-- RAW V5.30: MySQL 8.4 / MariaDB 11.4, InnoDB, UTF8MB4.
-- Additive schema for an isolated new database. No Firebase tables are touched.
-- All timestamps are signed safe JS epoch milliseconds, stored as BIGINT UNSIGNED.
-- Do NOT expose port 3306 outside the studio machine.

CREATE TABLE IF NOT EXISTS raw_users (
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  email VARCHAR(254) COLLATE utf8mb4_bin NOT NULL,
  password_hash VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  role ENUM('user','admin') NOT NULL DEFAULT 'user',
  disabled TINYINT(1) NOT NULL DEFAULT 0,
  created_ms BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_raw_users_email (email),
  CONSTRAINT chk_raw_users_disabled CHECK (disabled IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS raw_auth_sessions (
  token_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_ms BIGINT UNSIGNED NOT NULL,
  expires_ms BIGINT UNSIGNED NOT NULL,
  revoked_ms BIGINT UNSIGNED NULL,
  PRIMARY KEY (token_sha256),
  KEY ix_raw_auth_sessions_user (user_id),
  KEY ix_raw_auth_sessions_expiry (expires_ms),
  CONSTRAINT fk_raw_auth_sessions_user FOREIGN KEY (user_id)
    REFERENCES raw_users (user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS raw_studios (
  studio_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  bookable TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (studio_id),
  CONSTRAINT chk_raw_studios_bookable CHECK (bookable IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS raw_bookings (
  booking_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  owner_uid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  studio_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  starts_ms BIGINT UNSIGNED NOT NULL,
  ends_ms BIGINT UNSIGNED NOT NULL,
  created_ms BIGINT UNSIGNED NOT NULL,
  cancelled_ms BIGINT UNSIGNED NULL,
  status ENUM('reserved','cancelled') NOT NULL DEFAULT 'reserved',
  PRIMARY KEY (booking_id),
  KEY ix_raw_bookings_owner_time (owner_uid,starts_ms),
  KEY ix_raw_bookings_studio_time (studio_id,starts_ms),
  CONSTRAINT fk_raw_bookings_owner FOREIGN KEY (owner_uid)
    REFERENCES raw_users (user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_raw_bookings_studio FOREIGN KEY (studio_id)
    REFERENCES raw_studios (studio_id) ON DELETE RESTRICT,
  CONSTRAINT chk_raw_bookings_times CHECK (ends_ms > starts_ms)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS raw_booking_slots (
  studio_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  slot_ms BIGINT UNSIGNED NOT NULL,
  booking_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  owner_uid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (studio_id,slot_ms),
  KEY ix_raw_slots_booking (booking_id),
  CONSTRAINT fk_raw_slots_booking FOREIGN KEY (booking_id)
    REFERENCES raw_bookings (booking_id) ON DELETE RESTRICT,
  CONSTRAINT fk_raw_slots_owner FOREIGN KEY (owner_uid)
    REFERENCES raw_users (user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_raw_slots_studio FOREIGN KEY (studio_id)
    REFERENCES raw_studios (studio_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
