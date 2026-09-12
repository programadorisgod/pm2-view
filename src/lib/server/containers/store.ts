import * as fs from 'node:fs';
import path from 'node:path';
import { getEnv } from './env';

export function dataDir(): string {
	return getEnv('CONTAINERS_VIEW_DATA') || path.resolve(process.cwd(), 'data');
}

export class JsonStore<T extends object> {
	private data: T;

	constructor(
		private readonly filename: string,
		defaults: T
	) {
		this.data = this.load(defaults);
	}

	private get file(): string {
		return path.join(dataDir(), this.filename);
	}

	private load(defaults: T): T {
		try {
			const raw = fs.readFileSync(this.file, 'utf8');
			const parsed = JSON.parse(raw) as T;
			return { ...defaults, ...parsed };
		} catch {
			return { ...defaults };
		}
	}

	get(): T {
		return this.data;
	}

	update(fn: (draft: T) => void): T {
		fn(this.data);
		this.persist();
		return this.data;
	}

	private persist(): void {
		const dir = dataDir();
		fs.mkdirSync(dir, { recursive: true });
		const tmp = path.join(dir, `${this.filename}.tmp`);
		fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
		fs.renameSync(tmp, this.file);
	}
}
