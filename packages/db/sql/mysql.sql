-- @dimah-s3/db schema 2.1.0 for MySQL 8.
-- Keys, folders, and scopes compare byte for byte (utf8mb4_bin); file names
-- use a case-insensitive collation for search. An InnoDB index holds at most
-- 3072 bytes, so `key` and `path` are indexed by prefix: two values that
-- share their first 512 characters share an index entry, and the unique
-- keys treat them as equal. `parent_id` is `''` at the root.

CREATE TABLE `storage_object` (
  `id` varchar(255) NOT NULL,
  `scope` varchar(255) NOT NULL,
  `bucket` varchar(255) NOT NULL,
  `key` varchar(1024) NOT NULL,
  `route` varchar(255) NOT NULL,
  `folder_id` varchar(255),
  `filename` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content_type` varchar(255),
  `size` bigint,
  `declared_size` bigint,
  `e_tag` varchar(255),
  `status` varchar(16) NOT NULL,
  `s3_metadata` json,
  `attributes` json,
  `acl` varchar(255),
  `upload_id` text,
  `upload_token` varchar(64),
  `expires_at` datetime(3),
  `confirmed_at` datetime(3),
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deleted_at` datetime(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `storage_object_bucket_key_uk` (`bucket`, `key`(512)),
  KEY `storage_object_scope_folder_idx` (`scope`, `status`, `folder_id`, `created_at`),
  KEY `storage_object_scope_updated_idx` (`scope`, `status`, `updated_at`),
  KEY `storage_object_scope_filename_idx` (`scope`, `status`, `filename`),
  KEY `storage_object_scope_size_idx` (`scope`, `status`, `size`),
  KEY `storage_object_status_expires_idx` (`status`, `expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `storage_folder` (
  `id` varchar(255) NOT NULL,
  `scope` varchar(255) NOT NULL,
  `parent_id` varchar(255) NOT NULL DEFAULT '',
  `name` varchar(255) NOT NULL,
  `path` varchar(1024) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `storage_folder_scope_path_uk` (`scope`, `path`(512)),
  UNIQUE KEY `storage_folder_scope_parent_name_uk` (`scope`, `parent_id`, `name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- Schema version for the Kysely and Prisma adapters.
CREATE TABLE `private_dimah_s3_settings` (
  `key` varchar(255) NOT NULL,
  `value` text NOT NULL DEFAULT ('2.1.0'),
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

INSERT INTO `private_dimah_s3_settings` (`key`, `value`) VALUES ('version', '2.1.0');
