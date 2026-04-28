import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import { resolve } from "path";

const allowedHosts = (process.env.VITE_ALLOWED_HOSTS || "localhost")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);

export default defineConfig({
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
});
