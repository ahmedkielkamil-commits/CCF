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
--
-- Demo analytics (~14 days of MySQL-only history) is included below. Regenerate with:
--   python scripts/generate_demo_history.py
-- Only the live queue (entries 1–3) is mirrored into Redis via seed_redis.py.
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

-- -----------------------------------------------------------------------------
-- Demo analytics history (~14 days, MySQL only — not mirrored to Redis)
-- Regenerate: python scripts/generate_demo_history.py
-- BEGIN DEMO HISTORY (generated by scripts/generate_demo_history.py — do not edit manually)
INSERT INTO `registration` (
    `registrationid`,
    `parent_fname`,
    `parent_lname`,
    `phone`,
    `additional_notes`,
    `sms_opt_in`,
    `checked_in_at`
) VALUES
(6, 'Grace', 'Gomez', '5552000006', NULL, TRUE, '2026-08-03 09:06:00'),
(7, 'Isabel', 'Ibrahim', '5552000007', NULL, FALSE, '2026-08-03 10:13:00'),
(8, 'Karen', 'Kim', '5552000008', NULL, FALSE, '2026-08-03 11:29:00'),
(9, 'Megan', 'Martin', '5552000009', NULL, FALSE, '2026-08-03 09:58:00'),
(10, 'Oscar', 'Ortiz', '5552000010', 'Spanish preferred', FALSE, '2026-08-03 11:29:00'),
(11, 'Quinn', 'Quinn', '5552000011', NULL, TRUE, '2026-08-03 16:56:00'),
(12, 'Samuel', 'Singh', '5552000012', NULL, TRUE, '2026-08-03 15:15:00'),
(13, 'Uma', 'Upton', '5552000013', NULL, FALSE, '2026-08-03 09:42:00'),
(14, 'Wendy', 'Walker', '5552000014', NULL, FALSE, '2026-08-03 13:07:00'),
(15, 'Yolanda', 'Zhang', '5552000015', 'Spanish preferred', FALSE, '2026-08-03 10:42:00'),
(16, 'Quinn', 'Quinn', '5552000016', 'Spanish preferred', TRUE, '2026-08-04 14:41:00'),
(17, 'Samuel', 'Singh', '5552000017', NULL, TRUE, '2026-08-04 16:28:00'),
(18, 'Uma', 'Upton', '5552000018', NULL, TRUE, '2026-08-04 16:57:00'),
(19, 'Wendy', 'Walker', '5552000019', NULL, TRUE, '2026-08-04 13:47:00'),
(20, 'Yolanda', 'Zhang', '5552000020', NULL, FALSE, '2026-08-04 09:56:00'),
(21, 'Alicia', 'Clark', '5552000021', NULL, FALSE, '2026-08-04 13:32:00'),
(22, 'Chloe', 'Flores', '5552000022', NULL, FALSE, '2026-08-04 17:41:00'),
(23, 'Elena', 'Hall', '5552000023', NULL, TRUE, '2026-08-04 10:40:00'),
(24, 'Yolanda', 'Zhang', '5552000024', NULL, FALSE, '2026-08-05 09:23:00'),
(25, 'Alicia', 'Clark', '5552000025', NULL, TRUE, '2026-08-05 11:42:00'),
(26, 'Chloe', 'Flores', '5552000026', NULL, FALSE, '2026-08-05 09:49:00'),
(27, 'Elena', 'Hall', '5552000027', 'Spanish preferred', FALSE, '2026-08-05 14:22:00'),
(28, 'Ashley', 'Adams', '5552000028', NULL, FALSE, '2026-08-05 13:12:00'),
(29, 'David', 'Green', '5552000029', NULL, TRUE, '2026-08-06 10:28:00'),
(30, 'Frank', 'King', '5552000030', NULL, FALSE, '2026-08-06 10:12:00'),
(31, 'Brian', 'Baker', '5552000031', NULL, TRUE, '2026-08-06 16:55:00'),
(32, 'Diana', 'Davis', '5552000032', NULL, FALSE, '2026-08-06 10:15:00'),
(33, 'Fatima', 'Foster', '5552000033', 'Spanish preferred', TRUE, '2026-08-06 15:24:00'),
(34, 'Henry', 'Harris', '5552000034', NULL, FALSE, '2026-08-06 13:58:00'),
(35, 'James', 'Johnson', '5552000035', NULL, TRUE, '2026-08-06 11:48:00'),
(36, 'Ethan', 'Evans', '5552000036', NULL, FALSE, '2026-08-07 15:19:00'),
(37, 'Grace', 'Gomez', '5552000037', NULL, TRUE, '2026-08-07 14:07:00'),
(38, 'Isabel', 'Ibrahim', '5552000038', NULL, FALSE, '2026-08-07 11:46:00'),
(39, 'Karen', 'Kim', '5552000039', NULL, FALSE, '2026-08-07 14:24:00'),
(40, 'Megan', 'Martin', '5552000040', NULL, TRUE, '2026-08-07 15:44:00'),
(41, 'Oscar', 'Ortiz', '5552000041', NULL, TRUE, '2026-08-07 14:30:00'),
(42, 'Quinn', 'Quinn', '5552000042', NULL, TRUE, '2026-08-07 15:08:00'),
(43, 'Samuel', 'Singh', '5552000043', NULL, FALSE, '2026-08-07 11:11:00'),
(44, 'Uma', 'Upton', '5552000044', NULL, FALSE, '2026-08-07 14:10:00'),
(45, 'Nina', 'Nguyen', '5552000045', NULL, FALSE, '2026-08-08 16:50:00'),
(46, 'Priya', 'Patel', '5552000046', NULL, FALSE, '2026-08-08 09:02:00'),
(47, 'Rachel', 'Rivera', '5552000047', NULL, TRUE, '2026-08-08 12:05:00'),
(48, 'Tanya', 'Torres', '5552000048', NULL, FALSE, '2026-08-08 10:20:00'),
(49, 'Rachel', 'Rivera', '5552000049', NULL, TRUE, '2026-08-09 12:28:00'),
(50, 'Tanya', 'Torres', '5552000050', NULL, TRUE, '2026-08-09 17:15:00'),
(51, 'Victor', 'Vega', '5552000051', NULL, FALSE, '2026-08-09 10:19:00'),
(52, 'Xavier', 'Young', '5552000052', NULL, FALSE, '2026-08-09 12:58:00'),
(53, 'Zach', 'Brooks', '5552000053', NULL, TRUE, '2026-08-09 17:04:00'),
(54, 'Wendy', 'Walker', '5552000054', NULL, FALSE, '2026-08-10 14:56:00'),
(55, 'Yolanda', 'Zhang', '5552000055', 'Spanish preferred', FALSE, '2026-08-10 15:18:00'),
(56, 'Alicia', 'Clark', '5552000056', NULL, TRUE, '2026-08-10 14:29:00'),
(57, 'Chloe', 'Flores', '5552000057', NULL, FALSE, '2026-08-10 17:54:00'),
(58, 'Elena', 'Hall', '5552000058', NULL, FALSE, '2026-08-10 09:38:00'),
(59, 'Ashley', 'Adams', '5552000059', NULL, TRUE, '2026-08-10 15:05:00'),
(60, 'Carlos', 'Chen', '5552000060', NULL, FALSE, '2026-08-10 15:00:00'),
(61, 'Ethan', 'Evans', '5552000061', NULL, TRUE, '2026-08-10 10:39:00'),
(62, 'Grace', 'Gomez', '5552000062', 'Follow-up visit', FALSE, '2026-08-10 10:34:00'),
(63, 'Isabel', 'Ibrahim', '5552000063', NULL, TRUE, '2026-08-10 16:54:00'),
(64, 'Karen', 'Kim', '5552000064', NULL, TRUE, '2026-08-10 15:05:00'),
(65, 'Brian', 'Baker', '5552000065', NULL, TRUE, '2026-08-11 08:00:00'),
(66, 'Diana', 'Davis', '5552000066', NULL, TRUE, '2026-08-11 09:28:00'),
(67, 'Fatima', 'Foster', '5552000067', NULL, TRUE, '2026-08-11 14:37:00'),
(68, 'Henry', 'Harris', '5552000068', NULL, TRUE, '2026-08-11 11:26:00'),
(69, 'James', 'Johnson', '5552000069', NULL, TRUE, '2026-08-11 16:46:00'),
(70, 'Luis', 'Lopez', '5552000070', NULL, TRUE, '2026-08-11 10:14:00'),
(71, 'Nina', 'Nguyen', '5552000071', NULL, FALSE, '2026-08-11 08:55:00'),
(72, 'Priya', 'Patel', '5552000072', NULL, TRUE, '2026-08-11 10:36:00'),
(73, 'Rachel', 'Rivera', '5552000073', NULL, TRUE, '2026-08-11 13:19:00'),
(74, 'Karen', 'Kim', '5552000074', NULL, TRUE, '2026-08-12 11:45:00'),
(75, 'Megan', 'Martin', '5552000075', NULL, FALSE, '2026-08-12 11:07:00'),
(76, 'Oscar', 'Ortiz', '5552000076', 'Follow-up visit', TRUE, '2026-08-12 11:25:00'),
(77, 'Quinn', 'Quinn', '5552000077', NULL, TRUE, '2026-08-12 09:06:00'),
(78, 'Samuel', 'Singh', '5552000078', NULL, FALSE, '2026-08-12 17:20:00'),
(79, 'Priya', 'Patel', '5552000079', NULL, FALSE, '2026-08-13 11:51:00'),
(80, 'Rachel', 'Rivera', '5552000080', NULL, TRUE, '2026-08-13 15:41:00'),
(81, 'Tanya', 'Torres', '5552000081', NULL, FALSE, '2026-08-13 14:08:00'),
(82, 'Victor', 'Vega', '5552000082', NULL, TRUE, '2026-08-13 17:09:00'),
(83, 'Xavier', 'Young', '5552000083', 'Spanish preferred', FALSE, '2026-08-13 11:49:00'),
(84, 'Zach', 'Brooks', '5552000084', NULL, FALSE, '2026-08-13 14:28:00'),
(85, 'Ben', 'Edwards', '5552000085', NULL, FALSE, '2026-08-13 09:54:00'),
(86, 'David', 'Green', '5552000086', NULL, FALSE, '2026-08-13 11:25:00'),
(87, 'Frank', 'King', '5552000087', NULL, TRUE, '2026-08-13 14:08:00'),
(88, 'Yolanda', 'Zhang', '5552000088', 'Spanish preferred', FALSE, '2026-08-14 15:31:00'),
(89, 'Alicia', 'Clark', '5552000089', NULL, TRUE, '2026-08-14 15:22:00'),
(90, 'Chloe', 'Flores', '5552000090', 'Spanish preferred', FALSE, '2026-08-14 15:29:00'),
(91, 'Elena', 'Hall', '5552000091', NULL, FALSE, '2026-08-14 15:55:00'),
(92, 'Ashley', 'Adams', '5552000092', 'Spanish preferred', FALSE, '2026-08-14 14:52:00'),
(93, 'Carlos', 'Chen', '5552000093', 'Follow-up visit', TRUE, '2026-08-14 16:22:00'),
(94, 'Ethan', 'Evans', '5552000094', NULL, TRUE, '2026-08-14 16:02:00'),
(95, 'Grace', 'Gomez', '5552000095', NULL, TRUE, '2026-08-14 17:18:00'),
(96, 'Ashley', 'Adams', '5552000096', NULL, FALSE, '2026-08-15 15:32:00'),
(97, 'Carlos', 'Chen', '5552000097', NULL, TRUE, '2026-08-15 16:04:00'),
(98, 'Ethan', 'Evans', '5552000098', NULL, FALSE, '2026-08-15 14:22:00'),
(99, 'Diana', 'Davis', '5552000099', NULL, TRUE, '2026-08-16 13:19:00'),
(100, 'Fatima', 'Foster', '5552000100', NULL, TRUE, '2026-08-16 12:10:00'),
(101, 'Henry', 'Harris', '5552000101', NULL, FALSE, '2026-08-16 15:25:00'),
(102, 'James', 'Johnson', '5552000102', NULL, FALSE, '2026-08-16 09:23:00'),
(103, 'Luis', 'Lopez', '5552000103', NULL, FALSE, '2026-08-16 16:52:00');

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
(7, 6, 'Hannah', 'Gomez', 'Pink eye', 7, 'roomed', '{"timestamp":"2026-08-03T09:10:00","previous_status":"waiting","new_status":"arrived","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-03T09:36:00","previous_status":"arrived","new_status":"roomed","staff_name":"Mike","host":"192.168.1.10"}', NULL, NULL),
(8, 6, 'Julia', 'Gomez', 'Sprained ankle', 8, 'completed', '{"timestamp":"2026-08-03T09:17:00","previous_status":"waiting","new_status":"arrived","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-03T09:47:00","previous_status":"arrived","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-03T10:06:00","previous_status":"roomed","new_status":"completed","staff_name":"Sarah","host":"192.168.1.10"}', NULL),
(9, 7, 'Julia', 'Ibrahim', 'Sprained ankle', 9, 'completed', '{"timestamp":"2026-08-03T10:21:00","previous_status":"waiting","new_status":"arrived","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-03T11:00:00","previous_status":"arrived","new_status":"roomed","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-03T11:20:00","previous_status":"roomed","new_status":"completed","staff_name":"Sarah","host":"192.168.1.10"}', NULL),
(10, 7, 'Lily', 'Ibrahim', 'Runny nose and congestion', 10, 'roomed', '{"timestamp":"2026-08-03T10:24:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-03T11:06:00","previous_status":"arrived","new_status":"roomed","staff_name":"Mike","host":"192.168.1.10"}', NULL, NULL),
(11, 7, 'Nora', 'Ibrahim', 'Insect bite swelling', 11, 'no_show', NULL, NULL, NULL, '{"timestamp":"2026-08-03T11:42:00","previous_status":"waiting","new_status":"no_show","staff_name":"Jessica","host":"192.168.1.10"}'),
(12, 8, 'Mason', 'Kim', 'Headache', 12, 'completed', '{"timestamp":"2026-08-03T11:33:00","previous_status":"waiting","new_status":"arrived","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-03T12:16:00","previous_status":"arrived","new_status":"roomed","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-03T12:48:00","previous_status":"roomed","new_status":"completed","staff_name":"Mike","host":"192.168.1.10"}', NULL),
(13, 8, 'Owen', 'Ortiz', 'Fever and sore throat', 13, 'completed', '{"timestamp":"2026-08-03T11:42:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-03T12:06:00","previous_status":"arrived","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-03T12:39:00","previous_status":"roomed","new_status":"completed","staff_name":"Mike","host":"192.168.1.10"}', NULL),
(14, 9, 'Owen', 'Martin', 'Fever and sore throat', 14, 'no_show', NULL, NULL, NULL, '{"timestamp":"2026-08-03T10:21:00","previous_status":"waiting","new_status":"no_show","staff_name":"Parent Cancel","host":"192.168.1.10"}'),
(15, 9, 'Quinn', 'Martin', 'Ear pain', 15, 'completed', NULL, '{"timestamp":"2026-08-03T10:46:00","previous_status":"waiting","new_status":"roomed","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-03T11:06:00","previous_status":"roomed","new_status":"completed","staff_name":"Tom","host":"192.168.1.10"}', NULL),
(16, 9, 'Sofia', 'Martin', 'Vomiting', 16, 'completed', NULL, '{"timestamp":"2026-08-03T10:55:00","previous_status":"waiting","new_status":"roomed","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-03T11:10:00","previous_status":"roomed","new_status":"completed","staff_name":"Mike","host":"192.168.1.10"}', NULL),
(17, 10, 'Ruby', 'Ortiz', 'Rash on arms', 17, 'roomed', '{"timestamp":"2026-08-03T11:34:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-03T12:20:00","previous_status":"arrived","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', NULL, NULL),
(18, 11, 'Sofia', 'Quinn', 'Vomiting', 18, 'roomed', '{"timestamp":"2026-08-03T17:01:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-03T17:46:00","previous_status":"arrived","new_status":"roomed","staff_name":"Mike","host":"192.168.1.10"}', NULL, NULL),
(19, 11, 'Uma', 'Quinn', 'Stomach ache', 19, 'completed', '{"timestamp":"2026-08-03T17:08:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-03T17:54:00","previous_status":"arrived","new_status":"roomed","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-03T18:06:00","previous_status":"roomed","new_status":"completed","staff_name":"Sarah","host":"192.168.1.10"}', NULL),
(20, 12, 'Uma', 'Singh', 'Stomach ache', 20, 'no_show', NULL, NULL, NULL, '{"timestamp":"2026-08-03T15:38:00","previous_status":"waiting","new_status":"no_show","staff_name":"Parent Cancel","host":"192.168.1.10"}'),
(21, 13, 'Violet', 'Upton', 'Pink eye', 21, 'completed', '{"timestamp":"2026-08-03T09:48:00","previous_status":"waiting","new_status":"arrived","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-03T10:39:00","previous_status":"arrived","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-03T11:08:00","previous_status":"roomed","new_status":"completed","staff_name":"Tom","host":"192.168.1.10"}', NULL),
(22, 14, 'Wyatt', 'Walker', 'Seasonal allergies', 22, 'completed', '{"timestamp":"2026-08-03T13:13:00","previous_status":"waiting","new_status":"arrived","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-03T13:35:00","previous_status":"arrived","new_status":"roomed","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-03T13:49:00","previous_status":"roomed","new_status":"completed","staff_name":"Sarah","host":"192.168.1.10"}', NULL),
(23, 15, 'Zoe', 'Zhang', 'Sprained ankle', 23, 'completed', '{"timestamp":"2026-08-03T10:51:00","previous_status":"waiting","new_status":"arrived","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-03T11:16:00","previous_status":"arrived","new_status":"roomed","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-03T11:31:00","previous_status":"roomed","new_status":"completed","staff_name":"Jessica","host":"192.168.1.10"}', NULL),
(24, 16, 'Leo', 'Quinn', 'Asthma flare-up', 24, 'completed', NULL, '{"timestamp":"2026-08-04T15:15:00","previous_status":"waiting","new_status":"roomed","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-04T15:44:00","previous_status":"roomed","new_status":"completed","staff_name":"Mike","host":"192.168.1.10"}', NULL),
(25, 17, 'Mia', 'Singh', 'Runny nose and congestion', 25, 'no_show', NULL, NULL, NULL, '{"timestamp":"2026-08-04T16:53:00","previous_status":"waiting","new_status":"no_show","staff_name":"Parent Cancel","host":"192.168.1.10"}'),
(26, 17, 'Ella', 'Edwards', 'Insect bite swelling', 26, 'no_show', NULL, NULL, NULL, '{"timestamp":"2026-08-04T17:03:00","previous_status":"waiting","new_status":"no_show","staff_name":"Parent Cancel","host":"192.168.1.10"}'),
(27, 18, 'Ella', 'Upton', 'Insect bite swelling', 27, 'completed', '{"timestamp":"2026-08-04T17:07:00","previous_status":"waiting","new_status":"arrived","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-04T17:34:00","previous_status":"arrived","new_status":"roomed","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-04T17:59:00","previous_status":"roomed","new_status":"completed","staff_name":"Mike","host":"192.168.1.10"}', NULL),
(28, 19, 'Lucas', 'Walker', 'Fever and sore throat', 28, 'completed', '{"timestamp":"2026-08-04T13:52:00","previous_status":"waiting","new_status":"arrived","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-04T14:16:00","previous_status":"arrived","new_status":"roomed","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-04T14:44:00","previous_status":"roomed","new_status":"completed","staff_name":"Sarah","host":"192.168.1.10"}', NULL),
(29, 20, 'Aria', 'Zhang', 'Persistent cough', 29, 'completed', '{"timestamp":"2026-08-04T10:08:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-04T10:42:00","previous_status":"arrived","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-04T11:10:00","previous_status":"roomed","new_status":"completed","staff_name":"Mike","host":"192.168.1.10"}', NULL),
(30, 20, 'Bella', 'Zhang', 'Rash on arms', 30, 'completed', '{"timestamp":"2026-08-04T10:05:00","previous_status":"waiting","new_status":"arrived","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-04T10:40:00","previous_status":"arrived","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-04T11:02:00","previous_status":"roomed","new_status":"completed","staff_name":"Tom","host":"192.168.1.10"}', NULL),
(31, 21, 'Bella', 'King', 'Rash on arms', 31, 'roomed', '{"timestamp":"2026-08-04T13:41:00","previous_status":"waiting","new_status":"arrived","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-04T14:11:00","previous_status":"arrived","new_status":"roomed","staff_name":"Tom","host":"192.168.1.10"}', NULL, NULL),
(32, 22, 'Caleb', 'Adams', 'Vomiting', 32, 'completed', NULL, '{"timestamp":"2026-08-04T18:17:00","previous_status":"waiting","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-04T18:32:00","previous_status":"roomed","new_status":"completed","staff_name":"Mike","host":"192.168.1.10"}', NULL),
(33, 23, 'Daisy', 'Baker', 'Well-child check', 33, 'completed', '{"timestamp":"2026-08-04T10:44:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-04T11:28:00","previous_status":"arrived","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-04T11:53:00","previous_status":"roomed","new_status":"completed","staff_name":"Sarah","host":"192.168.1.10"}', NULL),
(34, 23, 'Faith', 'Hall', 'Pink eye', 34, 'completed', '{"timestamp":"2026-08-04T10:51:00","previous_status":"waiting","new_status":"arrived","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-04T11:26:00","previous_status":"arrived","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-04T12:00:00","previous_status":"roomed","new_status":"completed","staff_name":"Sarah","host":"192.168.1.10"}', NULL),
(35, 24, 'Faith', 'Zhang', 'Pink eye', 35, 'completed', '{"timestamp":"2026-08-05T09:26:00","previous_status":"waiting","new_status":"arrived","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-05T10:19:00","previous_status":"arrived","new_status":"roomed","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-05T10:42:00","previous_status":"roomed","new_status":"completed","staff_name":"Sarah","host":"192.168.1.10"}', NULL),
(36, 24, 'Hannah', 'Foster', 'Sprained ankle', 36, 'completed', '{"timestamp":"2026-08-05T09:32:00","previous_status":"waiting","new_status":"arrived","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-05T10:21:00","previous_status":"arrived","new_status":"roomed","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-05T10:38:00","previous_status":"roomed","new_status":"completed","staff_name":"Sarah","host":"192.168.1.10"}', NULL),
(37, 25, 'Hannah', 'Clark', 'Sprained ankle', 37, 'no_show', NULL, NULL, NULL, '{"timestamp":"2026-08-05T12:12:00","previous_status":"waiting","new_status":"no_show","staff_name":"Parent Cancel","host":"192.168.1.10"}'),
(38, 25, 'Julia', 'Harris', 'Runny nose and congestion', 38, 'completed', '{"timestamp":"2026-08-05T11:52:00","previous_status":"waiting","new_status":"arrived","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-05T12:21:00","previous_status":"arrived","new_status":"roomed","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-05T12:42:00","previous_status":"roomed","new_status":"completed","staff_name":"Sarah","host":"192.168.1.10"}', NULL),
(39, 26, 'Julia', 'Flores', 'Runny nose and congestion', 39, 'completed', '{"timestamp":"2026-08-05T09:57:00","previous_status":"waiting","new_status":"arrived","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-05T10:47:00","previous_status":"arrived","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-05T10:59:00","previous_status":"roomed","new_status":"completed","staff_name":"Mike","host":"192.168.1.10"}', NULL),
(40, 27, 'Kyle', 'Hall', 'Headache', 40, 'completed', '{"timestamp":"2026-08-05T14:29:00","previous_status":"waiting","new_status":"arrived","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-05T14:51:00","previous_status":"arrived","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-05T15:25:00","previous_status":"roomed","new_status":"completed","staff_name":"Mike","host":"192.168.1.10"}', NULL),
(41, 27, 'Mason', 'Kim', 'Fever and sore throat', 41, 'completed', '{"timestamp":"2026-08-05T14:34:00","previous_status":"waiting","new_status":"arrived","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-05T15:00:00","previous_status":"arrived","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-05T15:33:00","previous_status":"roomed","new_status":"completed","staff_name":"Jessica","host":"192.168.1.10"}', NULL),
(42, 28, 'Mason', 'Adams', 'Fever and sore throat', 42, 'roomed', '{"timestamp":"2026-08-05T13:20:00","previous_status":"waiting","new_status":"arrived","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-05T13:54:00","previous_status":"arrived","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', NULL, NULL),
(43, 29, 'Nora', 'Green', 'Persistent cough', 43, 'completed', '{"timestamp":"2026-08-06T10:33:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-06T11:17:00","previous_status":"arrived","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-06T11:31:00","previous_status":"roomed","new_status":"completed","staff_name":"Sarah","host":"192.168.1.10"}', NULL),
(44, 30, 'Owen', 'King', 'Ear pain', 44, 'completed', '{"timestamp":"2026-08-06T10:22:00","previous_status":"waiting","new_status":"arrived","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-06T10:53:00","previous_status":"arrived","new_status":"roomed","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-06T11:25:00","previous_status":"roomed","new_status":"completed","staff_name":"Tom","host":"192.168.1.10"}', NULL),
(45, 31, 'Piper', 'Baker', 'Rash on arms', 45, 'completed', '{"timestamp":"2026-08-06T17:06:00","previous_status":"waiting","new_status":"arrived","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-06T17:37:00","previous_status":"arrived","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-06T17:50:00","previous_status":"roomed","new_status":"completed","staff_name":"Tom","host":"192.168.1.10"}', NULL),
(46, 31, 'Ruby', 'Baker', 'Well-child check', 46, 'completed', '{"timestamp":"2026-08-06T17:10:00","previous_status":"waiting","new_status":"arrived","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-06T17:36:00","previous_status":"arrived","new_status":"roomed","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-06T18:12:00","previous_status":"roomed","new_status":"completed","staff_name":"Tom","host":"192.168.1.10"}', NULL),
(47, 32, 'Ruby', 'Davis', 'Well-child check', 47, 'completed', '{"timestamp":"2026-08-06T10:19:00","previous_status":"waiting","new_status":"arrived","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-06T11:05:00","previous_status":"arrived","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-06T11:26:00","previous_status":"roomed","new_status":"completed","staff_name":"Jessica","host":"192.168.1.10"}', NULL),
(48, 32, 'Tyler', 'Davis', 'Pink eye', 48, 'completed', '{"timestamp":"2026-08-06T10:20:00","previous_status":"waiting","new_status":"arrived","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-06T11:05:00","previous_status":"arrived","new_status":"roomed","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-06T11:23:00","previous_status":"roomed","new_status":"completed","staff_name":"Tom","host":"192.168.1.10"}', NULL),
(49, 33, 'Tyler', 'Rivera', 'Pink eye', 49, 'completed', '{"timestamp":"2026-08-06T15:33:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-06T16:07:00","previous_status":"arrived","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-06T16:19:00","previous_status":"roomed","new_status":"completed","staff_name":"Tom","host":"192.168.1.10"}', NULL),
(50, 33, 'Violet', 'Foster', 'Sprained ankle', 50, 'no_show', NULL, NULL, NULL, '{"timestamp":"2026-08-06T15:58:00","previous_status":"waiting","new_status":"no_show","staff_name":"Parent Cancel","host":"192.168.1.10"}'),
(51, 33, 'Zoe', 'Foster', 'Runny nose and congestion', 51, 'completed', '{"timestamp":"2026-08-06T15:36:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-06T15:54:00","previous_status":"arrived","new_status":"roomed","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-06T16:18:00","previous_status":"roomed","new_status":"completed","staff_name":"Mike","host":"192.168.1.10"}', NULL),
(52, 34, 'Wyatt', 'Harris', 'Asthma flare-up', 52, 'completed', '{"timestamp":"2026-08-06T14:08:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-06T14:31:00","previous_status":"arrived","new_status":"roomed","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-06T14:44:00","previous_status":"roomed","new_status":"completed","staff_name":"Jessica","host":"192.168.1.10"}', NULL),
(53, 35, 'Zoe', 'Johnson', 'Runny nose and congestion', 53, 'completed', '{"timestamp":"2026-08-06T11:51:00","previous_status":"waiting","new_status":"arrived","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-06T12:46:00","previous_status":"arrived","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-06T13:09:00","previous_status":"roomed","new_status":"completed","staff_name":"Sarah","host":"192.168.1.10"}', NULL),
(54, 35, 'Mia', 'Johnson', 'Insect bite swelling', 54, 'no_show', NULL, NULL, NULL, '{"timestamp":"2026-08-06T12:30:00","previous_status":"waiting","new_status":"no_show","staff_name":"Mike","host":"192.168.1.10"}'),
(55, 35, 'Ella', 'Johnson', 'Persistent cough', 55, 'completed', '{"timestamp":"2026-08-06T12:00:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-06T12:36:00","previous_status":"arrived","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-06T13:10:00","previous_status":"roomed","new_status":"completed","staff_name":"Mike","host":"192.168.1.10"}', NULL),
(56, 36, 'Noah', 'Evans', 'Fever and sore throat', 56, 'completed', '{"timestamp":"2026-08-07T15:28:00","previous_status":"waiting","new_status":"arrived","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-07T15:59:00","previous_status":"arrived","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-07T16:33:00","previous_status":"roomed","new_status":"completed","staff_name":"Mike","host":"192.168.1.10"}', NULL),
(57, 37, 'Ella', 'Gomez', 'Persistent cough', 57, 'completed', '{"timestamp":"2026-08-07T14:15:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-07T14:37:00","previous_status":"arrived","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-07T15:05:00","previous_status":"roomed","new_status":"completed","staff_name":"Tom","host":"192.168.1.10"}', NULL),
(58, 37, 'Aria', 'Gomez', 'Rash on arms', 58, 'no_show', NULL, NULL, NULL, '{"timestamp":"2026-08-07T14:26:00","previous_status":"waiting","new_status":"no_show","staff_name":"Parent Cancel","host":"192.168.1.10"}'),
(59, 38, 'Aria', 'Ibrahim', 'Rash on arms', 59, 'completed', '{"timestamp":"2026-08-07T11:58:00","previous_status":"waiting","new_status":"arrived","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-07T12:22:00","previous_status":"arrived","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-07T12:44:00","previous_status":"roomed","new_status":"completed","staff_name":"Jessica","host":"192.168.1.10"}', NULL),
(60, 39, 'Aiden', 'Kim', 'Vomiting', 60, 'completed', '{"timestamp":"2026-08-07T14:31:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-07T15:02:00","previous_status":"arrived","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-07T15:22:00","previous_status":"roomed","new_status":"completed","staff_name":"Mike","host":"192.168.1.10"}', NULL),
(61, 40, 'Bella', 'Martin', 'Well-child check', 61, 'no_show', NULL, NULL, NULL, '{"timestamp":"2026-08-07T16:29:00","previous_status":"waiting","new_status":"no_show","staff_name":"Jessica","host":"192.168.1.10"}'),
(62, 41, 'Caleb', 'Ortiz', 'Stomach ache', 62, 'completed', '{"timestamp":"2026-08-07T14:37:00","previous_status":"waiting","new_status":"arrived","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-07T15:06:00","previous_status":"arrived","new_status":"roomed","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-07T15:25:00","previous_status":"roomed","new_status":"completed","staff_name":"Jessica","host":"192.168.1.10"}', NULL),
(63, 41, 'Eli', 'Ortiz', 'Seasonal allergies', 63, 'completed', '{"timestamp":"2026-08-07T14:38:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-07T15:22:00","previous_status":"arrived","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-07T15:52:00","previous_status":"roomed","new_status":"completed","staff_name":"Mike","host":"192.168.1.10"}', NULL),
(64, 42, 'Eli', 'Quinn', 'Seasonal allergies', 64, 'roomed', '{"timestamp":"2026-08-07T15:14:00","previous_status":"waiting","new_status":"arrived","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-07T15:58:00","previous_status":"arrived","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', NULL, NULL),
(65, 43, 'Faith', 'Singh', 'Sprained ankle', 65, 'completed', NULL, '{"timestamp":"2026-08-07T11:41:00","previous_status":"waiting","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-07T12:11:00","previous_status":"roomed","new_status":"completed","staff_name":"Mike","host":"192.168.1.10"}', NULL),
(66, 43, 'Hannah', 'Singh', 'Runny nose and congestion', 66, 'completed', '{"timestamp":"2026-08-07T11:24:00","previous_status":"waiting","new_status":"arrived","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-07T12:05:00","previous_status":"arrived","new_status":"roomed","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-07T12:30:00","previous_status":"roomed","new_status":"completed","staff_name":"Tom","host":"192.168.1.10"}', NULL),
(67, 43, 'Julia', 'Foster', 'Insect bite swelling', 67, 'roomed', '{"timestamp":"2026-08-07T11:25:00","previous_status":"waiting","new_status":"arrived","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-07T11:54:00","previous_status":"arrived","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', NULL, NULL),
(68, 44, 'Ian', 'Upton', 'Headache', 68, 'completed', '{"timestamp":"2026-08-07T14:22:00","previous_status":"waiting","new_status":"arrived","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-07T14:53:00","previous_status":"arrived","new_status":"roomed","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-07T15:14:00","previous_status":"roomed","new_status":"completed","staff_name":"Jessica","host":"192.168.1.10"}', NULL),
(69, 45, 'Julia', 'Nguyen', 'Insect bite swelling', 69, 'completed', '{"timestamp":"2026-08-08T16:55:00","previous_status":"waiting","new_status":"arrived","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-08T17:47:00","previous_status":"arrived","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-08T18:07:00","previous_status":"roomed","new_status":"completed","staff_name":"Sarah","host":"192.168.1.10"}', NULL),
(70, 45, 'Lily', 'Nguyen', 'Persistent cough', 70, 'completed', '{"timestamp":"2026-08-08T16:59:00","previous_status":"waiting","new_status":"arrived","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-08T17:34:00","previous_status":"arrived","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-08T17:49:00","previous_status":"roomed","new_status":"completed","staff_name":"Tom","host":"192.168.1.10"}', NULL),
(71, 46, 'Lily', 'Patel', 'Persistent cough', 71, 'no_show', NULL, NULL, NULL, '{"timestamp":"2026-08-08T09:56:00","previous_status":"waiting","new_status":"no_show","staff_name":"Sarah","host":"192.168.1.10"}'),
(72, 46, 'Nora', 'Patel', 'Rash on arms', 72, 'roomed', '{"timestamp":"2026-08-08T09:10:00","previous_status":"waiting","new_status":"arrived","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-08T09:49:00","previous_status":"arrived","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', NULL, NULL),
(73, 47, 'Nora', 'Rivera', 'Rash on arms', 73, 'completed', '{"timestamp":"2026-08-08T12:13:00","previous_status":"waiting","new_status":"arrived","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-08T12:46:00","previous_status":"arrived","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-08T13:20:00","previous_status":"roomed","new_status":"completed","staff_name":"Tom","host":"192.168.1.10"}', NULL),
(74, 48, 'Owen', 'Torres', 'Vomiting', 74, 'no_show', NULL, NULL, NULL, '{"timestamp":"2026-08-08T11:34:00","previous_status":"waiting","new_status":"no_show","staff_name":"Tom","host":"192.168.1.10"}'),
(75, 49, 'Piper', 'Lopez', 'Well-child check', 75, 'completed', '{"timestamp":"2026-08-09T12:38:00","previous_status":"waiting","new_status":"arrived","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-09T12:59:00","previous_status":"arrived","new_status":"roomed","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-09T13:11:00","previous_status":"roomed","new_status":"completed","staff_name":"Jessica","host":"192.168.1.10"}', NULL),
(76, 49, 'Ruby', 'Rivera', 'Pink eye', 76, 'completed', '{"timestamp":"2026-08-09T12:35:00","previous_status":"waiting","new_status":"arrived","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-09T13:13:00","previous_status":"arrived","new_status":"roomed","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-09T13:28:00","previous_status":"roomed","new_status":"completed","staff_name":"Jessica","host":"192.168.1.10"}', NULL),
(77, 50, 'Ruby', 'Nguyen', 'Pink eye', 77, 'completed', '{"timestamp":"2026-08-09T17:20:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-09T18:10:00","previous_status":"arrived","new_status":"roomed","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-09T18:24:00","previous_status":"roomed","new_status":"completed","staff_name":"Jessica","host":"192.168.1.10"}', NULL),
(78, 51, 'Sofia', 'Ortiz', 'Seasonal allergies', 78, 'completed', '{"timestamp":"2026-08-09T10:29:00","previous_status":"waiting","new_status":"arrived","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-09T10:58:00","previous_status":"arrived","new_status":"roomed","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-09T11:20:00","previous_status":"roomed","new_status":"completed","staff_name":"Jessica","host":"192.168.1.10"}', NULL),
(79, 51, 'Uma', 'Vega', 'Asthma flare-up', 79, 'no_show', NULL, NULL, NULL, '{"timestamp":"2026-08-09T10:35:00","previous_status":"waiting","new_status":"no_show","staff_name":"Parent Cancel","host":"192.168.1.10"}'),
(80, 52, 'Uma', 'Young', 'Asthma flare-up', 80, 'completed', NULL, '{"timestamp":"2026-08-09T13:56:00","previous_status":"waiting","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-09T14:26:00","previous_status":"roomed","new_status":"completed","staff_name":"Sarah","host":"192.168.1.10"}', NULL),
(81, 52, 'Wyatt', 'Young', 'Headache', 81, 'no_show', NULL, NULL, NULL, '{"timestamp":"2026-08-09T13:23:00","previous_status":"waiting","new_status":"no_show","staff_name":"Parent Cancel","host":"192.168.1.10"}'),
(82, 53, 'Wyatt', 'Brooks', 'Headache', 82, 'roomed', '{"timestamp":"2026-08-09T17:14:00","previous_status":"waiting","new_status":"arrived","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-09T17:54:00","previous_status":"arrived","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', NULL, NULL),
(83, 54, 'Zoe', 'Walker', 'Insect bite swelling', 83, 'no_show', NULL, NULL, NULL, '{"timestamp":"2026-08-10T15:11:00","previous_status":"waiting","new_status":"no_show","staff_name":"Parent Cancel","host":"192.168.1.10"}'),
(84, 54, 'Mia', 'Vega', 'Persistent cough', 84, 'completed', '{"timestamp":"2026-08-10T15:07:00","previous_status":"waiting","new_status":"arrived","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-10T15:29:00","previous_status":"arrived","new_status":"roomed","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-10T16:05:00","previous_status":"roomed","new_status":"completed","staff_name":"Mike","host":"192.168.1.10"}', NULL),
(85, 55, 'Mia', 'Zhang', 'Persistent cough', 85, 'completed', '{"timestamp":"2026-08-10T15:23:00","previous_status":"waiting","new_status":"arrived","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-10T15:51:00","previous_status":"arrived","new_status":"roomed","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-10T16:08:00","previous_status":"roomed","new_status":"completed","staff_name":"Mike","host":"192.168.1.10"}', NULL),
(86, 56, 'Noah', 'Walker', 'Ear pain', 86, 'completed', '{"timestamp":"2026-08-10T14:34:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-10T14:59:00","previous_status":"arrived","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-10T15:25:00","previous_status":"roomed","new_status":"completed","staff_name":"Tom","host":"192.168.1.10"}', NULL),
(87, 57, 'Ella', 'Flores', 'Rash on arms', 87, 'completed', '{"timestamp":"2026-08-10T18:01:00","previous_status":"waiting","new_status":"arrived","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-10T18:22:00","previous_status":"arrived","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-10T19:00:00","previous_status":"roomed","new_status":"completed","staff_name":"Sarah","host":"192.168.1.10"}', NULL),
(88, 58, 'Lucas', 'Hall', 'Vomiting', 88, 'no_show', NULL, NULL, NULL, '{"timestamp":"2026-08-10T09:53:00","previous_status":"waiting","new_status":"no_show","staff_name":"Parent Cancel","host":"192.168.1.10"}'),
(89, 58, 'Aiden', 'Hall', 'Stomach ache', 89, 'completed', '{"timestamp":"2026-08-10T09:47:00","previous_status":"waiting","new_status":"arrived","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-10T10:29:00","previous_status":"arrived","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-10T11:05:00","previous_status":"roomed","new_status":"completed","staff_name":"Sarah","host":"192.168.1.10"}', NULL),
(90, 59, 'Aiden', 'Adams', 'Stomach ache', 90, 'completed', NULL, '{"timestamp":"2026-08-10T16:01:00","previous_status":"waiting","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-10T16:24:00","previous_status":"roomed","new_status":"completed","staff_name":"Mike","host":"192.168.1.10"}', NULL),
(91, 59, 'Caleb', 'Flores', 'Seasonal allergies', 91, 'completed', '{"timestamp":"2026-08-10T15:16:00","previous_status":"waiting","new_status":"arrived","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-10T16:01:00","previous_status":"arrived","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-10T16:16:00","previous_status":"roomed","new_status":"completed","staff_name":"Mike","host":"192.168.1.10"}', NULL),
(92, 59, 'Eli', 'Hall', 'Asthma flare-up', 92, 'no_show', NULL, NULL, NULL, '{"timestamp":"2026-08-10T16:33:00","previous_status":"waiting","new_status":"no_show","staff_name":"Tom","host":"192.168.1.10"}'),
(93, 60, 'Daisy', 'Chen', 'Sprained ankle', 93, 'completed', '{"timestamp":"2026-08-10T15:12:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-10T15:40:00","previous_status":"arrived","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-10T16:18:00","previous_status":"roomed","new_status":"completed","staff_name":"Mike","host":"192.168.1.10"}', NULL),
(94, 61, 'Eli', 'Hall', 'Asthma flare-up', 94, 'completed', '{"timestamp":"2026-08-10T10:48:00","previous_status":"waiting","new_status":"arrived","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-10T11:10:00","previous_status":"arrived","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-10T11:26:00","previous_status":"roomed","new_status":"completed","staff_name":"Jessica","host":"192.168.1.10"}', NULL),
(95, 62, 'Faith', 'Gomez', 'Runny nose and congestion', 95, 'completed', '{"timestamp":"2026-08-10T10:43:00","previous_status":"waiting","new_status":"arrived","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-10T11:22:00","previous_status":"arrived","new_status":"roomed","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-10T11:37:00","previous_status":"roomed","new_status":"completed","staff_name":"Jessica","host":"192.168.1.10"}', NULL),
(96, 63, 'Gavin', 'Ibrahim', 'Headache', 96, 'roomed', '{"timestamp":"2026-08-10T17:08:00","previous_status":"waiting","new_status":"arrived","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-10T17:35:00","previous_status":"arrived","new_status":"roomed","staff_name":"Tom","host":"192.168.1.10"}', NULL, NULL),
(97, 64, 'Hannah', 'Kim', 'Insect bite swelling', 97, 'completed', '{"timestamp":"2026-08-10T15:10:00","previous_status":"waiting","new_status":"arrived","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-10T15:58:00","previous_status":"arrived","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-10T16:28:00","previous_status":"roomed","new_status":"completed","staff_name":"Mike","host":"192.168.1.10"}', NULL),
(98, 64, 'Julia', 'Kim', 'Persistent cough', 98, 'completed', NULL, '{"timestamp":"2026-08-10T15:34:00","previous_status":"waiting","new_status":"roomed","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-10T15:54:00","previous_status":"roomed","new_status":"completed","staff_name":"Mike","host":"192.168.1.10"}', NULL),
(99, 65, 'Julia', 'Baker', 'Persistent cough', 99, 'no_show', NULL, NULL, NULL, '{"timestamp":"2026-08-11T08:56:00","previous_status":"waiting","new_status":"no_show","staff_name":"Sarah","host":"192.168.1.10"}'),
(100, 66, 'Kyle', 'Davis', 'Ear pain', 100, 'completed', '{"timestamp":"2026-08-11T09:40:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-11T09:57:00","previous_status":"arrived","new_status":"roomed","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-11T10:32:00","previous_status":"roomed","new_status":"completed","staff_name":"Sarah","host":"192.168.1.10"}', NULL),
(101, 66, 'Mason', 'Davis', 'Vomiting', 101, 'completed', '{"timestamp":"2026-08-11T09:35:00","previous_status":"waiting","new_status":"arrived","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-11T10:14:00","previous_status":"arrived","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-11T10:48:00","previous_status":"roomed","new_status":"completed","staff_name":"Sarah","host":"192.168.1.10"}', NULL),
(102, 67, 'Mason', 'Foster', 'Vomiting', 102, 'completed', '{"timestamp":"2026-08-11T14:41:00","previous_status":"waiting","new_status":"arrived","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-11T15:30:00","previous_status":"arrived","new_status":"roomed","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-11T16:04:00","previous_status":"roomed","new_status":"completed","staff_name":"Tom","host":"192.168.1.10"}', NULL),
(103, 68, 'Nora', 'Harris', 'Well-child check', 103, 'completed', '{"timestamp":"2026-08-11T11:31:00","previous_status":"waiting","new_status":"arrived","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-11T12:15:00","previous_status":"arrived","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-11T12:42:00","previous_status":"roomed","new_status":"completed","staff_name":"Sarah","host":"192.168.1.10"}', NULL),
(104, 68, 'Piper', 'Harris', 'Pink eye', 104, 'completed', '{"timestamp":"2026-08-11T11:31:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-11T12:11:00","previous_status":"arrived","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-11T12:24:00","previous_status":"roomed","new_status":"completed","staff_name":"Tom","host":"192.168.1.10"}', NULL),
(105, 69, 'Piper', 'Johnson', 'Pink eye', 105, 'completed', '{"timestamp":"2026-08-11T16:52:00","previous_status":"waiting","new_status":"arrived","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-11T17:18:00","previous_status":"arrived","new_status":"roomed","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-11T17:51:00","previous_status":"roomed","new_status":"completed","staff_name":"Sarah","host":"192.168.1.10"}', NULL),
(106, 70, 'Quinn', 'Lopez', 'Seasonal allergies', 106, 'no_show', NULL, NULL, NULL, '{"timestamp":"2026-08-11T10:43:00","previous_status":"waiting","new_status":"no_show","staff_name":"Parent Cancel","host":"192.168.1.10"}'),
(107, 70, 'Sofia', 'Lopez', 'Asthma flare-up', 107, 'no_show', NULL, NULL, NULL, '{"timestamp":"2026-08-11T10:32:00","previous_status":"waiting","new_status":"no_show","staff_name":"Parent Cancel","host":"192.168.1.10"}'),
(108, 71, 'Sofia', 'Nguyen', 'Asthma flare-up', 108, 'completed', '{"timestamp":"2026-08-11T08:58:00","previous_status":"waiting","new_status":"arrived","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-11T09:25:00","previous_status":"arrived","new_status":"roomed","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-11T10:00:00","previous_status":"roomed","new_status":"completed","staff_name":"Tom","host":"192.168.1.10"}', NULL),
(109, 72, 'Tyler', 'Patel', 'Runny nose and congestion', 109, 'roomed', '{"timestamp":"2026-08-11T10:49:00","previous_status":"waiting","new_status":"arrived","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-11T11:07:00","previous_status":"arrived","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', NULL, NULL),
(110, 72, 'Violet', 'Patel', 'Insect bite swelling', 110, 'completed', '{"timestamp":"2026-08-11T10:46:00","previous_status":"waiting","new_status":"arrived","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-11T11:13:00","previous_status":"arrived","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-11T11:49:00","previous_status":"roomed","new_status":"completed","staff_name":"Tom","host":"192.168.1.10"}', NULL),
(111, 73, 'Violet', 'Rivera', 'Insect bite swelling', 111, 'completed', '{"timestamp":"2026-08-11T13:25:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-11T14:11:00","previous_status":"arrived","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-11T14:27:00","previous_status":"roomed","new_status":"completed","staff_name":"Jessica","host":"192.168.1.10"}', NULL),
(112, 74, 'Wyatt', 'Kim', 'Fever and sore throat', 112, 'completed', '{"timestamp":"2026-08-12T11:48:00","previous_status":"waiting","new_status":"arrived","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-12T12:26:00","previous_status":"arrived","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-12T12:38:00","previous_status":"roomed","new_status":"completed","staff_name":"Jessica","host":"192.168.1.10"}', NULL),
(113, 75, 'Zoe', 'Martin', 'Persistent cough', 113, 'roomed', '{"timestamp":"2026-08-12T11:20:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-12T11:51:00","previous_status":"arrived","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', NULL, NULL),
(114, 76, 'Leo', 'Ortiz', 'Ear pain', 114, 'completed', '{"timestamp":"2026-08-12T11:30:00","previous_status":"waiting","new_status":"arrived","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-12T11:55:00","previous_status":"arrived","new_status":"roomed","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-12T12:23:00","previous_status":"roomed","new_status":"completed","staff_name":"Jessica","host":"192.168.1.10"}', NULL),
(115, 77, 'Mia', 'Quinn', 'Rash on arms', 115, 'completed', '{"timestamp":"2026-08-12T09:11:00","previous_status":"waiting","new_status":"arrived","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-12T10:04:00","previous_status":"arrived","new_status":"roomed","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-12T10:40:00","previous_status":"roomed","new_status":"completed","staff_name":"Tom","host":"192.168.1.10"}', NULL),
(116, 78, 'Noah', 'Singh', 'Vomiting', 116, 'completed', '{"timestamp":"2026-08-12T17:27:00","previous_status":"waiting","new_status":"arrived","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-12T18:13:00","previous_status":"arrived","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-12T18:33:00","previous_status":"roomed","new_status":"completed","staff_name":"Sarah","host":"192.168.1.10"}', NULL),
(117, 78, 'Lucas', 'Singh', 'Stomach ache', 117, 'completed', '{"timestamp":"2026-08-12T17:30:00","previous_status":"waiting","new_status":"arrived","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-12T17:53:00","previous_status":"arrived","new_status":"roomed","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-12T18:25:00","previous_status":"roomed","new_status":"completed","staff_name":"Tom","host":"192.168.1.10"}', NULL),
(118, 79, 'Lucas', 'Patel', 'Stomach ache', 118, 'completed', '{"timestamp":"2026-08-13T12:01:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-13T12:22:00","previous_status":"arrived","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-13T12:59:00","previous_status":"roomed","new_status":"completed","staff_name":"Mike","host":"192.168.1.10"}', NULL),
(119, 79, 'Aiden', 'Zhang', 'Seasonal allergies', 119, 'completed', '{"timestamp":"2026-08-13T12:06:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-13T12:27:00","previous_status":"arrived","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-13T12:50:00","previous_status":"roomed","new_status":"completed","staff_name":"Tom","host":"192.168.1.10"}', NULL),
(120, 80, 'Aiden', 'Rivera', 'Seasonal allergies', 120, 'completed', '{"timestamp":"2026-08-13T15:53:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-13T16:36:00","previous_status":"arrived","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-13T16:52:00","previous_status":"roomed","new_status":"completed","staff_name":"Mike","host":"192.168.1.10"}', NULL),
(121, 81, 'Bella', 'Torres', 'Sprained ankle', 121, 'roomed', '{"timestamp":"2026-08-13T14:22:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-13T15:03:00","previous_status":"arrived","new_status":"roomed","staff_name":"Mike","host":"192.168.1.10"}', NULL, NULL),
(122, 81, 'Daisy', 'Torres', 'Runny nose and congestion', 122, 'completed', '{"timestamp":"2026-08-13T14:16:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-13T14:36:00","previous_status":"arrived","new_status":"roomed","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-13T14:59:00","previous_status":"roomed","new_status":"completed","staff_name":"Mike","host":"192.168.1.10"}', NULL),
(123, 82, 'Daisy', 'Vega', 'Runny nose and congestion', 123, 'no_show', NULL, NULL, NULL, '{"timestamp":"2026-08-13T17:34:00","previous_status":"waiting","new_status":"no_show","staff_name":"Parent Cancel","host":"192.168.1.10"}'),
(124, 83, 'Eli', 'Young', 'Headache', 124, 'completed', '{"timestamp":"2026-08-13T12:01:00","previous_status":"waiting","new_status":"arrived","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-13T12:42:00","previous_status":"arrived","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-13T12:59:00","previous_status":"roomed","new_status":"completed","staff_name":"Tom","host":"192.168.1.10"}', NULL),
(125, 83, 'Gavin', 'Hall', 'Fever and sore throat', 125, 'completed', '{"timestamp":"2026-08-13T12:00:00","previous_status":"waiting","new_status":"arrived","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-13T12:25:00","previous_status":"arrived","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-13T12:54:00","previous_status":"roomed","new_status":"completed","staff_name":"Tom","host":"192.168.1.10"}', NULL),
(126, 84, 'Gavin', 'Brooks', 'Fever and sore throat', 126, 'completed', '{"timestamp":"2026-08-13T14:33:00","previous_status":"waiting","new_status":"arrived","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-13T15:22:00","previous_status":"arrived","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-13T15:40:00","previous_status":"roomed","new_status":"completed","staff_name":"Sarah","host":"192.168.1.10"}', NULL),
(127, 85, 'Hannah', 'Edwards', 'Persistent cough', 127, 'completed', '{"timestamp":"2026-08-13T10:05:00","previous_status":"waiting","new_status":"arrived","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-13T10:26:00","previous_status":"arrived","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-13T11:04:00","previous_status":"roomed","new_status":"completed","staff_name":"Mike","host":"192.168.1.10"}', NULL),
(128, 86, 'Ian', 'Green', 'Ear pain', 128, 'completed', NULL, '{"timestamp":"2026-08-13T12:19:00","previous_status":"waiting","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-13T12:53:00","previous_status":"roomed","new_status":"completed","staff_name":"Mike","host":"192.168.1.10"}', NULL),
(129, 87, 'Julia', 'Baker', 'Rash on arms', 129, 'completed', NULL, '{"timestamp":"2026-08-13T15:02:00","previous_status":"waiting","new_status":"roomed","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-13T15:18:00","previous_status":"roomed","new_status":"completed","staff_name":"Sarah","host":"192.168.1.10"}', NULL),
(130, 87, 'Lily', 'King', 'Well-child check', 130, 'no_show', NULL, NULL, NULL, '{"timestamp":"2026-08-13T14:52:00","previous_status":"waiting","new_status":"no_show","staff_name":"Mike","host":"192.168.1.10"}'),
(131, 88, 'Lily', 'Zhang', 'Well-child check', 131, 'completed', '{"timestamp":"2026-08-14T15:34:00","previous_status":"waiting","new_status":"arrived","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-14T16:18:00","previous_status":"arrived","new_status":"roomed","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-14T16:41:00","previous_status":"roomed","new_status":"completed","staff_name":"Mike","host":"192.168.1.10"}', NULL),
(132, 88, 'Nora', 'Zhang', 'Pink eye', 132, 'completed', '{"timestamp":"2026-08-14T15:42:00","previous_status":"waiting","new_status":"arrived","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-14T16:16:00","previous_status":"arrived","new_status":"roomed","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-14T16:44:00","previous_status":"roomed","new_status":"completed","staff_name":"Tom","host":"192.168.1.10"}', NULL),
(133, 89, 'Nora', 'Clark', 'Pink eye', 133, 'completed', '{"timestamp":"2026-08-14T15:30:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-14T15:54:00","previous_status":"arrived","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-14T16:07:00","previous_status":"roomed","new_status":"completed","staff_name":"Mike","host":"192.168.1.10"}', NULL),
(134, 89, 'Piper', 'Harris', 'Sprained ankle', 134, 'no_show', NULL, NULL, NULL, '{"timestamp":"2026-08-14T15:48:00","previous_status":"waiting","new_status":"no_show","staff_name":"Parent Cancel","host":"192.168.1.10"}'),
(135, 90, 'Piper', 'Harris', 'Sprained ankle', 135, 'completed', '{"timestamp":"2026-08-14T15:36:00","previous_status":"waiting","new_status":"arrived","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-14T16:13:00","previous_status":"arrived","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-14T16:37:00","previous_status":"roomed","new_status":"completed","staff_name":"Sarah","host":"192.168.1.10"}', NULL),
(136, 91, 'Quinn', 'Hall', 'Asthma flare-up', 136, 'completed', '{"timestamp":"2026-08-14T16:05:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-14T16:51:00","previous_status":"arrived","new_status":"roomed","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-14T17:15:00","previous_status":"roomed","new_status":"completed","staff_name":"Tom","host":"192.168.1.10"}', NULL),
(137, 91, 'Sofia', 'Kim', 'Headache', 137, 'no_show', NULL, NULL, NULL, '{"timestamp":"2026-08-14T17:10:00","previous_status":"waiting","new_status":"no_show","staff_name":"Jessica","host":"192.168.1.10"}'),
(138, 92, 'Sofia', 'Adams', 'Headache', 138, 'completed', '{"timestamp":"2026-08-14T14:59:00","previous_status":"waiting","new_status":"arrived","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-14T15:34:00","previous_status":"arrived","new_status":"roomed","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-14T16:05:00","previous_status":"roomed","new_status":"completed","staff_name":"Tom","host":"192.168.1.10"}', NULL),
(139, 93, 'Tyler', 'Chen', 'Insect bite swelling', 139, 'completed', '{"timestamp":"2026-08-14T16:30:00","previous_status":"waiting","new_status":"arrived","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-14T17:06:00","previous_status":"arrived","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-14T17:43:00","previous_status":"roomed","new_status":"completed","staff_name":"Mike","host":"192.168.1.10"}', NULL),
(140, 93, 'Violet', 'Chen', 'Persistent cough', 140, 'no_show', NULL, NULL, NULL, '{"timestamp":"2026-08-14T16:35:00","previous_status":"waiting","new_status":"no_show","staff_name":"Parent Cancel","host":"192.168.1.10"}'),
(141, 94, 'Violet', 'Evans', 'Persistent cough', 141, 'completed', '{"timestamp":"2026-08-14T16:14:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-14T16:34:00","previous_status":"arrived","new_status":"roomed","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-14T17:02:00","previous_status":"roomed","new_status":"completed","staff_name":"Jessica","host":"192.168.1.10"}', NULL),
(142, 94, 'Zoe', 'Patel', 'Rash on arms', 142, 'completed', NULL, '{"timestamp":"2026-08-14T16:46:00","previous_status":"waiting","new_status":"roomed","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-14T17:14:00","previous_status":"roomed","new_status":"completed","staff_name":"Sarah","host":"192.168.1.10"}', NULL),
(143, 95, 'Zoe', 'Gomez', 'Rash on arms', 143, 'roomed', '{"timestamp":"2026-08-14T17:23:00","previous_status":"waiting","new_status":"arrived","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-14T18:02:00","previous_status":"arrived","new_status":"roomed","staff_name":"Tom","host":"192.168.1.10"}', NULL, NULL),
(144, 95, 'Mia', 'Gomez', 'Well-child check', 144, 'roomed', '{"timestamp":"2026-08-14T17:35:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-14T17:52:00","previous_status":"arrived","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', NULL, NULL),
(145, 96, 'Mia', 'Adams', 'Well-child check', 145, 'roomed', '{"timestamp":"2026-08-15T15:43:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-15T16:02:00","previous_status":"arrived","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', NULL, NULL),
(146, 97, 'Noah', 'Chen', 'Stomach ache', 146, 'roomed', '{"timestamp":"2026-08-15T16:14:00","previous_status":"waiting","new_status":"arrived","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-15T16:52:00","previous_status":"arrived","new_status":"roomed","staff_name":"Mike","host":"192.168.1.10"}', NULL, NULL),
(147, 98, 'Ella', 'Evans', 'Pink eye', 147, 'no_show', NULL, NULL, NULL, '{"timestamp":"2026-08-15T14:34:00","previous_status":"waiting","new_status":"no_show","staff_name":"Parent Cancel","host":"192.168.1.10"}'),
(148, 99, 'Lucas', 'Davis', 'Seasonal allergies', 148, 'completed', '{"timestamp":"2026-08-16T13:26:00","previous_status":"waiting","new_status":"arrived","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-16T14:14:00","previous_status":"arrived","new_status":"roomed","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-16T14:28:00","previous_status":"roomed","new_status":"completed","staff_name":"Jessica","host":"192.168.1.10"}', NULL),
(149, 100, 'Aria', 'Foster', 'Sprained ankle', 149, 'completed', '{"timestamp":"2026-08-16T12:22:00","previous_status":"waiting","new_status":"arrived","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-16T12:48:00","previous_status":"arrived","new_status":"roomed","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-16T13:26:00","previous_status":"roomed","new_status":"completed","staff_name":"Sarah","host":"192.168.1.10"}', NULL),
(150, 100, 'Bella', 'Foster', 'Runny nose and congestion', 150, 'completed', '{"timestamp":"2026-08-16T12:21:00","previous_status":"waiting","new_status":"arrived","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-16T12:59:00","previous_status":"arrived","new_status":"roomed","staff_name":"Tom","host":"192.168.1.10"}', '{"timestamp":"2026-08-16T13:31:00","previous_status":"roomed","new_status":"completed","staff_name":"Jessica","host":"192.168.1.10"}', NULL),
(151, 101, 'Bella', 'Harris', 'Runny nose and congestion', 151, 'completed', '{"timestamp":"2026-08-16T15:35:00","previous_status":"waiting","new_status":"arrived","staff_name":"Mike","host":"192.168.1.10"}', '{"timestamp":"2026-08-16T15:59:00","previous_status":"arrived","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-16T16:21:00","previous_status":"roomed","new_status":"completed","staff_name":"Jessica","host":"192.168.1.10"}', NULL),
(152, 102, 'Caleb', 'Johnson', 'Headache', 152, 'completed', '{"timestamp":"2026-08-16T09:29:00","previous_status":"waiting","new_status":"arrived","staff_name":"Sarah","host":"192.168.1.10"}', '{"timestamp":"2026-08-16T09:55:00","previous_status":"arrived","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-16T10:10:00","previous_status":"roomed","new_status":"completed","staff_name":"Tom","host":"192.168.1.10"}', NULL),
(153, 103, 'Daisy', 'Lopez', 'Insect bite swelling', 153, 'completed', NULL, '{"timestamp":"2026-08-16T17:34:00","previous_status":"waiting","new_status":"roomed","staff_name":"Jessica","host":"192.168.1.10"}', '{"timestamp":"2026-08-16T18:01:00","previous_status":"roomed","new_status":"completed","staff_name":"Tom","host":"192.168.1.10"}', NULL);

ALTER TABLE `registration` AUTO_INCREMENT = 104;
ALTER TABLE `queue_entry` AUTO_INCREMENT = 154;
-- END DEMO HISTORY
-- -----------------------------------------------------------------------------

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
