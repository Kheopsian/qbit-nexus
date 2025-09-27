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

	private async fetchInstanceData(instance: QbitInstance): Promise<QbitMainData> {
		try {
			// Authentification
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

			// Récupération des données maindata avec l'endpoint de synchronisation
			const currentRid = this.instanceRids[instance.id] || 0;
			const mainDataUrl = `${instance.url}/api/v2/sync/maindata?rid=${currentRid}`;

			const mainDataResponse = await fetch(mainDataUrl, {
				headers: {
					Cookie: cookies
				}
			});

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

			return data;
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
