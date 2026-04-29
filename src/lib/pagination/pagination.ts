export interface PaginationParams {
	limit?: number;
	offset?: number;
}

export interface PaginatedResult<T> {
	data: T[];
	total: number;
	limit: number;
	offset: number;
	hasMore: boolean;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

export function normalizePagination(params: PaginationParams): { limit: number; offset: number } {
	const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
	const offset = Math.max(params.offset ?? 0, 0);
	return { limit, offset };
}

export function paginate<T>(items: T[], total: number, limit: number, offset: number): PaginatedResult<T> {
	return {
		data: items,
		total,
		limit,
		offset,
		hasMore: offset + items.length < total,
	};
}
