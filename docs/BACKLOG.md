# Kinetic — backlog

Two parts: what has shipped, in the order it was built; and what could come
next, prioritised.

Part 1 is reconstructed from git history and `app.json` version bumps, not from
memory — the commit hash is given for anything you might want to look up.
Part 2 is a proposal, not a commitment.

**Release numbering.** `releases/` and `E:\GoogleDrive\Apps` share one sequence,
`Kinetic_vNN_stable.apk`. `versionCode` only started matching `NN` at v10 —
v01–v08 all shipped as versionCode 1, which is why they could not be installed
over one another without an uninstall (see AGENTS.md).

---

# Part 1 — Shipped

| Release | versionCode | Version | Date | Headline |
|---|---|---|---|---|
| v01–v02 | 1 | 1.0.0 | 2026-06-30 | First working app: templates, training, summary |
| v03–v08 | 1 | 1.0.0 | Jul–Aug | Backend, web dashboard, cardio, body metrics *(not archived)* |
| v09 | 1 | 1.0.0 | 2026-09-04 | Last build before versionCode alignment |
| v10 | 10 | 1.2.0 | 2026-09-05 | versionCode aligned to release number *(not archived)* |
| v11 | 11 | 1.3.0 | 2026-09-08 | Supabase consolidation, session sync, sign-out |
| v12 | 12 | 1.4.0 | 2026-09-20 | Console redesign, stages 1–5 |
| v13 | 13 | 1.4.1 | 2026-09-21 | Four device fixes *(built, superseded before publishing)* |
| v14 | 14 | 1.5.0 | 2026-09-21 | Console redesign, stages 6–7 |
| v15 | 15 | 1.5.1 | 2026-09-21 | Combo plate-math entry |

---

## v01–v02 · the first working app
*2026-06-26 → 06-30 · `810f4aa` … `a485c3b`*

- **Session templates** — create, edit, delete, reorder; persisted locally
  (AsyncStorage), offline from day one.
- **Four exercise types** — Regular (weight/sets/reps), Combo (several
  exercises sharing a set count), Warmup (timed), Intervals (run/walk cycles).
- **Training mode** — exercise list, per-exercise detail, set tracking, rest
  timer, session timer.
- **Summary screen** — per-exercise breakdown at the end of a session.
- **Seven-segment timers** — DSEG7 bundled (`f61a792`), so countdowns read as
  instrument panels rather than text.
- **Sound** — rest, interval, warmup-end and session-complete beeps
  (`1a0ce90`, `6c3385a`).
- **Background-resilient timers** (`a485c3b`) — timers fast-forward correctly
  after the app has been backgrounded, rather than freezing.
- **App identity** — icon and splash (`4d257b2`).
- **Web support** — react-native-web, with a long tail of scroll fixes.

Roughly half the commits in this window are build plumbing: Gradle/foojay
version conflicts, New Architecture, and a custom Metro transformer to stub
React Native's codegen tree. Worth knowing the `plugins/fixFoojay.js` config
plugin dates from here.

## v03–v08 · backend, web, and the data model
*2026-07-02 → 2026-08-23 · not archived as APKs*

- **Background notifications** (`57290bc`) — timers fire via scheduled local
  notifications, so a rest timer completes with the app closed.
- **Supabase backend** (`a08b183`) — auth, `workout_sessions`,
  `workout_exercises`, and sync on session end.
- **Mobile dashboard** with charts (`ef8f2ea`), hand-rolled in plain Views.
- **Next.js web dashboard** (`c5ddbce`) on Vercel, reading the same data.
- **Session timeline** (`26dabf8`) — every set start/done and rest start/end
  recorded as timestamped events. This is what later made time-under-load
  computable; nothing used it at the time.
- **Ad-hoc training mode** (`26dabf8`) — start an empty session and add
  exercises as you go, for when you are not following a template.
- **CSV export** + set duration tracking (`7600326`).
- **Body metrics** (`e75e35c`, `6670f70`) — weight, waist, diet adherence, with
  history charts on mobile and web.
- **Period selector** 1M/6M/12M (`91894ef`).
- **Session discard** (`e872a2f`) — end a session without writing it to stats.
- **Per-sub-exercise weight and reps for Combo** (`75f50c3`) — previously a
  combo logged one weight for the whole group.
- **Cardio generalised** (`75f50c3`) — Intervals became Cardio, gaining
  Treadmill and Stairs subtypes with speed and incline.

## v09–v10 · consistency
*2026-09-04 → 09-05*

- **Sunday-start weeks everywhere** (`6fd033f`) — mobile and web had disagreed
  about when a week begins, so the same data gave two different weekly charts.
- **versionCode aligned to release number** (`6a8c054`) and the release
  convention written down in AGENTS.md.

## v11 · consolidation
*2026-09-08*

- **Supabase moved** to the shared ClaudeApps project, `kinetic` schema
  (`b7a26c5`).
