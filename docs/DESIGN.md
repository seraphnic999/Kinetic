# Kinetic — "Console" design system

Status: **approved, not built.** All six open questions were closed on
2026-09-19 — see §12 for the answers and for the one that changed the work
(units: kg only, with a pound shadow, §3.5). Nothing here is implemented yet;
stage 1 is the next move.

Precedent: this follows the same shape as Cellar's *Cellar Door*, Manifest's
*Skyfare* and Mommy's *Fridge Door* — a token file, a generated icon set, a
staged rollout — and deliberately diverges from all three in one place: Kinetic
stays **dark-only**, and that is a feature, not an omission (§2.6).

Companion documents:

- **`docs/ICON-BRIEF.md`** — the generator-facing icon spec. That is the file to
  hand to whatever draws the glyphs.
- **Mockups** — https://claude.ai/code/artifact/26d61709-8000-453c-b08c-06d1fd8aa605

---

## 0. What is wrong today

Not a list of complaints — a list of causes, because each one drives a decision
below.

**Identity**

1. The app has a strong idea it is not committing to. Near-black plus ember
   orange plus a real 7-segment LCD font is *gym equipment console*, and that is
   an ownable, unclaimed position. But the 7-segment face appears on four
   screens out of seven, is fetched from a jsdelivr CDN **at runtime** (a gym
   with no signal renders the fallback), and everything around it is stock
   system sans and stock Ionicons.
2. **The iconography is emoji.** 🔥 Warmup, ⚡ Intervals, 🔗 Combo, 🪜 Stairs,
   🏋️ in the empty state — rendered by the platform font, different on every
   device, and impossible to recolour. The other three apps each replaced
   exactly this with a generated set; Kinetic is the last one still on it.

**Colour**

3. **Six accents at full saturation, none of them meaning anything.** The four
   dashboard stat cards are orange, blue, gold and amber for no semantic reason
   whatsoever. `amber` is used 27 times and means "warmup" *and* "partial" *and*
   "a running timer" *and* "the quick-train button" *and* "a body-part label".
   When every colour is hot, none of them is a signal.
4. `border` and `surfaceRaised` are **the same hex** (`#2C2C2E`), so cards have
   no edge and the whole UI reads as one flat charcoal wash.
5. `textMuted` `#505050` measures **2.11:1** on `surface` — that is the colour
   the chart axes, the calendar week labels, the exercise detail line and the
   captions are drawn in. It is not readable in a gym, and it is not readable
   anywhere else either.
6. Three tokens are dead: `success`, `partial`, `blueDim` — zero uses.

**Navigation**

7. There is no tab bar. Four circular buttons are crammed into the list header
   alongside the title, and the account screen is hidden behind tapping your own
   email address, because "the header's button row has no space left for a fifth
   circle" (the code says so itself).
8. CSV export exists **only** on the Summary screen, which you see once, right
   after a session, and can never return to. Historic sessions cannot be
   exported at all.

**Training — the screen that matters most**

9. The rest timer is a 34px number in a 70px box in the header. It is the single
   most time-critical readout in the app and it is the third-smallest thing on
   screen.
10. Exercise detail *replaces* the list inside the same screen, and the way back
    is a text link at the bottom of a scroll view.
11. Changing weight from 60 kg to 100 kg is **forty taps** on a `+` button.
12. A row shows a status dot — pending / partial / complete. It does not show
    *how many sets are left*, which is the only thing you want to know.

**Statistics — the other thing you asked about**

13. **The four headline numbers have no window and no comparison.** Sessions,
    total time, active days, kg lifted — all cumulative over the last 100
    sessions, all monotonically increasing. A number that can only go up is not
    information.
14. **Volume is wrong.** `sessionVolume()` sums `weight × sets × reps` for
    `exercise_type === 'regular'` **only**. Combos are excluded — and combos are
    where the per-sub-exercise weights and reps live. Cardio contributes
    nothing. The headline "kg lifted" systematically undercounts, by an amount
    that varies with how you train.
15. **A bench press performed inside a combo is invisible.** It never reaches
    `workout_exercises` as its own row, so it cannot appear in the progression
    chart, in a PR, or in a body-part split.
16. **`timeline` is the richest data in the app and nothing reads it.** Every
    set start, every set completion with weight, reps and duration, every rest
    period, all timestamped, all synced to a JSONB column — and the only thing
    that ever renders it is a raw event dump on a tab of the web dashboard. Real
    time-under-tension, real rest compliance, real work:rest ratio are all
    sitting in that column.
17. **Progression is "max weight per session"**, which ranks 100 kg × 1 above
    90 kg × 10. It is the wrong metric.
18. **Body metrics have two homes with two different windows** — the Body
    Metrics screen (per-day entries, 1M/6M/12M selector) and the Dashboard
    (weekly *averages*, hard-coded 12 weeks). Two truths for your own weight.
19. `src/utils/analytics.js` and `web/lib/analytics.js` are maintained as a
    byte-for-byte manual copy. Its own header says so, and says they have
    already drifted apart once.

---

## 1. The concept

**Console.**

Kinetic is the readout on the machine you are standing next to. Not a fitness
*social* app, not a coach, not a journal — an instrument panel. That is what the
near-black and the seven-segment numerals were already reaching for, and the
redesign's whole job is to commit to it hard enough that every other decision
falls out of it.

What the metaphor buys:

| Question | The console answers it |
|---|---|
| How dark? | Near-black, always. An instrument panel does not have a light mode (§2.6). |
| How many colours? | One channel lit at a time. A panel with six lights on is a fault condition. |
| What are the numerals? | Segmented, tabular, enormous. Readable from the rack, not from the hand. |
| What do the icons look like? | Engraved plate markings. Geometric, exact, ruler-drawn. |
| How much chrome? | Almost none. The reading is the interface. |

**Where the character lives.** Like Mommy, Kinetic gets exactly one carrier of
personality, and unlike Mommy it is not the icons:

| Layer | Register |
|---|---|
| **Live numerals** | **Seven-segment, huge, one hot colour.** The signature. |
| Icon set | Geometric contour, exact, monochrome. Quiet by design. |
| Type, cards, chips, sheets | Industrial, condensed, flat. Quiet by design. |
| App icon / splash | The existing bolt-through-barbell mark. Keep it (§9). |

