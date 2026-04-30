// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user?: import('./lib/auth/provider.interface').AuthUser;
			session?: any;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
