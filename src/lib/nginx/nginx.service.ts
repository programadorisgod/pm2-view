import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from '$lib/logger';

export interface NginxLocation {
	path: string;
	proxyPass?: string;
	proxyBuffering?: string;
	proxyTimeout?: string;
	isWebsocket?: boolean;
}

export interface NginxConfigFile {
	filename: string;
	relativePath: string; // e.g. "rpatic.conf" or "apps/api-export-excel-reportes.conf"
	fullPath: string;
	isApp: boolean;
	size: number;
	updatedAt: string;
	commentTitle?: string;
	serverNames: string[];
	listenPorts: { port: number; ssl: boolean; isDefault: boolean }[];
	locations: NginxLocation[];
	includes: string[];
	sslCertificate?: string;
}

export interface NginxTestResult {
	ok: boolean;
	output: string;
	exitCode: number;
}

export interface NginxReloadResult {
	ok: boolean;
	output: string;
	exitCode: number;
}

export interface NginxSaveResult {
	ok: boolean;
	error?: string;
	testResult: NginxTestResult;
}

export class NginxService {
	private readonly baseDir: string;

	constructor(baseDir?: string) {
		this.baseDir = baseDir || process.env.NGINX_CONF_DIR || '/etc/nginx/conf.d';
	}

	getBaseDir(): string {
		return this.baseDir;
	}

	/**
	 * Validates that a requested relative path stays strictly within baseDir or baseDir/apps
	 * and does not contain path traversal (..).
	 */
	sanitizePath(relativePath: string): string {
		if (!relativePath || typeof relativePath !== 'string') {
			throw new Error('Ruta de archivo inválida');
		}

		// Disallow path traversal, null bytes, backslashes
		if (relativePath.includes('..') || relativePath.includes('\0') || relativePath.includes('\\')) {
			throw new Error('Ruta no permitida: caracteres sospechosos');
		}

		const cleaned = relativePath.trim().replace(/^\/+/, '');
		const fullPath = path.resolve(this.baseDir, cleaned);

		// Must strictly start with baseDir
		const realBase = path.resolve(this.baseDir);
		if (!fullPath.startsWith(realBase)) {
			throw new Error('Acceso denegado fuera del directorio de configuración de Nginx');
		}

		// Must have .conf extension
		if (!fullPath.endsWith('.conf')) {
			throw new Error('Solo se permiten archivos con extensión .conf');
		}

		return fullPath;
	}

	/**
	 * Sanitizes a filename for creating a new config file in apps/
	 */
	sanitizeAppFilename(name: string): string {
		let clean = name ? name.trim() : '';
		if (!clean) throw new Error('El nombre de la aplicación es requerido');

		// Disallow directory separators
		if (clean.includes('/') || clean.includes('\\')) {
			throw new Error('El nombre no puede contener barras o rutas');
		}

		clean = path.basename(clean);

		// Only allow alphanumeric, dashes, dots, underscores
		if (!/^[a-zA-Z0-9_-]+(\.conf)?$/.test(clean)) {
			throw new Error('El nombre solo puede contener letras, números, guiones y guiones bajos');
		}

		if (!clean.endsWith('.conf')) {
			clean += '.conf';
		}

		return clean;
	}

	/**
	 * Lists all configuration files in baseDir and baseDir/apps
	 */
	async listFiles(): Promise<NginxConfigFile[]> {
		const results: NginxConfigFile[] = [];

		if (!fs.existsSync(this.baseDir)) {
			logger.warn(`Nginx base dir does not exist: ${this.baseDir}`);
			return results;
		}

		// 1. Scan root conf files in baseDir
		const rootEntries = await fs.promises.readdir(this.baseDir, { withFileTypes: true });
		for (const entry of rootEntries) {
			if (entry.isFile() && entry.name.endsWith('.conf')) {
				const fullPath = path.join(this.baseDir, entry.name);
				const parsed = await this.parseConfigFile(entry.name, entry.name, fullPath, false);
				if (parsed) results.push(parsed);
			}
		}

		// 2. Scan apps directory if present
		const appsDir = path.join(this.baseDir, 'apps');
		if (fs.existsSync(appsDir)) {
			const appEntries = await fs.promises.readdir(appsDir, { withFileTypes: true });
			for (const entry of appEntries) {
				if (entry.isFile() && entry.name.endsWith('.conf')) {
					const fullPath = path.join(appsDir, entry.name);
					const relativePath = `apps/${entry.name}`;
					const parsed = await this.parseConfigFile(entry.name, relativePath, fullPath, true);
					if (parsed) results.push(parsed);
				}
			}
		}

		// Sort: main configs first, then apps alphabetically
		return results.sort((a, b) => {
			if (a.isApp !== b.isApp) return a.isApp ? 1 : -1;
			return a.filename.localeCompare(b.filename);
		});
	}