The icons are deliberately *not* the voice here. Mommy's wobble works because
everything around it is exact; Kinetic's numerals work because everything around
them is exact **and cold**. A wobbly line on an instrument panel is a broken
instrument.

**The one-sentence rule that follows from all of it:**

> At any moment, exactly one thing on screen is hot. It is the thing the next
> ten seconds belong to.

---

## 2. Palette

### 2.1 The ground — a real ramp

Today there are four near-identical near-blacks (`0D`, `1C`, `2C`, `3A`) and the
border shares a value with one of them. Six steps, each with a job, warmed very
slightly so they do not read green beside the orange:

```
void      #08080A   scrims, the OLED true-black behind sheets
base      #0F0F11   page ground
surface   #17171A   cards, rows
raised    #202024   inputs, chips, controls sitting on a card
nested    #2A2A30   controls inside a card inside a card (combo sub-exercises)
line      #34343C   hairline borders — NOT the same value as any surface
```

`line` at `#34343C` is the fix for cause 4: it sits one clear step above
`raised`, so a card has an edge whether or not it also has a shadow.

### 2.2 The three channels

```
ember     #FF6B2B   LIVE / PRIMARY     unchanged — the brand
emberHot  #FF8A4C   pressed, and "start" where "done" is ember
emberDim  rgba(255,107,43,0.14)

ice       #4FC3F7   WAITING            unchanged — rest, recovery, countdown
iceDim    rgba(79,195,247,0.14)

gold      #FFC93C   BANKED             was #FFD23F — warmed off the green edge
goldDim   rgba(255,201,60,0.14)
```

**Each channel has one meaning and holds it everywhere:**

- **Ember = live.** The set you are doing. The button that starts the next
  thing. The bar on the chart for *this* week. Never more than one ember
  element visible at a time.
- **Ice = waiting.** Rest countdown, "next up", anything that is a clock
  running *against* you doing nothing. Ice and ember are never both hot: when
  rest starts, ember goes cold and ice lights.
- **Gold = banked.** Completed sets, completed sessions, personal records, the
  streak. **Gold is never an action** — it is only ever a result. This is the
  rule that kills the current confusion where gold is a checkmark *and* a
  dashboard stat colour *and* a card border.

### 2.3 Semantics — two, not five

```
warn      #FF9A3C   partial / attention / "you left this unfinished"
danger    #FF453A   destructive only — delete, discard
```

`amber` is renamed to `warn` and stripped back to one job. It is no longer the
colour of warmups, of running timers, of body-part labels or of the quick-train
button. Today it carries five meanings across 27 call sites; after this it
carries one.

`success` `#4CAF50` and `partial` are **deleted** — zero uses. Gold is the
success colour; `warn` is the partial colour.

### 2.4 Text

```
text        #F5F3F1   a hair warm — pure #FFF on near-black glares under gym lights
textMuted   #A3A3AD   secondary lines, meta
textFaint   #7A7A86   axis labels, captions, timestamps
```

### 2.5 Contrast, verified

Measured, not eyeballed. WCAG 2.1 ratios:

| Foreground | on `base` | on `surface` | on `raised` |
|---|---|---|---|
| `text #F5F3F1` | 17.30 | 16.16 | 14.67 |
| `textMuted #A3A3AD` | 7.66 | 7.16 | 6.49 |
| `textFaint #7A7A86` | 4.52 | 4.22 | 3.83 |
| `ember #FF6B2B` | 6.74 | 6.30 | 5.71 |
| `ice #4FC3F7` | 9.56 | 8.93 | 8.10 |
| `gold #FFC93C` | 12.47 | 11.65 | 10.57 |
| `warn #FF9A3C` | 9.06 | 8.47 | 7.68 |
| `danger #FF453A` | 5.62 | 5.25 | 4.77 |

**For comparison, what is shipping today:** `textMuted #505050` measures
**2.11** on `#1C1C1E`. That is the axis-label colour, the calendar week-label
colour, and the exercise-detail-line colour.

**Labels on filled buttons take `base`, never white.** Dark-on-ember is 6.74;
white-on-ember is 2.84 and fails. The code already does this for the primary
button and does *not* do it for `danger` (white on red = 3.41). Rule: **every
filled accent button has `base`-coloured text.** A destructive button is either
`base` on `danger`, or `danger` text on `dangerDim` — never white on red.

### 2.6 No light mode — on purpose

Manifest added one. Kinetic should not, and this is a design position rather
than a backlog item:

- The app is used in a gym, where the ambient light is either dim or hostile,
  and where the phone is usually propped on a bench two metres away.
- The seven-segment numerals are the identity. Seven-segment on white is a
  calculator; seven-segment glowing on black is a machine.
- Every remaining colour decision above is calibrated against a near-black
  ground. A light palette is not a token swap here; it is a second design.

`userInterfaceStyle` stays `"dark"` in `app.json`. If a light mode is ever
wanted, it is a new document, not a new column in this one.

### 2.7 The token file

`src/theme.js` becomes:

```js
export const Colors = {
  void:'#08080A', base:'#0F0F11', surface:'#17171A',
  raised:'#202024', nested:'#2A2A30', line:'#34343C',

  ember:'#FF6B2B', emberHot:'#FF8A4C', emberDim:'rgba(255,107,43,0.14)',
  ice:'#4FC3F7',   iceDim:'rgba(79,195,247,0.14)',
  gold:'#FFC93C',  goldDim:'rgba(255,201,60,0.14)',

  warn:'#FF9A3C',  warnDim:'rgba(255,154,60,0.14)',
  danger:'#FF453A',dangerDim:'rgba(255,69,58,0.14)',

  text:'#F5F3F1', textMuted:'#A3A3AD', textFaint:'#7A7A86',
};
```

Old names (`background`, `primary`, `surfaceRaised`, `amber`, `textPrimary`, …)
stay as aliases for the length of the rollout and are deleted at stage 7, the
way Mommy deleted its legacy `colors` export. Nothing is migrated twice.

---

## 3. Typography

### 3.1 Three voices, three jobs

