-- Add auto-deploy configuration columns to projects
ALTER TABLE `projects` ADD `github_repo` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `deploy_branch` text NOT NULL DEFAULT 'main';--> statement-breakpoint
ALTER TABLE `projects` ADD `auto_deploy_enabled` integer NOT NULL DEFAULT false;--> statement-breakpoint
-- Create deployments table (webhook-triggered deployment runs, doubles as job queue)
CREATE TABLE `deployments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL REFERENCES `projects`(`id`) ON DELETE CASCADE,
	`repository` text NOT NULL,
	`branch` text NOT NULL,
	`commit_sha` text,
	`delivery_id` text NOT NULL UNIQUE,
	`status` text DEFAULT 'pending' NOT NULL,
	`stage` text,
	`error` text,
	`logs` text DEFAULT '' NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`duration_ms` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);--> statement-breakpoint
CREATE INDEX `deployments_project_created_idx` ON `deployments` (`project_id`, `created_at`);--> statement-breakpoint
CREATE INDEX `deployments_status_idx` ON `deployments` (`status`);
