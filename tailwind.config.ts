import type { Config } from 'tailwindcss';

const config: Config = {
	darkMode: 'class',
	content: [
		'./src/**/*.{html,js,svelte,ts}',
		'./.svelte-kit/**/*.{html,js,svelte,ts}'
	],
	theme: {
		extend: {
			colors: {
				// Accent palette (Vercel blue)
				accent: {
					1: '#E8F4FD',
					2: '#B3D9F2',
					3: '#0070F3',
					4: '#0060DF',
					5: '#004CC0',
					6: '#003A99'
				},

				// Dark mode surfaces (Vercel + Material Design)
				base: {
					DEFAULT: '#0A0A0A',
					2: '#111111',
					3: '#1A1A1A',
					4: '#222222'
				},

				// Light mode surfaces (Vercel)
				surface: {
					DEFAULT: '#FAFAFA',
					2: '#F5F5F5',
					3: '#FFFFFF'
				},

				// Text
				text: {
					primary: '#EDEDED',
					secondary: '#888888',
					muted: '#666666',
					dark: '#171717',
					'dark-secondary': '#666666'
				},

				// Status
				status: {
					online: '#00E676',
					offline: '#666666',
					stopped: '#FFB74D',
					error: '#FF5B4F',
					warning: '#FFD740'
				},

				// Border
				border: {
					DEFAULT: 'rgba(255, 255, 255, 0.06)',
					light: 'rgba(255, 255, 255, 0.04)',
					hover: 'rgba(255, 255, 255, 0.12)'
				}
			},
			fontFamily: {
				display: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
				text: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
				mono: ['JetBrains Mono', 'Fira Code', 'monospace']
			},
			fontSize: {
				'hero': ['32px', { lineHeight: '1.1', fontWeight: '700', letterSpacing: '-0.5px' }],
				'h1': ['24px', { lineHeight: '1.2', fontWeight: '600', letterSpacing: '-0.3px' }],
				'h2': ['20px', { lineHeight: '1.3', fontWeight: '600', letterSpacing: '-0.2px' }],
				'h3': ['16px', { lineHeight: '1.4', fontWeight: '600' }],
				'body': ['14px', { lineHeight: '1.5', fontWeight: '400' }],
				'body-sm': ['13px', { lineHeight: '1.5', fontWeight: '400' }],
				'caption': ['12px', { lineHeight: '1.4', fontWeight: '400' }],
				'caption-sm': ['11px', { lineHeight: '1.3', fontWeight: '400' }],
				'code': ['13px', { lineHeight: '1.6', fontWeight: '400' }]
			},
			borderRadius: {
				xs: '4px',
				sm: '6px',
				md: '8px',
				lg: '12px',
				xl: '16px',
				pill: '9999px'
			},
			spacing: {
				'2xs': '2px',
				xs: '4px',
				sm: '8px',
				md: '12px',
				lg: '16px',
				xl: '20px',
				'2xl': '24px',
				'3xl': '32px'
			},
			boxShadow: {
				'glow': '0 0 12px rgba(0, 112, 243, 0.08)',
				'glow-sm': '0 0 8px rgba(0, 112, 243, 0.06)',
				'glow-lg': '0 0 16px rgba(0, 112, 243, 0.1)',
				'card': '0 0 0 1px rgba(255, 255, 255, 0.06), 0 2px 4px rgba(0, 0, 0, 0.4)',
				'card-hover': '0 0 0 1px rgba(255, 255, 255, 0.1), 0 4px 8px rgba(0, 0, 0, 0.5)',
				'card-light': '0 0 0 1px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04)',
				'card-light-hover': '0 0 0 1px rgba(0, 0, 0, 0.12), 0 4px 8px rgba(0, 0, 0, 0.04)'
			},
			animation: {
				'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
				'slide-up': 'slide-up 0.2s ease-out',
				'fade-in': 'fade-in 0.15s ease-out'
			},
			keyframes: {
				'pulse-glow': {
					'0%, 100%': { boxShadow: '0 0 4px rgba(0, 230, 118, 0.4)' },
					'50%': { boxShadow: '0 0 12px rgba(0, 230, 118, 0.6)' }
				},
				'slide-up': {
					'0%': { transform: 'translateY(8px)', opacity: '0' },
					'100%': { transform: 'translateY(0)', opacity: '1' }
				},
				'fade-in': {
					'0%': { opacity: '0' },
					'100%': { opacity: '1' }
				}
			}
		}
	},
	plugins: []
};

export default config;
