# Supabase Setup for Kinetic

## 1. Create project
Go to https://supabase.com → New project → name it "kinetic"
Note your **Project URL** and **anon public key** from Settings → API.

## 2. Run this SQL in the Supabase SQL Editor

```sql
-- ── workout_sessions ──────────────────────────────────────────────────────────
CREATE TABLE workout_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users NOT NULL,
  name            TEXT NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL,
  duration_secs   INTEGER NOT NULL,
  rest_timer_secs INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── workout_exercises ─────────────────────────────────────────────────────────
CREATE TABLE workout_exercises (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID REFERENCES workout_sessions ON DELETE CASCADE NOT NULL,
  user_id             UUID REFERENCES auth.users NOT NULL,
  exercise_type       TEXT NOT NULL,
  exercise_name       TEXT NOT NULL,
  body_section        TEXT,
  status              TEXT NOT NULL,
  perf_order          INTEGER,
  weight_kg           NUMERIC,
  sets_planned        INTEGER,
  sets_completed      INTEGER,
  reps                INTEGER,
  duration_secs       INTEGER,
  intervals_planned   INTEGER,
  intervals_done      INTEGER,
  interval_len_secs   INTEGER
);

-- ── Row-Level Security ────────────────────────────────────────────────────────
ALTER TABLE workout_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own sessions"  ON workout_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own exercises" ON workout_exercises
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

## 3. Add credentials to the app
Edit `src/config/supabase.js` and replace the two placeholder strings.