| Role | Face | Where |
|---|---|---|
| **`digits`** | **DSEG7 Classic** | **Live countdowns only.** Session elapsed, rest, warmup, interval phase, cardio. Nothing else, ever. |
| **`display`** | **Barlow Semi Condensed** 600/700 | Screen titles, exercise names, stat values, weights, every number that is not a countdown. |
| **`body`** | **Inter** 400/500/600 | Everything you read as language. |

**Why Barlow Semi Condensed.** It is the athletic/industrial archetype — it is
what is silkscreened on the plate rack — it has true tabular figures, and being
condensed it fits `142.5 kg` and `TIME UNDER TENSION` in a phone-width tile
without tracking them into soup. Kinetic currently has *no* display face at all;
every heading is the system UI font, which is why the app reads like a
well-built prototype rather than a product.

**Why the split between `digits` and `display`.** DSEG7 is a seven-segment
emulation: it has no lowercase, awkward punctuation, and no weight range. It is
perfect for a number that is *changing* and wrong for a number that is *stored*.
Today the app half-observes this already. Make it a rule:

> DSEG7 renders a clock. Barlow renders a record.

### 3.2 DSEG7 must be bundled

This is a bug, not a preference:

```js
// App.js, today
useFonts({ DSEG7Classic: 'https://cdn.jsdelivr.net/npm/dseg/…/DSEG7Classic-Regular.ttf' })
```

`useFonts` with a remote URL means a cold start with no connectivity renders the
system fallback in every timer — in the one environment the app is designed for.
Vendor the `.ttf` into `assets/fonts/` and load it from the bundle. The web
build's `@font-face` can keep the CDN as a secondary source, but the app must
not depend on the network to draw a countdown.

### 3.3 Scale

```
timerHero    DSEG7  76 / 76    the rest countdown when rest is running
timerLarge   DSEG7  56 / 56    interval phase, warmup, cardio
timerInline  DSEG7  30 / 30    session elapsed in the top bar
statHuge     Barlow 700  40 / 40   the one number on a stat tile
h1           Barlow 700  28 / 32   screen titles
h2           Barlow 700  22 / 26   section heads, exercise names in detail
h3           Barlow 600  18 / 24   card titles, list row titles
metric       Barlow 600  17 / 22   tabular — weights, reps, kg, %; tabular-nums on
body         Inter  400  16 / 24   the reading floor. Never smaller for prose.
bodySmall    Inter  400  14 / 20   meta lines
label        Inter  600  11 / 14   +1.4 tracking, uppercase — section labels
caption      Inter  400  12 / 16   axis labels, timestamps
```

**The 16px floor is not negotiable on a gym screen** and it is currently broken
in places that matter: chart axis labels are **8px**, calendar week labels are
**9px**, bar value labels are **8px**. Those go to `caption` (12) or they go
away — an 8px label is not a compromise, it is a decoration.

### 3.4 Tabular figures everywhere a number can change

`fontVariant: ['tabular-nums']` is already on the three timer styles. It belongs
on `statHuge` and `metric` too: a weight stepping 97.5 → 100.0 should not shift
the layout, and a column of set counts should line up.

### 3.5 The lb shadow

**Decided (§12.1).** Kinetic logs, stores and thinks in kilograms — there is no
unit toggle, and `weight_kg` / `waist_cm` / `speed_kmh` stay exactly as they are.
But every kilogram figure carries a **small pound value beside it**, so that a
machine in a gym abroad can be set to the right pin without arithmetic.

```
    ┌─────────────────────────────┐
−   │      82.5  kg               │   +
    │            182 lb           │
    └─────────────────────────────┘
```

**The rule**

- **Type:** `caption` (12 / 16, Inter 400) in `textFaint`, set beneath or
  trailing the kg figure, never competing with it. Where space is tight it
  trails on the same line after a middle dot: `82.5 kg · 182 lb`.
- **It is never an input.** You cannot type into it, step it, or sort by it.
  It is a readout, the way a speedometer prints mph under km/h.
- **Conversion:** `lb = kg × 2.20462262`.
- **Rounding: nearest whole pound.** Not nearest 2.5 or 5 — rounding to plate
  increments would state a weight you are not actually lifting. 82.5 kg reads
  `182 lb`, and picking the nearest available pin is the athlete's call, which
  is the same call they make with a kg machine that only has 2.5 kg steps.
- **Never on aggregates.** Session and weekly tonnage, `t` totals, volume
  charts and body-split percentages get **no** shadow — `12.4 t · 27,337 lb` is
  noise, and nobody translates a weekly total onto a machine.

**Where it appears**

| Surface | Shadow |
|---|---|
| Set detail — the weight box (§7.2) | **yes**, the primary case |
| Set detail — the ± plate chips | no. The chips stay kg-only; a `+2.5` chip with `+5.5 lb` under it is unreadable at that size |
| Exercise rows in Training, and in the session editor | **yes**, trailing |
| Exercise Detail — best set, last set (§5.7) | **yes** |
| Exercise Detail — e1RM hero and the 30-day volume row | e1RM **yes**; volume **no** (aggregate) |
| Summary — per-exercise weights | **yes** |
| Summary / Stats — tonnage, tiles, charts | **no** (aggregate) |
| Body tab — body weight entry and its chart readout | **yes**. A bathroom scale abroad is in pounds for exactly the same reason |
| Body tab — waist | **no**. Centimetres to inches is a different conversion and a different need; if it is wanted it is a separate decision |
| CSV export | **yes**, as its own `weight_lb` column — a spreadsheet can afford it |

One helper, used everywhere, so the rounding is defined in exactly one place:

```js
// src/utils/units.js
export const KG_TO_LB = 2.20462262;
export const lb = (kg) => kg == null ? null : Math.round(kg * KG_TO_LB);
export const lbLabel = (kg) => kg == null ? '' : `${lb(kg)} lb`;
```

**If it ever reads as clutter**, the escape hatch is a single switch on the You
tab — *Show pounds alongside kilograms*, default **on**. It is not built in
stage 1; it is the thing to build if the shadow turns out to be noise on the
screens where it is densest (the training exercise rail).

---

## 4. Icons

> `docs/ICON-BRIEF.md` is the spec to hand to the generator. This section is the
> concept, the inventory and the usage map.

### 4.1 Style — "open line" · **shipped**

