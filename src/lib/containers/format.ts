export function formatBytes(bytes: number): string {
	if (!bytes || bytes <= 0) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
	return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(ms: number | null | undefined): string {
	if (!ms) return '—';
	const date = new Date(ms);
	if (Number.isNaN(date.getTime())) return '—';
	return date.toLocaleString();
}

export function formatRelative(ms: number | null | undefined): string {
	if (!ms) return '—';
	const seconds = Math.floor((Date.now() - ms) / 1000);
	if (seconds < 60) return 'hace un momento';
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `hace ${minutes} min`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `hace ${hours} h`;
	const days = Math.floor(hours / 24);
	return `hace ${days} d`;
}
