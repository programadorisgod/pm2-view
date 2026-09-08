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

	toggle(x?: number, y?: number) {
		if (!browser) return;

		const next = this.current === 'dark' ? 'light' : 'dark';

		if (!document.startViewTransition) {
			this.current = next;
			this.apply();
			return;
		}

		const posX = x ?? window.innerWidth / 2;
		const posY = y ?? 0;
		const endRadius = Math.hypot(
			Math.max(posX, window.innerWidth - posX),
			Math.max(posY, window.innerHeight - posY)
		);

		document.documentElement.style.setProperty('--theme-x', `${posX}px`);
		document.documentElement.style.setProperty('--theme-y', `${posY}px`);
		document.documentElement.style.setProperty('--theme-r', `${endRadius}px`);

		document.startViewTransition(() => {
			this.current = next;
			this.apply();
		});
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
