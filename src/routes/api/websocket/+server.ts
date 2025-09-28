import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	// On retourne un chemin relatif, sans domaine ni port
	const wsPath = `/qbit-ws`;

	return json({
		websocketPath: wsPath,
		message: 'Utilisez ce chemin pour la connexion WebSocket'
	});
};