**Hairline open-stroke line pictograms of the body and the equipment that loads
it.** A uniform **1.5u** stroke with round caps, and — the load-bearing part —
forms built from **open strokes that start and stop**, not from closed outlines.
A torso is two side lines and a shoulder line that simply end; a limb is an open
line with a bulge where the muscle is. Closed loops appear only where the real
form encloses something: a head, a ring, a weight plate.

Four to eight internal strokes per glyph, 8–12% ink, 52–53u of the 64 grid.

**All 100 glyphs are drawn and installed** (§4.2). Two remain weak and are
logged in `docs/ICON-FIXES.md` rather than blocking: `combo` reads as a clover
instead of two interlocking links, and `diet` reads as a prohibition sign
instead of a plate.

**Four directions were tried and rejected before this one**, and the fourth is
the instructive one. `ICON-BRIEF.md` §0 has the full table; in short: v1 asked
for ruler-drawn instrument markings and got exploded parts diagrams; v2 asked
for clean contour drawings and accidentally described Mommy's hand-drawn set;
v3 asked for solid silhouettes and got abstract blobs; **v4 hit every number in
the brief — 52.5u frame fill, 15–20% ink, clean format — and six of its eight
glyphs were the same leaf.**

The cause was the same in all four: every brief specified geometry and never
specified *construction*, and each one said some version of "one continuous
closed contour". A closed contour around a muscle is a leaf.

The settled style was not inferred. The client supplied an approved reference
set; every number in the brief was **measured off it**, and the eight SVGs ship
in `assets/icons-src/_reference/target/` as the thing to match.

**The trade that came with it:** every size in §4.3 went up twice — the set is
displayed large so a hairline drawing has room to be hairline. The tab bar grows
with it: a 38px glyph over an 11px label needs **80px** of bar, up from the 72px
in §6.

**And one app-side rule protects the style:** icons are never drawn in
`textFaint`. At 1.5u on a near-black ground that is the single combination where
the set disappears, so `textMuted` is the quietest ink an icon may take.

### 4.1.1 What the build enforces, so the drawing does not have to

`scripts/generate-icons.mjs` grew through the batches into the thing that makes
a 100-glyph set from many separate generation runs look like one set. It is
worth knowing what it handles, because it is the reason the prompt could shrink
to a page:

| | |
|---|---|
| **Scale** | Every glyph is measured and rescaled to fill 53 of the 64 units, then centred. Batches came in at anything from 18u to 451u and all landed uniform. |
| **Optical size** | A table of per-glyph corrections on top of that, because a plus at the same bounding box as a magnifier reads *larger* — it spans the frame with almost no ink in it. |
| **Stroke weight** | Line glyphs are emitted as stroked paths and rendered at one constant width for the set, so they cannot disagree. Batches arrived at 1.5u, 2.6u and 2.8u; all render identically. |
| **Input shape** | Any number of `<path>`, `<circle>`, `<ellipse>`, `<line>`, `<polyline>`, `<polygon>`, `<rect>`, with `transform` attributes baked in. |
| **Mixed fill and stroke** | Per element, not per file — `streak` is four filled boxes and one outlined one. |
| **Refusals** | `<mask>`/`<clipPath>` (cannot fold into one path), `<g transform>`, degenerate paths, bad filenames. `<defs>` is stripped rather than drawn. |

### 4.2 Inventory — 100

The per-glyph briefs — style code and drawing note for each — are the tables in
`ICON-BRIEF.md` §8. These counts are the contract, not a target.

**Chrome (16)** — `back` `forward` `close` `more` `search` `filter` `sort`
`add` `minus` `check` `chevronUp` `chevronDown` `chevronLeft` `chevronRight`
`refresh` `settings`

**Tabs (4 + 4 active) (8)** — `tabTrain` `tabStats` `tabBody` `tabYou`, each
with an `…Active` variant. Active variants are **solid**, not contour — the same
carve-out Mommy made, for the same reason.

**Exercise types (8)** — `barbell` `dumbbell` `combo` `warmup` `intervals`
`treadmill` `stairs` `cardio`

*These eight replace 🔥 ⚡ 🔗 🪜 🏃 🏋️ everywhere they currently appear —
session cards, training rows, the quick-add sheet, the editor, both session
lists, and the web dashboard.*

**Body sections (8)** — `bodyChest` `bodyBack` `bodyShoulders` `bodyArmsFront`
`bodyArmsBack` `bodyLegs` `bodyCore` `bodyOther`

*The highest-value eight in the set, and the app has none of them today.* A
session card that shows five section glyphs tells you what tomorrow's session
is without reading a word; the same eight then carry the body-split chart
(§5.6), the exercise picker, the history filters and the per-exercise screen.
**Simplified figures and torsos in open line** — a front torso, a V-taper back,
cropped shoulders, a two-armed figure, a single raised arm, legs, a midsection,
and one whole figure. Torsos are headless and cropped; full figures carry a
detached round head (`ICON-BRIEF.md` §8.1).

**Training (14)** — `play` `pause` `stop` `skip` `setDone` `rest` `timer`
`stopwatch` `plate` `reps` `sets` `flame` `bolt` `target`

*`bolt` is the quick/ad-hoc session mark and echoes the app icon.*

**Status (4, solid)** — `statusPending` `statusPartial` `statusComplete`
`statusSkipped`. Solid, like Mommy's, because they render as 12px dots beside
text where a contour ring is a smudge.

**Stats (14)** — `chartBar` `chartLine` `calendar` `streak` `trophy` `tonnage`
`trendUp` `trendDown` `trendFlat` `clock` `activity` `history` `compare`
`export`

**Body metrics (5)** — `scale` `tape` `diet` `ruler` `bodyProfile`

**Account & system (10)** — `user` `signOut` `bell` `lock` `mail` `eye` `eyeOff`
`cloudSynced` `cloudOffline` `info`

**Actions (8)** — `edit` `trash` `duplicate` `dragHandle` `share` `save`
`warning` `error`

**Empty states (5, drawn at 56px)** — `emptySessions` `emptyHistory`
`emptyChart` `emptyMetrics` `emptySearch`

### 4.3 Sizes

Raised across the board with the v2 style (§4.1): fine line work displayed
large, rather than heavy line work displayed small.

