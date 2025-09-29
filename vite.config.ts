// /vite.config.ts

import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// Supprime toute la logique liée à QbitWebSocketServer et webSocketDevPlugin
// La configuration devient beaucoup plus simple :

export default defineConfig({
	plugins: [sveltekit()]
});
