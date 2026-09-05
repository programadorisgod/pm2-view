import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { auth } from '$lib/auth';
import { DeployConfigRepository } from '$lib/db/repositories/deploy-config-repository.impl';
import { DeployConfigService } from '$lib/deploy-config/deploy-config.service';
import { getProjectRole } from '$lib/server/project-access';
import type { RequestHandler } from './$types';

const createCommandSchema = z.object({
	project_id: z.string().min(1, 'Project ID is required'),
	command_type: z.enum(['install', 'build', 'restart', 'post-deploy']),
	target_process: z.string().nullable().optional(),
	label: z.string().min(1, 'Label is required').max(100, 'Label must be 100 characters or fewer'),
	command: z.string().min(1, 'Command is required').max(2000, 'Command must be 2000 characters or fewer')
});

export const POST: RequestHandler = async ({ request }) => {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json();
	const validationResult = createCommandSchema.safeParse(body);

	if (!validationResult.success) {
		const message = validationResult.error.issues[0]?.message ?? 'Validation failed';
		return json({ error: message }, { status: 400 });
	}

	const { project_id, command_type, target_process, label, command } = validationResult.data;

	// Check project access
	const userRole = (session.user as { role?: string }).role;
	const role = await getProjectRole(session.user.id, project_id, userRole);
	if (!role) {
		return json({ error: 'Access denied' }, { status: 403 });
	}

	const repo = new DeployConfigRepository();
	const service = new DeployConfigService(repo);

	try {
		const saved = await service.saveCommand({
			project_id,
			command_type,
			target_process,
			label,
			command
		});
		return json({ success: true, data: saved }, { status: 201 });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json({ error: message }, { status: 400 });
	}
};

const updateCommandSchema = z.object({
	label: z.string().min(1, 'Label is required').max(100, 'Label must be 100 characters or fewer').optional(),
	command: z.string().min(1, 'Command is required').max(2000, 'Command must be 2000 characters or fewer').optional(),
	target_process: z.string().nullable().optional(),
	sort_order: z.number().int().min(0).optional(),
});

export const PUT: RequestHandler = async ({ request }) => {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json();
	const validationResult = updateCommandSchema.safeParse(body);

	if (!validationResult.success) {
		const message = validationResult.error.issues[0]?.message ?? 'Validation failed';
		return json({ error: message }, { status: 400 });
	}

	// Extract command ID from body - the client sends id in the body
	const { id, label, command, target_process, sort_order } = body;

	if (!id) {
		return json({ error: 'Command ID is required' }, { status: 400 });
	}

	const repo = new DeployConfigRepository();

	// Find command by ID to check project access
	const cmd = await repo.getById(id);

	if (!cmd) {
		return json({ error: 'Command not found' }, { status: 404 });
	}

	// Check project access using the command's projectId
	const userRole = (session.user as { role?: string }).role;
	const role = await getProjectRole(session.user.id, cmd.projectId, userRole);
	if (!role) {
		return json({ error: 'Access denied' }, { status: 403 });
	}

	try {
		const updates: Record<string, unknown> = {};
		if (label !== undefined) updates.label = label;
		if (command !== undefined) updates.command = command;
		if (target_process !== undefined) updates.targetProcess = target_process ? target_process.trim() : null;
		if (sort_order !== undefined) updates.sortOrder = sort_order;

		const updated = await repo.update(id, updates);
		return json({ success: true, data: updated });
	} catch (err) {
		return json({ error: 'Failed to update command' }, { status: 400 });
	}
};

export const DELETE: RequestHandler = async ({ request }) => {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json();
	const { id } = body;

	if (!id) {
		return json({ error: 'Command ID is required' }, { status: 400 });
	}

	const repo = new DeployConfigRepository();

	// Find command by ID to check project access
	const cmd = await repo.getById(id);

	if (!cmd) {
		return json({ error: 'Command not found' }, { status: 404 });
	}

	// Check project access using the command's projectId
	const userRole = (session.user as { role?: string }).role;
	const role = await getProjectRole(session.user.id, cmd.projectId, userRole);
	if (!role) {
		return json({ error: 'Access denied' }, { status: 403 });
	}

	const service = new DeployConfigService(repo);

	try {
		await service.deleteCommand(id);
		return json({ success: true });
	} catch (err) {
		return json({ error: 'Failed to delete command' }, { status: 400 });
	}
};