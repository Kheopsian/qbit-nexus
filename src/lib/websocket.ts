import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs/promises';
import { readQbitStats } from './qbit-stats';
import type { Server } from 'http';

interface QbitInstance {
	id: number;
	name: string;
	url: string;
	user: string;
	pass: string;
	configPath?: string;
}

export interface QbitMainData {
	torrents?: Record<string, unknown>;
	server_state?: unknown;
	categories?: Record<string, unknown>;
	tags?: string[];
	[key: string]: unknown;
}

interface AggregatedData {
	instances: Record<number, QbitMainData>;
	timestamp: number;
	globalStats?: {
		alltimeUL: bigint;
		alltimeDL: bigint;
	};
}

interface QbitWebSocketServerOptions {
	port?: number;
	server?: Server;
	path?: string;
}

export class QbitWebSocketServer {
	private wss: WebSocketServer | null = null;
	private clients = new Set<WebSocket>();
	private instances: QbitInstance[] = [];
	private intervalId: NodeJS.Timeout | null = null;
	private configPath = 'data/config.json';
	private instanceRids: Record<number, number> = {}; // Suivi des RID pour chaque instance
	private instanceCookies: Record<number, { cookie: string; expires: number }> = {}; // Stockage des cookies par instance avec leur date d'expiration
	private instanceFullData: Record<number, QbitMainData> = {}; // Stockage de l'état complet des données par instance
	private globalStatsIntervalId: NodeJS.Timeout | null = null; // Interval pour les statistiques globales

	constructor(options: QbitWebSocketServerOptions) {
		if (options.server) {
			// Attach to an existing HTTP server
			this.wss = new WebSocketServer({ server: options.server, path: options.path });
		} else if (options.port) {
			// Create a new server on a specific port
			this.wss = new WebSocketServer({ port: options.port });
		} else {
			throw new Error("WebSocketServer requires either a 'port' or a 'server' option.");
		}

		this.setupWebSocketServer();
		this.loadInstances();
		this.startDataPolling();
		this.startGlobalStatsPolling();
	}

	private async loadInstances() {
		try {
			const configContent = await fs.readFile(this.configPath, 'utf-8');
			const config = JSON.parse(configContent);
			this.instances = config.instances || [];
		} catch (error) {
			console.error('[WebSocket] Erreur lors du chargement des instances:', error);
			this.instances = [];
		}
	}

	private setupWebSocketServer() {
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

	private isCookieValid(instanceId: number): boolean {
		const cookieData = this.instanceCookies[instanceId];
		if (!cookieData) return false;

		// Vérifier si le cookie a expiré (durée de session: 1 heure)
		return Date.now() < cookieData.expires;
	}

	private async authenticateInstance(instance: QbitInstance): Promise<string> {
		const authUrl = `${instance.url}/api/v2/auth/login`;
		const authResponse = await fetch(authUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: new URLSearchParams({
				username: instance.user,
				password: instance.pass
			})
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

	private mergeData(currentData: QbitMainData, newData: QbitMainData): void {
		// Fusionner les torrents
		if (newData.torrents) {
			if (!currentData.torrents) {
				currentData.torrents = {};
			}
			Object.entries(newData.torrents).forEach(([hash, torrentData]) => {
				if (torrentData === null) {
					delete currentData.torrents![hash];
				} else {
					currentData.torrents![hash] = {
						...((currentData.torrents![hash] as Record<string, unknown>) || {}),
						...(torrentData as Record<string, unknown>)
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
					delete currentData.categories![name];
				} else {
					currentData.categories![name] = {
						...((currentData.categories![name] as Record<string, unknown>) || {}),
						...(categoryData as Record<string, unknown>)
					};
				}
			});
		}

		// Remplacer les tags
		if (newData.tags !== undefined) {
			currentData.tags = newData.tags;
		}
	}

	private async fetchInstanceData(instance: QbitInstance): Promise<QbitMainData> {
		try {
			let cookies: string;

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
				}
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
					}
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
			console.error(`[WebSocket] Erreur pour l'instance ${instance.name}:`, error);
			return {};
		}
	}

	private async pollAllInstances(): Promise<void> {
		const promises = this.instances.map((instance) =>
			this.fetchInstanceData(instance).then((data) => ({ instanceId: instance.id, data }))
		);

		const results = await Promise.all(promises);

		const aggregatedData: AggregatedData = {
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
	private async fetchGlobalStats(): Promise<{ alltimeUL: bigint; alltimeDL: bigint }> {
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
	private async updateGlobalStats(): Promise<void> {
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
	private startGlobalStatsPolling(): void {
		// Exécuter immédiatement la première fois
		this.updateGlobalStats();

		// Puis toutes les 30 secondes
		this.globalStatsIntervalId = setInterval(() => {
			this.updateGlobalStats();
		}, 30000);
	}

	private startDataPolling() {
		// Démarrer immédiatement
		this.pollAllInstances();

		// Puis toutes les 2 secondes
		this.intervalId = setInterval(() => {
			this.pollAllInstances();
		}, 2000);
	}

	public stop() {
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
