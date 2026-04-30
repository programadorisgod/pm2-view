-- Add team_id column to projects table for team-project relationship
ALTER TABLE `projects` ADD COLUMN `team_id` text REFERENCES `teams`(`id`) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `idx_projects_team_id` ON `projects`(`team_id`);
