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
	private reconnectInterval = 3000; // 3 secondes
	private reconnectTimeout: NodeJS.Timeout | null = null;
	private wsUrl = '';

	constructor() {
		this.initializeWebSocket();
	}

	private async initializeWebSocket() {
		try {
			// Récupérer l'URL du WebSocket depuis l'API
			const response = await fetch('/api/websocket');

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Erreur ${response.status}: ${errorText}`);
			}

			const data = await response.json();
			this.wsUrl = data.websocketUrl;
			this.connect();
		} catch (error) {
			console.error("[WebSocket Client] Erreur lors de la récupération de l'URL WebSocket:", error);
			wsConnectionStatus.set('error');
		}
	}

	private connect() {
		if (!this.wsUrl) {
			return;
		}

		wsConnectionStatus.set('connecting');

		try {
			this.ws = new WebSocket(this.wsUrl);

			this.ws.onopen = () => {
				wsConnectionStatus.set('connected');
				this.reconnectAttempts = 0;
			};

			this.ws.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data);

					// Vérifier si c'est des données d'instances ou des statistiques globales
					if (data.instances !== undefined) {
						// C'est les données des instances
						qbitData.set(data);
					} else if (data.globalStats !== undefined) {
						// C'est les statistiques globales
						globalStatsData.set(data);
					}
				} catch (error) {
					console.error('[WebSocket Client] Erreur lors du parsing des données WebSocket:', error);
				}
			};

			this.ws.onclose = () => {
				wsConnectionStatus.set('disconnected');
				this.handleReconnect();
			};

			this.ws.onerror = (error) => {
				console.error('[WebSocket Client] Erreur WebSocket:', error);
				wsConnectionStatus.set('error');
				this.handleReconnect();
			};
		} catch (error) {
			console.error(
				'[WebSocket Client] Erreur lors de la création de la connexion WebSocket:',
				error
			);
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
