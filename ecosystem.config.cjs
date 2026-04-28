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
                NODE_ENV: "production",
                PORT: "5179",
                ORIGIN: "http://localhost:5179",
                BODY_SIZE_LIMIT: "Infinity",
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