| Context | Size |
|---|---|
| Status pill, set pip (solid glyphs) | **18 px** |
| Meta rows, inline marks | **30 px** — the floor |
| List rows, chips, buttons, section markers | **34 px** |
| Tab bar | **38 px** (in an **80px** bar) |
| Section heads, stat tiles | **44 px** |
| Empty states | **72 px** |

Raised twice during the icon work, deliberately: the set is finer than any
sibling app's, and the trade for that was displaying it larger.

The set must hold at **30 / 34 / 38 px** on `base`, `surface` and `raised`.
Stage 1 shipped a hidden `Dev/Icons` route drawing every glyph at all three
sizes on all three grounds plus a specimen of each face — Cellar caught
zero-sized and empty paths that way before any screen depended on the set.

### 4.4 Usage map

**Chrome, every screen** — `back` `close` `more` `search` `filter` `add`
`chevronRight` (rows) `chevronDown` (pickers) `refresh` `cloudOffline`

**Train tab** — `tabTrain` · `play` (start) · `bolt` (quick session) · `add` ·
the eight `body*` on session cards · `barbell`/`combo`/`warmup`/`cardio` type
marks · `edit` `duplicate` `trash` (row swipe) · `clock` (last run) ·
`emptySessions`

**Training (the mode)** — `pause` `play` `stop` `skip` `setDone` · `rest`
`timer` · `statusPending`/`Partial`/`Complete` · `plate` `reps` `sets` ·
`flame` (warmup) `intervals` `treadmill` `stairs` · `bolt` (quick add) ·
`chevronDown` (dismiss the detail sheet)

**Summary** — `trophy` (a PR) · `tonnage` `clock` `activity` · `save`
(save as template) · `export` · `statusComplete`/`Partial`/`Skipped`

**Stats tab** — `tabStats` · `streak` `trendUp`/`trendDown`/`trendFlat` ·
`chartBar` `chartLine` `calendar` `compare` · `trophy` (PR feed) · the eight
`body*` (split chart) · `history` · `export` · `emptyChart` `emptyHistory`

**Body tab** — `tabBody` · `scale` `tape` `diet` · `calendar` · `save` ·
`trendUp`/`trendDown` · `emptyMetrics`

**You tab** — `tabYou` · `user` `mail` `bell` `lock` `signOut` `settings` ·
`export` · `cloudSynced`/`cloudOffline` · `info`

**Auth** — `mail` `lock` `eye` `eyeOff`

Anything not on this map has no home yet and should be questioned before it gets
drawn.

### 4.5 Lean on the icons — but less than Mommy does

Mommy's standing directive is "use an icon wherever it carries meaning, because
the icons are the voice". Kinetic's voice is the numerals, so the directive is
narrower:

**Always:** exercise-type marks, body-section marks, status, tab bar, empty
states, destructive actions, row affordances.

**Never:** competing with a live numeral. No icon inside or beside the rest
countdown, the session timer or a stat tile's hero number. The number is the
thing; a glyph next to it is a second thing.

One icon per row, per chip, per header. Every icon-only control gets an
`accessibilityLabel`.

---

## 5. Statistics — the rework

This is the half of the project that is not cosmetic. Sections 5.1–5.4 are data
and schema; 5.5–5.8 are what gets drawn.

### 5.1 The principle

> Every number on screen states **what it counts**, **over what window**, and
> **against what**.

A number with no window is a vanity metric. A number with no comparison is a
trophy. Today all four headline numbers are both.

### 5.2 Fix the arithmetic first

No chart is worth drawing on top of a wrong total.

**a. Combo sub-exercises become real rows.** Today a combo writes one aggregate
row to `workout_exercises` (planned/completed sets) and the per-sub weights and
reps go only into the `timeline` JSONB and the CSV. Consequence: combo volume is
zero, and a bench press done inside a combo cannot appear in a progression
chart, a PR, or a body split.

Migration:

```sql
ALTER TABLE workout_exercises
  ADD COLUMN parent_id UUID REFERENCES workout_exercises(id) ON DELETE CASCADE;
CREATE INDEX workout_exercises_parent_idx ON workout_exercises (parent_id);
```

`syncWorkout` then writes each combo child as an ordinary `exercise_type =
'regular'` row with `parent_id` set and `sets_completed` inherited from the
parent. Every existing aggregation — volume, progression, body split, PRs —
picks them up with **no special-casing at all**, because they are just regular
rows. The parent row stays for "this was one combo of 4 sets".

*Historic combos stay uncounted, permanently.* The original plan was to backfill
them from the `timeline` column — **that turns out to be impossible.** Checked
against the live data: 61 combo `set_done` events, **none carrying a weight**.
The cause is a logging bug — `handleSetDone` recorded `st.weight` and `st.reps`,
which are `undefined` for a combo, because combo state keeps `subWeights` and
`subReps` arrays instead. The sub-exercise loads only ever existed in the
in-memory summary and the per-session CSV; they were never persisted anywhere a
backfill could reach.

The logging is fixed (a combo `set_done` now records each sub-exercise's own
load), so future timelines are complete. The 34 historic combo rows keep
counting as zero volume, and always will.

**b. Volume includes cardio work — separately.** Cardio has no kilograms, so it
does not join tonnage. It gets its own two derived numbers, both computable from
columns that already exist and are used by nothing:

```
cardioSecs      = Σ duration_secs where exercise_type='intervals'
cardioDistKm    = Σ speed_kmh × duration_secs / 3600
```

**c. Volume counts *completed* sets.** Already correct
(`sets_completed`), but it is worth stating so it survives the refactor: a
planned-but-skipped set is not tonnage.

### 5.3 Mine the timeline

The `timeline` column already records, per session:

```
session_start · warmup_start · set_start{exercise, bodySection, setNumber}
set_done{exercise, setNumber, setsLeft, weight, reps, durationSecs}
rest_start{durationSecs} · rest_end{interrupted} · cardio_length_start
session_end
```

Three derived numbers come out of it that no other gym app on a phone will show
you, because no other gym app records set starts:

```
workSecs   = Σ set_done.durationSecs                    time under tension
restSecs   = Σ (rest_end − rest_start)                  actual rest taken
density    = workSecs / totalDurationSecs               how much of the hour was work
```

`density` is the headline. "You were in the gym 1 h 52 m and under load for
41 m" is a genuinely actionable sentence, and it is one `reduce` away.