	/**
	 * Reads the text content of a config file.
	 */
	async readFile(relativePath: string): Promise<string> {
		const fullPath = this.sanitizePath(relativePath);
		try {
			return await fs.promises.readFile(fullPath, 'utf8');
		} catch (err: any) {
			logger.error(`Error reading nginx config ${fullPath}`, { error: err.message });
			throw new Error(`No se pudo leer el archivo: ${err.message}`);
		}
	}

	/**
	 * Parses an Nginx config file to extract high-level info (locations, proxies, ports, etc.).
	 */
	async parseConfigFile(
		filename: string,
		relativePath: string,
		fullPath: string,
		isApp: boolean
	): Promise<NginxConfigFile | null> {
		try {
			const stat = await fs.promises.stat(fullPath);
			const content = await fs.promises.readFile(fullPath, 'utf8');

			// Extract title from comment header if available, e.g. # API EXPORT EXCEL
			let commentTitle: string | undefined;
			const lines = content.split('\n');
			for (const line of lines) {
				const trimmed = line.trim();
				if (trimmed.startsWith('#')) {
					const commentText = trimmed.replace(/^#+\s*/, '').trim();
					if (/^[_\-=\s*]+$/.test(commentText)) continue;
					if (commentText.includes('HTTP') || commentText.includes('HTTPS')) continue;
					if (commentText.length >= 2 && /[a-zA-Z0-9]/.test(commentText)) {
						commentTitle = commentText;
						break;
					}
				}
			}

			// Extract server_name
			const serverNames: string[] = [];
			const serverNameRegex = /server_name\s+([^;]+);/g;
			let snMatch: RegExpExecArray | null;
			while ((snMatch = serverNameRegex.exec(content)) !== null) {
				const names = snMatch[1].trim().split(/\s+/);
				serverNames.push(...names);
			}

			// Extract listen ports
			const listenPorts: { port: number; ssl: boolean; isDefault: boolean }[] = [];
			const listenRegex = /listen\s+(?:\[::\]:)?([0-9]+)([^;]*);/g;
			let lMatch: RegExpExecArray | null;
			while ((lMatch = listenRegex.exec(content)) !== null) {
				const port = parseInt(lMatch[1], 10);
				const rest = lMatch[2];
				const ssl = rest.includes('ssl');
				const isDefault = rest.includes('default_server');
				if (!listenPorts.some((p) => p.port === port && p.ssl === ssl)) {
					listenPorts.push({ port, ssl, isDefault });
				}
			}

			// Extract locations and proxy_pass
			const locations: NginxLocation[] = [];
			const locationRegex = /location\s+([^{]+)\{([^}]+)\}/gs;
			let locMatch: RegExpExecArray | null;
			while ((locMatch = locationRegex.exec(content)) !== null) {
				const locPath = locMatch[1].trim();
				const body = locMatch[2];

				const proxyMatch = body.match(/proxy_pass\s+([^;]+);/);
				const proxyPass = proxyMatch ? proxyMatch[1].trim() : undefined;

				const bufferingMatch = body.match(/proxy_buffering\s+([^;]+);/);
				const proxyBuffering = bufferingMatch ? bufferingMatch[1].trim() : undefined;

				const timeoutMatch = body.match(/proxy_read_timeout\s+([^;]+);/);
				const proxyTimeout = timeoutMatch ? timeoutMatch[1].trim() : undefined;

				const isWebsocket =
					body.includes('$http_upgrade') ||
					body.includes('Upgrade $http_upgrade') ||
					body.includes('Connection "upgrade"');

				locations.push({
					path: locPath,
					proxyPass,
					proxyBuffering,
					proxyTimeout,
					isWebsocket
				});
			}

			// Extract includes
			const includes: string[] = [];
			const includeRegex = /include\s+([^;]+);/g;
			let incMatch: RegExpExecArray | null;
			while ((incMatch = includeRegex.exec(content)) !== null) {
				includes.push(incMatch[1].trim());
			}

			// Extract SSL Certificate
			const sslCertMatch = content.match(/ssl_certificate\s+([^;]+);/);
			const sslCertificate = sslCertMatch ? sslCertMatch[1].trim() : undefined;

			return {
				filename,
				relativePath,
				fullPath,
				isApp,
				size: stat.size,
				updatedAt: stat.mtime.toISOString(),
				commentTitle,
				serverNames,
				listenPorts,
				locations,
				includes,
				sslCertificate
			};
		} catch (err: any) {
			logger.warn(`Could not parse nginx file ${fullPath}`, { error: err.message });
			return null;
		}
	}

	/**
	 * Saves content to a configuration file using sudo.
	 * Writes to a temporary file first, then copies it via sudo, sets 0644 permissions,
	 * and immediately runs `nginx -t`.
	 */
	async saveFile(
		relativePath: string,
		content: string,
		sudoPassword?: string
	): Promise<NginxSaveResult> {
		const targetPath = this.sanitizePath(relativePath);

		// Write to temporary file
		const tmpFile = path.join(os.tmpdir(), `nginx-edit-${Date.now()}-${Math.random().toString(36).slice(2)}.conf`);
		await fs.promises.writeFile(tmpFile, content, 'utf8');

		try {
			// Copy temp file to target with sudo
			const cmd = `cp '${tmpFile}' '${targetPath}' && chmod 644 '${targetPath}'`;
			const copyResult = await this.runSudoCommand(cmd, sudoPassword);

			if (!copyResult.ok) {
				logger.error(`Failed to copy nginx config to ${targetPath}`, { output: copyResult.output });
				return {
					ok: false,
					error: copyResult.output || 'Error al guardar el archivo con sudo. Verifica la contraseña.',
					testResult: { ok: false, output: copyResult.output, exitCode: copyResult.exitCode }
				};
			}

			// Automatically test config after saving
			const testResult = await this.testConfig(sudoPassword);

			return {
				ok: true,
				testResult
			};
		} finally {
			try {
				await fs.promises.unlink(tmpFile);
			} catch {
				// Ignore temp unlink error
			}
		}
	}

	/**
	 * Creates a new configuration file inside apps/ directory.
	 */
	async createAppFile(
		name: string,
		content: string,
		sudoPassword?: string
	): Promise<NginxSaveResult & { filename?: string }> {
		const cleanFilename = this.sanitizeAppFilename(name);
		const relativePath = `apps/${cleanFilename}`;

		// Ensure apps dir exists
		const appsDir = path.join(this.baseDir, 'apps');
		if (!fs.existsSync(appsDir)) {
			await this.runSudoCommand(`mkdir -p '${appsDir}' && chmod 755 '${appsDir}'`, sudoPassword);
		}

		const saveResult = await this.saveFile(relativePath, content, sudoPassword);
		return {
			...saveResult,
			filename: cleanFilename
		};
	}

	/**
	 * Runs `sudo nginx -t` to test the configuration syntax.
	 */
	async testConfig(sudoPassword?: string): Promise<NginxTestResult> {
		const result = await this.runSudoCommand('nginx -t', sudoPassword);
		return {
			ok: result.ok,
			output: result.output,
			exitCode: result.exitCode
		};
	}

	/**
	 * Runs `sudo nginx -s reload` to apply the updated configuration.
	 */
	async reloadNginx(sudoPassword: string): Promise<NginxReloadResult> {
		if (!sudoPassword) {
			return { ok: false, output: 'Se requiere la contraseña de sudo para recargar Nginx.', exitCode: 1 };
		}
		// First verify syntax
		const test = await this.testConfig(sudoPassword);
		if (!test.ok) {
			return {
				ok: false,
				output: `No se puede recargar Nginx porque la prueba de configuración falló:\n\n${test.output}`,
				exitCode: test.exitCode
			};
		}

		const result = await this.runSudoCommand('nginx -s reload', sudoPassword);
		return {
			ok: result.ok,
			output: result.output || 'Nginx recargado exitosamente.',
			exitCode: result.exitCode
		};
	}

	/**
	 * Executes a command with `sudo -S -p ''` when a password is provided,
	 * or directly if no password is provided.
	 */
	private runSudoCommand(
		command: string,
		password?: string
	): Promise<{ ok: boolean; output: string; exitCode: number }> {
		return new Promise((resolve) => {
			const useSudo = Boolean(password);
			const cmd = useSudo ? `sudo -S -p '' ${command}` : command;

			const child = spawn('sh', ['-c', cmd], {
				env: process.env,
				stdio: ['pipe', 'pipe', 'pipe']
			});

			let stdout = '';
			let stderr = '';

			child.stdout.on('data', (data) => {
				stdout += data.toString();
			});

			child.stderr.on('data', (data) => {
				stderr += data.toString();
			});

			child.on('error', (err) => {
				resolve({
					ok: false,
					output: err.message,
					exitCode: -1
				});
			});

			child.on('close', (code) => {
				const combined = (stdout + (stdout && stderr ? '\n' : '') + stderr).trim();
				// Filter out any potential sudo prompt artifact
				const cleanOutput = combined.replace(/^\[sudo\]\s*password\s*for\s*[^:]+:\s*/m, '').trim();

				resolve({
					ok: code === 0,
					output: cleanOutput,
					exitCode: code ?? -1
				});
			});

			if (password && child.stdin) {
				try {
					child.stdin.write(`${password}\n`);
				} catch {
					// stdin may have already closed
				}
				child.stdin.end();
			} else if (child.stdin) {
				child.stdin.end();
			}
		});
	}
}
