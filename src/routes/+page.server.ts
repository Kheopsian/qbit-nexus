import type { Actions, PageServerLoad } from './$types';
import fs from 'fs/promises';
import { fail } from '@sveltejs/kit';

const CONFIG_PATH = 'data/config.json';

export const load: PageServerLoad = async () => {
	try {
		const fileContent = await fs.readFile(CONFIG_PATH, 'utf-8');
		const config = JSON.parse(fileContent);
		return { config };
	} catch (_error) {
		return { config: { instances: [], settings: { visibleStatuses: [] } } };
	}
};

export const actions: Actions = {
	updateSettings: async ({ request }) => {
		const data = await request.formData();
		const visibleStatuses = data.get('visibleStatuses');

		if (!visibleStatuses) {
			return fail(400, { success: false, message: 'Visible statuses are required.' });
		}

		try {
			const fileContent = await fs.readFile(CONFIG_PATH, 'utf-8');
			const config = JSON.parse(fileContent);
			config.settings.visibleStatuses = JSON.parse(visibleStatuses as string);

			await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
		} catch (_error) {
			return fail(500, { success: false, message: 'Could not save settings.' });
		}

		return { success: true };
	}
};
