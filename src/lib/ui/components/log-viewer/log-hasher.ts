export type RawLog = {
	type: 'out' | 'err';
	data: string;
	timestamp: Date | string;
	hasTimestamp?: boolean;
	level: 'info' | 'warn' | 'error';
};

export type LogEntry = {
	id: string;
	type: 'out' | 'err';
	data: string;
	timestamp: Date;
	hasTimestamp: boolean;
	level: 'info' | 'warn' | 'error';
	dismissed: boolean;
};

export function logIdHash(ts: number, type: string, data: string): string {
	let h = 5381;
	const key = `${ts}:${type}:${data}`;
	for (let i = 0; i < key.length; i++) {
		h = ((h << 5) + h + key.charCodeAt(i)) | 0;
	}
	return `log-${h >>> 0}`;
}

export function toLogEntries(rawLogs: RawLog[]): LogEntry[] {
	const seen = new Map<string, number>();
	return rawLogs.map((raw) => {
		const ts = raw.timestamp instanceof Date ? raw.timestamp : new Date(raw.timestamp);
		const base = `${ts.getTime()}:${raw.type}:${raw.data}`;
		const occurrence = seen.get(base) ?? 0;
		seen.set(base, occurrence + 1);
		const id =
			occurrence === 0
				? logIdHash(ts.getTime(), raw.type, raw.data)
				: `${logIdHash(ts.getTime(), raw.type, raw.data)}-${occurrence}`;
		return {
			id,
			type: raw.type,
			data: raw.data,
			timestamp: ts,
			hasTimestamp: raw.hasTimestamp ?? ts.getTime() > 0,
			level: raw.level,
			dismissed: false,
		};
	});
}
