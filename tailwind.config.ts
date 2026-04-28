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
				// Accent palette (blue-cyan)
				accent: {
					1: '#CAF8FF',
					2: '#89DBFE',
					3: '#38CDFF',
					4: '#009DCD',
					5: '#007CA2',
					6: '#005C79'
				},

				// Dark mode surfaces
				base: {
					DEFAULT: '#0A0E17',
					2: '#0F1623',
					3: '#141D2F',
					4: '#1A2540'
				},

				// Light mode surfaces
				surface: {
					DEFAULT: '#F0F4F8',
					2: '#E8EDF2',
					3: '#FFFFFF'
				},

				// Text
				text: {
					primary: '#E8EDF2',
					secondary: '#8B95A5',
					muted: '#5A6474',
					dark: '#0A0E17',
					'dark-secondary': '#4A5568'
				},

				// Status
				status: {
					online: '#00E676',
					offline: '#5A6474',
					stopped: '#FFB74D',
					error: '#FF5252',
					warning: '#FFD740'
				},

				// Border
				border: {
					DEFAULT: 'rgba(137, 219, 254, 0.1)',
					light: 'rgba(137, 219, 254, 0.06)',
					hover: 'rgba(56, 205, 255, 0.3)'
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
				'glow': '0 0 20px rgba(56, 205, 255, 0.15)',
				'glow-sm': '0 0 10px rgba(56, 205, 255, 0.1)',
				'glow-lg': '0 0 30px rgba(56, 205, 255, 0.2)',
				'card': '0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)',
				'card-hover': '0 4px 12px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.3)',
				'card-light': '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)',
				'card-light-hover': '0 4px 12px rgba(0, 0, 0, 0.12), 0 2px 4px rgba(0, 0, 0, 0.08)'
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
