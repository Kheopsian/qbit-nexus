// server.ts

import { handler } from './build/handler.js';
import express from 'express';
import http from 'http';
import { QbitWebSocketServer } from './src/lib/websocket.ts'; // On peut maintenant importer le .ts directement

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

console.log('[Server] Initialisation du QbitWebSocketServer...');
const wsServer = new QbitWebSocketServer({ path: '/qbit-ws' });

server.on('upgrade', (req, socket, head) => {
	const pathname = req.url ? new URL(req.url, `http://${req.headers.host}`).pathname : '';
	if (pathname === '/qbit-ws') {
		wsServer.handleUpgrade(req, socket, head, (ws) => {
			wsServer.emitConnection(ws, req);
		});
	}
});

// Le handler SvelteKit gère toutes les requêtes HTTP classiques
app.use(handler);

server.listen(port, () => {
	console.log(`[Server] Le serveur écoute sur le port ${port}`);
});