`rest_end.interrupted` additionally gives **rest compliance** — how often you
cut rest short versus letting it run — which is a real training variable and is
currently thrown away.

### 5.4 The derived layer

One module, `shared/analytics.js`, exporting a single `deriveSession(row)` that
every chart consumes. Per session:

```js
{
  id, name, startedAt, dayKey, weekKey,
  durationSecs, workSecs, restSecs, density,
  volumeKg,                       // regular + combo children
  setCount, repCount,
  cardioSecs, cardioDistKm,
  sectionVolume: { Chest: 2840, Back: 1960, … },
  bestSets: [{ exercise, weightKg, reps, e1rm }],
}
```

**e1RM replaces "max weight".** Epley, with the standard guard:

```js
const e1rm = (w, reps) => reps > 12 ? null : w * (1 + reps / 30);
```

Above 12 reps the formula stops predicting anything, so it returns `null` rather
than a number that looks like data. This one change makes the progression chart
answer "am I getting stronger" instead of "did I do a heavy single".

**Kill the mirror file.** `src/utils/analytics.js` and `web/lib/analytics.js`
stop being hand-copied twins. Move the module to `/shared/analytics.js`, make
both existing paths one-line re-exports, and add a `prebuild` check that fails
loudly if they diverge. Ten lines, and it removes a class of bug the file's own
header already documents as having happened.

### 5.5 The four headline tiles — replaced

Out: Sessions · Total time · Active days · kg lifted (all cumulative, all
capped at 100 sessions, all comparison-free).

In: four tiles, each **value + window + delta**, delta coloured `gold` when up
on a "more is better" metric, `warn` when down, `textFaint` when flat:

| Tile | Value | Sub-line |
|---|---|---|
| **THIS WEEK** | `4 sessions` | `+1 vs last week` |
| **VOLUME** | `12.4 t` | `−8% vs last week` |
| **UNDER LOAD** | `41m` | `of 1h 52m in the gym · 37%` |
| **STREAK** | `6 weeks` | `best 11` |

A streak is **consecutive weeks with ≥1 session**, not days. Daily streaks
punish rest days, which is exactly backwards for lifting, and they are the
single most common way a fitness app makes you feel bad for training correctly.

### 5.6 The dashboard, rebuilt around three questions

Everything on the Stats tab answers one of three, and they appear in this order
because that is the order of how much they matter:

**1 — Am I showing up?**
- The four tiles above.
- Activity grid, 10 weeks, unchanged in concept and rebuilt for legibility: the
  week label goes to `caption` (12px) from 9px, and a cell's intensity encodes
  *volume*, not just presence — four steps of `emberDim → ember`.

**2 — Am I getting stronger?**
- **PR feed.** The last five personal records, each `trophy`-marked in gold:
  `Bench Press · 92.5 kg e1RM · +2.5 since Aug 14`. This is the most motivating
  surface in the whole app and it costs one pass over `bestSets`.
- **Exercise progression**, now e1RM, with the raw best set plotted as a
  secondary dimmed series so you can see *how* the estimate moved.
- **Volume trend**, 12 weeks, with a 4-week rolling average line over the bars.
  Weekly tonnage is noisy; the average is the signal.

**3 — Am I balanced?**
- **Body split**, last 4 weeks: a horizontal bar per section with its `body*`
  glyph, as a percentage of total volume. This is the chart that tells you legs
  are 9% and it is the most useful uncomfortable number the app can produce.
- **Lift vs cardio**, last 4 weeks: one stacked bar, `workSecs` vs `cardioSecs`.

**And one strip, not a section, for the body:**
- `WEIGHT 82.4 kg ▾0.8 · 30d` `WAIST 91.0 ▾1.5 · 30d` `DIET 78% · 7d avg` —
  three readouts, each with its window stated, tapping through to the Body tab.
  The three duplicated line charts come off the dashboard entirely (cause 18).
  One truth for your weight, and it lives on the Body tab.

### 5.7 New screen — Exercise detail

The screen the data has always supported and nobody built. Reached by tapping an
exercise name anywhere — history row, progression picker, PR feed, session
editor.

```
BENCH PRESS                            [bodyChest]
e1RM 92.5 kg   ▲ +4.2 kg / 90 days
──────────────────────────────────────────
[ e1RM line, 6 months, best-set series dimmed underneath ]

BEST SET        100 kg × 5      Sep 2
LAST            95 kg × 8       Sep 14
VOLUME, 30d     18,420 kg       ▲ 12%
SESSIONS        14              across 20 weeks
──────────────────────────────────────────
HISTORY
Sep 14  95 × 8, 8, 7          3 sets    2,190 kg
Sep  9  92.5 × 8, 8, 8        3 sets    2,220 kg
…
```

### 5.8 History

The flat list of 20 becomes **grouped by week**, with a week header carrying
that week's totals: `SEP 14 – SEP 20 · 4 sessions · 12.4 t · 2 PRs`. Filters by
body section (the `body*` glyphs) and by type. Infinite scroll past the current
100-session cap.

### 5.9 Charts need react-native-svg

The current charts are hand-rolled from `View`s — bars from flex children, lines
from `View`s rotated by `Math.atan2`. It is genuinely clever and it has hit its
ceiling: no gridlines, no area fill, no curve, no touch, and the line chart
labels only its max and min.

`react-native-svg` is **required anyway** for the generated icon set — every
sibling app's `Icon.tsx` is built on it. Adding it once buys the icons *and*
real charts: paths, gradient area fills under the volume trend, gridlines, and
a touch scrubber that reads out the value under your finger. One dependency,
two payoffs, and it deletes ~150 lines of geometry maths from two screens.

The web side already uses Recharts and keeps it.

---

## 6. Navigation

**A four-tab bar, at last.**

```
┌────────────┬────────────┬────────────┬────────────┐
│  tabTrain  │  tabStats  │   tabBody  │   tabYou   │
│    Train   │    Stats   │    Body    │     You    │
└────────────┴────────────┴────────────┴────────────┘
```

- **Train** — session templates, quick start. The home.
- **Stats** — §5.6. Was a push screen behind a chevron.
- **Body** — metrics entry and history. Was a push screen behind a chevron.
- **You** — account, defaults, sounds, export. **Was a tap on your own email
  address.**

