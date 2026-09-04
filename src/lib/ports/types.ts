export interface PortInfo {
	port: number;
	protocol: 'tcp' | 'udp';
	address: string;
	pid: number | null;
	processName: string | null;
	user: string | null;
	state: string;
}

export interface PortSummary {
	total: number;
	tcpCount: number;
	udpCount: number;
	listeningCount: number;
}

export interface KillRequest {
	port: number;
	pid: number | null;
	processName: string | null;
}

export interface OtpPayload {
	code: string;
	userId: string;
	port: number;
	pid: number | null;
	processName: string | null;
	expiresAt: number;
}
