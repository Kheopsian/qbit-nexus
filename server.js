import express from 'express';
import http from 'http';
import { handler } from './build/handler.js'; // Le handler SvelteKit
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs/promises';
import path from 'path';
import v8 from 'v8'; // Pour obtenir des informations détaillées sur la mémoire

/**
 * Version valide : Parse la chaîne de caractères qBittorrent et la convertit en Buffer.
 * @param {string} str La chaîne de caractères brute.
 * @returns {Buffer}
 */
function qbitStringToBuffer(str) {
	const bytes = [];
	for (let i = 0; i < str.length; i++) {
		if (str[i] === '\\') {
			i++;
			if (i >= str.length) break;

			if (str[i] === 'x') {
				let hexEnd = i + 1;
				while (hexEnd < str.length && hexEnd < i + 3 && /[0-9a-fA-F]/.test(str[hexEnd])) {
					hexEnd++;
				}
				const hex = str.substring(i + 1, hexEnd);
				bytes.push(parseInt(hex, 16));
				i = hexEnd - 1;
			} else if (str[i] === '0') {
				bytes.push(0);
			} else {
				bytes.push(str.charCodeAt(i));
			}
		} else {
			bytes.push(str.charCodeAt(i));
		}
	}
	return Buffer.from(bytes);
}

/**
 * Version valide : Décode le buffer binaire des statistiques.
 * @param {Buffer} binaryData Le buffer contenant les données binaires.
 * @returns {{AlltimeUL: bigint, AlltimeDL: bigint} | null}
 */
function decodeQbitStats(binaryData) {
	try {
		const dataView = new DataView(binaryData.buffer, binaryData.byteOffset, binaryData.byteLength);
		let offset = 0;

		const mapType = dataView.getInt32(offset, false);
		if (mapType !== 0x1c)
			throw new Error(`Type non reconnu. Attendu: 0x1c, Reçu: 0x${mapType.toString(16)}`);
		offset += 4;

		const pairCount = dataView.getInt32(offset, false);
		if (pairCount <= 0 || pairCount > 10)
			throw new Error(`Nombre de paires suspect: ${pairCount}.`);
		offset += 4;

		const stats = {};
		const textDecoder = new TextDecoder('utf-16be');

		for (let i = 0; i < pairCount; i++) {
			const keyLength = dataView.getInt32(offset, false);
			if (keyLength < 0 || keyLength > 200) throw new Error(`Taille de clé suspecte: ${keyLength}`);
			offset += 4;

			const keyBytes = new Uint8Array(binaryData.buffer, binaryData.byteOffset + offset, keyLength);
			const key = textDecoder.decode(keyBytes);
			offset += keyLength;

			const valueType = dataView.getInt32(offset, false);
			if (valueType !== 4)
				throw new Error(`Type de valeur inattendu pour la clé "${key}": ${valueType} (attendu: 4)`);
			offset += 4;

			const value = dataView.getBigUint64(offset, false);
			offset += 8;
			stats[key] = value;
		}
		return { AlltimeUL: stats.AlltimeUL || 0n, AlltimeDL: stats.AlltimeDL || 0n };
	} catch (error) {
		console.error('Erreur lors du décodage:', error.message);
		return null;
	}
}

export class QbitWebSocketServer {
	wss = null;
	clients = new Set();
	instances = [];
	intervalId = null;
	configPath = 'data/config.json';
	instanceRids = {}; // Suivi des RID pour chaque instance
	instanceCookies = {}; // Stockage des cookies par instance avec leur date d'expiration
	instanceFullData = {}; // Stockage de l'état complet des données par instance
	globalStatsIntervalId = null; // Interval pour les statistiques globales

	constructor(options) {
		console.log('[DEBUG] QbitWebSocketServer constructor appelé avec options:', options);
		// Log de diagnostic mémoire à l'initialisation
		const memoryUsage = process.memoryUsage();
		const heapStats = v8.getHeapStatistics();
		console.log('[MEMORY DEBUG] Initialisation QbitWebSocketServer - Memory Usage:');
		console.log('[MEMORY DEBUG] RSS:', Math.round(memoryUsage.rss / 1024 / 1024), 'MB');
		console.log(
			'[MEMORY DEBUG] Heap Total:',
			Math.round(heapStats.total_heap_size / 1024 / 1024),
			'MB'
		);
		console.log(
			'[MEMORY DEBUG] Heap Used:',
			Math.round(heapStats.used_heap_size / 1024 / 1024),
			'MB'
		);
		console.log('[MEMORY DEBUG] External:', Math.round(memoryUsage.external / 1024 / 1024), 'MB');

		if (options.path) {
			console.log('[DEBUG] Création du WebSocketServer avec noServer: true');
			this.wss = new WebSocketServer({ noServer: true, path: options.path });
			console.log('[DEBUG] WebSocketServer créé:', !!this.wss);
		} else {
			throw new Error("WebSocketServer requires a 'path' option when running with 'noServer'.");
		}

		// On ne fait que la configuration synchrone ici
		this.setupWebSocketServer();
	}

