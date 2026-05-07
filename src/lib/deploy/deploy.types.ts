/**
 * Deploy domain types.
 *
 * This domain handles the deployment pipeline:
 * git pull → package manager install → build → pm2 restart
 */

/** Ordered steps of the deployment pipeline */
export const DEPLOY_STEPS = [
	'git-pull',
	'install',
	'build',
	'restart',
] as const;

export type DeployStep = (typeof DEPLOY_STEPS)[number];

/** Detected package manager */
export type PackageManager = 'bun' | 'pnpm' | 'npm';

/** Result of a single deploy step */
export interface DeployStepResult {
	step: DeployStep;
	success: boolean;
	exitCode: number | null;
}

/** Full deploy result */
export interface DeployResult {
	pmId: string;
	processName: string;
	packageManager: PackageManager;
	workingDir: string;
	steps: DeployStepResult[];
	success: boolean;
	error?: string;
}

/** Callback signature for streaming deploy output line by line */
export type DeployLogCallback = (step: DeployStep, line: string, isError: boolean) => void;
