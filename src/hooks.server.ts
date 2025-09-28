import { QbitWebSocketServer } from '$lib/websocket';
import type { Handle } from '@sveltejs/kit';

let wsServer: QbitWebSocketServer | null = null;

export const handle: Handle = async ({ event, resolve }) => {
	// Démarrer le serveur WebSocket si pas déjà démarré
	if (!wsServer) {
		// @ts-expect-error: La propriété 'server' est ajoutée par l'environnement Node.js
		const httpServer = event.platform?.server;
		if (httpServer) {
			console.log('Intégration du serveur WebSocket au serveur SvelteKit existant.');
			wsServer = new QbitWebSocketServer({ server: httpServer, path: '/qbit-ws' });
		} else {
			// Fallback pour les environnements où le serveur HTTP n'est pas directement accessible
			console.log(
				'Serveur HTTP non trouvé, démarrage du serveur WebSocket sur un port séparé (8082).'
			);
			wsServer = new QbitWebSocketServer({ port: 8082 });
		}
	}

	// Continuer avec la requête normale
	return resolve(event);
};

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