Bar height 72px on `surface` with a `line` top hairline; 30px glyph over an
11px `label`. Active tab = solid variant + `ember` glyph + `ember` label; the
others are `textFaint` contour.

**Full-screen pushes over the tabs**, tab bar hidden: Training, Summary, Session
Editor, Exercise Detail. Training is a *mode* — it keeps the screen awake, it
owns the hardware back button, and it should not offer a way to wander into the
dashboard mid-set.

This deletes the four-circle header cluster, and it gives export and account a
real home (causes 7 and 8).

---

## 7. Screens

Mockups for each of these are in the artifact linked at the top.

### 7.1 Train

```
KINETIC                                      [search]
─────────────────────────────────────────────────────
┌─ NEXT UP ─────────────────────────────────────────┐
│  Push Day A                                       │
│  [bodyChest][bodyShoulders][bodyArmsBack]         │
│  Last run Sep 14 · 8.2 t · 52m                    │
│                                                   │
│  ┌───────────────────────────────────────────┐    │
│  │  ▶   START                                │    │  ← ember, 64px
│  └───────────────────────────────────────────┘    │
└───────────────────────────────────────────────────┘

YOUR SESSIONS
┌───────────────────────────────────────────────────┐
│ [barbell] Pull Day A                              │
│           [bodyBack][bodyArmsFront] · 6 exercises │
│           Sep 12 · 7.4 t                        › │
└───────────────────────────────────────────────────┘
…
                                          ( bolt )( + )
```

**Changes.** A hero "next up" card, so the most likely action is one tap with no
reading. Session templates become **rows, not cards with three buttons** — edit
and delete move to a swipe, `start` is the whole row. Every row gains its body
glyphs and its last-run stats, which the data already has and the list never
shows. The four header circles are gone: the two creation actions become a small
speed dial, everything else is a tab.

### 7.2 Training — the mode

Three states, one screen.

**a. Working.** Top bar: session name, elapsed in `timerInline`, `END`. Below,
the exercise rail — each row carries **set pips** rather than a bare status dot:

```
[statusComplete] Bench Press              ● ● ● ● ○
[bodyChest]      80 kg · 5 reps           4 of 5 sets
```

The pips are the fix for cause 12: "how many left" without opening anything.

**b. Resting.** The rest countdown **takes the top third of the screen** — ice,
`timerHero` at 76px, inside a ring that drains, with the next exercise named
underneath and a `SKIP REST` beneath that. Ember goes cold everywhere while ice
is lit (§2.2). This is the largest single usability change in the redesign: the
number you most need to read from two metres away is currently the third
smallest thing on the screen.

**c. Set detail — a sheet, not a screen swap.** The detail slides up over the
dimmed list at ~78% height, dismissed by a header chevron or a swipe down. You
never lose your place, and "Back to exercises" stops being a text link at the
bottom of a scroll view.

**Weight and reps entry, rebuilt** (cause 11):

```
WEIGHT
        ┌──────────────────────────────┐
  −2.5  │        82.5  kg              │  +2.5
        └──────────────────────────────┘
        [ −5 ] [ −2.5 ] [ +2.5 ] [ +5 ] [ +10 ]
                    tap the value to type
```

Plate-math increments, pre-filled from the last time you performed this exercise
(the data is there and is not used), long-press or tap-the-value to type an
exact number. Reps keep `±1` plus a keypad. Forty taps becomes two.

`SET DONE` is a fixed full-width 72px ember bar at the bottom, and pressing it
transitions the screen straight into state (b).

### 7.3 Summary

```
              [statusComplete]
              SESSION BANKED
              Push Day A · 52m

   12.4 t          41m            2 PRs
   VOLUME       UNDER LOAD      [trophy]

[trophy] Bench Press  92.5 kg e1RM  +2.5 since Aug 14
[trophy] Lat Pulldown 71.0 kg e1RM  +1.0 since Sep  2

EXERCISES
…
[ save as template ]        [ export CSV ]
```

The three numbers that matter, then the gold PR callouts, then the detail. PRs
are computed here and nowhere else pays for it.

### 7.4 Body

Entry form collapses to a single `✓ Logged today · 82.4 kg` row once today has
an entry, expanding on tap. **One period selector at the top drives all three
charts** — today the Body screen has 1M/6M/12M and the dashboard hard-codes 12
weeks, which is cause 18. Each chart gains a delta readout against the start of
the selected window.

### 7.5 You

Account · units (kg/lb) · default rest timer · sounds · notifications ·
**export all history to CSV** · sign out. Most of this does not exist anywhere
today; the export exists in exactly one unreachable place.

### 7.6 Shared primitives to build once

Currently duplicated across four screens each:

- **`ConfirmDialog`** — the hand-rolled full-screen overlay appears three times
  with three sets of styles.
- **`Sheet`** — bottom sheet with a grabber, used by set detail, quick add,
  pickers, account.
- **`StatTile`** — value + label + window + delta, the §5.5 shape.
- **`Chart`** — one svg chart component with bar/line/area modes, gridlines and
  a scrubber, replacing two hand-rolled implementations on mobile.
- **`Stepper`** — the §7.2 version, replacing the current one.

### 7.7 Empty and loading states

Every empty state gets its `empty*` glyph at 56px, one `h3` line, one `body`
line, and — where there is an obvious next action — one button. No emoji.
Loading gets skeleton rows in `raised`, not a centred spinner: a spinner on a
dark screen with no chrome looks like a failure.

---

## 8. Shape, depth, motion

```
radius   sm 10 · md 14 · lg 20 · xl 28 · pill 999
spacing  xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 40
```

**One elevation rule, and it is different from Mommy's.** Mommy says cards get a
hairline and no shadow. Kinetic gets a third option, because it has glow:

- **Cards**: `surface` + a `line` hairline. **No shadow.** The current
  `Shadows.card` on a near-black ground produces nothing visible and costs
  render time.
- **Floating** (sheets, the header once content scrolls under it): a real
  shadow, `void` at 0.6.
- **Glow**: reserved for the **live** element only, and never more than one on
  screen — the ember `SET DONE` bar, or the ice rest ring while it runs. This is
  the payoff for the one-hot-channel rule: because only one thing glows, the
  glow means something.

