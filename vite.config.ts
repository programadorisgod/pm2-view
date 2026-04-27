import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
    plugins: [sveltekit()],
    resolve: {
        alias: {
            "@": resolve(__dirname, "./src"),
        },
    },
    server: {
        port: 5179,
    },
    test: {
        alias: {
            '$env/dynamic/private': resolve(__dirname, 'src/lib/db/env.mock.ts'),
        },
    },
});
