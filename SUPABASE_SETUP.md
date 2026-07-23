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

## SQL Migration — add timeline column

Run this in the Supabase SQL Editor to add timeline support:

```sql
ALTER TABLE workout_sessions
  ADD COLUMN IF NOT EXISTS timeline JSONB;
```

## SQL Migration — weekly metrics

```sql
CREATE TABLE weekly_metrics (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users NOT NULL,
  week_date  DATE NOT NULL,
  weight_kg  NUMERIC(5,1),
  waist_cm   NUMERIC(5,1),
  diet_pct   INTEGER CHECK (diet_pct BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_week UNIQUE (user_id, week_date)
);
ALTER TABLE weekly_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own metrics" ON weekly_metrics
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

## SQL Migration — weekly body metrics

```sql
CREATE TABLE body_metrics (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users NOT NULL,
  week_date  DATE NOT NULL,           -- Monday of that week (YYYY-MM-DD)
  weight_kg  NUMERIC(5,1),            -- e.g. 82.5
  waist_cm   NUMERIC(5,1),            -- e.g. 91.0
  diet_pct   INTEGER CHECK (diet_pct BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, week_date)         -- one entry per user per week (upsert-safe)
);

ALTER TABLE body_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own metrics" ON body_metrics
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```
