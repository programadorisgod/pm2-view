-- Create project_favorites table for user project bookmarks
CREATE TABLE `project_favorites` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`pm2_name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_project_favorites_user_pm2` ON `project_favorites`(`user_id`, `pm2_name`);
