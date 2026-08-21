import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, loadEnv } from "vite";
import { resolve } from "path";

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd());
    const allowedHosts = (env.VITE_ALLOWED_HOSTS || "localhost")
        .split(",")
        .map((h) => h.trim())
        .filter(Boolean);

    console.log(allowedHosts);

    return {
        plugins: [sveltekit()],
        resolve: {
            alias: {
                "@": resolve(__dirname, "./src"),
            },
        },
        server: {
            port: 5179,
            allowedHosts,
        },
        preview: {
            allowedHosts,
        },
    };
});
