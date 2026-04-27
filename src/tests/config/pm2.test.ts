import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PM2_CONFIG } from '../../lib/config/pm2';

describe('PM2 Config', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it('should have default PM2 connection settings', () => {
		expect(PM2_CONFIG).toBeDefined();
		expect(PM2_CONFIG.host).toBeDefined();
		expect(PM2_CONFIG.port).toBeDefined();
	});

	it('should default to localhost', () => {
		expect(PM2_CONFIG.host).toBe('localhost');
	});

	it('should have sensible default port', () => {
		expect(PM2_CONFIG.port).toBe(4322); // Default PM2 port
	});

	it('should allow overriding host via environment', async () => {
		process.env.PM2_HOST = 'remote-host';
		const { PM2_CONFIG: config } = await import('../../lib/config/pm2');
		expect(config.host).toBe('remote-host');
	});

	it('should allow overriding port via environment', async () => {
		process.env.PM2_PORT = '5000';
		const { PM2_CONFIG: config } = await import('../../lib/config/pm2');
		expect(config.port).toBe(5000);
	});
});
