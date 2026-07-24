-- ═══════════════════════════════════════════════════════════════════════════════
-- KINETIC — Full Database Creation Script
-- Run the entire contents of this file once in the Supabase SQL Editor.
-- (Dashboard → SQL Editor → New query → paste → Run)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── workout_sessions ──────────────────────────────────────────────────────────
-- One row per completed training session.
-- `timeline` is a JSONB array of timestamped events recorded during the session
-- (warmup start/end, each set start/done with weight+reps, rest periods, etc.)
CREATE TABLE workout_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users NOT NULL,
  name            TEXT NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL,
  duration_secs   INTEGER NOT NULL,
  rest_timer_secs INTEGER,
  timeline        JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── workout_exercises ─────────────────────────────────────────────────────────
-- One row per exercise performed in a session.
-- Flat schema so dashboard queries can aggregate without heavy JSON parsing.
CREATE TABLE workout_exercises (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         UUID REFERENCES workout_sessions ON DELETE CASCADE NOT NULL,
  user_id            UUID REFERENCES auth.users NOT NULL,
  exercise_type      TEXT NOT NULL,          -- regular | combo | warmup | intervals
  exercise_name      TEXT NOT NULL,
  body_section       TEXT,
  status             TEXT NOT NULL,          -- complete | partial | pending
  perf_order         INTEGER,               -- order performed in session
  -- Regular / combo fields
  weight_kg          NUMERIC,
  sets_planned       INTEGER,
  sets_completed     INTEGER,
  reps               INTEGER,
  -- Warmup field
  duration_secs      INTEGER,
  -- Intervals fields
  intervals_planned  INTEGER,
  intervals_done     INTEGER,
  interval_len_secs  INTEGER
);

-- ── body_metrics ──────────────────────────────────────────────────────────────
-- One row per user per ISO week (week_date = that Monday, YYYY-MM-DD).
-- training_count is auto-populated by the app from workout_sessions — never
-- entered manually. weight_kg / waist_cm / diet_pct are manual weekly entries.
CREATE TABLE body_metrics (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users NOT NULL,
  week_date     DATE NOT NULL,               -- ISO Monday of the week
  weight_kg     NUMERIC(5,1),               -- e.g. 82.5
  waist_cm      NUMERIC(5,1),               -- e.g. 91.0
  diet_pct      INTEGER CHECK (diet_pct BETWEEN 0 AND 100),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, week_date)               -- one row per week, safe to upsert
);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Every user sees only their own rows on all three tables.
ALTER TABLE workout_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_metrics      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own sessions"  ON workout_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own exercises" ON workout_exercises
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own metrics"   ON body_metrics
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
