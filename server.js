import express from 'express';
import http from 'http';
import { handler } from './build/handler.js'; // Le handler SvelteKit
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs/promises';
import path from 'path';

async function readQbitStats(configPath) {
	try {
		const confFilePath = path.join(configPath, 'qBittorrent-data.conf');
		await fs.access(confFilePath);

		// 1. Lire le fichier entier directement dans un Buffer.
		const fileBuffer = await fs.readFile(confFilePath);

		// 2. Chercher la séquence de début (aussi en tant que Buffer).
		const prefix = Buffer.from('AllStats=@Variant(');
		const startIndex = fileBuffer.indexOf(prefix);
		if (startIndex === -1) {
			console.error("Séquence '@Variant(' non trouvée dans le buffer.");
			return null;
		}

		// 3. Chercher la parenthèse de fin.
		const endIndex = fileBuffer.indexOf(Buffer.from(')'), startIndex);
		if (endIndex === -1) {
			console.error("Parenthèse fermante ')' non trouvée dans le buffer.");
			return null;
		}

		// 4. Extraire la tranche de données binaires PURES.
		const binaryData = fileBuffer.slice(startIndex + prefix.length, endIndex);

		// 5. Envoyer le Buffer pur au décodeur.
		return decodeQbitStats(binaryData);
	} catch (error) {
		console.error(`Erreur de lecture des stats qBittorrent:`, error);
		return null;
	}
}

// La fonction de décodage prend maintenant un Buffer en entrée.
function decodeQbitStats(binaryData) {
	try {
		// Pas besoin de conversion, on a déjà un Buffer !
		const dataView = new DataView(binaryData.buffer, binaryData.byteOffset, binaryData.byteLength);

		let offset = 0;
		const mapType = dataView.getInt32(offset);
		if (mapType !== 0x1c) {
			throw new Error(`Type non reconnu. Reçu: 0x${mapType.toString(16)}`);
		}
		offset += 4;

		const pairCount = dataView.getInt32(offset);
		if (pairCount !== 2) {
			throw new Error(`Nombre de paires inattendu: ${pairCount}.`);
		}
		offset += 4;

		const stats = {};
		const textDecoder = new TextDecoder('utf-16be');

		for (let i = 0; i < pairCount; i++) {
			const keyLength = dataView.getInt32(offset);
			offset += 4;
			const keyBytes = new Uint8Array(binaryData.buffer, binaryData.byteOffset + offset, keyLength);
			const key = textDecoder.decode(keyBytes);
			offset += keyLength;

			const valueType = dataView.getInt32(offset);
			if (valueType !== 4) {
				throw new Error(`Type de valeur inattendu pour la clé "${key}".`);
			}
			offset += 4;

			const value = dataView.getBigUint64(offset);
			offset += 8;
			stats[key] = value;
		}

		return {
			AlltimeUL: stats.AlltimeUL || 0n,
			AlltimeDL: stats.AlltimeDL || 0n
		};
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

			ws.on('close', () => {
				this.clients.delete(ws);
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
		// Fusionner les torrents
		if (newData.torrents) {
			if (!currentData.torrents) {
				currentData.torrents = {};
			}
			Object.entries(newData.torrents).forEach(([hash, torrentData]) => {
				if (torrentData === null) {
					delete currentData.torrents[hash];
				} else {
					currentData.torrents[hash] = {
						...(currentData.torrents[hash] || {}),
						...torrentData
					};
				}
			});
		}

		// Remplacer server_state
		if (newData.server_state !== undefined) {
			currentData.server_state = newData.server_state;
		}

		// Fusionner les catégories
		if (newData.categories) {
			if (!currentData.categories) {
				currentData.categories = {};
			}
			Object.entries(newData.categories).forEach(([name, categoryData]) => {
				if (categoryData === null) {
					delete currentData.categories[name];
				} else {
					currentData.categories[name] = {
						...(currentData.categories[name] || {}),
						...categoryData
					};
				}
			});
		}

		// Remplacer les tags
		if (newData.tags !== undefined) {
			currentData.tags = newData.tags;
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
	}

	/**
	 * Récupère les statistiques globales de toutes les instances qui ont un configPath défini
	 */
	async fetchGlobalStats() {
		let alltimeUL = 0n;
		let alltimeDL = 0n;

		// Parcourir toutes les instances qui ont un configPath défini
		for (const instance of this.instances) {
			if (instance.configPath) {
				try {
					const stats = await readQbitStats(instance.configPath);
					if (stats) {
						alltimeUL += stats.AlltimeUL;
						alltimeDL += stats.AlltimeDL;
						console.log(
							`[GlobalStats] Statistiques récupérées pour ${instance.name}: UL=${stats.AlltimeUL}, DL=${stats.AlltimeDL}`
						);
					}
				} catch (error) {
					console.error(
						`[GlobalStats] Erreur lors de la lecture des statistiques pour ${instance.name}:`,
						error
					);
				}
			}
		}

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
