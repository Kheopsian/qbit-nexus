import { QbitWebSocketServer } from '$lib/websocket';

let wsServer: QbitWebSocketServer | null = null;

export async function handle({ event, resolve }) {
	// Démarrer le serveur WebSocket si pas déjà démarré
	if (!wsServer) {
		wsServer = new QbitWebSocketServer(8081);
		console.log('Serveur WebSocket qBittorrent démarré');
	}

	// Continuer avec la requête normale
	return resolve(event);
}

// Nettoyer le serveur WebSocket à l'arrêt
process.on('SIGTERM', () => {
	if (wsServer) {
		wsServer.stop();
		console.log('Serveur WebSocket arrêté');
	}
});

process.on('SIGINT', () => {
	if (wsServer) {
		wsServer.stop();
		console.log('Serveur WebSocket arrêté');
	}
});
