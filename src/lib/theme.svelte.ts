import { browser } from '$app/environment';

const THEME_KEY = 'pm2-view-theme';

function getInitialTheme(): 'dark' | 'light' {
	if (!browser) return 'dark';
	const stored = localStorage.getItem(THEME_KEY);
	if (stored === 'light' || stored === 'dark') return stored;
	return 'dark';
}

export class Theme {
	current: 'dark' | 'light' = $state(getInitialTheme());

	toggle() {
		if (!browser) return;

		// Use View Transitions API for smooth theme switch
		if (document.startViewTransition) {
			document.documentElement.classList.add('theme-transitioning');
			document.startViewTransition(() => {
				this.current = this.current === 'dark' ? 'light' : 'dark';
				this.apply();
			}).finished.finally(() => {
				document.documentElement.classList.remove('theme-transitioning');
			});
		} else {
			this.current = this.current === 'dark' ? 'light' : 'dark';
			this.apply();
		}
	}

	apply() {
		if (!browser) return;
		document.documentElement.classList.toggle('dark', this.current === 'dark');
		localStorage.setItem(THEME_KEY, this.current);
	}
}

export const theme = new Theme();

// Apply theme on module load (for SSR hydration)
if (browser) {
	theme.apply();
}
