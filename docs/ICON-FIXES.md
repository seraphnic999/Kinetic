# Icon corrections — running list

Glyphs that landed but need redrawing. Collected as they were found so they can
go back to the generator in one or two batches at the end, rather than
interrupting the run.

**Status: 99 of 100 installed. 13 need a redraw. 1 is blocked.**

All thirteen redraws plus the blocked glyph are written as ready-to-paste
prompts:

- `icon-prompts/99-corrections.txt` — the 13 line glyphs
- `icon-prompts/99-corrections-solid.txt` — `statusComplete`, which is solid

Everything listed here is currently **in the app** except `statusComplete`, so
none of it blocks progress — the wrong glyph is visible rather than absent.

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

Everything else in those three batches landed clean: `scale`, `ruler`, all four
other `empty*`, and the whole 10-glyph account family first time.

## All 100 accounted for

`ICON-LIST.txt` and the generated `Icon.js` agree: 99 installed, nothing extra,
`statusComplete` the only gap.
