CREATE TABLE `submissions` (
	`submission_id` integer PRIMARY KEY NOT NULL,
	`question_id` integer NOT NULL,
	`title_slug` text NOT NULL,
	`lang` text NOT NULL,
	`status_display` text NOT NULL,
	`runtime` text,
	`memory` text,
	`submitted_at` integer NOT NULL,
	`runtime_percentile` real,
	`memory_percentile` real,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sub_question_time` ON `submissions` (`question_id`,`submitted_at`);--> statement-breakpoint
CREATE INDEX `idx_sub_submitted_at` ON `submissions` (`submitted_at`);--> statement-breakpoint
ALTER TABLE `questions` ADD `submissions_fetched_at` integer;