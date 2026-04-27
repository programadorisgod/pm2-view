import type { envVars } from '../db/schema';

export type EnvVar = typeof envVars.$inferSelect;
export type NewEnvVar = typeof envVars.$inferInsert;

export interface IEnvVarRepository {
	getByProjectId(projectId: string): Promise<EnvVar[]>;
	create(envVar: Omit<NewEnvVar, 'id'>): Promise<EnvVar>;
	update(id: string, data: Partial<Omit<NewEnvVar, 'id'>>): Promise<EnvVar>;
	delete(id: string): Promise<void>;
	bulkUpdate(projectId: string, envVars: Omit<NewEnvVar, 'id'>[]): Promise<EnvVar[]>;
}
