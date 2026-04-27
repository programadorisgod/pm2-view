import { describe, it, expect, vi } from 'vitest';
import { AuthRepository } from '../../lib/db/repositories/auth-repository.impl';
import type { IAuthRepository, User, Session } from '../../lib/auth/auth.types';

describe('Auth Repository', () => {
	it('should implement IAuthRepository interface', () => {
		const repo = new AuthRepository();
		expect(repo).toBeDefined();
		expect(typeof repo.createSession).toBe('function');
		expect(typeof repo.getSession).toBe('function');
		expect(typeof repo.deleteSession).toBe('function');
		expect(typeof repo.getUserByEmail).toBe('function');
		expect(typeof repo.createUser).toBe('function');
	});

	it('should be instantiable', () => {
		const repo = new AuthRepository();
		expect(repo instanceof AuthRepository).toBe(true);
	});

	it('should have all required methods', () => {
		const repo = new AuthRepository();
		const methods: (keyof IAuthRepository)[] = [
			'createSession',
			'getSession',
			'deleteSession',
			'getUserByEmail',
			'createUser'
		];
		methods.forEach((method) => {
			expect(typeof repo[method]).toBe('function');
		});
	});
});

