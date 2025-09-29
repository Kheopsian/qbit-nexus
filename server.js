// server.js

import { handler } from './build/handler.js'; // Le handler SvelteKit
import express from 'express';
import http from 'http';
import { QbitWebSocketServer } from './build/server/chunks/websocket.js'; // Importe ta classe depuis le build

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

// Initialise ton serveur WebSocket
const wsServer = new QbitWebSocketServer({ path: '/qbit-ws' });
console.log('[Server] QbitWebSocketServer initialisé.');

// Attache le handler d'upgrade WebSocket au serveur HTTP
server.on('upgrade', (req, socket, head) => {
	const pathname = req.url ? new URL(req.url, `http://${req.headers.host}`).pathname : '';
	if (pathname === '/qbit-ws') {
		console.log('[Server] Requête de mise à niveau WebSocket reçue. Traitement...');
		wsServer.handleUpgrade(req, socket, head, (ws) => {
			wsServer.emitConnection(ws, req);
		});
	}
});

// Laisse SvelteKit gérer toutes les autres requêtes (GET, POST, etc.)
app.use(handler);

// Démarre le serveur
server.listen(port, () => {
	console.log(`[Server] Serveur démarré et à l'écoute sur le port ${port}`);
});