	// Nouvelle méthode pour l'initialisation asynchrone
	async init() {
		await this.loadInstances();
		this.startDataPolling();
		this.startGlobalStatsPolling();
	}

	/**
	 * Méthode publique pour gérer les upgrades WebSocket
	 */
	handleUpgrade(request, socket, head, callback) {
		console.log('[DEBUG] handleUpgrade appelé');
		if (!this.wss) {
			console.error('[DEBUG] Erreur: wss est null dans handleUpgrade');
			return;
		}

		try {
			console.log('[DEBUG] Tentative de handleUpgrade avec wss');
			this.wss.handleUpgrade(request, socket, head, (ws) => {
				console.log('[DEBUG] WebSocket upgrade réussi');
				callback(ws);
			});
		} catch (error) {
			console.error('[DEBUG] Erreur dans handleUpgrade:', error);
		}
	}

	/**
	 * Méthode publique pour émettre des événements de connexion
	 */
	emitConnection(ws, request) {
		console.log('[DEBUG] emitConnection appelé');
		if (!this.wss) {
			console.error('[DEBUG] Erreur: wss est null dans emitConnection');
			return;
		}

		try {
			console.log("[DEBUG] Émission de l'événement connection");
			this.wss.emit('connection', ws, request);
		} catch (error) {
			console.error('[DEBUG] Erreur dans emitConnection:', error);
		}
	}

	/**
	 * Getter pour vérifier si le serveur WebSocket est disponible
	 */
	get isReady() {
		return this.wss !== null;
	}

	async loadInstances() {
		try {
			const configContent = await fs.readFile(this.configPath, 'utf-8');
			const config = JSON.parse(configContent);
			this.instances = config.instances || [];
		} catch (error) {
			console.error('[WebSocket] Erreur lors du chargement des instances:', error);
			this.instances = [];
		}
	}

	setupWebSocketServer() {
		if (!this.wss) return;

		this.wss.on('connection', (ws) => {
			this.clients.add(ws);

			// Log de diagnostic mémoire lors de la connexion WebSocket
			const memoryUsage = process.memoryUsage();
			const heapStats = v8.getHeapStatistics();
			console.log('[MEMORY DEBUG] Nouvelle connexion WebSocket - Memory Usage:');
			console.log('[MEMORY DEBUG] RSS:', Math.round(memoryUsage.rss / 1024 / 1024), 'MB');
			console.log(
				'[MEMORY DEBUG] Heap Total:',
				Math.round(heapStats.total_heap_size / 1024 / 1024),
				'MB'
			);
			console.log(
				'[MEMORY DEBUG] Heap Used:',
				Math.round(heapStats.used_heap_size / 1024 / 1024),
				'MB'
			);
			console.log('[MEMORY DEBUG] External:', Math.round(memoryUsage.external / 1024 / 1024), 'MB');

			ws.on('close', () => {
				this.clients.delete(ws);
				// Log de diagnostic mémoire lors de la fermeture WebSocket
				const closeMemoryUsage = process.memoryUsage();
				const closeHeapStats = v8.getHeapStatistics();
				console.log('[MEMORY DEBUG] Fermeture connexion WebSocket - Memory Usage:');
				console.log('[MEMORY DEBUG] RSS:', Math.round(closeMemoryUsage.rss / 1024 / 1024), 'MB');
				console.log(
					'[MEMORY DEBUG] Heap Total:',
					Math.round(closeHeapStats.total_heap_size / 1024 / 1024),
					'MB'
				);
				console.log(
					'[MEMORY DEBUG] Heap Used:',
					Math.round(closeHeapStats.used_heap_size / 1024 / 1024),
					'MB'
				);
				console.log(
					'[MEMORY DEBUG] External:',
					Math.round(closeMemoryUsage.external / 1024 / 1024),
					'MB'
				);
			});

			ws.on('error', (error) => {
				console.error('Erreur WebSocket:', error);
				this.clients.delete(ws);
			});
		});
	}

