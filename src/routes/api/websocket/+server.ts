import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	// Retourner l'URL du serveur WebSocket
	const wsUrl = `ws://localhost:8081`;

	return json({
		websocketUrl: wsUrl,
		message: 'Connectez-vous à cette URL pour recevoir les données qBittorrent'
	});
};
