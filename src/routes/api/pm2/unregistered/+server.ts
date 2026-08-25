import { json } from '@sveltejs/kit';
import { adminHandler } from '$lib/server/admin-handler';
import { createServices } from '$lib/services/factory';
import { ProjectRepository } from '$lib/db/repositories/project-repository.impl';

export const GET = adminHandler(async () => {
  const { pm2Service } = createServices();
  const projectRepo = new ProjectRepository();

  const [pm2Processes, projects] = await Promise.all([
    pm2Service.getAllProcesses(),
    projectRepo.getAll(),
  ]);

  const registeredPm2Names = new Set(projects.map(p => p.pm2Name));

  const unregisteredProcesses = pm2Processes
    .filter(p => !registeredPm2Names.has(p.name))
    .map(p => ({
      name: p.name,
      pm_id: p.pm_id,
      status: p.pm2_env?.status ?? 'unknown',
      cwd: (p.pm2_env as Record<string, string | undefined>)?.pm_cwd
        ?? (p.pm2_env as Record<string, string | undefined>)?.cwd
        ?? '',
    }));

  return json(unregisteredProcesses);
});
