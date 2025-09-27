import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs/promises';

interface QbitInstance {
	id: number;
	name: string;
	url: string;
	user: string;
	pass: string;
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

	constructor(port: number = 8081) {
		this.wss = new WebSocketServer({ port });
		this.setupWebSocketServer();
		this.loadInstances();
		this.startDataPolling();
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

	private mergeData(currentData: QbitMainData, newData: QbitMainData): QbitMainData {
		// Commencer avec une copie complète des données actuelles
		const mergedData: QbitMainData = JSON.parse(JSON.stringify(currentData));

		// Fusionner les torrents
		if (newData.torrents) {
			// S'assurer que nous avons un objet torrents
			if (!mergedData.torrents) {
				mergedData.torrents = {};
			}

			// Parcourir les torrents dans newData pour les mises à jour et suppressions
			Object.entries(newData.torrents).forEach(([hash, torrentData]) => {
				if (torrentData === null) {
					// Supprimer le torrent
					delete mergedData.torrents![hash];
				} else {
					// Mettre à jour ou ajouter le torrent
					// Si le torrent existe déjà, fusionner ses propriétés pour préserver les données non modifiées
					if (mergedData.torrents![hash]) {
						// Fusionner les propriétés du torrent existant avec les nouvelles données
						mergedData.torrents![hash] = {
							...(mergedData.torrents![hash] as Record<string, unknown>),
							...(torrentData as Record<string, unknown>)
						};
					} else {
						// Nouveau torrent
						mergedData.torrents![hash] = torrentData;
					}
				}
			});
		}

		// Remplacer server_state (représente l'état global actuel)
		if (newData.server_state !== undefined) {
			mergedData.server_state = newData.server_state;
		}

		// Fusionner les catégories
		if (newData.categories) {
			// S'assurer que nous avons un objet categories
			if (!mergedData.categories) {
				mergedData.categories = {};
			}

			// Parcourir les catégories dans newData pour les mises à jour et suppressions
			Object.entries(newData.categories).forEach(([name, categoryData]) => {
				if (categoryData === null) {
					// Supprimer la catégorie
					delete mergedData.categories![name];
				} else {
					// Mettre à jour ou ajouter la catégorie
					// Si la catégorie existe déjà, fusionner ses propriétés pour préserver les données non modifiées
					if (mergedData.categories![name]) {
						// Fusionner les propriétés de la catégorie existante avec les nouvelles données
						mergedData.categories![name] = {
							...(mergedData.categories![name] as Record<string, unknown>),
							...(categoryData as Record<string, unknown>)
						};
					} else {
						// Nouvelle catégorie
						mergedData.categories![name] = categoryData;
					}
				}
			});
		}

		// Remplacer les tags (représente la liste complète actuelle)
		if (newData.tags !== undefined) {
			mergedData.tags = newData.tags;
		}

		return mergedData;
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

				// Fusionner les données avec l'état complet existant
				const currentFullData = this.instanceFullData[instance.id] || {};
				const mergedData = this.mergeData(currentFullData, data);
				this.instanceFullData[instance.id] = mergedData;

				return mergedData;
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
				// Sinon, fusionner les données différentielles avec l'état complet existant
				const mergedData = this.mergeData(this.instanceFullData[instance.id], data);
				this.instanceFullData[instance.id] = mergedData;
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

		if (this.wss) {
			this.wss.close();
			this.wss = null;
		}

		this.clients.clear();
	}
}