	isCookieValid(instanceId) {
		const cookieData = this.instanceCookies[instanceId];
		if (!cookieData) return false;

		// Vérifier si le cookie a expiré (durée de session: 1 heure)
		return Date.now() < cookieData.expires;
	}

	async authenticateInstance(instance) {
		const authUrl = `${instance.url}/api/v2/auth/login`;
		const authResponse = await fetch(authUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: new URLSearchParams({
				username: instance.user,
				password: instance.pass
			}),
			// Ajouter timeout pour l'authentification
			signal: AbortSignal.timeout(5000) // Timeout de 5 secondes
		});

		if (!authResponse.ok) {
			throw new Error(`Échec d'authentification pour ${instance.name}: ${authResponse.status}`);
		}

		const cookies = authResponse.headers.get('set-cookie');

		if (!cookies) {
			throw new Error(`Pas de cookies d'authentification pour ${instance.name}`);
		}

		// Stocker les cookies avec une expiration d'1 heure
		this.instanceCookies[instance.id] = {
			cookie: cookies,
			expires: Date.now() + 3600 * 1000 // 1 heure en millisecondes
		};

		return cookies;
	}

	mergeData(currentData, newData) {
		// Si c'est une mise à jour complète (première requête), on remplace tout
		if (newData.full_update) {
			currentData.torrents = newData.torrents || {};
			currentData.categories = newData.categories || {};
			currentData.tags = newData.tags || [];
			currentData.server_state = newData.server_state || {};
			return;
		}

		// Gérer les torrents mis à jour ou ajoutés de manière optimisée
		if (newData.torrents) {
			if (!currentData.torrents) {
				currentData.torrents = {};
			}
			for (const [hash, torrentData] of Object.entries(newData.torrents)) {
				// Si le torrent n'existe pas, on l'ajoute. Sinon, on met à jour l'objet existant.
				if (!currentData.torrents[hash]) {
					currentData.torrents[hash] = torrentData;
				} else {
					Object.assign(currentData.torrents[hash], torrentData);
				}
			}
		}

		// Gérer les torrents supprimés
		if (newData.torrents_removed && currentData.torrents) {
			for (const hash of newData.torrents_removed) {
				delete currentData.torrents[hash];
			}
		}

		// Remplacer l'état du serveur
		if (newData.server_state) {
			currentData.server_state = newData.server_state;
		}

		// Gérer les catégories (ajout/mise à jour)
		if (newData.categories) {
			if (!currentData.categories) {
				currentData.categories = {};
			}
			Object.assign(currentData.categories, newData.categories);
		}

		// Gérer les catégories supprimées
		if (newData.categories_removed && currentData.categories) {
			for (const categoryName of newData.categories_removed) {
				delete currentData.categories[categoryName];
			}
		}

		// Gérer les tags (ajout/mise à jour)
		if (newData.tags) {
			if (!currentData.tags) {
				currentData.tags = [];
			}
			const existingTags = new Set(currentData.tags);
			for (const newTag of newData.tags) {
				if (!existingTags.has(newTag)) {
					currentData.tags.push(newTag);
				}
			}
		}

		// Gérer les tags supprimés
		if (newData.tags_removed && currentData.tags) {
			const removedTags = new Set(newData.tags_removed);
			currentData.tags = currentData.tags.filter((tag) => !removedTags.has(tag));
		}
	}

	async fetchInstanceData(instance) {
		try {
			let cookies;

			// Vérifier si nous avons déjà des cookies valides pour cette instance
			if (this.isCookieValid(instance.id)) {
				cookies = this.instanceCookies[instance.id].cookie;
			} else {
				// Authentifier et obtenir de nouveaux cookies
				cookies = await this.authenticateInstance(instance);
			}

			// Récupération des données maindata avec l'endpoint de synchronisation
			const currentRid = this.instanceRids[instance.id] || 0;
			const mainDataUrl = `${instance.url}/api/v2/sync/maindata?rid=${currentRid}`;

			const mainDataResponse = await fetch(mainDataUrl, {
				headers: {
					Cookie: cookies
				},
				// Ajouter timeout et options pour améliorer la stabilité
				signal: AbortSignal.timeout(3000) // Timeout de 3 secondes
			});

			// Si la réponse est 403 (Forbidden), les cookies ont probablement expiré
			if (mainDataResponse.status === 403) {
				console.log(`[WebSocket] Cookies expirés pour ${instance.name}, réauthentification...`);
				// Supprimer les cookies invalides
				delete this.instanceCookies[instance.id];
				// Réauthentifier et réessayer
				cookies = await this.authenticateInstance(instance);

				// Refaire la requête avec les nouveaux cookies
				const retryResponse = await fetch(mainDataUrl, {
					headers: {
						Cookie: cookies
					},
					signal: AbortSignal.timeout(3000) // Timeout de 3 secondes pour le retry
				});

				if (!retryResponse.ok) {
					throw new Error(
						`Échec de récupération des données pour ${instance.name} après réauthentification: ${retryResponse.status}`
					);
				}

				const data = await retryResponse.json();

				// Mettre à jour le RID pour la prochaine requête
				if (data.rid !== undefined) {
					this.instanceRids[instance.id] = data.rid;
				}

				// S'assurer que l'objet existe avant de le modifier
				if (!this.instanceFullData[instance.id]) {
					this.instanceFullData[instance.id] = {};
				}

				// Fusionner les données directement dans l'état complet existant
				this.mergeData(this.instanceFullData[instance.id], data);

				// Retourner l'objet mis à jour
				return this.instanceFullData[instance.id];
			}

			if (!mainDataResponse.ok) {
				throw new Error(
					`Échec de récupération des données pour ${instance.name}: ${mainDataResponse.status}`
				);
			}

			const data = await mainDataResponse.json();

			// Mettre à jour le RID pour la prochaine requête
			if (data.rid !== undefined) {
				this.instanceRids[instance.id] = data.rid;
			}

			// Si c'est la première requête (RID = 0) ou si nous n'avons pas de données complètes,
			// stocker les données comme état complet
			if (currentRid === 0 || !this.instanceFullData[instance.id]) {
				this.instanceFullData[instance.id] = data;
			} else {
				// Fusionner les données différentielles avec l'état complet existant
				this.mergeData(this.instanceFullData[instance.id], data); // Plus de réassignation
			}

			// Retourner l'état complet
			return this.instanceFullData[instance.id];
		} catch (error) {
			// Gestion d'erreur améliorée avec moins de logs pour les erreurs temporaires
			if (error instanceof Error) {
				if (error.name === 'AbortError') {
					console.warn(`[WebSocket] Timeout pour l'instance ${instance.name}`);
				} else if (error.message.includes('ECONNRESET') || error.message.includes('fetch failed')) {
					console.warn(`[WebSocket] Connexion instable pour ${instance.name} (${error.message})`);
				} else {
					console.error(`[WebSocket] Erreur pour l'instance ${instance.name}:`, error.message);
				}
			} else {
				console.error(`[WebSocket] Erreur inconnue pour l'instance ${instance.name}:`, error);
			}
			return {};
		}
	}

	async pollAllInstances() {
		// Log de diagnostic mémoire avant le traitement des instances
		const startMemoryUsage = process.memoryUsage();
		const startHeapStats = v8.getHeapStatistics();
		console.log('[MEMORY DEBUG] Début pollAllInstances - Memory Usage:');
		console.log('[MEMORY DEBUG] RSS:', Math.round(startMemoryUsage.rss / 1024 / 1024), 'MB');
		console.log(
			'[MEMORY DEBUG] Heap Total:',
			Math.round(startHeapStats.total_heap_size / 1024 / 1024),
			'MB'
		);
		console.log(
			'[MEMORY DEBUG] Heap Used:',
			Math.round(startHeapStats.used_heap_size / 1024 / 1024),
			'MB'
		);
		console.log(
			'[MEMORY DEBUG] External:',
			Math.round(startMemoryUsage.external / 1024 / 1024),
			'MB'
		);

		const promises = this.instances.map((instance) =>
			this.fetchInstanceData(instance).then((data) => ({ instanceId: instance.id, data }))
		);

		const results = await Promise.all(promises);

		const aggregatedData = {
			instances: {},
			timestamp: Date.now()
		};

		results.forEach(({ instanceId, data }) => {
			aggregatedData.instances[instanceId] = data;
		});

		// Envoyer les données à tous les clients connectés
		const message = JSON.stringify(aggregatedData);

		this.clients.forEach((client) => {
			if (client.readyState === WebSocket.OPEN) {
				client.send(message);
			}
		});

		// Log de diagnostic mémoire après le traitement des instances
		const endMemoryUsage = process.memoryUsage();
		const endHeapStats = v8.getHeapStatistics();
		console.log('[MEMORY DEBUG] Fin pollAllInstances - Memory Usage:');
		console.log('[MEMORY DEBUG] RSS:', Math.round(endMemoryUsage.rss / 1024 / 1024), 'MB');
		console.log(
			'[MEMORY DEBUG] Heap Total:',
			Math.round(endHeapStats.total_heap_size / 1024 / 1024),
			'MB'
		);
		console.log(
			'[MEMORY DEBUG] Heap Used:',
			Math.round(endHeapStats.used_heap_size / 1024 / 1024),
			'MB'
		);
		console.log(
			'[MEMORY DEBUG] External:',
			Math.round(endMemoryUsage.external / 1024 / 1024),
			'MB'
		);

		// Calcul de la différence de mémoire
		const rssDiff = endMemoryUsage.rss - startMemoryUsage.rss;
		const heapUsedDiff = endHeapStats.used_heap_size - startHeapStats.used_heap_size;
		console.log('[MEMORY DEBUG] Différence RSS:', Math.round(rssDiff / 1024 / 1024), 'MB');
		console.log(
			'[MEMORY DEBUG] Différence Heap Used:',
			Math.round(heapUsedDiff / 1024 / 1024),
			'MB'
		);
	}

	/**
	 * Récupère les statistiques globales de toutes les instances qui ont un configPath défini
	 */
	async fetchGlobalStats() {
		let alltimeUL = 0n,
			alltimeDL = 0n;

		console.log(`[DEBUG-STATS] === DÉBUT DIAGNOSTIC fetchGlobalStats ===`);
		console.log(`[DEBUG-STATS] Nombre d'instances configurées: ${this.instances.length}`);

		for (const instance of this.instances) {
			console.log(`[DEBUG-STATS] Traitement instance: ${instance.name}`);
			console.log(`[DEBUG-STATS] - ID: ${instance.id}`);
			console.log(`[DEBUG-STATS] - configPath: ${instance.configPath || 'NON DÉFINI'}`);

			if (instance.configPath) {
				try {
					const fullPath = path.join(instance.configPath, 'qBittorrent-data.conf');
					console.log(`[DEBUG-STATS] - Chemin complet: ${fullPath}`);

					// Vérifier l'existence du fichier
					try {
						await fs.access(fullPath);
						console.log(`[DEBUG-STATS] - ✅ Fichier accessible`);
					} catch (accessError) {
						console.log(`[DEBUG-STATS] - ❌ Fichier NON accessible:`, accessError.message);
						continue;
					}

					const fileContent = await fs.readFile(fullPath, 'utf-8');
					console.log(`[DEBUG-STATS] - Taille du fichier: ${fileContent.length} caractères`);

					// Chercher la section AllStats (avec ou sans guillemets)
					const match = fileContent.match(/AllStats=["']?@Variant\((.*)\)["']?/s);
					console.log(`[DEBUG-STATS] - Regex AllStats trouvé: ${!!match}`);

					if (match && match[1]) {
						console.log(`[DEBUG-STATS] - Longueur données échappées: ${match[1].length}`);
						const binaryData = qbitStringToBuffer(match[1]);
						console.log(`[DEBUG-STATS] - Taille buffer binaire: ${binaryData.length} bytes`);

						const stats = decodeQbitStats(binaryData);
						console.log(`[DEBUG-STATS] - Décodage réussi: ${!!stats}`);

						if (stats) {
							console.log(`[DEBUG-STATS] - AlltimeUL: ${stats.AlltimeUL.toString()}`);
							console.log(`[DEBUG-STATS] - AlltimeDL: ${stats.AlltimeDL.toString()}`);
							alltimeUL += stats.AlltimeUL;
							alltimeDL += stats.AlltimeDL;
						} else {
							console.log(`[DEBUG-STATS] - ❌ Décodage retourné null`);
						}
					} else {
						console.log(`[DEBUG-STATS] - ❌ Regex AllStats ne match pas`);
						// Afficher un extrait du fichier pour diagnostic
						const preview = fileContent.substring(0, 500);
						console.log(`[DEBUG-STATS] - Extrait du fichier (500 premiers chars):`, preview);
					}
				} catch (error) {
					console.error(
						`[DEBUG-STATS] Erreur de lecture des stats pour l'instance ${instance.name}:`,
						error
					);
				}
			} else {
				console.log(`[DEBUG-STATS] - ⚠️  Instance sans configPath défini`);
			}
		}

		console.log(`[DEBUG-STATS] === RÉSULTATS FINAUX ===`);
		console.log(`[DEBUG-STATS] Total UL: ${alltimeUL.toString()}`);
		console.log(`[DEBUG-STATS] Total DL: ${alltimeDL.toString()}`);
		console.log(`[DEBUG-STATS] === FIN DIAGNOSTIC ===`);

		return { alltimeUL, alltimeDL };
	}

	/**
	 * Met à jour les statistiques globales et les envoie aux clients
	 */
	async updateGlobalStats() {
		try {
			const globalStats = await this.fetchGlobalStats();

			// Créez un objet sérialisable en convertissant les BigInt en string
			const serializableGlobalStats = {
				alltimeUL: globalStats.alltimeUL.toString(),
				alltimeDL: globalStats.alltimeDL.toString()
			};

			// Utilisez ce nouvel objet pour la sérialisation JSON
			const message = JSON.stringify({
				globalStats: serializableGlobalStats,
				timestamp: Date.now()
			});

			// Envoyer les statistiques globales à tous les clients connectés
			this.clients.forEach((client) => {
				if (client.readyState === WebSocket.OPEN) {
					client.send(message);
				}
			});

			console.log(
				`[GlobalStats] Statistiques globales mises à jour: UL=${serializableGlobalStats.alltimeUL}, DL=${serializableGlobalStats.alltimeDL}`
			);
		} catch (error) {
			console.error(
				'[GlobalStats] Erreur lors de la mise à jour des statistiques globales:',
				error
			);
		}
	}

	/**
	 * Démarre le polling des statistiques globales toutes les 30 secondes
	 */
	startGlobalStatsPolling() {
		// Exécuter immédiatement la première fois
		this.updateGlobalStats();

		// Puis toutes les 30 secondes
		this.globalStatsIntervalId = setInterval(() => {
			this.updateGlobalStats();
		}, 30000);
	}

	startDataPolling() {
		// Démarrer immédiatement
		this.pollAllInstances();

		// Puis toutes les 2 secondes
		this.intervalId = setInterval(() => {
			// Log de diagnostic mémoire à chaque polling
			const memoryUsage = process.memoryUsage();
			const heapStats = v8.getHeapStatistics();
			console.log('[MEMORY DEBUG] Polling Data - Memory Usage:');
			console.log('[MEMORY DEBUG] RSS:', Math.round(memoryUsage.rss / 1024 / 1024), 'MB');
			console.log(
				'[MEMORY DEBUG] Heap Total:',
				Math.round(heapStats.total_heap_size / 1024 / 1024),
				'MB'
			);
			console.log(
				'[MEMORY DEBUG] Heap Used:',
				Math.round(heapStats.used_heap_size / 1024 / 1024),
				'MB'
			);
			console.log('[MEMORY DEBUG] External:', Math.round(memoryUsage.external / 1024 / 1024), 'MB');

			this.pollAllInstances();
		}, 2000);
	}

	stop() {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}

		if (this.globalStatsIntervalId) {
			clearInterval(this.globalStatsIntervalId);
			this.globalStatsIntervalId = null;
		}

		if (this.wss) {
			this.wss.close();
			this.wss = null;
		}

		this.clients.clear();
	}
}

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

console.log('[Server] Initialisation du WebSocket Server...');
const wsServer = new QbitWebSocketServer({ path: '/qbit-ws' });
wsServer.init();

server.on('upgrade', (req, socket, head) => {
	const pathname = req.url ? new URL(req.url, `http://${req.headers.host}`).pathname : '';
	if (pathname === '/qbit-ws') {
		console.log('[Server] Mise à niveau de la requête vers WebSocket pour /qbit-ws');
		wsServer.handleUpgrade(req, socket, head, (ws) => {
			wsServer.emitConnection(ws, req);
		});
	} else {
		socket.destroy();
	}
});

// Le handler de SvelteKit prend le relais pour toutes les autres requêtes
app.use(handler);

server.listen(port, () => {
	console.log(`[Server] Serveur HTTP et WebSocket écoutant sur le port ${port}`);
});
