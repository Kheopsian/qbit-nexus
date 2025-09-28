import { QbitWebSocketServer } from '$lib/websocket';
import type { Handle } from '@sveltejs/kit';
import type { Server } from 'http';

// Utiliser un singleton pour garantir que le serveur n'est créé qu'une seule fois
const wsServer = new QbitWebSocketServer({ path: '/qbit-ws' });

let serverInitialized = false;

export const handle: Handle = async ({ event, resolve }) => {
	// @ts-expect-error - 'server' est injecté par adapter-node
	const server = event.platform?.server as Server;

	if (server && !serverInitialized) {
		console.log('Attaching WebSocket upgrade handler to the HTTP server.');

		server.on('upgrade', (req, socket, head) => {
			const pathname = req.url ? new URL(req.url, `http://${req.headers.host}`).pathname : '';

			// On vérifie si la demande concerne bien notre chemin WebSocket
			if (pathname === '/qbit-ws') {
				wsServer.wss?.handleUpgrade(req, socket, head, (ws) => {
					wsServer.wss?.emit('connection', ws, req);
				});
			}
		});

		serverInitialized = true;
	}

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
