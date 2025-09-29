import { QbitWebSocketServer } from '$lib/websocket';
import type { Handle } from '@sveltejs/kit';
import type { Server } from 'http';

// En mode développement, le WebSocket est géré par Vite
// En production, on utilise hooks.server.ts
let wsServer: QbitWebSocketServer | null = null;
let serverInitialized = false;

export const handle: Handle = async ({ event, resolve }) => {
	// @ts-expect-error - 'server' est injecté par adapter-node
	const server = event.platform?.server as Server;
	console.log('[DEBUG] Handle appelé - Server disponible:', !!server, 'Mode production:', !!server);

	// Seulement en mode production (quand server est disponible)
	if (server && !serverInitialized) {
		console.log('[DEBUG] Mode production détecté - Initialisation WebSocket server...');
		wsServer = new QbitWebSocketServer({ path: '/qbit-ws' });
		console.log('[DEBUG] QbitWebSocketServer créé, isReady:', wsServer.isReady);

		server.on('upgrade', (req, socket, head) => {
			console.log('[DEBUG] Upgrade request reçue:', req.url);
			const pathname = req.url ? new URL(req.url, `http://${req.headers.host}`).pathname : '';
			console.log('[DEBUG] Pathname extrait:', pathname);

			// On vérifie si la demande concerne bien notre chemin WebSocket
			if (pathname === '/qbit-ws' && wsServer) {
				console.log('[DEBUG] Utilisation de wsServer.handleUpgrade');

				try {
					wsServer.handleUpgrade(req, socket, head, (ws) => {
						console.log('[DEBUG] WebSocket upgrade réussi, émission de connection...');
						wsServer!.emitConnection(ws, req);
					});
				} catch (error) {
					console.error('[DEBUG] Erreur lors du handleUpgrade:', error);
				}
			} else {
				console.log('[DEBUG] Chemin ignoré (pas /qbit-ws):', pathname);
			}
		});

		serverInitialized = true;
		console.log('[DEBUG] Server WebSocket upgrade handler attaché');
	} else if (!server) {
		console.log('[DEBUG] Mode développement - WebSocket géré par Vite');
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
