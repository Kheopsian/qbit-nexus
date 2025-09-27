import { writable } from 'svelte/store';
import type { QbitMainData } from './websocket';

interface AggregatedData {
	instances: Record<number, QbitMainData>;
	timestamp: number;
}

export const qbitData = writable<AggregatedData | null>(null);
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
			console.log("[WebSocket Client] Tentative de récupération de l'URL WebSocket depuis l'API");
			// Récupérer l'URL du WebSocket depuis l'API
			const response = await fetch('/api/websocket');
			console.log(`[WebSocket Client] Réponse de l'API: ${response.status} ${response.statusText}`);

			if (!response.ok) {
				const errorText = await response.text();
				console.error(
					`[WebSocket Client] Erreur lors de la récupération de l'URL WebSocket: ${errorText}`
				);
				throw new Error(`Erreur ${response.status}: ${errorText}`);
			}

			const data = await response.json();
			console.log(`[WebSocket Client] URL WebSocket reçue: ${data.websocketUrl}`);
			this.wsUrl = data.websocketUrl;
			this.connect();
		} catch (error) {
			console.error("[WebSocket Client] Erreur lors de la récupération de l'URL WebSocket:", error);
			wsConnectionStatus.set('error');
		}
	}

	private connect() {
		if (!this.wsUrl) {
			console.error('[WebSocket Client] URL WebSocket non disponible');
			return;
		}

		console.log(`[WebSocket Client] Tentative de connexion à: ${this.wsUrl}`);
		wsConnectionStatus.set('connecting');

		try {
			this.ws = new WebSocket(this.wsUrl);

			this.ws.onopen = () => {
				console.log('[WebSocket Client] WebSocket connecté avec succès');
				wsConnectionStatus.set('connected');
				this.reconnectAttempts = 0;
			};

			this.ws.onmessage = (event) => {
				try {
					console.log(`[WebSocket Client] Message reçu, taille: ${event.data.length} caractères`);
					const data: AggregatedData = JSON.parse(event.data);
					console.log(
						`[WebSocket Client] Données parsées avec succès. Instances: ${Object.keys(data.instances || {}).length}, Timestamp: ${data.timestamp}`
					);
					qbitData.set(data);
				} catch (error) {
					console.error('[WebSocket Client] Erreur lors du parsing des données WebSocket:', error);
					console.log(`[WebSocket Client] Données brutes reçues: ${event.data}`);
				}
			};

			this.ws.onclose = (event) => {
				console.log(
					`[WebSocket Client] WebSocket déconnecté. Code: ${event.code}, Raison: ${event.reason}`
				);
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
			console.error('[WebSocket Client] Nombre maximum de tentatives de reconnexion atteint');
			return;
		}

		this.reconnectAttempts++;
		console.log(
			`[WebSocket Client] Tentative de reconnexion ${this.reconnectAttempts}/${this.maxReconnectAttempts} dans ${this.reconnectInterval}ms`
		);

		this.reconnectTimeout = setTimeout(() => {
			console.log('[WebSocket Client] Exécution de la tentative de reconnexion');
			this.connect();
		}, this.reconnectInterval);
	}

	public disconnect() {
		console.log('[WebSocket Client] Déconnexion manuelle du WebSocket');

		if (this.reconnectTimeout) {
			console.log('[WebSocket Client] Annulation de la tentative de reconnexion en cours');
			clearTimeout(this.reconnectTimeout);
			this.reconnectTimeout = null;
		}

		if (this.ws) {
			console.log('[WebSocket Client] Fermeture de la connexion WebSocket');
			this.ws.close();
			this.ws = null;
		}

		wsConnectionStatus.set('disconnected');
		console.log('[WebSocket Client] WebSocket déconnecté manuellement');
	}
}

// Créer une instance globale du client WebSocket
export const wsClient = new WebSocketClient();

// Fonction pour se déconnecter proprement
export function disconnectWebSocket() {
	wsClient.disconnect();
}
