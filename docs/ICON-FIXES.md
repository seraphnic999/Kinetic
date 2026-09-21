# Icon corrections — running list

Glyphs that landed but need redrawing. Collected as they were found so they can
go back to the generator in one or two batches at the end, rather than
interrupting the run.

**Status: 100 of 100 installed. The 13 corrections were delivered and are IN
THE APP. One glyph is genuinely still weak.**

Corrected history, because this file was stale and misled a later session into
asking for work that was already done:

- The 13 redraws listed below were delivered on 2026-09-20 as
  `refined_gym_icons_set.zip`, copied into `assets/icons-src/` and regenerated
  into `src/components/Icon.js` the same day. Re-running
  `node scripts/generate-icons.mjs` today produces a byte-identical file, which
  is the proof: **`warmup`, `flame`, `combo`, `barbell`, `tonnage`, `streak`,
  `compare`, `sets`, `plate`, `tape`, `bodyProfile`, `diet` and `emptyMetrics`
  are all the corrected versions.** The table further down is kept as the
  record of WHY each was redrawn, not as a to-do list.
- `statusComplete` was delivered as a separate solid SVG and, because its
  source used three `<mask>` elements the generator cannot fold into one path,
  was authored by hand instead (`mktick.py`). It is installed.
- `icon-prompts/99-corrections.txt` and `99-corrections-solid.txt` are both
  **spent**. Do not re-send them.

Nothing is open. `emptySessions` was the last one and is closed — see below.

## emptySessions — closed 2026-09-21, authored rather than generated

The delivered redraw came back **worse than what it replaced**: narrower in
the frame, two pairs of stubs instead of one, and — crucially — no sign at all
that the bar was missing. It still read as two stray brackets, now with extra
ticks.

That was my fault, not the generator's. The prompt asked for a **dashed**
horizontal line to signal the absent bar, and **this build cannot render a
dash**: `Icon.js` strokes a single path with no `strokeDasharray`, and
`generate-icons.mjs` does not carry one. A perfect answer to that prompt would
have arrived as `stroke-dasharray`, been silently dropped, and come through
SOLID — which, as the prompt itself said, means the opposite thing: a rack
with a bar in it.

So the glyph is authored by hand (`scratchpad/mkrack.py`), with the dash drawn
as three real segments. Precedent: `statusComplete`, authored the same way when
its source used masks the generator could not fold.

The shape: two uprights on feet wide enough to stand on, a J-hook with an
upturned lip reaching inward from each post, and three dashes at resting height
between the lips. Verified on device at 72px, which is the only size it is ever
drawn at — every call site is `EmptyState`.

**Do not re-prompt this one.** `icon-prompts/99-corrections-2.txt` is spent,
and asking for a dash again will fail the same way until the pipeline grows
dash support.

---

## The corrections

Both prompt files are self-contained. Attach `icon-references/0-house-style.png`
and paste. The list below is the reasoning; the prompt files are the thing to
send.


---

## Why each one

| Glyph | Batch | What arrived | Why it fails |
|---|---|---|---|
| `warmup` | 03-exercise | A water drop — rounded top, symmetric inner droplet | Reads as hydration, not heat |
| `flame` | 07-trainingB | A pointed vertical oval with an inner oval | Reads as a leaf or an eye |
| `combo` | 03-exercise | Two curves that do not visibly interlock | Reads as a paperclip. The whole point is showing which link is in front |
| `barbell` | 03-exercise | Four thin plates per side | Collapses to a comb of vertical lines at 34px; also its weakest separation from `dumbbell` |
| `tonnage` | 08-statsA | Three concentric rings stacked vertically | Wrong object, and the widest ring is at the top |
| `streak` | 08-statsA | Five boxes each containing a tick | Normalises to 53 × 17.7u, so each box is ~5px at row size |
| `compare` | 09-statsB | Three plain bars | No bracket, so it is just `chartBar` again — a real in-app confusion |
| `sets` | 07-trainingB | Three equal thin horizontal lines | That is a hamburger menu. My original brief said equal length *avoids* the confusion, which was wrong — equal length *is* the confusion |
| `plate` | 07-trainingB | Ring with four full-length spokes and a centre dot | Reads as a crosshair; too close to `target`, which is the glyph right next to it in the same family |
| `statusComplete` | 05-solid | A `<circle>` with a `<mask>` cutting the tick | **Blocked, not installed.** The build cannot fold a mask into one compound path. See the separate block above |

---

## Fixed in the pipeline, no redraw needed

Recorded here so they are not re-reported.

| Glyph | Issue | Fix |
|---|---|---|
| `dragHandle` | Six hollow rings — drawn as stroked `<circle r="2">`, which at 34px is fuzz | Replaced with six solid discs, authored at final size |
| `more` | Same problem, from the nav batch | Same fix |
| `trendUp`, `trendDown` | Fill the frame corner-to-corner, so they read larger than their neighbours | `OPTICAL` entry rather than a redraw — it is a scaling question, not a drawing one |
| `refresh` | First version had a weak arrowhead; second was a filled outline measuring 4.17u against the set's 1.5u | `refresh2` accepted after the generator learned to bake `transform` attributes |

---

## Added from the final three batches

| Glyph | Batch | What arrived | Why it fails |
|---|---|---|---|
| `tape` | 10-metrics | An unreadable squiggle | No loop, no graduation marks — reads as a ball of string |
| `bodyProfile` | 10-metrics | A stick figure | Off-style: every other figure in the set has a real body outline |
| `diet` | 10-metrics | A circle split down the middle | Reads as a contrast symbol, not a plate |
| `emptyMetrics` | 13-empty | Identical to `scale` | The display is not visibly empty, so the two glyphs cannot be told apart |
| `emptySessions` | 13-empty | Two detached bracket strokes | Found on device at 72px in the editor's empty state — it does not resolve into an object at all, it reads as two stray marks |

Everything else in those three batches landed clean: `scale`, `ruler`, all four
other `empty*`, and the whole 10-glyph account family first time.

## All 100 accounted for

`Icon.js` carries 100 glyphs, nothing extra. `statusComplete` was the last gap
and is now authored by hand (`mktick.py`) rather than generated, because the
source used three `<mask>` elements and the generator cannot fold a mask into a
single path.

---

## Wrong glyph chosen, not wrongly drawn

Found by walking the v12 build on the emulator. These are usage errors in the
screens — the glyphs themselves are fine and are still correct elsewhere.

| Screen | Row | Was | Now | Why |
|---|---|---|---|---|
| You | Rest timer | `rest` | `timer` | `rest` is a clock with a bar across it; at `IconSize.meta` the bar reads as the slash of a no-entry sign |
| You | Sounds | `cardio` | `intervals` | `cardio` is a heart with an ECG trace through it, so the row read as heart rate. `intervals` is a square wave, which reads as audio |

Worth noting for the rest of the set: both mistakes were mine picking a glyph by
its name rather than by what it looks like at the size it is drawn. The glyph
inventory is large enough now that the usage map in DESIGN.md §4 is the thing to
check against, not the glyph name.
