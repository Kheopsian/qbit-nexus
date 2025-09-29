import { writable } from 'svelte/store';
import type { QbitMainData } from './websocket';

interface AggregatedData {
	instances: Record<number, QbitMainData>;
	timestamp: number;
}

interface GlobalStatsData {
	globalStats: {
		alltimeUL: bigint;
		alltimeDL: bigint;
	};
	timestamp: number;
}

export const qbitData = writable<AggregatedData | null>(null);
export const globalStatsData = writable<GlobalStatsData | null>(null);
export const wsConnectionStatus = writable<'connecting' | 'connected' | 'disconnected' | 'error'>(
	'disconnected'
);

class WebSocketClient {
	private ws: WebSocket | null = null;
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 5;
	private reconnectInterval = 3000;
	private reconnectTimeout: NodeJS.Timeout | null = null;
	private wsUrl = '';

	constructor() {
		// On ne se connecte que côté client (navigateur)
		if (typeof window !== 'undefined') {
			this.initializeWebSocket();
		}
	}

	private getWebSocketUrl(path: string): string {
		const loc = window.location;
		const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
		const host = loc.host;
		return `${protocol}//${host}${path}`;
	}

	private async initializeWebSocket() {
		try {
			console.log('[DEBUG Client] Initialisation WebSocket - Récupération du chemin...');
			const response = await fetch('/api/websocket');
			console.log('[DEBUG Client] Réponse de /api/websocket:', response.status, response.ok);

			if (!response.ok) {
				throw new Error(`Erreur API: ${response.status}`);
			}
			const data = await response.json();
			console.log('[DEBUG Client] Données reçues:', data);

			// On construit l'URL complète à partir du chemin reçu
			this.wsUrl = this.getWebSocketUrl(data.websocketPath);
			console.log(`[DEBUG Client] URL WebSocket construite: ${this.wsUrl}`);
			this.connect();
		} catch (error) {
			console.error('[DEBUG Client] Erreur lors de la récupération du chemin WebSocket:', error);
			wsConnectionStatus.set('error');
		}
	}

	private connect() {
		if (!this.wsUrl) {
			console.error('[DEBUG Client] Tentative de connexion sans URL WebSocket');
			return;
		}

		console.log('[DEBUG Client] Tentative de connexion WebSocket vers:', this.wsUrl);
		wsConnectionStatus.set('connecting');

		try {
			this.ws = new WebSocket(this.wsUrl);
			console.log('[DEBUG Client] Objet WebSocket créé:', this.ws.readyState);

			this.ws.onopen = () => {
				console.log('[DEBUG Client] WebSocket connexion ouverte');
				wsConnectionStatus.set('connected');
				this.reconnectAttempts = 0;
			};

			this.ws.onmessage = (event) => {
				console.log('[DEBUG Client] Message WebSocket reçu:', event.data?.length, 'caractères');
				try {
					const data = JSON.parse(event.data);

					// Vérifier si c'est des données d'instances ou des statistiques globales
					if (data.instances !== undefined) {
						console.log(
							'[DEBUG Client] Données instances reçues:',
							Object.keys(data.instances).length,
							'instances'
						);
						// C'est les données des instances
						qbitData.set(data);
					} else if (data.globalStats !== undefined) {
						console.log('[DEBUG Client] Statistiques globales reçues');
						// C'est les statistiques globales
						globalStatsData.set(data);
					}
				} catch (error) {
					console.error('[DEBUG Client] Erreur lors du parsing des données WebSocket:', error);
				}
			};

			this.ws.onclose = (event) => {
				console.log('[DEBUG Client] WebSocket fermé:', event.code, event.reason);
				wsConnectionStatus.set('disconnected');
				this.handleReconnect();
			};

			this.ws.onerror = (error) => {
				console.error('[DEBUG Client] Erreur WebSocket:', error);
				wsConnectionStatus.set('error');
				this.handleReconnect();
			};
		} catch (error) {
			console.error('[DEBUG Client] Erreur lors de la création de la connexion WebSocket:', error);
			wsConnectionStatus.set('error');
			this.handleReconnect();
		}
	}

	private handleReconnect() {
		if (this.reconnectAttempts >= this.maxReconnectAttempts) {
			return;
		}

		this.reconnectAttempts++;

		this.reconnectTimeout = setTimeout(() => {
			this.connect();
		}, this.reconnectInterval);
	}

	public disconnect() {
		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout);
			this.reconnectTimeout = null;
		}

		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}

		wsConnectionStatus.set('disconnected');
	}
}

// Créer une instance globale du client WebSocket
export const wsClient = new WebSocketClient();

// Fonction pour se déconnecter proprement
export function disconnectWebSocket() {
	wsClient.disconnect();
}
