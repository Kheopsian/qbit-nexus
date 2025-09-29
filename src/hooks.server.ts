// src/hooks.server.ts

import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment'; // La méthode officielle pour vérifier le mode
import { QbitWebSocketServer } from '$lib/websocket';
import type { Server } from 'http';

let wsServer: QbitWebSocketServer | null = null;
let serverInitialized = false;

// Ce log s'exécute une seule fois au démarrage du serveur
console.log(
	`[HOOKS_INIT] Démarrage du serveur. Mode dev: ${dev}. NODE_ENV: ${process.env.NODE_ENV}`
);

export const handle: Handle = async ({ event, resolve }) => {
	// @ts-expect-error - 'server' est injecté par l'adapter-node
	const server = event.platform?.server as Server;

	// Ce log s'exécute à chaque requête
	if (!serverInitialized) {
		console.log(
			`[HOOKS_HANDLE] Première requête. Mode dev: ${dev}. Objet 'server' disponible: ${!!server}`
		);
	}

	// Logique d'initialisation du WebSocket
	if (!dev && server && !serverInitialized) {
		console.log('[HOOKS_PROD] Mode production détecté. Initialisation du serveur WebSocket...');
		serverInitialized = true; // On le met ici pour éviter les initialisations multiples

		wsServer = new QbitWebSocketServer({ path: '/qbit-ws' });

		server.on('upgrade', (req, socket, head) => {
			const pathname = req.url ? new URL(req.url, `http://${req.headers.host}`).pathname : '';
			if (pathname === '/qbit-ws' && wsServer) {
				wsServer.handleUpgrade(req, socket, head, (ws) => {
					wsServer!.emitConnection(ws, req);
				});
			}
		});

		console.log('[HOOKS_PROD] Handler "upgrade" attaché au serveur de production.');
	} else if (dev && !serverInitialized) {
		console.log(
			'[HOOKS_DEV] Mode développement détecté. Le WebSocket est géré par le plugin Vite.'
		);
		// On marque comme initialisé pour ne plus logger ce message
		serverInitialized = true;
	}

	return resolve(event);
};
