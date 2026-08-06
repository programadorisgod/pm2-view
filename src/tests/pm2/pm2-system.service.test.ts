import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exec, spawn } from 'child_process';
import { EventEmitter } from 'events';
import { PM2SystemService } from '../../lib/pm2/pm2-system.service';

vi.mock('child_process', () => {
	const exec = vi.fn();
	const spawn = vi.fn();
	return {
		default: { exec, spawn },
		exec,
		spawn,
	};
});

function mockExecSuccess(stdout: string, stderr = '') {
	vi.mocked(exec).mockImplementation((...args: any[]) => {
		const cb = args[args.length - 1];
		cb(null, stdout, stderr);
		return {} as any;
	});
}

function mockExecFailure(message: string) {
	vi.mocked(exec).mockImplementation((...args: any[]) => {
		const cb = args[args.length - 1];
		cb(new Error(message), '', '');
		return {} as any;
	});
}

// Node's exec error object does NOT carry stdout/stderr (they are undefined);
// the real output only arrives via the callback args, so mimic that contract.
function mockExecErrorWithOutput(message: string, stdout: string, stderr = '') {
	vi.mocked(exec).mockImplementation((...args: any[]) => {
		const cb = args[args.length - 1];
		cb(new Error(message), stdout, stderr);
		return {} as any;
	});
}

function createMockChild() {
	const child: any = {
		stdout: Object.assign(new EventEmitter(), { setEncoding: vi.fn() }),
		stderr: Object.assign(new EventEmitter(), { setEncoding: vi.fn() }),
		stdin: { write: vi.fn(), end: vi.fn() },
		on: vi.fn(),
	};
	const handlers: Record<string, Function> = {};
	child.on.mockImplementation((event: string, cb: Function) => {
		handlers[event] = cb;
		return child;
	});
	child.__handlers = handlers;
	return child;
}

const STARTUP_OUTPUT = `[PM2] Init System found: systemd
[PM2] To setup the Startup Script, copy/paste the following command:
sudo env PATH=$PATH:/home/rpatic/.nvm/versions/node/v24.13.1/bin /home/rpatic/.nvm/versions/node/v24.13.1/lib/node_modules/pm2/bin/pm2 startup systemd -u rpatic --hp /home/rpatic
`;

const STARTUP_COMMAND =
	'sudo env PATH=$PATH:/home/rpatic/.nvm/versions/node/v24.13.1/bin /home/rpatic/.nvm/versions/node/v24.13.1/lib/node_modules/pm2/bin/pm2 startup systemd -u rpatic --hp /home/rpatic';

