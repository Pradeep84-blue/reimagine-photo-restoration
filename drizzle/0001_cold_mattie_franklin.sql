CREATE TABLE `password_credentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`salt` varchar(32) NOT NULL,
	`passwordHash` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `password_credentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `password_credentials_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `photo_history` (
	`id` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`batchId` varchar(36),
	`fileName` varchar(255) NOT NULL,
	`title` varchar(160) NOT NULL,
	`style` enum('natural','vivid') NOT NULL DEFAULT 'natural',
	`originalPath` varchar(512) NOT NULL,
	`originalMimeType` varchar(32) NOT NULL,
	`resultPath` varchar(512) NOT NULL,
	`resultMimeType` varchar(32) NOT NULL,
	`favorite` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`removedAt` timestamp,
	CONSTRAINT `photo_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `loginMethod` varchar(64) DEFAULT 'email';--> statement-breakpoint
ALTER TABLE `users` ADD `sessionVersion` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_unique` UNIQUE(`email`);--> statement-breakpoint
ALTER TABLE `password_credentials` ADD CONSTRAINT `password_credentials_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `photo_history` ADD CONSTRAINT `photo_history_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `photo_history_owner_created_idx` ON `photo_history` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `photo_history_owner_removed_idx` ON `photo_history` (`userId`,`removedAt`);--> statement-breakpoint
CREATE INDEX `photo_history_owner_batch_idx` ON `photo_history` (`userId`,`batchId`);