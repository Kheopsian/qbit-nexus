import type { Actions, PageServerLoad } from './$types';
import fs from 'fs/promises'; // On importe le module de gestion de fichiers de Node.js
import { fail } from '@sveltejs/kit';

// On définit le chemin vers notre fichier de configuration.
const CONFIG_PATH = 'data/config.json';

// Définir un type pour les instances
interface Instance {
	id: number;
	name: string;
	url: string;
	user: string;
	pass: string;
	configPath?: string;
}

// Définir un type pour les settings
interface Settings {
	visibleStatuses?: string[];
}

// Définir un type pour la configuration
interface Config {
	instances: Instance[];
	settings: Settings;
}

// --- FONCTION LOAD ---
// Cette fonction s'exécute AVANT que la page ne soit rendue.
// Son rôle est de charger les données nécessaires à la page.
export const load: PageServerLoad = async () => {
	try {
		const fileContent = await fs.readFile(CONFIG_PATH, 'utf-8');
		const config: Config = JSON.parse(fileContent);
		const instances = config.instances || [];
		const settings = config.settings || {};
		return { instances, settings };
	} catch {
		// Si le fichier n'existe pas ou est vide, on retourne un tableau vide.
		return { instances: [], settings: {} };
	}
};

// --- FONCTION ACTIONS ---
// Ne change pas beaucoup, mais au lieu d'un tableau en mémoire,
// on lit et on écrit dans le fichier.
export const actions: Actions = {
	// Action pour ajouter une nouvelle instance
	add: async ({ request }) => {
		const data = await request.formData();
		const name = data.get('name') as string;
		const url = data.get('url') as string;
		const user = data.get('user') as string;
		const pass = data.get('pass') as string;
		const configPath = data.get('configPath') as string;

		if (!name || !url || !user || !pass) {
			return fail(400, { success: false, message: 'All fields are required.' });
		}

		// 1. Lire les instances actuelles
		const fileContent = await fs.readFile(CONFIG_PATH, 'utf-8');
		const config = JSON.parse(fileContent);
		const instances = config.instances || [];

		const newInstance: Instance = { id: Date.now(), name, url, user, pass };

		// Ajouter configPath seulement s'il est fourni
		if (configPath) {
			newInstance.configPath = configPath;
		}

		// 2. Ajouter la nouvelle instance
		instances.push(newInstance);

		// 3. Préparer les données de configuration mises à jour
		const updatedConfig = {
			instances: instances,
			settings: config.settings || {}
		};

		try {
			// 4. S'assurer que le dossier 'data' existe
			await fs.mkdir('data', { recursive: true });
			// 5. Écrire le tableau mis à jour dans le fichier
			await fs.writeFile(CONFIG_PATH, JSON.stringify(updatedConfig, null, 2));
		} catch (error) {
			console.error('Failed to save config:', error);
			return fail(500, { success: false, message: 'Could not save the instance configuration.' });
		}

		return { success: true, message: `${name} has been added!` };
	},

	// Action pour mettre à jour une instance existante
	update: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id');
		const name = data.get('name');
		const url = data.get('url');
		const user = data.get('user');
		const pass = data.get('pass');
		const configPath = data.get('configPath');

		if (!id || !name || !url || !user || !pass) {
			return fail(400, { success: false, message: 'All fields are required.' });
		}

		// 1. Lire les instances actuelles
		const fileContent = await fs.readFile(CONFIG_PATH, 'utf-8');
		const config = JSON.parse(fileContent);
		const instances = config.instances || [];

		// 2. Trouver l'instance à mettre à jour
		const instanceIndex = instances.findIndex(
			(instance: Instance) => instance.id == parseInt(id as string)
		);

		if (instanceIndex === -1) {
			return fail(400, { success: false, message: 'Instance not found.' });
		}

		// 3. Mettre à jour l'instance
		const updatedInstance: Instance = {
			id: parseInt(id as string),
			name: name as string,
			url: url as string,
			user: user as string,
			pass: pass as string
		};

		// Ajouter configPath seulement s'il est fourni
		if (configPath) {
			updatedInstance.configPath = configPath as string;
		}

		instances[instanceIndex] = updatedInstance;

		// 4. Préparer les données de configuration mises à jour
		const updatedConfig = {
			instances: instances,
			settings: config.settings || {}
		};

		try {
			// 5. S'assurer que le dossier 'data' existe
			await fs.mkdir('data', { recursive: true });
			// 6. Écrire le tableau mis à jour dans le fichier
			await fs.writeFile(CONFIG_PATH, JSON.stringify(updatedConfig, null, 2));
		} catch (error) {
			console.error('Failed to save config:', error);
			return fail(500, { success: false, message: 'Could not save the instance configuration.' });
		}

		return { success: true, message: `${name} has been updated!` };
	},

	// Action pour supprimer une instance
	delete: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id');

		if (!id) {
			return fail(400, { success: false, message: 'Instance ID is required.' });
		}

		// 1. Lire les instances actuelles
		const fileContent = await fs.readFile(CONFIG_PATH, 'utf-8');
		const config = JSON.parse(fileContent);
		const instances = config.instances || [];

		// 2. Trouver l'instance à supprimer
		const instanceIndex = instances.findIndex(
			(instance: Instance) => instance.id == parseInt(id as string)
		);

		if (instanceIndex === -1) {
			return fail(400, { success: false, message: 'Instance not found.' });
		}

		// 3. Supprimer l'instance
		const deletedInstance = instances.splice(instanceIndex, 1)[0];

		// 4. Préparer les données de configuration mises à jour
		const updatedConfig = {
			instances: instances,
			settings: config.settings || {}
		};

		try {
			// 5. S'assurer que le dossier 'data' existe
			await fs.mkdir('data', { recursive: true });
			// 6. Écrire le tableau mis à jour dans le fichier
			await fs.writeFile(CONFIG_PATH, JSON.stringify(updatedConfig, null, 2));
		} catch (error) {
			console.error('Failed to save config:', error);
			return fail(500, { success: false, message: 'Could not save the instance configuration.' });
		}

		return { success: true, message: `${deletedInstance.name} has been deleted!` };
	}
};