- **Training sessions synced** with sign-out support (`afa6908`).

## v12 · Console redesign, stages 1–5
*2026-09-20 · see `docs/DESIGN.md`*

- **Stage 1 — Foundations.** New token system (six-step ground ramp; ember /
  ice / gold channels), Barlow Semi Condensed + Inter, DSEG7 bundled,
  `react-native-svg`, and `utils/units.js` — the **pound shadow**, a readout
  beside every kilogram figure so a machine abroad can be set without
  arithmetic.
- **Stage 2 — Icon set.** 100 custom glyphs replacing every emoji and
  `@expo/vector-icons`; **bundle dropped 12 MB → 5.1 MB**. Generated through
  `scripts/generate-icons.mjs`, which normalises size and stroke so many
  generation runs look like one set.
- **Stage 3 — Navigation.** Four-tab bar (Train / Stats / Body / You). The You
  tab gave a home to settings that had none — the account sheet was previously
  reached by tapping your own email address.
- **Stage 4 — Analytics engine.** `shared/analytics.js` as the single source of
  truth, mirrored to mobile and web by `scripts/sync-analytics.mjs`. Fixed real
  arithmetic bugs: combos contributed nothing to tonnage until the `parent_id`
  migration made their children real rows.
- **Stage 5 — Stats and Body.** Comparison tiles, records feed, e1RM
  progression (Epley, 12-rep guard), volume with a rolling average, body split,
  lifting-vs-cardio, and a new **Exercise Detail** screen.

## v13 · four device fixes
*2026-09-21 · built, superseded before publishing*

Rest-timer and Sounds rows carried glyphs that read as a no-entry sign and a
heart-rate trace; the Body tab's pound shadow sat under the date axis where it
labelled the wrong thing; the "under load" tile said *no timed sets yet* for a
week that had not started.

## v14 · Console redesign, stages 6–7
*2026-09-21*

- **Stage 6 — Training.** The rest countdown moved from a 30 px corner readout
  to the **top third of the screen** — ice, a draining ring, the next exercise
  named, ember going cold everywhere while ice is lit. **Plate-math weight
  entry** replaced a ±1 stepper that made 60 → 82.5 kg cost forty-five taps.
  **Set pips** replaced a status dot that read "one of five" and "four of five"
  identically. The set detail became a **sheet over the dimmed list** rather
  than a screen swap. **Summary rebuilt** on volume, time under load and PRs,
  computed through the shared engine rather than its own arithmetic.
- **Stage 7 — Sweep.** Train tab with a next-up hero, swipe-to-edit/delete and
  a speed dial; the editor's private `Stepper` and `PickerModal` deleted in
  favour of the shared ones; skeleton loading and real empty states; splash
  re-grounded, notification icon wired; **all 18 legacy token aliases deleted**.

Four defects found on device and fixed in the same release:

- **Timer notifications had never fired on this SDK** — expo-notifications 56
  rejects a bare `{ seconds }` trigger, and the only trace was a console
  warning.
- **`StyleSheet.absoluteFill` does not exist in React Native 0.85.** It reads
  as `undefined`, so spreading it silently produces a view with no position and
  no size. One deleted API, three bugs: two backdrops that never dimmed and a
  countdown laid out below its own ring.
- Warmup rows read "180 min" for a three-minute warmup.
- The editor set static hints in DSEG7, which §3.1 reserves for live
  countdowns.

## v15 · combo plate-math entry
*2026-09-21*

- **Combo is an accordion.** Every station shows weight × reps with its pound
  shadow in the closed row; opening one gives it the same plate-math field a
  single lift gets. Stacking five `WeightField`s was the obvious move and the
  wrong one — three screens of scrolling, and it buries the overview.
- Editor rest timer lost a redundant label and gained a 15-second step.

---

# Part 2 — Proposed next

**Priority.** P0 reliability or correctness, do before features · P1 high value,
grounded in how the app is actually used · P2 valuable, not urgent · P3
speculative.

**Complexity.** S ≤ 1 day · M 2–4 days · L 1–2 weeks · XL multi-week.

Items marked **§11** contradict something `DESIGN.md` §11 placed out of scope.
That was scoping for the redesign, not a permanent ban — but reversing one
should be a deliberate decision, not a drift.

