// server.js

import { handler } from './build/handler.js';
import express from 'express';
import http from 'http';
// On importe depuis notre fichier local, plus de dépendance au build de SvelteKit
import { QbitWebSocketServer } from './websocket-server.js';

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

const wsServer = new QbitWebSocketServer({ path: '/qbit-ws' });
console.log('[Server] QbitWebSocketServer initialisé.');

server.on('upgrade', (req, socket, head) => {
	const pathname = req.url ? new URL(req.url, `http://${req.headers.host}`).pathname : '';
	if (pathname === '/qbit-ws') {
		wsServer.handleUpgrade(req, socket, head, (ws) => {
			wsServer.emitConnection(ws, req);
		});
	}
});

app.use(handler);

server.listen(port, () => {
	console.log(`[Server] Serveur démarré et à l'écoute sur le port ${port}`);
});
