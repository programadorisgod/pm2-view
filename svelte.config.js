import adapter from "@sveltejs/adapter-node";

/** @type {import('@sveltejs/kit').Config} */
const basePath = process.env.APP_BASE_PATH || "";
const config = {
    compilerOptions: {
        // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
        runes: ({ filename }) =>
            filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
    },
    kit: {
        adapter: adapter(),
        alias: {
            $lib: "src/lib",
            "$lib/*": "src/lib/*",
        },
        paths: {
            base: basePath,
        },
    },
};

export default config;
