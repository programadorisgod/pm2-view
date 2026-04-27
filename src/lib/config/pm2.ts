export const PM2_CONFIG = {
	host: process.env.PM2_HOST || 'localhost',
	port: parseInt(process.env.PM2_PORT || '4322', 10)
};
