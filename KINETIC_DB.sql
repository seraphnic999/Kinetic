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
  interval_len_secs  INTEGER,
  -- Cardio fields (exercise_type='intervals'; cardio_type discriminates the
  -- subtype — 'intervals' | 'treadmill' | 'stairs'; NULL = legacy 'intervals'
  -- row predating this column. Treadmill/stairs reuse duration_secs above.)
  cardio_type        TEXT,
  speed_kmh          NUMERIC,
  incline_pct        NUMERIC
);

-- ── body_metrics ──────────────────────────────────────────────────────────────
-- One row per user per DAY. `week_date` is a historical name — both the app's
-- Body Metrics screen and the web form log an entry against a specific calendar
-- day, and the dashboards average those entries into Sunday→Saturday weeks.
-- weight_kg / waist_cm / diet_pct are all entered manually.
CREATE TABLE body_metrics (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users NOT NULL,
  week_date     DATE NOT NULL,               -- the day the entry is for
  weight_kg     NUMERIC(5,1),               -- e.g. 82.5
  waist_cm      NUMERIC(5,1),               -- e.g. 91.0
  diet_pct      INTEGER CHECK (diet_pct BETWEEN 0 AND 100),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, week_date)               -- one row per day, safe to upsert
);

-- ── training_sessions ─────────────────────────────────────────────────────────
-- The session *templates* the phone's list screen shows and the Training screen
-- runs — distinct from workout_sessions above, which is history.
--
-- `id` is the client-generated string id ("<epoch>_<rand>") the app assigns, so
-- a session created with no connection keeps its identity when it later reaches
-- the server; the composite primary key keeps two users' ids from colliding.
-- `exercises` is the phone's session shape verbatim (camelCase JSON), which is
-- what the Training screen consumes and what src/utils/analytics.js
-- `templateExerciseLabel` renders on both platforms.
--
-- Deletes are tombstones (`deleted_at`), never row removals: that is what lets
-- a device that has been offline tell "this session was never pushed" (absent)
-- from "this session was deleted on another device" (present, tombstoned).
CREATE TABLE training_sessions (
  id              TEXT        NOT NULL,
  user_id         UUID        NOT NULL REFERENCES auth.users,
  name            TEXT        NOT NULL,
  exercises       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  rest_timer_secs INTEGER     NOT NULL DEFAULT 60,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- last edit, set by the client (last-write-wins)
  deleted_at      TIMESTAMPTZ,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX training_sessions_user_updated_idx
  ON training_sessions (user_id, updated_at DESC);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Every user sees only their own rows on all four tables.
ALTER TABLE workout_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_metrics      ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own sessions"  ON workout_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own exercises" ON workout_exercises
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own metrics"   ON body_metrics
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own training sessions" ON training_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
