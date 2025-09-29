import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type UserConfig, type ViteDevServer } from 'vite';
import { QbitWebSocketServer } from './src/lib/websocket.js';

// Plugin WebSocket uniquement pour le mode développement
const webSocketServer = {
	name: 'webSocketServer',
	configureServer(server: ViteDevServer) {
		console.log('[DEBUG Vite] Configuration du serveur WebSocket...');
		const wsServer = new QbitWebSocketServer({ path: '/qbit-ws' });

		server.httpServer?.on('upgrade', (req, socket, head) => {
			const pathname = req.url ? new URL(req.url, `http://${req.headers.host}`).pathname : '';
			if (pathname === '/qbit-ws') {
				wsServer.handleUpgrade(req, socket, head, (ws) => {
					wsServer.emitConnection(ws, req);
				});
			}
		});
	}
};

// Configuration Vite
export default defineConfig(({ mode }): UserConfig => {
	return {
		plugins: [
			sveltekit(),
			// On ajoute le plugin WebSocket seulement si le mode est 'development'
			mode === 'development' && webSocketServer
		]
	};
});
