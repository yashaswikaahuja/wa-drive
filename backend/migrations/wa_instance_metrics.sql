-- Resource-based admission control for WhatsApp sharding.
-- Each instance reports its REAL memory pressure + session count + whether it can accept new
-- sessions (mem usage below its own % threshold). The hub routes NEW sessions to the healthy
-- instance with the most headroom, and refuses to assign to instances that are near their ceiling.
-- This replaces fixed per-instance session caps: every VM fills to its OWN capacity (a 1GB and an
-- 8GB box each fill to their own %), and when all are near full it's the signal to add a shard.
-- Safe to run multiple times.

ALTER TABLE wa_instances
  ADD COLUMN IF NOT EXISTS mem_pct   integer NOT NULL DEFAULT 0,      -- last reported RAM usage %
  ADD COLUMN IF NOT EXISTS sessions  integer NOT NULL DEFAULT 0,      -- sessions this instance runs
  ADD COLUMN IF NOT EXISTS accepting boolean NOT NULL DEFAULT true;   -- may the hub assign new sessions here?
