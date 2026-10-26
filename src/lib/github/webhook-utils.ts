export const COMMIT_SHA_REGEX = /^[0-9a-f]{40}$/i;
export const MAX_WEBHOOK_BODY_BYTES = 1 * 1024 * 1024; // 1 MiB

/**
 * Validates repository full_name (`owner/repo`) against path traversal and malformed inputs.
 */
export function isValidRepoFullName(repoFullName: string): boolean {
	if (typeof repoFullName !== 'string' || repoFullName.length < 3 || repoFullName.length > 200) {
		return false;
	}
	const parts = repoFullName.split('/');
	if (parts.length !== 2) {
		return false;
	}
	const [owner, repo] = parts;
	if (!owner || !repo || owner.length > 100 || repo.length > 100) {
		return false;
	}
	if (owner === '.' || owner === '..' || repo === '.' || repo === '..') {
		return false;
	}
	if (owner.includes('..') || repo.includes('..')) {
		return false;
	}
	if (owner.endsWith('.lock') || repo.endsWith('.lock')) {
		return false;
	}
	const segmentRegex = /^[a-zA-Z0-9._-]+$/;
	return segmentRegex.test(owner) && segmentRegex.test(repo);
}

/**
 * Validates branch name according to git check-ref-format --branch rules.
 */
export function isValidGitBranchName(branch: string): boolean {
	if (typeof branch !== 'string' || branch.length === 0 || branch.length > 255) {
		return false;
	}
	// Git does not allow a single '@' as a branch/ref name
	if (branch === '@') {
		return false;
	}
	// Cannot start with '-' (prevent git flag injection), '/', or '.'
	if (branch.startsWith('-') || branch.startsWith('/') || branch.startsWith('.')) {
		return false;
	}
	// Cannot end with '/', '.', or '.lock'
	if (branch.endsWith('/') || branch.endsWith('.') || branch.endsWith('.lock')) {
		return false;
	}
	// Cannot contain '..', '@{', or consecutive '//'
	if (branch.includes('..') || branch.includes('@{') || branch.includes('//')) {
		return false;
	}
	// Cannot contain ASCII control characters, spaces, or git ref special characters: ~ ^ : ? * [ \
	// eslint-disable-next-line no-control-regex
	if (/[\x00-\x1f\x7f\s~^:?*[\\\]]/.test(branch)) {
		return false;
	}

	// Validate each slash-separated component
	const segments = branch.split('/');
	for (const segment of segments) {
		if (
			!segment ||
			segment.startsWith('.') ||
			segment.endsWith('.') ||
			segment.endsWith('.lock')
		) {
			return false;
		}
	}

	return true;
}

/**
 * Reads request body stream enforcing strict byte limit before buffering.
 */
export async function readBodyBytesWithLimit(
	request: Request,
	maxBytes = MAX_WEBHOOK_BODY_BYTES
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; status: number }> {
	const contentLengthHeader = request.headers.get('content-length');
	if (contentLengthHeader !== null) {
		if (!/^\d+$/.test(contentLengthHeader)) {
			return { ok: false, status: 413 };
		}
		const declaredLength = Number(contentLengthHeader);
		if (!Number.isSafeInteger(declaredLength) || declaredLength > maxBytes) {
			return { ok: false, status: 413 };
		}
	}

	if (!request.body) {
		return { ok: true, bytes: new Uint8Array(0) };
	}

	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;

	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value) {
				totalBytes += value.byteLength;
				if (totalBytes > maxBytes) {
					try {
						await reader.cancel();
					} catch {
						// Stream might already be closed
					}
					return { ok: false, status: 413 };
				}
				chunks.push(value);
			}
		}
	} finally {
		try {
			reader.releaseLock();
		} catch {
			// Ignore lock release if already released
		}
	}

	const merged = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		merged.set(chunk, offset);
		offset += chunk.byteLength;
	}

	return { ok: true, bytes: merged };
}
