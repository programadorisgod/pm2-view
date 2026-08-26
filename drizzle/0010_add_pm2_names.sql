ALTER TABLE `projects` ADD `pm2_names` text;--> statement-breakpoint
UPDATE `projects` SET `pm2_names` = '["atlas-backend","atlas-frontend"]' WHERE `pm2_name` = 'ATLAS';--> statement-breakpoint
DELETE FROM `projects` WHERE `pm2_name` = 'atlas-backend';
