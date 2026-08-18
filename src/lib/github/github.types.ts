export interface GitHubInstallationRecord {
	id: string;
	userId: string;
	installationId: number;
	accountLogin: string;
	accountType: string;
	accountAvatar: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface GitHubRepository {
	id: number;
	name: string;
	fullName: string;
	private: boolean;
	defaultBranch: string;
	cloneUrl: string;
	description: string | null;
}

export interface GitHubRepoDTO {
	id: number;
	name: string;
	fullName: string;
	private: boolean;
	defaultBranch: string;
}

export interface GitHubInstallationInfo {
	id: number;
	account: {
		login: string;
		type: string;
		avatarUrl: string | null;
	};
	repositoriesUrl: string;
}

export interface IGitHubInstallationRepository {
	getByUserId(userId: string): Promise<GitHubInstallationRecord | null>;
	getByInstallationId(installationId: number): Promise<GitHubInstallationRecord | null>;
	create(data: {
		userId: string;
		installationId: number;
		accountLogin: string;
		accountType: string;
		accountAvatar?: string | null;
	}): Promise<GitHubInstallationRecord>;
	update(installationId: number, data: Partial<Pick<GitHubInstallationRecord, 'accountLogin' | 'accountType' | 'accountAvatar'>>): Promise<GitHubInstallationRecord>;
	delete(installationId: number): Promise<void>;
}

export class GitHubInstallationNotFound extends Error {
	constructor(message = 'GitHub installation not found') {
		super(message);
		this.name = 'GitHubInstallationNotFound';
	}
}

export class GitHubInstallationNotOwnedByUser extends Error {
	constructor(message = 'GitHub installation does not belong to this user') {
		super(message);
		this.name = 'GitHubInstallationNotOwnedByUser';
	}
}

export class GitHubRepositoryNotAccessible extends Error {
	constructor(message = 'Repository is not accessible for this installation') {
		super(message);
		this.name = 'GitHubRepositoryNotAccessible';
	}
}

export class GitHubRepositoryNotFound extends Error {
	constructor(message = 'Repository not found on GitHub') {
		super(message);
		this.name = 'GitHubRepositoryNotFound';
	}
}

export class GitHubAuthenticationFailed extends Error {
	constructor(message = 'Failed to authenticate with GitHub') {
		super(message);
		this.name = 'GitHubAuthenticationFailed';
	}
}

export class GitHubInstallationRevoked extends Error {
	constructor(message = 'GitHub installation has been revoked') {
		super(message);
		this.name = 'GitHubInstallationRevoked';
	}
}

export class GitHubRateLimitExceeded extends Error {
	constructor(message = 'GitHub API rate limit exceeded') {
		super(message);
		this.name = 'GitHubRateLimitExceeded';
	}
}

export class GitHubImportFailed extends Error {
	constructor(message = 'Failed to import repository') {
		super(message);
		this.name = 'GitHubImportFailed';
	}
}
