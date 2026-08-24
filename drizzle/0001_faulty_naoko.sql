CREATE TABLE `github_user_installations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`installation_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_github_installations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`installation_id` integer NOT NULL,
	`account_login` text NOT NULL,
	`account_type` text NOT NULL,
	`account_avatar` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_github_installations`("id", "user_id", "installation_id", "account_login", "account_type", "account_avatar", "created_at", "updated_at") SELECT "id", "user_id", "installation_id", "account_login", "account_type", "account_avatar", "created_at", "updated_at" FROM `github_installations`;--> statement-breakpoint
DROP TABLE `github_installations`;--> statement-breakpoint
ALTER TABLE `__new_github_installations` RENAME TO `github_installations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `projects` ADD `pm2_names` text;