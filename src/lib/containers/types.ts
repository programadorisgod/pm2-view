export type EngineType = 'podman' | 'docker';

export type ResourceKind = 'containers' | 'images' | 'volumes' | 'networks';

export type ContainerAction = 'start' | 'stop' | 'restart' | 'remove';

export interface EngineStatus {
	running: boolean;
	engine: EngineType | null;
	version: string | null;
	apiVersion: string | null;
	socketPath: string | null;
	error: string | null;
	checkedAt: number;
}

export type ContainerState =
	'created' | 'running' | 'paused' | 'restarting' | 'exited' | 'dead' | 'removing' | 'unknown';

export interface PortMapping {
	hostIp: string;
	hostPort: string;
	containerPort: string;
	type: string;
}

export interface ContainerSummary {
	id: string;
	engine: EngineType;
	name: string;
	names: string[];
	image: string;
	imageId: string;
	state: ContainerState;
	running: boolean;
	status: string;
	created: number;
	ports: PortMapping[];
	highlighted: boolean;
}

export interface ImageSummary {
	id: string;
	engine: EngineType;
	repoTags: string[];
	repoDigests: string[];
	created: number;
	size: number;
	sharedSize: number;
	containers: number;
	labels: Record<string, string>;
	reference: string;
}

export interface VolumeSummary {
	name: string;
	engine: EngineType;
	driver: string;
	mountpoint: string;
	createdAt: string;
	scope: string;
	labels: Record<string, string>;
	used: boolean;
}

export interface NetworkSummary {
	id: string;
	engine: EngineType;
	name: string;
	driver: string;
	scope: string;
	internal: boolean;
	attachable: boolean;
	created: number;
	containers: number;
	subnet?: string;
}

export interface HighlightTarget {
	id: string;
	name: string;
	lastKnownRunning: boolean;
	alertedAt: number | null;
	addedAt: number;
}

export interface WatchState {
	enabled: boolean;
	intervalMs: number;
	lastRunAt: number | null;
	lastAlertAt: number | null;
	alertCount: number;
	targets: HighlightTarget[];
}

export interface WatchRunResult {
	ran: boolean;
	checked: number;
	down: HighlightTarget[];
	notified: boolean;
	error: string | null;
}

export type NotificationChannelType = 'email' | 'console' | 'telegram' | 'whatsapp';

export interface NotificationChannelConfig {
	type: NotificationChannelType;
	label: string;
	configured: boolean;
	description: string;
}

export interface AppSettings {
	to: string;
	from: string;
	multiTo: boolean;
	channels: NotificationChannelConfig[];
}

export interface ApiResult {
	ok: boolean;
	message: string;
}
