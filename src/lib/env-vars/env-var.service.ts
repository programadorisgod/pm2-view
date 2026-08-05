import type { EnvVar, IEnvVarRepository, NewEnvVar } from './env-var.types';

export class EnvVarService {
  private repo: IEnvVarRepository;

  constructor(repo: IEnvVarRepository) {
    this.repo = repo;
  }

  async getEnvVars(projectId: string): Promise<EnvVar[]> {
    return await this.repo.getByProjectId(projectId);
  }

  async saveEnvVars(projectId: string, envVars: Omit<NewEnvVar, 'id'>[]): Promise<EnvVar[]> {
    return await this.repo.bulkUpdate(projectId, envVars);
  }
}
