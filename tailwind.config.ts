import type { Config } from 'tailwindcss';

const config: Config = {
	content: [
		'./src/**/*.{html,js,svelte,ts}',
		'./.svelte-kit/**/*.{html,js,svelte,ts}'
	],
	theme: {
		extend: {
			colors: {
				// Primary & Accent
				'action-blue': '#0066cc',
				'action-blue-focus': '#0071e3',
				'action-blue-on-dark': '#2997ff',

				// Ink & Text
				ink: '#1d1d1f',
				body: '#1d1d1f',
				'body-on-dark': '#ffffff',
				'body-muted': '#cccccc',
				'ink-muted-80': '#333333',
				'ink-muted-48': '#7a7a7a',

				// Dividers & Borders
				'divider-soft': '#f0f0f0',
				hairline: '#e0e0e0',

				// Surfaces
				canvas: '#ffffff',
				'canvas-parchment': '#f5f5f7',
				'surface-pearl': '#fafafc',
				'surface-tile-1': '#272729',
				'surface-tile-2': '#2a2a2c',
				'surface-tile-3': '#252527',
				'surface-black': '#000000',
				'surface-chip-translucent': '#d2d2d7',

				// Text on surfaces
				'on-primary': '#ffffff',
				'on-dark': '#ffffff'
			},
			fontFamily: {
				display: ['SF Pro Display', 'system-ui', '-apple-system', 'sans-serif'],
				text: ['SF Pro Text', 'system-ui', '-apple-system', 'sans-serif']
			},
			fontSize: {
				// Typography scale from DESIGN.md
				'hero-display': ['56px', { lineHeight: '1.07', fontWeight: '600', letterSpacing: '-0.28px' }],
				'display-lg': ['40px', { lineHeight: '1.1', fontWeight: '600', letterSpacing: '0px' }],
				'display-md': ['34px', { lineHeight: '1.47', fontWeight: '600', letterSpacing: '-0.374px' }],
				lead: ['28px', { lineHeight: '1.14', fontWeight: '400', letterSpacing: '0.196px' }],
				'lead-airy': ['24px', { lineHeight: '1.5', fontWeight: '300', letterSpacing: '0px' }],
				tagline: ['21px', { lineHeight: '1.19', fontWeight: '600', letterSpacing: '0.231px' }],
				'body-strong': ['17px', { lineHeight: '1.24', fontWeight: '600', letterSpacing: '-0.374px' }],
				body: ['17px', { lineHeight: '1.47', fontWeight: '400', letterSpacing: '-0.374px' }],
				'dense-link': ['17px', { lineHeight: '2.41', fontWeight: '400', letterSpacing: '0px' }],
				caption: ['14px', { lineHeight: '1.43', fontWeight: '400', letterSpacing: '-0.224px' }],
				'caption-strong': ['14px', { lineHeight: '1.29', fontWeight: '600', letterSpacing: '-0.224px' }],
				'button-large': ['18px', { lineHeight: '1.0', fontWeight: '300', letterSpacing: '0px' }],
				'button-utility': ['14px', { lineHeight: '1.29', fontWeight: '400', letterSpacing: '-0.224px' }],
				'fine-print': ['12px', { lineHeight: '1.0', fontWeight: '400', letterSpacing: '-0.12px' }],
				'micro-legal': ['10px', { lineHeight: '1.3', fontWeight: '400', letterSpacing: '-0.08px' }],
				'nav-link': ['12px', { lineHeight: '1.0', fontWeight: '400', letterSpacing: '-0.12px' }]
			},
			borderRadius: {
				none: '0px',
				xs: '5px',
				sm: '8px',
				md: '11px',
				lg: '18px',
				pill: '9999px',
				full: '9999px'
			},
			spacing: {
				xxs: '4px',
				xs: '8px',
				sm: '12px',
				md: '17px',
				lg: '24px',
				xl: '32px',
				xxl: '48px',
				section: '80px'
			},
			letterSpacing: {
				tight: '-0.374px',
				'negative-sm': '-0.224px',
				'negative-xs': '-0.12px',
				'negative-hero': '-0.28px'
			}
		}
	},
	plugins: []
};

export default config;
