-- ═══════════════════════════════════════════════════════════════════════════════
-- KINETIC — Migration: Cardio (Intervals → Treadmill/Stairs) columns
-- Run once in the Supabase SQL Editor against the existing project.
-- Adds three nullable columns to workout_exercises — no impact on existing
-- rows, which will simply read back as cardio_type = NULL (treated by the
-- app as the classic 'intervals' subtype).
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE workout_exercises
  ADD COLUMN IF NOT EXISTS cardio_type TEXT,     -- 'intervals' | 'treadmill' | 'stairs'
  ADD COLUMN IF NOT EXISTS speed_kmh   NUMERIC,  -- treadmill / stairs
  ADD COLUMN IF NOT EXISTS incline_pct NUMERIC;  -- treadmill only
