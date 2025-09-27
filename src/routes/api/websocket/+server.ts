import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	console.log("[API WebSocket] Requête pour l'URL du WebSocket reçue");

	// Retourner l'URL du serveur WebSocket
	const wsUrl = `ws://localhost:8081`;
	console.log(`[API WebSocket] URL du WebSocket générée: ${wsUrl}`);

	return json({
		websocketUrl: wsUrl,
		message: 'Connectez-vous à cette URL pour recevoir les données qBittorrent'
	});
};
