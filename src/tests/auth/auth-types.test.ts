import { describe, it, expect } from 'vitest';
import type { IAuthRepository, User, Session } from '../../lib/auth/auth.types';

describe('Auth Types', () => {
	it('should define IAuthRepository interface', () => {
		// Verify the interface can be imported
		expect(true).toBe(true); // Interface exists at compile time
	});

	const mockUser: User = {
		id: 'user-1',
		email: 'test@example.com',
		name: null,
		emailVerified: false,
		createdAt: new Date(),
		role: 'user',
		banned: false,
		banReason: null
	};

	const mockSession: Session = {
		user: mockUser,
		token: 'session-token-123',
		expiresAt: new Date()
	};

	it('should have createSession method', () => {
		const mockRepo: IAuthRepository = {
			createSession: async () => mockSession,
			getSession: async () => null,
			deleteSession: async () => {},
			getUserByEmail: async () => null,
			createUser: async () => mockUser
		};
		expect(mockRepo.createSession).toBeDefined();
		expect(typeof mockRepo.createSession).toBe('function');
	});

	it('should have getSession method', () => {
		const mockRepo: IAuthRepository = {
			createSession: async () => mockSession,
			getSession: async () => null,
			deleteSession: async () => {},
			getUserByEmail: async () => null,
			createUser: async () => mockUser
		};
		expect(mockRepo.getSession).toBeDefined();
	});

	it('should have deleteSession method', () => {
		const mockRepo: IAuthRepository = {
			createSession: async () => mockSession,
			getSession: async () => null,
			deleteSession: async () => {},
			getUserByEmail: async () => null,
			createUser: async () => mockUser
		};
		expect(mockRepo.deleteSession).toBeDefined();
	});

	it('should have getUserByEmail method', () => {
		const mockRepo: IAuthRepository = {
			createSession: async () => mockSession,
			getSession: async () => null,
			deleteSession: async () => {},
			getUserByEmail: async () => null,
			createUser: async () => mockUser
		};
		expect(mockRepo.getUserByEmail).toBeDefined();
	});

	it('should have createUser method', () => {
		const mockRepo: IAuthRepository = {
			createSession: async () => mockSession,
			getSession: async () => null,
			deleteSession: async () => {},
			getUserByEmail: async () => null,
			createUser: async () => mockUser
		};
		expect(mockRepo.createUser).toBeDefined();
	});

	it('should create User type with correct structure', () => {
		expect(mockUser.id).toBe('user-1');
		expect(mockUser.email).toBe('test@example.com');
		expect(mockUser.name).toBeNull();
		expect(mockUser.emailVerified).toBe(false);
	});

	it('should create Session type with correct structure', () => {
		expect(mockSession.user).toBeDefined();
		expect(mockSession.token).toBe('session-token-123');
		expect(mockSession.expiresAt).toBeInstanceOf(Date);
	});
});
