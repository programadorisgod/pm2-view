import { json, error } from '@sveltejs/kit';
import { adminHandler } from '$lib/server/admin-handler';
import { rateLimiter } from '$lib/rate-limiter';
import { registerProjectSchema } from '$lib/validation/project-register-schema';
import { ProjectRepository } from '$lib/db/repositories/project-repository.impl';
import { AuditLogRepository } from '$lib/db/repositories/audit-log-repository.impl';
import { createProjectSharingService } from '$lib/services/admin/project-sharing.service';

function getZodErrorMessage(result: unknown): string {
  if (result && typeof result === 'object' && 'error' in result) {
    const err = result as { error?: { issues?: Array<{ message?: string }> } };
    const issues = err.error?.issues;
    if (issues && issues.length > 0) {
      return issues[0]?.message || 'Validation failed';
    }
  }
  return 'Validation failed';
}

export const POST = adminHandler(async (event) => {
  const ip = event.getClientAddress();
  const rateLimitResult = rateLimiter.check(ip);
  if (!rateLimitResult.allowed) {
    return json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter ?? 60) } }
    );
  }

  let body: unknown;
  try {
    body = await event.request.json();
  } catch {
    throw error(400, 'Invalid JSON body');
  }

  const validationResult = registerProjectSchema.safeParse(body);
  if (!validationResult.success) {
    throw error(400, getZodErrorMessage(validationResult));
  }

  const { processName, name, description, targetPath, teamId, members } = validationResult.data;
  const user = event.locals.user!;

  const projectRepo = new ProjectRepository();

  // Check for collision
  const existing = await projectRepo.getAll();
  const collision = existing.find(p => p.pm2Name === processName);
  if (collision) {
    throw error(409, 'Process already registered');
  }

  // Create project
  const newProject = await projectRepo.create({
    userId: user.id,
    pm2Name: processName,
    name: name ?? processName,
    description: description ?? `PM2 process: ${processName}`,
    targetPath: targetPath ?? null,
    teamId: teamId ?? null,
  });

  // Add members
  const sharingService = createProjectSharingService();
  for (const member of members ?? []) {
    try {
      await sharingService.addMember(newProject.id, member.userId, member.role, user.id);
    } catch (err) {
      // If member addition fails (e.g., user doesn't exist), continue but log
      console.error(`Failed to add member ${member.userId}:`, err);
    }
  }

  // Create audit log
  const auditRepo = new AuditLogRepository();
  await auditRepo.create({
    action: 'project_register',
    actorId: user.id,
    resourceType: 'project',
    resourceId: newProject.id,
    details: {
      processName,
      teamId,
      memberCount: members?.length ?? 0,
    },
  });

  return json(
    { success: true, project: { id: newProject.id, name: newProject.name, pm2Name: newProject.pm2Name } },
    { status: 201 }
  );
});
