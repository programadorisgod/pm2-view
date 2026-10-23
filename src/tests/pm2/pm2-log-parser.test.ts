import { describe, it, expect } from 'vitest';
import { parseTimestamp, classifyLogLevel } from '$lib/pm2/pm2-log-parser';

describe('pm2-log-parser', () => {
	describe('parseTimestamp', () => {
		it('should parse standard YYYY-MM-DD HH:MM:SS timestamps', () => {
			const line = '2026-04-28 15:02:14: server started';
			const ts = parseTimestamp(line);
			expect(ts).toBeInstanceOf(Date);
			expect(ts?.getFullYear()).toBe(2026);
		});

		it('should return null when no timestamp is found', () => {
			expect(parseTimestamp('plain log message')).toBeNull();
		});
	});

	describe('classifyLogLevel', () => {
		it('should identify errors with emoji and explicit keywords', () => {
			expect(classifyLogLevel('❌ Fatal unhandled exception', 'out')).toBe('error');
			expect(classifyLogLevel('ERROR: something blew up', 'out')).toBe('error');
			expect(classifyLogLevel('[CRITICAL] service unavailable', 'out')).toBe('error');
		});

		it('should identify warnings with emoji and Spanish terms', () => {
			expect(classifyLogLevel('⚠️ Memory threshold reached', 'out')).toBe('warn');
			expect(classifyLogLevel('[ALERTA] Desbalance detectado', 'err')).toBe('warn');
			expect(classifyLogLevel('Warning: deprecated API', 'out')).toBe('warn');
		});

		it('should identify startup info on stderr as info', () => {
			expect(classifyLogLevel('vite v5.0.0 ready in 300 ms', 'err')).toBe('info');
			expect(classifyLogLevel('listening on http://localhost:3000', 'err')).toBe('info');
		});

		it('should default to stream type when neutral', () => {
			expect(classifyLogLevel('Regular message', 'out')).toBe('info');
			expect(classifyLogLevel('Generic error text', 'err')).toBe('error');
		});
	});
});
