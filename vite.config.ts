// /vite.config.ts

import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type UserConfig, type ViteDevServer } from 'vite';
import { QbitWebSocketServer } from './src/lib/websocket';

// On définit le plugin pour le serveur de développement WebSocket
const webSocketDevPlugin = {
	name: 'webSocketServer',
	configureServer(server: ViteDevServer) {
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

// On exporte une fonction pour que la configuration soit dynamique
export default defineConfig(
	({ mode }): UserConfig => ({
		plugins: [
			sveltekit(),
			// Cette ligne est LA CLÉ : le plugin n'est ajouté qu'en mode 'development'
			mode === 'development' ? webSocketDevPlugin : null
		]
	})
);
