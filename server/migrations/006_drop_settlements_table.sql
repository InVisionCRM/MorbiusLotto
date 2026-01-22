-- Migration: drop settlements table (after analytics no longer uses it)
-- This should be run after 005 has been applied and the server restarted.

-- Fail fast if the table is locked by long-running queries.
SET lock_timeout = '3s';

DROP TABLE IF EXISTS settlements;

