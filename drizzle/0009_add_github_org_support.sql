-- Support org-level GitHub App installations shared by multiple org members
-- 1. Remove UNIQUE constraint on installation_id (one installation can be accessed by many users)
-- 2. Add github_user_installations table for the many-to-many relationship

DROP INDEX IF EXISTS `github_installations_installation_id_unique`;

CREATE TABLE IF NOT EXISTS `github_user_installations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`installation_id` integer NOT NULL,
	`created_at` integer NOT NULL DEFAULT (unixepoch()),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `github_user_installations_user_id_idx` ON `github_user_installations` (`user_id`);
CREATE INDEX IF NOT EXISTS `github_user_installations_installation_id_idx` ON `github_user_installations` (`installation_id`);
