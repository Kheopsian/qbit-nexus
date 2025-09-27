import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'fs/promises';

interface QbitInstance {
	id: number;
	name: string;
	url: string;
	user: string;
	pass: string;
}

export const GET: RequestHandler = async ({ url }) => {
	const instanceId = parseInt(url.searchParams.get('instanceId') || '0');
	const hash = url.searchParams.get('hash') || '';

	if (!instanceId || !hash) {
		return json({ error: 'Paramètres manquants' }, { status: 400 });
	}

	try {
		// Charger les instances depuis le fichier de configuration
		const configContent = await fs.readFile('data/config.json', 'utf-8');
		const config = JSON.parse(configContent);
		const instances: QbitInstance[] = config.instances || [];
		const instance = instances.find((inst: QbitInstance) => inst.id === instanceId);

		if (!instance) {
			return json({ error: 'Instance non trouvée' }, { status: 404 });
		}

		// Authentification à l'instance
		const authUrl = `${instance.url}/api/v2/auth/login`;
		const authResponse = await fetch(authUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: new URLSearchParams({
				username: instance.user,
				password: instance.pass
			})
		});

		if (!authResponse.ok) {
			return json({ error: "Échec de l'authentification" }, { status: 401 });
		}

		const cookies = authResponse.headers.get('set-cookie');
		if (!cookies) {
			return json({ error: "Pas de cookies d'authentification" }, { status: 401 });
		}

		// Récupérer les détails du torrent
		const detailsUrl = `${instance.url}/api/v2/torrents/trackers?hash=${hash}`;
		const detailsResponse = await fetch(detailsUrl, {
			headers: {
				Cookie: cookies
			}
		});

		if (!detailsResponse.ok) {
			return json({ error: 'Échec de la récupération des détails du torrent' }, { status: 500 });
		}

		const trackers = await detailsResponse.json();
		return json({ trackers });
	} catch (error) {
		console.error('Erreur lors de la récupération des détails du torrent:', error);
		return json({ error: 'Erreur serveur interne' }, { status: 500 });
	}
};
