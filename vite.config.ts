import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { QbitWebSocketServer } from './src/lib/websocket.js';

export default defineConfig({
	plugins: [
		sveltekit(),
		{
			name: 'websocket-server',
			configureServer(server) {
				console.log('[DEBUG Vite] Configuration du serveur WebSocket...');

				// Créer l'instance WebSocket
				const wsServer = new QbitWebSocketServer({ path: '/qbit-ws' });
				console.log('[DEBUG Vite] QbitWebSocketServer créé, isReady:', wsServer.isReady);

				// Gérer les upgrades WebSocket sur le serveur Vite
				server.middlewares.use((req, res, next) => {
					if (req.url === '/qbit-ws' && req.headers.upgrade === 'websocket') {
						console.log('[DEBUG Vite] WebSocket upgrade request intercepté');
						// Le handle de l'upgrade sera fait par le serveur HTTP sous-jacent
						next();
					} else {
						next();
					}
				});

				// Attacher le gestionnaire d'upgrade sur le serveur HTTP de Vite
				server.httpServer?.on('upgrade', (request, socket, head) => {
					console.log('[DEBUG Vite] Upgrade event reçu:', request.url);

					const url = new URL(request.url || '', `http://${request.headers.host}`);
					if (url.pathname === '/qbit-ws') {
						console.log("[DEBUG Vite] Traitement de l'upgrade WebSocket");
						try {
							wsServer.handleUpgrade(request, socket, head, (ws) => {
								console.log('[DEBUG Vite] WebSocket upgrade réussi');
								wsServer.emitConnection(ws, request);
							});
						} catch (error) {
							console.error("[DEBUG Vite] Erreur lors de l'upgrade WebSocket:", error);
						}
					}
				});

				console.log('[DEBUG Vite] Serveur WebSocket configuré');
			}
		}
	]
});
