// src/hooks.server.ts
import { QbitWebSocketServer } from '$lib/websocket';
import type { Handle } from '@sveltejs/kit';
import type { Server } from 'http';

let wsServerInitialized = false;

export const handle: Handle = async ({ event, resolve }) => {
	// @ts-expect-error - 'server' est injecté par adapter-node
	const server = event.platform?.server as Server;

	if (server && !wsServerInitialized) {
		console.log('[HOOKS] Serveur de production détecté. Initialisation du WebSocket...');
		wsServerInitialized = true;

		const wsServer = new QbitWebSocketServer({ path: '/qbit-ws' });

		server.on('upgrade', (req, socket, head) => {
			const pathname = req.url ? new URL(req.url, `http://${req.headers.host}`).pathname : '';
			if (pathname === '/qbit-ws') {
				wsServer.handleUpgrade(req, socket, head, (ws) => {
					wsServer.emitConnection(ws, req);
				});
			}
		});
		console.log('[HOOKS] Le handler WebSocket est attaché.');
	}

	return resolve(event);
};
