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

	constructor(port: number = 8081) {
		this.wss = new WebSocketServer({ port });
		this.setupWebSocketServer();
		this.loadInstances();
		this.startDataPolling();
	}

	private async loadInstances() {
		try {
			console.log(
				`[WebSocket] Tentative de chargement de la configuration depuis: ${this.configPath}`
			);
			const configContent = await fs.readFile(this.configPath, 'utf-8');
			const config = JSON.parse(configContent);
			this.instances = config.instances || [];
			console.log(
				`[WebSocket] Configuration chargée avec succès. Nombre d'instances: ${this.instances.length}`
			);
			this.instances.forEach((instance, index) => {
				console.log(`[WebSocket] Instance ${index + 1}: ${instance.name} (${instance.url})`);
			});
		} catch (error) {
			console.error('[WebSocket] Erreur lors du chargement des instances:', error);
			this.instances = [];
		}
	}

	private setupWebSocketServer() {
		if (!this.wss) return;

		this.wss.on('connection', (ws) => {
			console.log('Nouvelle connexion WebSocket établie');
			this.clients.add(ws);

			ws.on('close', () => {
				console.log('Connexion WebSocket fermée');
				this.clients.delete(ws);
			});

			ws.on('error', (error) => {
				console.error('Erreur WebSocket:', error);
				this.clients.delete(ws);
			});
		});

		console.log(`Serveur WebSocket démarré sur le port ${this.wss.options.port}`);
	}

	private async fetchInstanceData(instance: QbitInstance): Promise<QbitMainData> {
		try {
			console.log(
				`[WebSocket] Tentative de connexion à l'instance: ${instance.name} (${instance.url})`
			);

			// Authentification
			const authUrl = `${instance.url}/api/v2/auth/login`;
			console.log(`[WebSocket] Tentative d'authentification avec: ${instance.user}`);

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

			console.log(
				`[WebSocket] Réponse d'authentification pour ${instance.name}: ${authResponse.status} ${authResponse.statusText}`
			);

			if (!authResponse.ok) {
				const errorText = await authResponse.text();
				console.error(
					`[WebSocket] Échec d'authentification pour ${instance.name}. Réponse: ${errorText}`
				);
				throw new Error(`Échec d'authentification pour ${instance.name}: ${authResponse.status}`);
			}

			const cookies = authResponse.headers.get('set-cookie');
			console.log(`[WebSocket] Cookies reçus pour ${instance.name}: ${cookies ? 'Oui' : 'Non'}`);

			if (!cookies) {
				throw new Error(`Pas de cookies d'authentification pour ${instance.name}`);
			}

			// Récupération des données maindata avec l'endpoint de synchronisation
			const currentRid = this.instanceRids[instance.id] || 0;
			const mainDataUrl = `${instance.url}/api/v2/sync/maindata?rid=${currentRid}`;
			console.log(`[WebSocket] Récupération des données depuis: ${mainDataUrl}`);

			const mainDataResponse = await fetch(mainDataUrl, {
				headers: {
					Cookie: cookies
				}
			});

			console.log(
				`[WebSocket] Réponse des données pour ${instance.name}: ${mainDataResponse.status} ${mainDataResponse.statusText}`
			);

			if (!mainDataResponse.ok) {
				const errorText = await mainDataResponse.text();
				console.error(
					`[WebSocket] Échec de récupération des données pour ${instance.name}. Réponse: ${errorText}`
				);
				throw new Error(
					`Échec de récupération des données pour ${instance.name}: ${mainDataResponse.status}`
				);
			}

			const data = await mainDataResponse.json();
			console.log(
				`[WebSocket] Données récupérées avec succès pour ${instance.name}. Clés principales: ${Object.keys(data).join(', ')}`
			);

			// Log détaillé de la structure des données pour comprendre ce qu'on reçoit
			console.log(`[WebSocket] Structure des données pour ${instance.name}:`);
			if (data.server_state) {
				console.log(`[WebSocket] - server_state: ${Object.keys(data.server_state).join(', ')}`);
			}
			if (data.torrents) {
				console.log(`[WebSocket] - torrents: ${Object.keys(data.torrents).length} torrent(s)`);
				// Afficher les détails des 5 premiers torrents pour comprendre la structure
				const torrentKeys = Object.keys(data.torrents).slice(0, 5);
				torrentKeys.forEach((hash) => {
					const torrent = data.torrents[hash];
					console.log(`[WebSocket]   - Torrent ${hash}: ${Object.keys(torrent).join(', ')}`);
				});
			}

			// Mettre à jour le RID pour la prochaine requête
			if (data.rid !== undefined) {
				this.instanceRids[instance.id] = data.rid;
				console.log(`[WebSocket] RID mis à jour pour ${instance.name}: ${data.rid}`);
			}

			return data;
		} catch (error) {
			console.error(`[WebSocket] Erreur pour l'instance ${instance.name}:`, error);
			return {};
		}
	}

	private async pollAllInstances(): Promise<void> {
		console.log(
			`[WebSocket] Début de la récupération des données depuis ${this.instances.length} instance(s)`
		);

		const promises = this.instances.map((instance) =>
			this.fetchInstanceData(instance).then((data) => ({ instanceId: instance.id, data }))
		);

		const results = await Promise.all(promises);
		console.log(`[WebSocket] Récupération terminée pour ${results.length} instance(s)`);

		const aggregatedData: AggregatedData = {
			instances: {},
			timestamp: Date.now()
		};

		results.forEach(({ instanceId, data }) => {
			aggregatedData.instances[instanceId] = data;
			console.log(
				`[WebSocket] Instance ${instanceId}: ${Object.keys(data).length} propriétés récupérées`
			);
		});

		// Envoyer les données à tous les clients connectés
		const message = JSON.stringify(aggregatedData);
		console.log(
			`[WebSocket] Envoi des données à ${this.clients.size} client(s) connecté(s). Taille du message: ${message.length} caractères`
		);

		this.clients.forEach((client) => {
			if (client.readyState === WebSocket.OPEN) {
				client.send(message);
				console.log(`[WebSocket] Données envoyées avec succès à un client`);
			} else {
				console.log(`[WebSocket] Client non connecté, état: ${client.readyState}`);
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
