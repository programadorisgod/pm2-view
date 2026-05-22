-- Create deploy_commands table for project deployment configuration
CREATE TABLE `deploy_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL REFERENCES `projects`(`id`) ON DELETE CASCADE,
	`command_type` text NOT NULL,
	`label` text NOT NULL,
	`command` text NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `deploy_commands_unique` ON `deploy_commands`(`project_id`, `command_type`, `sort_order`);