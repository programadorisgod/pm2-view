import { describe, it, expect } from 'vitest';
import { projects, envVars, metrics } from '../../lib/db/schema';

describe('Projects Schema', () => {
	it('should have projects table with correct columns', () => {
		expect(projects).toBeDefined();
		expect(projects.id).toBeDefined();
		expect(projects.userId).toBeDefined();
		expect(projects.name).toBeDefined();
		expect(projects.pm2Name).toBeDefined();
		expect(projects.description).toBeDefined();
		expect(projects.createdAt).toBeDefined();
	});

	it('should have env_vars table with correct columns', () => {
		expect(envVars).toBeDefined();
		expect(envVars.id).toBeDefined();
		expect(envVars.projectId).toBeDefined();
		expect(envVars.key).toBeDefined();
		expect(envVars.value).toBeDefined();
		expect(envVars.isSecret).toBeDefined();
	});

	it('should have metrics table with correct columns', () => {
		expect(metrics).toBeDefined();
		expect(metrics.id).toBeDefined();
		expect(metrics.projectId).toBeDefined();
		expect(metrics.cpu).toBeDefined();
		expect(metrics.memory).toBeDefined();
		expect(metrics.uptime).toBeDefined();
		expect(metrics.status).toBeDefined();
		expect(metrics.recordedAt).toBeDefined();
	});

	it('should export all tables from schema index', async () => {
		const schema = await import('../../lib/db/schema/index');
		expect(schema.projects).toBeDefined();
		expect(schema.envVars).toBeDefined();
		expect(schema.metrics).toBeDefined();
	});

	it('should allow creating a valid project object', () => {
		const newProject: typeof projects.$inferInsert = {
			id: 'project-1',
			userId: 'user-1',
			name: 'My Project',
			pm2Name: 'my-app',
			description: 'A test project',
			createdAt: new Date()
		};
		expect(newProject.name).toBe('My Project');
		expect(newProject.pm2Name).toBe('my-app');
	});

	it('should allow creating a valid env var object', () => {
		const newEnvVar: typeof envVars.$inferInsert = {
			id: 'env-1',
			projectId: 'project-1',
			key: 'DATABASE_URL',
			value: 'sqlite://db.sqlite',
			isSecret: false
		};
		expect(newEnvVar.key).toBe('DATABASE_URL');
		expect(newEnvVar.isSecret).toBe(false);
	});

	it('should allow creating a valid metric object', () => {
		const newMetric: typeof metrics.$inferInsert = {
			id: 'metric-1',
			projectId: 'project-1',
			cpu: 25.5,
			memory: 128000,
			uptime: 3600,
			status: 'online',
			recordedAt: new Date()
		};
		expect(newMetric.cpu).toBe(25.5);
		expect(newMetric.status).toBe('online');
	});

	it('should support secret env vars', () => {
		const secretEnvVar: typeof envVars.$inferInsert = {
			id: 'env-2',
			projectId: 'project-1',
			key: 'API_SECRET',
			value: 'super-secret',
			isSecret: true
		};
		expect(secretEnvVar.isSecret).toBe(true);
	});
});
