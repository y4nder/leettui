CREATE TABLE `recents` (
	`question_id` integer PRIMARY KEY NOT NULL,
	`viewed_at` integer NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_recents_viewed_at` ON `recents` (`viewed_at`);