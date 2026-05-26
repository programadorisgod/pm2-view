import type {
	IDeployConfigRepository,
	DeployConfig,
	DeployCommand,
	CommandType
} from './deploy-config.types';

const SHELL_METACHAR_REGEX = /[;|&$()`<>]|^&|>>?|<<?|\|\|/;

export class DeployConfigService {
	constructor(
		private repo: IDeployConfigRepository
	) {}

	async getConfig(projectId: string): Promise<DeployConfig> {
		const commands = await this.repo.getByProjectId(projectId);

		const install: DeployCommand[] = [];
		const build: DeployCommand[] = [];
		const restart: DeployCommand[] = [];

		for (const cmd of commands) {
			if (cmd.commandType === 'install') install.push(cmd);
			else if (cmd.commandType === 'build') build.push(cmd);
			else if (cmd.commandType === 'restart') restart.push(cmd);
		}

		// Sort restart commands by sortOrder
		install.sort((a, b) => a.sortOrder - b.sortOrder);
		build.sort((a, b) => a.sortOrder - b.sortOrder);
		restart.sort((a, b) => a.sortOrder - b.sortOrder);

		return { install, build, restart };
	}

	async saveCommand(payload: {
		project_id: string;
		command_type: CommandType;
		label: string;
		command: string;
	}): Promise<DeployCommand> {
		// Trim and validate label
		const label = payload.label.trim();
		if (!label) {
			throw new Error('Label is required');
		}
		if (label.length > 100) {
			throw new Error('Label must be 100 characters or fewer');
		}

		// Trim and validate command
		const command = payload.command.trim();
		if (!command) {
			throw new Error('Command is required');
		}
		if (command.length > 2000) {
			throw new Error('Command must be 2000 characters or fewer');
		}

		// Check for shell metacharacters
		if (SHELL_METACHAR_REGEX.test(command)) {
			throw new Error('Command contains disallowed characters');
		}

		const { project_id, command_type } = payload;

		// Singleton enforcement for install/build
		if (command_type === 'install' || command_type === 'build') {
			const existing = await this.repo.getByType(project_id, command_type);
			if (existing.length > 0) {
				// Update in place
				const updated = await this.repo.update(existing[0].id, { label, command });
				return updated;
			}
		}

		// For restart, auto-assign sort_order = max + 1
		if (command_type === 'restart') {
			const existingRestart = await this.repo.getByType(project_id, 'restart');
			const maxSortOrder = existingRestart.reduce((max, cmd) => Math.max(max, cmd.sortOrder), -1);
			const sortOrder = maxSortOrder + 1;

			const created = await this.repo.create({
				projectId: project_id,
				commandType: command_type,
				label,
				command,
				sortOrder
			});
			return created;
		}

		// Default: regular insert for install/build when no existing
		const sortOrder = 0;
		const created = await this.repo.create({
			projectId: project_id,
			commandType: command_type,
			label,
			command,
			sortOrder
		});
		return created;
	}

	async deleteCommand(id: string): Promise<void> {
		await this.repo.delete(id);
	}
}