Motion: `sheetIn 240 / sheetOut 180 / tick 120 / pressOpacity 0.75`. The rest
ring drains with a linear 1 s tick, not an eased animation — an instrument does
not ease.

**Touch targets: 48px minimum, 56px for anything pressed mid-set** with a
sweaty hand. `SET DONE`, `START`, `PAUSE` and the weight chips are all ≥56.

---

## 9. App identity

**Keep the icon.** The bolt through the barbell on near-black is good, it is
already exactly on concept, and its `#FF6B2B` is the source of the brand orange.
Nothing here asks you to redraw it.

Three adjustments:

- **Splash** re-cut on `base #0F0F11` rather than `#0D0D0D`, so the launch does
  not step one value when the first screen paints.
- **Notification icon** — Android needs a monochrome silhouette;
  `android-icon-monochrome.png` exists but is not wired into the
  `expo-notifications` plugin config, so timer notifications currently show a
  grey square on Android 12+.
- **Adaptive icon background** is `#FF6B2B` — a full orange field behind an
  orange-and-black mark. It should be `base`, with the bolt carrying the colour.

---

## 10. Rollout

Seven stages, each independently shippable. The tokens land first and the old
names stay aliased until the last stage, so no screen is migrated twice.

| # | Stage | Contains |
|---|---|---|
| **1** | **Foundations** | `theme.js` v2 with aliases · bundle DSEG7 · add Barlow + Inter · add `react-native-svg` · `src/utils/units.js` (the lb shadow, §3.5) · `Dev/Icons` route · icon pipeline (`assets/icons-src` + `generate-icons.mjs` copied from Mommy) |
| **2** | **Icon set** | Generate 100 glyphs · review at 22/26/30 on three grounds · fix pass · delete every emoji from the codebase |
| **3** | **Navigation** | Four-tab bar · `You` tab (account, defaults, export) · Training/Summary/Editor become full-screen pushes · retire the header circle cluster |
| **4** | **Analytics engine** | `shared/analytics.js` · `parent_id` migration + combo children in `syncWorkout` · timeline-derived `workSecs`/`restSecs`/`density` · e1RM · mirror-file check |
| **5** | **Stats + Body** | Four tiles · PR feed · e1RM progression · volume trend with rolling average · body split · lift:cardio · body strip · Exercise Detail screen · grouped history · **historic combo backfill from `timeline`** · `weight_lb` column in the CSV export |
| **6** | **Training** | Rest hero · set pips · detail sheet · plate-math weight entry **with the lb shadow** · fixed `SET DONE` bar · Summary rebuild |
| **7** | **Sweep** | Train tab · Editor restyle · shared primitives · empty/loading states · splash + notification icon · **delete the legacy token aliases** · release build |

Stages 4 and 5 are the ones you asked for and they do not depend on stages 2–3
— if statistics matter more than looks right now, 1 → 4 → 5 is a valid path and
leaves the app looking exactly as it does today while every number in it becomes
correct.

---

## 11. Out of scope

Stated so they do not creep in:

- Light mode (§2.6).
- **Entering or storing pounds.** The lb shadow (§3.5) is a readout and nothing
  more: no unit toggle, no `weight_lb` column, no lb input. Also out: a cm→inch
  shadow on waist, which is a different conversion for a different need.
- Rest-timer auto-start per exercise, supersets as a first-class type, plate
  calculators, RPE/RIR logging, 1RM testing protocols, programme templates
  (5/3/1, PPL), exercise demonstration media, social/sharing.
- Apple Health / Google Fit / wearable import.
- Rewriting the web dashboard. It consumes `shared/analytics.js` and gets the
  corrected numbers for free; its visual redesign is a separate document.
- Offline-first for *history*. Templates are already offline-first; the
  dashboard is not and does not need to be.

---

## 12. Decisions — closed

All six were settled on 2026-09-19. Nothing in this document is open.

| # | Question | Decision |
|---|---|---|
| **1** | Units | **kg only — plus a lb shadow.** No toggle, no schema change, no second unit in the data. Every kg figure carries a small pound readout beside it so a machine abroad can be set without arithmetic. Full rule in **§3.5**. |
| **2** | Display face | **Barlow Semi Condensed.** §3.1 stands as written. |
| **3** | Body-section glyphs | ~~Equipment~~ → ~~anatomy in context~~ → ~~isolated muscles~~ → **simplified figures and torsos in open line.** Settled against a client-approved reference set, measured rather than described. |
| **4** | Streak unit | **Consecutive weeks** with ≥1 session. §5.5 stands. |
| **5** | Historic combo backfill | ~~Runs in stage 5.~~ **Cannot be done** — verified against the live data in stage 4. The combo loads were never persisted anywhere a backfill could reach; see §5.2a. Historic combo volume stays zero. The logging bug behind it is fixed, so this cannot recur. |
| **6** | Quick session | **Speed dial** on the Train tab. §7.1 stands. |

**Decision 3 moved twice.** It originally chose equipment over anatomy, on the
grounds that anatomy does not survive a small size — reasoning that was tied to a
22px floor. The floor is now 30px (§4.3), so that constraint is gone. A first
pass at anatomy drew bodies with the worked muscle emphasised, and was rejected;
the settled answer is **isolated muscles in line art** — the muscle alone, with
its tendons, no body around it.

Both the mode (line, not filled) and the framing (isolated, not in context) were
chosen by the client from reference images rather than inferred, after three
rejected batches. The images are in `docs/icon-references/`.

**What decision 1 changes elsewhere in this document.** It is the only one that
added work rather than confirming it:

- **§3.5** is new — the placement, type, rounding and per-surface map.
- **Stage 1** gains `src/utils/units.js` (six lines) so the conversion and its
  rounding are defined once.
- **Stage 5** gains the lb column in the CSV export.
- **Stage 6** and **stage 7** carry the shadow onto the training, summary,
  editor and body surfaces as those screens are built.
- **§11** no longer lists a unit toggle as out of scope; what stays out of scope
  is *storing* or *entering* pounds, and a cm→inch shadow for waist.

---

## 13. What to hand the icon generator

`docs/ICON-BRIEF.md`, in full. It contains the style prompt, the format
contract, the wobble-free geometry spec, the stroke and coverage numbers, the
per-glyph briefs for all 100, and the acceptance checklist. It is written to be
handed over without this document.
