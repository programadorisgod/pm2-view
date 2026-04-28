import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { resolve } from 'path';

export default defineConfig({
	plugins: [sveltekit()],
	resolve: {
		alias: {
			'@': resolve(__dirname, './src'),
			'$env/dynamic/private': resolve(__dirname, 'src/lib/db/env.mock.ts'),
		},
	},
	test: {
		include: ['src/tests/**/*.test.ts'],
	},
});
