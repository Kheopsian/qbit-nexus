import type { Actions, PageServerLoad } from './$types';
import fs from 'fs/promises'; // On importe le module de gestion de fichiers de Node.js
import { fail } from '@sveltejs/kit';

// On définit le chemin vers notre fichier de configuration.
const CONFIG_PATH = 'data/config.json';

// --- FONCTION LOAD ---
// Cette fonction s'exécute AVANT que la page ne soit rendue.
// Son rôle est de charger les données nécessaires à la page.
export const load: PageServerLoad = async () => {
	try {
		const fileContent = await fs.readFile(CONFIG_PATH, 'utf-8');
		const instances = JSON.parse(fileContent);
		return { instances };
	} catch (error) {
		// Si le fichier n'existe pas ou est vide, on retourne un tableau vide.
		return { instances: [] };
	}
};

// --- FONCTION ACTIONS ---
// Ne change pas beaucoup, mais au lieu d'un tableau en mémoire,
// on lit et on écrit dans le fichier.
export const actions: Actions = {
	default: async ({ request }) => {
		const data = await request.formData();
		const name = data.get('name');
		const url = data.get('url');
		const user = data.get('user');
		const pass = data.get('pass');

		if (!name || !url || !user || !pass) {
			return fail(400, { success: false, message: 'All fields are required.' });
		}

		// 1. Lire les instances actuelles
		const { instances } = await load();

		const newInstance = { id: Date.now(), name, url, user, pass };

		// 2. Ajouter la nouvelle instance
		instances.push(newInstance);

		try {
			// 3. S'assurer que le dossier 'data' existe
			await fs.mkdir('data', { recursive: true });
			// 4. Écrire le tableau mis à jour dans le fichier
			await fs.writeFile(CONFIG_PATH, JSON.stringify(instances, null, 2));
		} catch (error) {
			console.error('Failed to save config:', error);
			return fail(500, { success: false, message: 'Could not save the instance configuration.' });
		}

		return { success: true, message: `${name} has been added!` };
	}
};
