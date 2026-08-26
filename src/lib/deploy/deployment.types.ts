import type { Deployment, DeploymentStatus } from '../db/schema';

export type { Deployment, DeploymentStatus };

export const DEPLOYMENT_STAGES = ['git', 'install', 'build', 'pm2', 'post-deploy'] as const;
export type DeployStage = (typeof DEPLOYMENT_STAGES)[number];

export interface CreateDeploymentInput {
	projectId: string;
	repository: string;
	branch: string;
	commitSha: string | null;
	deliveryId: string;
}

export interface IDeploymentRepository {
	getById(id: string): Promise<Deployment | null>;
	getByDeliveryId(deliveryId: string): Promise<Deployment | null>;
	getByProjectId(projectId: string, limit?: number): Promise<Deployment[]>;
	getLatestByProjectId(projectId: string): Promise<Deployment | null>;
	create(input: CreateDeploymentInput): Promise<Deployment>;
	markRunning(id: string, startedAt: Date): Promise<void>;
	markSuccess(id: string, finishedAt: Date, durationMs: number): Promise<void>;
	markFailed(id: string, stage: string, error: string, finishedAt: Date, durationMs: number): Promise<void>;
	appendLog(id: string, line: string): Promise<void>;
	setLogs(id: string, content: string): Promise<void>;
	setCommitSha(id: string, commitSha: string): Promise<void>;
	failStaleRunning(): Promise<number>;
	findNextPending(excludeIds?: string[]): Promise<Deployment | null>;
	hasRunningForProject(projectId: string, excludeDeploymentId?: string): Promise<boolean>;
}
