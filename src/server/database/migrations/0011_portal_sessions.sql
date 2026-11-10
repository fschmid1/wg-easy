CREATE TABLE `sessions_table` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`last_seen_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users_table`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions_table` (`user_id`);--> statement-breakpoint
DROP TABLE `one_time_links_table`;--> statement-breakpoint
ALTER TABLE `clients_table` ADD `session_id` text;--> statement-breakpoint
ALTER TABLE `clients_table` ADD `revealed_at` text;--> statement-breakpoint
ALTER TABLE `clients_table` ADD `first_handshake_at` text;--> statement-breakpoint
ALTER TABLE `users_table` ADD `grant_issued_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users_table` ADD `grant_window_start` text;