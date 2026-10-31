-- @dimah-s3/db schema 1.0.0 → 2.0.0 for MySQL 8.
-- Back up the database first. MySQL commits each ALTER TABLE on its own, so
-- a failed step leaves the earlier ones applied.
-- - `metadata` moves to `s3_metadata`; `attributes`, `folder`, and
--   `upload_token` start empty (`folder` NULL is the root).
-- - A missing `filename` becomes the last segment of the key.
-- - Columns take the 2.0.0 types (see ../../mysql.sql). Timestamps become
--   datetime(3), converted in the session time zone: run this with the time
--   zone your app connects with.
--
-- If you added the 1.x recommended indexes, drop them first:
-- DROP INDEX `storage_object_scope_status_created_idx` ON `storage_object`;
-- DROP INDEX `storage_object_scope_route_idx` ON `storage_object`;
-- DROP INDEX `storage_object_status_created_idx` ON `storage_object`;
-- DROP INDEX `storage_object_status_expires_idx` ON `storage_object`;

UPDATE `storage_object`
SET `filename` = COALESCE(NULLIF(SUBSTRING_INDEX(`key`, '/', -1), ''), `key`)
WHERE `filename` IS NULL;
UPDATE `storage_object` SET `filename` = LEFT(`filename`, 255);

DROP INDEX `storage_object_bucket_key_uk` ON `storage_object`;

ALTER TABLE `storage_object`
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

ALTER TABLE `storage_object`
  CHANGE `metadata` `s3_metadata` json,
  ADD COLUMN `folder` varchar(1024),
  ADD COLUMN `attributes` json,
  ADD COLUMN `upload_token` varchar(64),
  MODIFY `id` varchar(255) NOT NULL,
  MODIFY `scope` varchar(255) NOT NULL,
  MODIFY `bucket` varchar(255) NOT NULL,
  MODIFY `key` varchar(1024) NOT NULL,
  MODIFY `route` varchar(255) NOT NULL,
  MODIFY `filename` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  MODIFY `content_type` varchar(255),
  MODIFY `size` bigint,
  MODIFY `declared_size` bigint,
  MODIFY `e_tag` varchar(255),
  MODIFY `status` varchar(16) NOT NULL,
  MODIFY `acl` varchar(255),
  MODIFY `upload_id` text,
  MODIFY `expires_at` datetime(3),
  MODIFY `confirmed_at` datetime(3),
  MODIFY `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  MODIFY `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  MODIFY `deleted_at` datetime(3),
  ADD UNIQUE KEY `storage_object_bucket_key_uk` (`bucket`, `key`(512)),
  ADD KEY `storage_object_scope_folder_idx` (`scope`, `status`, `folder`(255), `created_at`),
  ADD KEY `storage_object_scope_updated_idx` (`scope`, `status`, `updated_at`),
  ADD KEY `storage_object_scope_filename_idx` (`scope`, `status`, `filename`),
  ADD KEY `storage_object_scope_size_idx` (`scope`, `status`, `size`),
  ADD KEY `storage_object_status_expires_idx` (`status`, `expires_at`);

CREATE TABLE `storage_folder` (
  `id` varchar(255) NOT NULL,
  `scope` varchar(255) NOT NULL,
  `path` varchar(1024) NOT NULL,
  `parent` varchar(1024),
  `name` varchar(255) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `storage_folder_scope_path_uk` (`scope`, `path`(512)),
  KEY `storage_folder_scope_parent_idx` (`scope`, `parent`(512))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- Kysely and Prisma read the version from this table. A Drizzle setup reads
-- it from the table definition instead: skip this statement there.
UPDATE `private_dimah_s3_settings` SET `value` = '2.0.0' WHERE `key` = 'version';
