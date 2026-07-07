-- =============================================================================
-- CCoF Walk-In — database reset + schema + seed data
-- Run entire script in MySQL Workbench (re-runnable).
-- =============================================================================

CREATE DATABASE IF NOT EXISTS `ccof_walkin`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `ccof_walkin`;

-- Drop child table first (foreign key), then parent
DROP TABLE IF EXISTS `queue_entry`;
DROP TABLE IF EXISTS `registration`;

-- -----------------------------------------------------------------------------
-- Schema
-- -----------------------------------------------------------------------------

CREATE TABLE `registration`(
    `registrationid` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `parent_fname` VARCHAR(255) NOT NULL,
    `parent_lname` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(20) NOT NULL,
    `additional_notes` TEXT NULL,
    `sms_opt_in` BOOLEAN NOT NULL DEFAULT FALSE,
    `checked_in_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `queue_entry`(
    `entryid` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `registrationid` BIGINT UNSIGNED NOT NULL,
    `fname` VARCHAR(255) NOT NULL,
    `lname` VARCHAR(255) NOT NULL,
    `symptoms` TEXT NOT NULL,
    `position` INT NOT NULL,
    `status` ENUM(
        'waiting',
        'arrived',
        'roomed',
        'completed',
        'no_show'
    ) NOT NULL DEFAULT 'waiting',
    `arrived` JSON NULL,
    `roomed` JSON NULL,
    `completed` JSON NULL,
    `no_show` JSON NULL,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `queue_entry_registrationid_foreign`
        FOREIGN KEY(`registrationid`) REFERENCES `registration`(`registrationid`)
);

-- -----------------------------------------------------------------------------
-- Dummy data (fixed IDs for easy API / manual testing)
--
-- Live-queue scenario (would mirror Redis in production):
--   entry 1 — position 1, waiting   (Jane / Tim)
--   entry 2 — position 2, waiting   (Jane / Amy)
--   entry 3 — position 3, arrived   (John / Jake)
--
-- Historical (removed from Redis in production):
--   entry 4 — roomed    (Maria / Sofia)
--   entry 5 — no_show   (Pat / Alex)
--   entry 6 — completed (Lisa / Emma)
--
-- After seeding MySQL only, start the API and POST /api/check-in to populate
-- Redis, or PATCH entry 1–3 to test remove flow against matching rows.
-- -----------------------------------------------------------------------------

INSERT INTO `registration` (
    `registrationid`,
    `parent_fname`,
    `parent_lname`,
    `phone`,
    `additional_notes`,
    `sms_opt_in`,
    `checked_in_at`
) VALUES
(1, 'Jane',   'Doe',    '5551110001', 'Two kids, same visit', TRUE,  NOW()),
(2, 'John',   'Smith',  '5551110002', NULL,                   FALSE, NOW()),
(3, 'Maria',  'Garcia', '5551110003', 'Spanish preferred',    TRUE,  NOW()),
(4, 'Pat',    'Lee',    '5551110004', NULL,                   FALSE, NOW()),
(5, 'Lisa',   'Brown',  '5551110005', 'Follow-up visit',      TRUE,  NOW());

INSERT INTO `queue_entry` (
    `entryid`,
    `registrationid`,
    `fname`,
    `lname`,
    `symptoms`,
    `position`,
    `status`,
    `arrived`,
    `roomed`,
    `completed`,
    `no_show`
) VALUES
(
    1, 1, 'Tim', 'Doe', 'Fever and sore throat', 1, 'waiting',
    NULL, NULL, NULL, NULL
),
(
    2, 1, 'Amy', 'Doe', 'Cough', 2, 'waiting',
    NULL, NULL, NULL, NULL
),
(
    3, 2, 'Jake', 'Smith', 'Ear pain', 3, 'arrived',
    JSON_OBJECT(
        'timestamp', DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 5 MINUTE), '%Y-%m-%dT%H:%i:%s'),
        'previous_status', 'waiting',
        'new_status', 'arrived',
        'staff_name', 'Sarah',
        'host', '192.168.1.10'
    ),
    NULL, NULL, NULL
),
(
    4, 3, 'Sofia', 'Garcia', 'Rash on arms', 4, 'roomed',
    NULL,
    JSON_OBJECT(
        'timestamp', DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 10 MINUTE), '%Y-%m-%dT%H:%i:%s'),
        'previous_status', 'arrived',
        'new_status', 'roomed',
        'staff_name', 'Mike',
        'host', '192.168.1.10'
    ),
    NULL, NULL
),
(
    5, 4, 'Alex', 'Lee', 'Vomiting', 5, 'no_show',
    NULL, NULL, NULL,
    JSON_OBJECT(
        'timestamp', DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 18 MINUTE), '%Y-%m-%dT%H:%i:%s'),
        'previous_status', 'waiting',
        'new_status', 'no_show',
        'staff_name', 'Sarah',
        'host', '192.168.1.10'
    )
),
(
    6, 5, 'Emma', 'Brown', 'Well-child check', 6, 'completed',
    JSON_OBJECT(
        'timestamp', DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 30 MINUTE), '%Y-%m-%dT%H:%i:%s'),
        'previous_status', 'waiting',
        'new_status', 'arrived',
        'staff_name', 'Mike',
        'host', '192.168.1.10'
    ),
    JSON_OBJECT(
        'timestamp', DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 20 MINUTE), '%Y-%m-%dT%H:%i:%s'),
        'previous_status', 'arrived',
        'new_status', 'roomed',
        'staff_name', 'Mike',
        'host', '192.168.1.10'
    ),
    JSON_OBJECT(
        'timestamp', DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 8 MINUTE), '%Y-%m-%dT%H:%i:%s'),
        'previous_status', 'roomed',
        'new_status', 'completed',
        'staff_name', 'Sarah',
        'host', '192.168.1.10'
    ),
    NULL
);

-- Next AUTO_INCREMENT values after explicit seed IDs
ALTER TABLE `registration` AUTO_INCREMENT = 6;
ALTER TABLE `queue_entry` AUTO_INCREMENT = 7;

-- -----------------------------------------------------------------------------
-- Quick verification queries (optional — comment out if not needed)
-- -----------------------------------------------------------------------------

SELECT 'registrations' AS section;
SELECT * FROM `registration` ORDER BY `registrationid`;

SELECT 'queue_entries' AS section;
SELECT
    `entryid`,
    `registrationid`,
    `fname`,
    `lname`,
    `position`,
    `status`
FROM `queue_entry`
ORDER BY `position`;
