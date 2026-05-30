CREATE TABLE `question_topics` (
	`question_id` integer NOT NULL,
	`topic_slug` text NOT NULL,
	PRIMARY KEY(`question_id`, `topic_slug`),
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`topic_slug`) REFERENCES `topics`(`slug`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_qt_topic` ON `question_topics` (`topic_slug`);--> statement-breakpoint
CREATE INDEX `idx_qt_question` ON `question_topics` (`question_id`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`title_slug` text NOT NULL,
	`difficulty` text NOT NULL,
	`paid_only` integer DEFAULT 0 NOT NULL,
	`status` text,
	`ac_rate` real,
	`last_runtime` text,
	`last_memory` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `questions_title_slug_unique` ON `questions` (`title_slug`);--> statement-breakpoint
CREATE TABLE `topics` (
	`slug` text PRIMARY KEY NOT NULL
);
