export type CommandType = 'install' | 'build' | 'restart';

export interface DeployCommand {
	id: string;
	projectId: string;
	commandType: CommandType;
	label: string;
	command: string;
	sortOrder: number;
	createdAt: Date;
}

export interface DeployConfig {
	install: DeployCommand[];
	build: DeployCommand[];
	restart: DeployCommand[];
}

export interface IDeployConfigRepository {
	getById(id: string): Promise<DeployCommand | null>;
	getByProjectId(projectId: string): Promise<DeployCommand[]>;
	getByType(projectId: string, commandType: CommandType): Promise<DeployCommand[]>;
	create(cmd: Omit<DeployCommand, 'id' | 'createdAt'>): Promise<DeployCommand>;
	update(id: string, data: Partial<Omit<DeployCommand, 'id' | 'createdAt'>>): Promise<DeployCommand>;
	delete(id: string): Promise<void>;
	deleteAllForProject(projectId: string): Promise<void>;
}