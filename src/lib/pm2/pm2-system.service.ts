import { exec, spawn } from 'child_process';
import type { Readable } from 'stream';
import { logger } from '$lib/logger';
import { escapeShellArg } from '$lib/utils/shell';

export interface CommandResult {
	ok: boolean;
	output: string;
}

export interface ApplyStartupResult {
	ok: boolean;
	error?: string;
	serviceName?: string;
}

/**
 * Runs PM2 daemon-level operations: `pm2 save`, `pm2 startup` and the
 * application of the generated startup script (requires sudo).
 */
export class PM2SystemService {
	async save(): Promise<CommandResult> {
		return this.runCommand('pm2 save');
	}

	/**
	 * Runs `pm2 startup` and extracts the sudo command that the user would
	 * otherwise copy/paste into the terminal to actually enable boot startup.
	 *
	 * `pm2 startup` exits with a non-zero code when it prints the copy/paste
	 * command without applying it, so success is determined by whether the
	 * command was extracted from the output.
	 */
	async startup(): Promise<CommandResult & { command?: string }> {
		// `pm2 startup` exits non-zero whenever it prints the copy/paste
		// command (its normal success path), so run quietly and treat a
		// missing command as the only real failure.
		const result = await this.runCommand('pm2 startup', true);
		const command = this.extractStartupCommand(result.output);

		if (command) return { ok: true, output: result.output, command };

		logger.warn('pm2 startup produced no copy/paste command', { output: result.output });
		return { ...result, command: undefined };
	}

	/**
	 * Executes the pm2-generated startup command through `sudo -S`, feeding the
	 * password through stdin (never via argv/env). Streams output line by line,
	 * then verifies the resulting systemd service is enabled.
	 */
	async applyStartup(
		command: string,
		password: string,
		onLine: (line: string, isError: boolean) => void
	): Promise<ApplyStartupResult> {
		const trimmed = command.trim();
		if (!this.isSafeStartupCommand(trimmed)) {
			return { ok: false, error: 'Invalid startup command' };
		}

		// Replace the leading `sudo` with `sudo -S -p ''` so the password is
		// read from stdin and no prompt line is printed to the output.
		const cmd = trimmed.replace(/^\s*sudo\b/, `sudo -S -p ''`);
		const serviceName = this.extractServiceName(trimmed);

		return new Promise<ApplyStartupResult>((resolve) => {
			const child = spawn('sh', ['-c', cmd], {
				env: process.env,
				stdio: ['pipe', 'pipe', 'pipe'],
			});

			const lines: { text: string; isError: boolean }[] = [];

			streamLines(child.stdout, false, onLine, lines);
			streamLines(child.stderr, true, onLine, lines);

			child.on('error', (err) => {
				logger.error('Failed to spawn startup command', { error: err.message });
				onLine(err.message, true);
				resolve({ ok: false, error: err.message });
			});

			child.on('close', async (code) => {
				if (code !== 0) {
					const lastErrorLine = [...lines].reverse().find((l) => l.isError)?.text;
					resolve({ ok: false, error: lastErrorLine ?? `Command exited with code ${code}` });
					return;
				}
				await this.verifyStartup(serviceName, onLine);
				resolve({ ok: true, serviceName });
			});

			try {
				child.stdin.write(`${password}\n`);
			} catch {
				// stdin already closed — the command finished before reading it
			}
			child.stdin.end();
		});
	}

	/**
	 * Confirms the systemd unit that pm2 just installed actually exists and is
	 * enabled, streaming real output so the UI shows a concrete result even if
	 * pm2 printed nothing during the sudo step.
	 */
	private async verifyStartup(
		serviceName: string | undefined,
		onLine: (line: string, isError: boolean) => void
	): Promise<void> {
		if (!serviceName) {
			onLine('[PM2] Startup script applied.', false);
			return;
		}

		onLine(`[PM2] Verifying ${serviceName}...`, false);
		const result = await this.runCommand(`systemctl is-enabled ${escapeShellArg(serviceName)}`, true);
		if (result.ok && result.output) {
			onLine(`[PM2] ${serviceName} is ${result.output}`, false);
		} else {
			onLine(`[PM2] ${result.output || `${serviceName} could not be verified`}`, true);
		}
	}

	/**
	 * Derives the systemd service name (`pm2-<user>`) from the generated
	 * startup command (`pm2 startup systemd -u <user> --hp <home>`).
	 */
	private extractServiceName(command: string): string | undefined {
		const userMatch = command.match(/\s-u\s+([A-Za-z0-9._-]+)/);
		return userMatch ? `pm2-${userMatch[1]}.service` : undefined;
	}

	private async runCommand(command: string, quiet = false): Promise<CommandResult> {
		return new Promise((resolve) => {
			exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
				const output = `${stdout ?? ''}${stderr ?? ''}`.trim();
				if (error) {
					// `error` only carries the generic "Command failed" message;
					// the real pm2 output arrives via the callback args, so use
					// them on non-zero exit too.
					const message = output || error.message;
					if (!quiet) logger.warn('PM2 system command failed', { command, output: message });
					resolve({ ok: false, output: message });
					return;
				}
				resolve({ ok: true, output });
			});
		});
	}

	/**
	 * PM2 prints the command to copy/paste as a single line starting with `sudo`.
	 */
	private extractStartupCommand(output: string): string | undefined {
		for (const line of output.split('\n')) {
			const trimmed = line.trim();
			if (trimmed.startsWith('sudo ')) {
				return trimmed;
			}
		}
		return undefined;
	}

	/**
	 * The command is trusted to come from `pm2 startup`, but we still constrain it
	 * to a single-line sudo invocation of pm2 startup to block injection.
	 */
	private isSafeStartupCommand(command: string): boolean {
		return (
			command.startsWith('sudo ') &&
			!/\n/.test(command) &&
			/\bpm2\b/.test(command) &&
			/\bstartup\b/.test(command)
		);
	}
}

/**
 * Splits a stream into lines (UTF-8) and forwards them to `onLine`,
 * buffering partial lines until a newline or the stream ends.
 */
function streamLines(
	stream: Readable,
	isError: boolean,
	onLine: (line: string, isError: boolean) => void,
	lines: { text: string; isError: boolean }[]
): void {
	stream.setEncoding('utf8');
	let buffer = '';

	const flush = (chunk: string) => {
		buffer += chunk;
		let idx: number;
		while ((idx = buffer.indexOf('\n')) !== -1) {
			const line = buffer.slice(0, idx);
			buffer = buffer.slice(idx + 1);
			if (line.trim()) {
				onLine(line, isError);
				lines.push({ text: line, isError });
			}
		}
	};

	stream.on('data', flush);
	stream.on('end', () => {
		if (buffer.trim()) {
			onLine(buffer, isError);
			lines.push({ text: buffer, isError });
		}
	});
}
