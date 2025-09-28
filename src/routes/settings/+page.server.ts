import type { Actions, PageServerLoad } from './$types';
import fs from 'fs/promises';
import { fail } from '@sveltejs/kit';

const CONFIG_PATH = 'data/config.json';

// Interfaces pour la structure de la configuration
interface Instance {
	id: number;
	name: string;
	url: string;
	user: string;
	pass: string;
	configPath?: string;
}

interface Settings {
	visibleStatuses?: string[];
}

interface Config {
	instances: Instance[];
	settings: Settings;
}

// Fonction pour lire la configuration de manière sécurisée
async function readConfig(): Promise<Config> {
	try {
		const fileContent = await fs.readFile(CONFIG_PATH, 'utf-8');
		const config = JSON.parse(fileContent) as Config;
		// S'assurer que les propriétés de base existent
		if (!config.instances) config.instances = [];
		if (!config.settings) config.settings = {};
		return config;
	} catch (error) {
		// Si le fichier n'existe pas ou est corrompu, on retourne une config par défaut
		return { instances: [], settings: {} };
	}
}

// Fonction pour écrire la configuration
async function writeConfig(config: Config): Promise<void> {
	// S'assurer que le dossier 'data' existe avant d'écrire
	await fs.mkdir('data', { recursive: true });
	await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// La fonction load reste la même
export const load: PageServerLoad = async () => {
	const config = await readConfig();
	return { instances: config.instances, settings: config.settings };
};

export const actions: Actions = {
	// Action pour AJOUTER une nouvelle instance
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

		const config = await readConfig();

		const newInstance: Instance = { id: Date.now(), name, url, user, pass };
		if (configPath) {
			newInstance.configPath = configPath;
		}

		config.instances.push(newInstance);

		try {
			await writeConfig(config);
		} catch (error) {
			console.error('Failed to save config:', error);
			return fail(500, { success: false, message: 'Could not save the instance configuration.' });
		}

		return { success: true, message: `${name} has been added!` };
	},

	// Action pour METTRE À JOUR une instance
	update: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		const name = data.get('name') as string;
		const url = data.get('url') as string;
		const user = data.get('user') as string;
		const pass = data.get('pass') as string;
		const configPath = data.get('configPath') as string | null;

		if (!id || !name || !url || !user || !pass) {
			return fail(400, { success: false, message: 'All fields are required.' });
		}

		const config = await readConfig();
		const instanceIndex = config.instances.findIndex((instance) => instance.id === id);

		if (instanceIndex === -1) {
			return fail(404, { success: false, message: 'Instance not found.' });
		}

		const updatedInstance: Instance = { id, name, url, user, pass };
		if (configPath) {
			updatedInstance.configPath = configPath;
		}

		config.instances[instanceIndex] = updatedInstance;

		try {
			await writeConfig(config);
		} catch (error) {
			console.error('Failed to save config:', error);
			return fail(500, { success: false, message: 'Could not update the instance configuration.' });
		}

		return { success: true, message: `${name} has been updated!` };
	},

	// Action pour SUPPRIMER une instance
	delete: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));

		if (!id) {
			return fail(400, { success: false, message: 'Instance ID is required.' });
		}

		const config = await readConfig();
		const initialLength = config.instances.length;
		config.instances = config.instances.filter((instance) => instance.id !== id);

		if (config.instances.length === initialLength) {
			return fail(404, { success: false, message: 'Instance not found.' });
		}

		const deletedInstanceName = config.instances.find((i) => i.id === id)?.name || 'Instance';

		try {
			await writeConfig(config);
		} catch (error) {
			console.error('Failed to save config:', error);
			return fail(500, { success: false, message: 'Could not delete the instance configuration.' });
		}

		return { success: true, message: `${deletedInstanceName} has been deleted!` };
	}
};
