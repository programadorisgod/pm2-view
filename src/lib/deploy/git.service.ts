import { execFile } from 'child_process';
import { runCommand } from './process-runner';

export type GitLogFn = (line: string) => void;

export class GitCommandError extends Error {
	constructor(
		message: string,
		public readonly output: string[]
	) {
		super(message);
		this.name = 'GitCommandError';
	}
}

const GIT_TIMEOUT_MS = 120_000;

/**
 * Safe git operations for deployments.
 *
 * Strategy (non-destructive):
 *   git fetch origin
 *   git checkout <branch>   (only when not already on it)
 *   git pull --ff-only
 *
 * Never runs reset --hard / clean / checkout . — local modifications
 * cause the deployment to fail explicitly instead of being destroyed.
 * All arguments come from internal project configuration, never from
 * webhook payloads.
 */
export class GitService {
	async fetchOrigin(cwd: string, onLog: GitLogFn, authToken?: string): Promise<void> {
		await this.exec(cwd, [...this.authArgs(authToken), 'fetch', 'origin'], onLog);
	}

	async currentBranch(cwd: string): Promise<string> {
		const output = await this.capture(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
		return output.trim();
	}

	async checkoutBranch(cwd: string, branch: string, onLog: GitLogFn): Promise<void> {
		const current = await this.currentBranch(cwd);
		if (current === branch) {
			onLog(`Already on ${branch}`);
			return;
		}
		await this.exec(cwd, ['checkout', branch], onLog);
	}

	async pullFFOnly(cwd: string, onLog: GitLogFn, authToken?: string): Promise<void> {
		await this.exec(cwd, [...this.authArgs(authToken), 'pull', '--ff-only', 'origin'], onLog);
	}

	async headSha(cwd: string): Promise<string> {
		const output = await this.capture(cwd, ['rev-parse', 'HEAD']);
		return output.trim();
	}

	/**
	 * Returns true when the working tree has uncommitted changes to
	 * tracked files. Used to abort a deployment instead of destroying
	 * local modifications.
	 *
	 * Untracked files (logs/, .env, build artifacts) are ignored: they
	 * never get destroyed by fetch/checkout/pull, and git itself refuses
	 * the pull if an incoming file would overwrite an untracked one.
	 */
	async hasLocalChanges(cwd: string): Promise<boolean> {
		const output = await this.capture(cwd, ['status', '--porcelain', '--untracked-files=no']);
		return output.trim().length > 0;
	}

	private async exec(cwd: string, args: string[], onLog: GitLogFn): Promise<void> {
		const display = args.map((a) =>
			a.startsWith('http.extraheader=') ? 'http.extraheader=<redacted>' : a
		);
		onLog(`git ${display.join(' ')}`);
		const output: string[] = [];
		const exitCode = await runCommand(
			cwd,
			'git',
			args,
			(line, isError) => {
				output.push(line);
				onLog(isError ? `[stderr] ${line}` : line);
			},
			undefined,
			GIT_TIMEOUT_MS
		);
		if (exitCode !== 0) {
			const commandLabel = args[0] === '-c' ? (args[3] ?? 'command') : args[0];
			throw new GitCommandError(`git ${commandLabel} failed with exit code ${exitCode}`, output);
		}
	}

	/**
	 * Extra git config to authenticate HTTPS network operations without
	 * touching the repository's remote configuration. The header value must
	 * never be logged; exec() redacts it from displayed output.
	 */
	private authArgs(token?: string): string[] {
		if (!token) return [];
		const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
		return ['-c', `http.extraheader=AUTHORIZATION: basic ${basic}`];
	}

	private async capture(cwd: string, args: string[]): Promise<string> {
		return new Promise((resolve, reject) => {
			execFile('git', args, { cwd, timeout: GIT_TIMEOUT_MS }, (err, stdout, stderr) => {
				if (err) {
					reject(new GitCommandError(`git ${args[0]} failed: ${stderr || err.message}`, [stderr]));
					return;
				}
				resolve(stdout);
			});
		});
	}
}