describe('PM2SystemService', () => {
	let service: PM2SystemService;

	beforeEach(() => {
		vi.clearAllMocks();
		service = new PM2SystemService();
	});

	describe('save', () => {
		it('should return ok with output when pm2 save succeeds', async () => {
			mockExecSuccess('[PM2] Successfully saved in /home/rpatic/.pm2/dump.pm2\n');

			const result = await service.save();

			expect(result.ok).toBe(true);
			expect(result.output).toContain('Successfully saved');
			expect(vi.mocked(exec).mock.calls[0][0]).toBe('pm2 save');
		});

		it('should return ok false when pm2 save fails', async () => {
			mockExecFailure('pm2 save failed');

			const result = await service.save();

			expect(result.ok).toBe(false);
			expect(result.output).toBeTruthy();
		});
	});

	describe('startup', () => {
		it('should extract the copy/paste sudo command from pm2 output', async () => {
			mockExecSuccess(STARTUP_OUTPUT);

			const result = await service.startup();

			expect(result.ok).toBe(true);
			expect(result.command).toBe(STARTUP_COMMAND);
			expect(vi.mocked(exec).mock.calls[0][0]).toBe('pm2 startup');
		});

		it('should return ok false when pm2 startup fails', async () => {
			mockExecFailure('pm2 startup failed');

			const result = await service.startup();

			expect(result.ok).toBe(false);
			expect(result.command).toBeUndefined();
		});

		it('should not extract a command when none is present', async () => {
			mockExecSuccess('[PM2] Init System found: systemd\n');

			const result = await service.startup();

			expect(result.ok).toBe(true);
			expect(result.command).toBeUndefined();
		});

		it('should treat non-zero exit with a printed command as success', async () => {
			// pm2 startup exits 1 when it prints the copy/paste command but the
			// script has not been applied yet — the command is still the result.
			mockExecErrorWithOutput('Command failed: pm2 startup', STARTUP_OUTPUT);

			const result = await service.startup();

			expect(result.ok).toBe(true);
			expect(result.command).toBe(STARTUP_COMMAND);
		});
	});

	describe('applyStartup', () => {
		it('should run the command through sudo -S and feed the password via stdin', async () => {
			const child = createMockChild();
			vi.mocked(spawn).mockReturnValue(child);
			mockExecSuccess('enabled\n');

			const lines: { text: string; isError: boolean }[] = [];
			const promise = service.applyStartup(STARTUP_COMMAND, 'secret', (line, isError) => {
				lines.push({ text: line, isError });
			});

			// Simulate streaming output then a successful exit
			child.stdout.emit('data', '[PM2] Writing init configuration in /etc/systemd/system/pm2-rpatic.service\n');
			child.stdout.emit('end');
			child.__handlers['close'](0);

			const result = await promise;

			expect(spawn).toHaveBeenCalledWith('sh', ['-c', expect.stringContaining('sudo -S -p \'\'')], expect.anything());
			const shCmd = (spawn as any).mock.calls[0][1][1];
			expect(shCmd).toContain('pm2 startup systemd');
			expect(shCmd).not.toContain('secret');
			expect(child.stdin.write).toHaveBeenCalledWith('secret\n');
			expect(child.stdin.end).toHaveBeenCalled();
			expect(result.ok).toBe(true);
			expect(result.serviceName).toBe('pm2-rpatic.service');
			expect(lines.some((l) => l.text === '[PM2] Writing init configuration in /etc/systemd/system/pm2-rpatic.service')).toBe(true);
		});

		it('should verify the installed service is enabled and stream the result', async () => {
			const child = createMockChild();
			vi.mocked(spawn).mockReturnValue(child);
			mockExecSuccess('enabled\n');

			const lines: string[] = [];
			const promise = service.applyStartup(STARTUP_COMMAND, 'secret', (line) => {
				lines.push(line);
			});

			child.stdout.emit('end');
			child.__handlers['close'](0);

			const result = await promise;

			expect(result.ok).toBe(true);
			expect(result.serviceName).toBe('pm2-rpatic.service');
			expect(lines).toContain('[PM2] Verifying pm2-rpatic.service...');
			expect(lines).toContain('[PM2] pm2-rpatic.service is enabled');
			expect(vi.mocked(exec).mock.calls.some((c) => String(c[0]).includes("'pm2-rpatic.service'"))).toBe(true);
			const verifyCall = vi.mocked(exec).mock.calls.find((c) => String(c[0]).includes('systemctl is-enabled'));
			expect(verifyCall?.[1]).toMatchObject({ timeout: 8000 });
		});

		it('should report when the service cannot be verified', async () => {
			const child = createMockChild();
			vi.mocked(spawn).mockReturnValue(child);
			mockExecFailure('systemctl failed');

			const lines: { text: string; isError: boolean }[] = [];
			const promise = service.applyStartup(STARTUP_COMMAND, 'secret', (line, isError) => {
				lines.push({ text: line, isError });
			});

			child.stdout.emit('end');
			child.__handlers['close'](0);

			const result = await promise;

			expect(result.ok).toBe(true);
			expect(result.serviceName).toBe('pm2-rpatic.service');
			expect(lines.some((l) => l.isError && l.text === '[PM2] systemctl failed')).toBe(true);
			expect(
				lines.some((l) => l.isError && l.text.includes('could not be confirmed as enabled'))
			).toBe(true);
		});

		it('should mark the result as failed when the command exits non-zero', async () => {
			const child = createMockChild();
			vi.mocked(spawn).mockReturnValue(child);

			const lines: { text: string; isError: boolean }[] = [];
			const promise = service.applyStartup(STARTUP_COMMAND, 'wrong', (line, isError) => {
				lines.push({ text: line, isError });
			});

			child.stderr.emit('data', '[sudo] wrong password\n');
			child.stderr.emit('end');
			child.__handlers['close'](1);

			const result = await promise;

			expect(result.ok).toBe(false);
			expect(result.error).toContain('wrong password');
		});

		it('should reject commands that are not sudo pm2 startup invocations', async () => {
			const result = await service.applyStartup(
				'rm -rf / && echo hacked',
				'secret',
				vi.fn()
			);

			expect(result.ok).toBe(false);
			expect(result.error).toContain('Invalid startup command');
			expect(spawn).not.toHaveBeenCalled();
		});

		it('should reject multi-line commands to block injection', async () => {
			const result = await service.applyStartup(
				'sudo env X=1 pm2 startup\nrm -rf /',
				'secret',
				vi.fn()
			);

			expect(result.ok).toBe(false);
			expect(spawn).not.toHaveBeenCalled();
		});
	});
});
