import type { LogEntry } from './log-hasher';

export interface FilterOptions {
	showDismissed: boolean;
	filterLevel: 'all' | 'info' | 'warn' | 'error';
	filterStream: 'all' | 'out' | 'err';
	searchQuery: string;
	dateFrom: string;
	dateTo: string;
	sortOrder: 'newest' | 'oldest';
	errBaseline: number | null;
}

export interface FilteredResult {
	filteredLogs: LogEntry[];
	filteredOutLogs: LogEntry[];
	filteredErrLogs: LogEntry[];
	levelCounts: { info: number; warn: number; error: number };
	newErrCount: number;
	dismissedCount: number;
}

/**
 * Single-pass O(N) log filter and aggregator.
 * Replaces ~14 separate chained array filters with a single loop.
 */
export function filterLogsSinglePass(logs: LogEntry[], options: FilterOptions): FilteredResult {
	const query = options.searchQuery.trim().toLowerCase();
	const fromTime = options.dateFrom ? new Date(options.dateFrom).getTime() : NaN;
	const toTime = options.dateTo ? new Date(options.dateTo).getTime() : NaN;
	const hasFrom = !isNaN(fromTime);
	const hasTo = !isNaN(toTime);

	const levelCounts = { info: 0, warn: 0, error: 0 };
	let dismissedCount = 0;
	let newErrCount = 0;

	const matchedLogs: LogEntry[] = [];
	const matchedOutLogs: LogEntry[] = [];
	const matchedErrLogs: LogEntry[] = [];

	for (let i = 0; i < logs.length; i++) {
		const log = logs[i];

		if (log.dismissed) {
			dismissedCount++;
			if (!options.showDismissed) {
				continue;
			}
		}

		// Check stream filter
		if (options.filterStream !== 'all' && log.type !== options.filterStream) {
			continue;
		}

		// Check search query
		if (query && !log.data.toLowerCase().includes(query)) {
			continue;
		}

		// Check date range
		const logTime = log.timestamp.getTime();
		if (hasFrom && logTime < fromTime) {
			continue;
		}
		if (hasTo && logTime > toTime) {
			continue;
		}

		// Log matches all criteria except possibly level filter
		// Tab level counts must reflect all matched logs regardless of current level filter
		if (log.level in levelCounts) {
			levelCounts[log.level]++;
		}

		// Now apply level filter for the active list
		if (options.filterLevel !== 'all' && log.level !== options.filterLevel) {
			continue;
		}

		matchedLogs.push(log);
		if (log.type === 'out') {
			matchedOutLogs.push(log);
		} else if (log.type === 'err') {
			matchedErrLogs.push(log);
			if (options.errBaseline !== null && logTime > options.errBaseline) {
				newErrCount++;
			}
		}
	}

	// Apply sort order only if newest is selected
	if (options.sortOrder === 'newest') {
		matchedLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
		matchedOutLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
		matchedErrLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
	}

	return {
		filteredLogs: matchedLogs,
		filteredOutLogs: matchedOutLogs,
		filteredErrLogs: matchedErrLogs,
		levelCounts,
		newErrCount,
		dismissedCount,
	};
}
