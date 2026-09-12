import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { NginxService } from '$lib/nginx/nginx.service';

describe('NginxService', () => {
	let tempDir: string;
	let service: NginxService;

	beforeEach(async () => {
		tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nginx-test-'));
		await fs.promises.mkdir(path.join(tempDir, 'apps'), { recursive: true });
		service = new NginxService(tempDir);
	});

	afterEach(async () => {
		await fs.promises.rm(tempDir, { recursive: true, force: true });
	});

	describe('Security & Path Sanitization', () => {
		it('should reject paths attempting path traversal with ..', () => {
			expect(() => service.sanitizePath('../etc/passwd')).toThrow();
			expect(() => service.sanitizePath('apps/../../shadow.conf')).toThrow();
		});

		it('should reject non-.conf files', () => {
			expect(() => service.sanitizePath('script.sh')).toThrow();
			expect(() => service.sanitizePath('apps/config.yaml')).toThrow();
		});

		it('should accept valid conf paths', () => {
			const sanitized = service.sanitizePath('rpatic.conf');
			expect(sanitized).toBe(path.join(tempDir, 'rpatic.conf'));

			const appSanitized = service.sanitizePath('apps/agendamiento.conf');
			expect(appSanitized).toBe(path.join(tempDir, 'apps', 'agendamiento.conf'));
		});

		it('should sanitize app filename correctly', () => {
			expect(service.sanitizeAppFilename('smart-lab')).toBe('smart-lab.conf');
			expect(service.sanitizeAppFilename('mi_proyecto.conf')).toBe('mi_proyecto.conf');
			expect(() => service.sanitizeAppFilename('bad/name')).toThrow();
			expect(() => service.sanitizeAppFilename('bad name!@#')).toThrow();
		});
	});

	describe('Config Parsing', () => {
		it('should parse root server config with listen, server_name and include', async () => {
			const confContent = `
# 🔴 HTTP → HTTPS
server {
    listen 80 default_server;
    server_name engine.clinicamedicos.com;
    return 301 https://$host$request_uri;
}

# 🟢 HTTPS
server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name engine.clinicamedicos.com;

    ssl_certificate /home/rpatic/ssl/fullchain.crt;
    ssl_certificate_key /home/rpatic/ssl/tls.key;

    include /etc/nginx/conf.d/apps/*.conf;
}
`;
			const filePath = path.join(tempDir, 'rpatic.conf');
			await fs.promises.writeFile(filePath, confContent, 'utf8');

			const parsed = await service.parseConfigFile('rpatic.conf', 'rpatic.conf', filePath, false);
			expect(parsed).not.toBeNull();
			expect(parsed?.filename).toBe('rpatic.conf');
			expect(parsed?.isApp).toBe(false);
			expect(parsed?.serverNames).toContain('engine.clinicamedicos.com');
			expect(parsed?.sslCertificate).toBe('/home/rpatic/ssl/fullchain.crt');
			expect(parsed?.listenPorts.some(p => p.port === 80)).toBe(true);
			expect(parsed?.listenPorts.some(p => p.port === 443 && p.ssl)).toBe(true);
			expect(parsed?.includes).toContain('/etc/nginx/conf.d/apps/*.conf');
		});

		it('should parse app config with location and proxy_pass details', async () => {
			const appContent = `
    # __________________________
    # API EXPORT EXCEL
    # __________________________
    location /powerbi/ {
        proxy_pass http://localhost:5175/;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_buffering off;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
`;
			const filePath = path.join(tempDir, 'apps', 'api-export-excel-reportes.conf');
			await fs.promises.writeFile(filePath, appContent, 'utf8');

			const parsed = await service.parseConfigFile(
				'api-export-excel-reportes.conf',
				'apps/api-export-excel-reportes.conf',
				filePath,
				true
			);
			expect(parsed).not.toBeNull();
			expect(parsed?.isApp).toBe(true);
			expect(parsed?.commentTitle).toBe('API EXPORT EXCEL');
			expect(parsed?.locations.length).toBe(1);
			expect(parsed?.locations[0].path).toBe('/powerbi/');
			expect(parsed?.locations[0].proxyPass).toBe('http://localhost:5175/');
			expect(parsed?.locations[0].proxyBuffering).toBe('off');
			expect(parsed?.locations[0].proxyTimeout).toBe('600s');
		});

		it('should list all files in directory and apps correctly', async () => {
			await fs.promises.writeFile(path.join(tempDir, 'rpatic.conf'), 'server { listen 80; }', 'utf8');
			await fs.promises.writeFile(path.join(tempDir, 'apps', 'app1.conf'), 'location /a { proxy_pass http://127.0.0.1:3000; }', 'utf8');
			await fs.promises.writeFile(path.join(tempDir, 'apps', 'app2.conf'), 'location /b { proxy_pass http://127.0.0.1:3001; }', 'utf8');

			const files = await service.listFiles();
			expect(files.length).toBe(3);
			expect(files[0].filename).toBe('rpatic.conf');
			expect(files[0].isApp).toBe(false);
			expect(files[1].filename).toBe('app1.conf');
			expect(files[1].isApp).toBe(true);
			expect(files[2].filename).toBe('app2.conf');
		});
	});
});
