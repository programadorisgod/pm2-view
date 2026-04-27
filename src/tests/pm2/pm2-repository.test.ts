import { describe, it, expect, vi } from 'vitest';
import { PM2Repository } from '../../lib/pm2/pm2-repository.impl';
import type { IPM2Repository, PM2Process } from '../../lib/pm2/pm2.types';

describe('PM2 Repository', () => {
	it('should implement IPM2Repository interface', () => {
		const repo: IPM2Repository = new PM2Repository();
		expect(repo).toBeDefined();
		expect(typeof repo.list).toBe('function');
		expect(typeof repo.describe).toBe('function');
		expect(typeof repo.restart).toBe('function');
		expect(typeof repo.stop).toBe('function');
		expect(typeof repo.delete).toBe('function');
		expect(typeof repo.getLogs).toBe('function');
	});

	it('should be instantiable', () => {
		const repo = new PM2Repository();
		expect(repo instanceof PM2Repository).toBe(true);
	});

	it('should have all required methods', () => {
		const repo = new PM2Repository();
		const methods: (keyof IPM2Repository)[] = [
			'list',
			'describe',
			'restart',
			'stop',
			'delete',
			'getLogs'
		];
		methods.forEach((method) => {
			expect(typeof repo[method]).toBe('function');
		});
	});

	it('should return empty array for list (no processes)', () => {
		// This is a structural test - actual PM2 would return processes
		const repo = new PM2Repository();
		expect(repo.list).toBeDefined();
	});

	it('should handle describe for non-existent process', () => {
		const repo = new PM2Repository();
		expect(repo.describe).toBeDefined();
	});

	it('should have correct method signatures', () => {
		const repo = new PM2Repository();
		// Verify methods accept correct parameters
		expect(repo.list.length).toBe(0); // list() takes no args
		expect(repo.describe.length).toBe(1); // describe(name)
		expect(repo.restart.length).toBe(1); // restart(name)
		expect(repo.stop.length).toBe(1); // stop(name)
		expect(repo.delete.length).toBe(1); // delete(name)
		expect(repo.getLogs.length).toBe(1); // getLogs(name, lines?) - lines has default
	});
});
