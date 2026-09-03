const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const envFile = path.join(__dirname, ".env");
const fileEnv = fs.existsSync(envFile) ? dotenv.parse(fs.readFileSync(envFile)) : {};

module.exports = {
    apps: [
        {
            name: "test-crash",
            script: "./scripts/crash-app.js",
            cwd: __dirname,
            autorestart: false,
            env: {
                ...fileEnv,
                NODE_ENV: "development",
            },
        },
    ],
};
