import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	console.log('[DEBUG API] Requête pour obtenir le chemin WebSocket');

	// Retourner le chemin WebSocket (géré maintenant par Vite en dev et hooks.server.ts en prod)
	const wsPath = `/qbit-ws`;

	return json({
		websocketPath: wsPath,
		message: 'Utilisez ce chemin pour la connexion WebSocket'
	});
};
