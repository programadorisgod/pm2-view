import adapter from "@sveltejs/adapter-node";

/** @type {import('@sveltejs/kit').Config} */
const isProd = process.env.NODE_ENV === "production";
const config = {
    compilerOptions: {
        // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
        runes: ({ filename }) =>
            filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
    },
    kit: {
        // adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
        // If your environment is not supported, or you settled on a specific environment, switch out the adapter.
        // See https://svelte.dev/docs/kit/adapters for more information about adapters.
        adapter: adapter(),
        alias: {
            $lib: "src/lib",
            "$lib/*": "src/lib/*",
        },
        paths: {
            base: isProd ? "/pm2" : "",
        },
    },
};

export default config;
