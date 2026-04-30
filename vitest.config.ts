import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { resolve } from 'path';

export default defineConfig({
	plugins: [sveltekit()],
	resolve: {
		alias: {
			'@': resolve(__dirname, './src'),
			'$env/dynamic/private': resolve(__dirname, 'src/lib/db/env.mock.ts'),
			'$app/state': resolve(__dirname, 'src/tests/mocks/app-state.ts'),
			'$app/paths': resolve(__dirname, 'src/tests/mocks/app-paths.ts'),
			'$lib/theme.svelte': resolve(__dirname, 'src/tests/mocks/theme.ts'),
		},
	},
	test: {
		include: ['src/tests/**/*.test.ts'],
		environment: 'happy-dom',
	},
});
