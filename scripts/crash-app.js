#!/usr/bin/env node
/**
 * Test script for process error alert notifications.
 *
 * Usage:
 *   pm2 start scripts/crash-app.js --name test-crash --max-restarts 0
 *
 * IMPORTANT: The process must be registered in pm2-view's projects table
 * (pm2_name = 'test-crash') for the alert email to be sent.
 *
 * The process stays online for 12 seconds (long enough for the watcher to
 * register it), then crashes. The next watcher cycle (~10s) detects the
 * transition from 'online' to 'errored' and sends the alert email.
 *
 * To stop it:
 *   pm2 delete test-crash
 */

console.log('[test-crash] PID:', process.pid, '- will crash in 12 seconds...');

setTimeout(() => {
    console.error('[test-crash] Crashing now!');
    process.exit(1);
}, 12000);
