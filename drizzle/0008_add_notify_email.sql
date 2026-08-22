-- Add notify_email to projects: session email captured when deployment settings are saved
ALTER TABLE `projects` ADD `notify_email` text;
