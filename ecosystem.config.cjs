const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const envFile = path.join(__dirname, ".env");
const fileEnv = fs.existsSync(envFile) ? dotenv.parse(fs.readFileSync(envFile)) : {};

const env = {
    NODE_ENV: fileEnv.NODE_ENV ?? "production",
    PORT: fileEnv.PORT ?? "5179",
    BODY_SIZE_LIMIT: fileEnv.BODY_SIZE_LIMIT ?? "Infinity",
};

if (fileEnv.ORIGIN) env.ORIGIN = fileEnv.ORIGIN;

module.exports = {
    apps: [
        {
            name: "pm2-view",
            script: "./build/index.js",
            cwd: __dirname,

            exec_mode: "fork",
            instances: 1,

            autorestart: true,
            watch: false,
            max_memory_restart: "500M",

            env: {
                ...fileEnv,
                ...env,
            },

            error_file: "./logs/error.log",
            out_file: "./logs/out.log",
            merge_logs: true,
            log_date_format: "YYYY-MM-DD HH:mm:ss Z",

            min_uptime: "10s",
            max_restarts: 10,
            restart_delay: 2000,
        },
    ],
};