| # | Item | Pri | Cx | Note |
|---|---|---|---|---|
| 1 | Durable session sync — queue and retry | **P0** | M |  |
| 2 | Make the session write atomic | **P0** | S |  |
| 3 | Last time you did this, in the set sheet | P1 | S |  |
| 4 | Per-exercise rest duration | P1 | M |  |
| 5 | Progressive-overload suggestion | P1 | M |  |
| 6 | Edit or delete a logged session | P1 | L |  |
| 7 | Plate calculator — what to load per side | P1 | S | §11 |
| 8 | Add an exercise mid-session to a planned session | P1 | M |  |
| 9 | Session notes and a felt-difficulty mark | P2 | S | §11 |
| 10 | Warm-up set ramp | P2 | M |  |
| 11 | Training reminders and streak nudges | P2 | S |  |
| 12 | Template tags or folders | P2 | S |  |
| 13 | Body photos beside the metrics | P2 | M |  |
| 14 | Exercise library — muscles, cues, your own notes | P2 | L |  |
| 15 | Web dashboard visual redesign | P2 | L | §11 |
| 16 | Programme blocks — PPL rotation, 5/3/1 | P2 | L | §11 |
| 17 | Health Connect / Apple Health export | P3 | L | §11 |
| 18 | Import from Strong / Hevy CSV | P3 | M |  |
| 19 | Share a session card | P3 | M | §11 |
| 20 | Wear OS companion | P3 | XL | §11 |

## The two that are not features

**1 · Durable session sync — P0, M.**
`TrainingScreen` calls `syncWorkout(summary)` fire-and-forget, and every
failure path inside it is `console.warn(...); return;`. The summary is never
persisted locally. So a session finished in a basement gym with no signal, or
on an expired auth token, is **permanently lost from Stats** — and the only
signal is a warning in a log nobody reads. Fix: write the summary to
AsyncStorage before syncing, drain the queue on next launch and on regaining
connectivity, and clear only on confirmed success. *Not yet observed in the
data, but nothing prevents it.*

**2 · Make the session write atomic — P0, S.**
`syncWorkout` inserts `workout_sessions`, then `workout_exercises`, then combo
children — three round trips, no transaction. A failure between the first and
second leaves a **session row with no exercises**: it counts as a session that
moved nothing, quietly dragging down volume and density. Fix: one RPC that
writes all three, or clean up the parent on child failure. *Checked on
2026-09-21: zero orphan sessions exist today, so this has not bitten yet.*

## The high-value features

**3 · Last time you did this — P1, S.**
Show `Last time · 120 kg × 10 · Sep 14` above the plate math in the set sheet.
Every number needed is already computed by `computeExerciseDetail`. This is the
cheapest large win in the list: progressive overload is a memory problem, and
the app has the memory and does not show it at the moment of decision.

**4 · Per-exercise rest — P1, M.**
Rest is one value for the whole session. Squats and curls do not want the same
rest, so the setting is wrong for most of the exercises in any session.
Template already stores `restTimerSecs`; add an optional per-exercise override
and fall back to the session value.

**5 · Progressive-overload suggestion — P1, M.**
Builds on #3: given the e1RM trend, propose the next load — "you have held
120 kg for three sessions; try 122.5". Must be a suggestion that pre-fills, not
a target that nags.

**6 · Edit or delete a logged session — P1, L.**
Today a mis-logged weight can only be fixed with SQL. Needs a history detail
screen and a write path back to Supabase, plus care that edits do not silently
rewrite a PR. The L is mostly the write path and the PR interaction.

**7 · Plate calculator — P1, S. §11**
"122.5 kg = 20 + 20 + 15 + 5 + 1.25 a side." Pairs naturally with the plate
math already in `WeightField`, and is a few lines of arithmetic. §11 excluded it
from the redesign; it is small enough to reconsider.

**8 · Add an exercise mid-session — P1, M.**
`QuickAddModal` exists but is wired only to ad-hoc mode. Planned sessions
cannot gain an exercise once started, so a busy squat rack means going
off-plan with no way to record it.

## The rest, briefly

**9 · Notes and felt difficulty (§11 RPE).** One text field and a 1–5 mark per
session. Cheap, and the only way to explain a bad week later.
**10 · Warm-up ramp.** Generate 40/60/80 % sets from a working weight.
**11 · Reminders.** The notification infrastructure is already there and
already knows your streak.
**12 · Template tags.** Trivial, and useful the moment there are more than five
templates.
**13 · Body photos.** `body_metrics` gains a storage reference; the Body tab
gains a comparison view.
**14 · Exercise library.** Muscles worked, cues, and your own notes per
exercise. Large because it needs content, not just code.
**15 · Web redesign (§11).** The web dashboard consumes `shared/analytics.js`,
so it already has the corrected numbers — it just looks like the old app.
**16 · Programme blocks (§11).** A real rotation with planned progression. The
biggest behavioural change in the list, and the one most likely to change what
the app is for.
**17 · Health export (§11).** One-way out, to Health Connect and Apple Health.
**18 · Import.** Lowers the cost of switching to Kinetic from Strong or Hevy.
**19 · Share card (§11).** A rendered summary image. Cosmetic.
**20 · Wear OS (§11).** Rest timer and set logging on the wrist. XL because it
is a second app, a second build pipeline and a sync protocol.

## Not proposed, deliberately

Light mode and pound *input* stay out (`DESIGN.md` §2.6, §11). Pounds are a
readout: no unit toggle, no `weight_lb` column. And combo volume from before
the `parent_id` migration is **unrecoverable** — those events were logged
without weights, so there is nothing to backfill from (§12.5).
