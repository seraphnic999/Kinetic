# Kinetic — icon set brief ("Open Line")

The spec for the **100-glyph** icon set of Kinetic, a gym training app.

Self-contained: hand it over on its own. `docs/DESIGN.md` §4 is the summary and
the usage map; this supersedes it in every detail.

**Read §1–§6 before generating anything. §7 is the reference geometry — it is
not optional reading, it is the thing you are matching. §8 is the per-icon list.
§9 is the acceptance checklist.**

---

## 0. Why this brief is different from the four before it

Four batches of the eight `body*` glyphs have been generated and rejected. The
first three failed for reasons the brief can be blamed for. The fourth is the
one that matters:

| | Asked for | Got | Verdict |
|---|---|---|---|
| v1 | Engraved instrument-panel markings, ruler-drawn, 5.0u | Disconnected bars and discs floating near each other | Rejected |
| v2 | Clean contour line drawings, 3.8u | Wobbly cartoon — accidentally a description of a different sibling app | Rejected |
| v3 | Solid silhouettes, muscle knocked out at 25–35% | Abstract blobs: a mask, a tooth, a safety pin, a waffle | Rejected |
| v4 | Fine-line isolated muscles, 3.0u, 15–20% ink | **Every number hit. Six of the eight were the same leaf.** | Rejected |

**v4 is the instructive failure.** It satisfied every measurable rule in the
brief and was still unusable, because the brief described *geometry* and never
described *construction*. In particular, every version said some form of "one
continuous closed contour" — and a closed contour around a muscle is a leaf.

**The set being matched is not closed contours. It is open strokes with round
caps.** A torso is drawn as two open side lines and a shoulder line that simply
stop; a bicep is a bulge in an open arm line. Nothing is a closed loop unless
the real form encloses something.

That single structural fact is what the previous four briefs all got wrong, and
it is §3.1.

**v5 is measured, not described.** Every number below was taken off a reference
set the client supplied and approved. It ships with this brief as SVG (§7).

---

## 1. The concept

**Simple, confident line pictograms of the human body and the equipment that
loads it.** Uniform hairline stroke, round caps, open construction, minimal
internal detail. Anatomically plausible but symbolic — a person, not a
diagram; a muscle group you recognise, not a muscle you could dissect.

### 1.1 The master style prompt

> Thin-line icon of a simplified human figure or object. Uniform hairline
> stroke throughout with fully rounded caps and joins. Built from **open
> strokes that start and stop**, not from closed outlines — a torso is a pair of
> open side lines, a limb is an open line with a bulge where the muscle is.
> Closed loops only where the real form encloses something, like a head. A few
> short internal strokes for anatomy — a collarbone, an ab grid, a lat line —
> and nothing more. No fill, no shading, no hatching, no texture, no wobble. The
> drawing fills its frame. Simple, calm and instantly recognisable at 30 pixels.

### 1.2 What this is not

Every one of these has been produced and rejected already:

- **Not closed outlines.** No leaf shapes, no teardrops, no silhouette rings.
  This is the failure that killed v4 (§3.1).
- **Not filled.** No solid masses, no negative-space cut-outs.
- **Not schematic.** No exploded diagrams, no floating primitives.
- **Not hand-drawn.** No wobble, no bulbous marker line, no cartoon.
- **Not an anatomy plate.** Four to eight internal strokes, not twenty.
- **No text, letters, numbers, faces, sparkles or speed lines.** A head is an
  empty circle; it never has a face.

---

## 2. Format contract — enforced by the build

`src/components/Icon.js` is **generated** by `scripts/generate-icons.mjs` from
`assets/icons-src/*.svg` and is never hand-edited. The generator refuses to emit
a table if any of the following is violated:

- **`viewBox="0 0 64 64"`**, and no `width`/`height` attributes.
- **Exactly one `<path>` element.** No `<circle>`, `<rect>`, `<ellipse>`,
  `<polygon>`, `<polyline>`, `<line>`, `<g>`, `<text>`, `<use>`, `<defs>`,
  `<mask>`, `<clipPath>`.
- **`fill-rule="evenodd"`** on that path.
- **`fill="currentColor"`.**
- **No `stroke` attribute** — see §2.1.
- **No `transform` attribute.** Bake it into the coordinates.
- **Filename is the icon name**, lowerCamelCase: `bodyArmsFront.svg`, not
  `BodyArmsFront.svg` and not `body-arms-front.svg`.
- **No degenerate paths.**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <path fill="currentColor" fill-rule="evenodd" d="M…Z"/>
</svg>
```

### 2.1 Delivering open strokes in a fill-only format

The drawing is line art; the format has no strokes. So:

1. Draw with real strokes at §3.2's weight, **round cap, round join**.
2. **Outline / expand** every stroke into a filled ribbon. A round cap becomes a
   semicircular end on the ribbon — that is what preserves the look.
3. **Union** every ribbon into one shape.
4. Export as a single `<path fill-rule="evenodd">`.

**Union is not optional.** `evenodd` makes two overlapping subpaths cancel, so
un-unioned crossings punch holes. In the v1 batch this notched the barbell
wherever a plate crossed it.

The reference set in §7 delivers this as `M`/`L`/`Z` polylines — curves
flattened to short segments, ~440 vertices per glyph. **That is acceptable and
expected.** Flattening at export is fine; what must not happen is drawing in
facets in the first place.

---

## 3. The drawing style — measured

Every number in this section was measured off the approved reference set.

### 3.1 Open strokes, not closed contours

**This is the rule the whole set turns on.**

- A form is described by **open strokes that begin and end**, each finishing in
  a round cap. A torso is a left side line, a right side line, and a shoulder
  line — three open strokes that stop where the crop stops. There is no line
  across the top of the neck and none across the waist.
- **Closed loops only where the real form encloses something**: a head, a wheel,
  a weight plate, a clock face, a ring.
- **Internal detail is more open strokes** at the same weight — a collarbone is
  one short curve, an ab grid is one vertical plus two or three horizontals,
  a lat is two diverging lines.
- **Nothing floats.** An internal stroke sits inside the form it belongs to and
  reads as part of it.
- The head, where a glyph has one, is **a detached circle** with a clear gap
  between it and the shoulders. That gap is part of the style.

`docs/icon-references/0-target-construction.png` shows four of the reference
glyphs at 260px. Look at where the lines simply stop.

### 3.2 Line weight

| | Units on the 64 grid |
|---|---|
| Nominal stroke | **1.5 u** |
| Permitted variation across the set | 1.4 – 1.7 u |
| Permitted variation *within one glyph* | none — visually uniform |

Measured across the eight reference glyphs: min 1.39u, **median 1.48u**, max
1.64u. This is a genuine hairline — far finer than any sibling app — and it is
the single most characteristic property of the set.

**Round caps and round joins everywhere.** No flat cuts, no tapering, no
variation through a curve.

At the app's sizes this lands at 0.7 px (30px) to 0.9 px (38px) in CSS pixels,
which on a 2.5–3.5× phone screen is 1.8–3.2 device pixels. Fine, not fragile —
**provided the app never renders an icon in its faintest ink**; see §6.

### 3.3 Geometry

- **Draw the body, not a diagram of it.** Real proportions, simplified muscle.
- **True smooth curves.** Facets are a flattening artefact at export, never a
  drawing decision.
- **No wobble.** Clean and calm.
- **Symmetric where the body is symmetric** — a chest, an ab grid, a pair of
  legs — and only there.

### 3.4 Fill the frame

**Every glyph's bounding box spans 52–53 units of the 64 grid** on its dominant
axis, leaving ~5.5u margin. The reference set hits 53.0u on all eight.

Optical balance beats the bounding box: in a row of eight at 34px, no glyph
should read larger, smaller, heavier or lighter than its neighbours.

### 3.5 Ink coverage

**Target 8–12% of the 64×64 frame.** The reference set measures 8.0–11.3%.

This is *low*, and deliberately so — it follows from a 1.5u stroke. Do not
inflate it by thickening the line or adding detail. A glyph over 14% is too busy
for this set.

### 3.6 Internal detail — the budget

| | Strokes |
|---|---|
| Internal detail lines, typical glyph | **4 – 8** |
| Absolute maximum | **10** |
| `empty*` glyphs (drawn at 72px) | up to 14 |

Counted off the reference: `bodyChest` 6, `bodyCore` 8, `bodyBack` 8,
`bodyLegs` 4.

- **Minimum gap between two parallel strokes: 4 u.** Closer than that and they
  merge into a grey smear at 30px.
- **Minimum enclosed counter: 6 u across.**
- If a glyph will not fit the budget, **cut detail, never the silhouette** — the
  outer form is what makes it nameable.

### 3.7 Grammar to reuse across the set

- **A limb is an open line with a bulge** where the muscle is.
- **A torso is two side lines plus a shoulder line**, cropped at neck and waist,
  open at both ends.
- **A head is a detached empty circle.** Never a face.
- **Equipment is tubular** — round caps, even bore.
- **Motion, where needed at all, is one clean arc attached to the drawing.**
- **Time is a circle with two hands**, never an hourglass.

---

## 4. Directional icons

The app is LTR. `back` and `chevronLeft` point **left (←)**; `forward` and
`chevronRight` point **right (→)**. Runtime mirroring only for the four
chevrons.

---

## 5. Two sub-families that break the rules — deliberately

**a. `status*` — solid, not line (4 glyphs).** These render at **18px** beside
text and as set pips, where a 1.5u ring is invisible. Solid filled marks with at
most one internal cut. `statusPending` stays an open ring, because "nothing has
happened yet" should read as empty.

**b. `tab*Active` — solid, not line (4 glyphs).** Each tab glyph ships as a line
default plus a **solid-silhouette** active variant, so the active tab reads
without depending on colour alone. The solid variant keeps the exact outer
silhouette of its line sibling, with one interior detail knocked out.

---

## 6. Sizes, and the one app-side rule that protects the style

| Context | Size |
|---|---|
| Status pill, set pip (solid glyphs only) | **18 px** |
| Meta rows, inline marks | **30 px** — the floor |
| List rows, chips, buttons, section markers | **34 px** |
| Tab bar | **38 px** |
| Section heads, stat tiles | **44 px** |
| Empty states | **72 px** |

**Icons are never drawn in `textFaint` (`#7A7A86`).** At 1.5u on a near-black
ground that is the one combination where this set genuinely disappears. The
quietest ink an icon may take is `textMuted` (`#A3A3AD`). This is a theme rule,
not a drawing rule — it exists so the stroke can stay as fine as the reference.

Every glyph is reviewed at **30 / 34 / 38 px** on `#0F0F11`, `#17171A` and
`#202024`, in `#F5F3F1` (text), `#FF6B2B` (ember) and `#A3A3AD` (muted). The
app's hidden **Dev → Icons** screen renders that matrix.

---

## 7. Reference material — match this, do not interpret it

### 7.1 The geometry — `assets/icons-src/_reference/target/`

**Eight SVGs, normalised to the 64×64 contract. This is the style, exactly.**
They are the client-approved reference and every number in §3 was measured off
them. They sit in a subdirectory so the generator ignores them.

Open them. Measure them. Match the stroke weight, the cap shape, the number of
internal strokes, and above all the **open construction** (§3.1).

The eight are the same eight names as §8.1, so they double as a first draft of
that family — but they need re-posing to fix three confusions (§8.1) and
renaming is already done.

### 7.2 Zoomed views — `docs/icon-references/`

| File | Shows |
|---|---|
| `0-target-construction.png` | Four reference glyphs at 260px. **The open stroke ends are the thing to look at.** |
| `0-target-figure.png` | A full figure at 420px — detached head, open torso lines, bulged arms. |
| `1-muscle-line-set.jpg` | Muscle-level anatomy, as a vocabulary of which forms mean which body part. Style is finer than ours; do not copy the density. |
| `2-strong-icons-line.jpg` | Gym figures and poses. Closest raster reference to the target register. |
| `3-filled-glyph-set.jpg` | **Subject reference only.** Filled style — do not copy the fill. |

### 7.3 Sibling apps — `assets/icons-src/_reference/`

`manifest-*` and `cellar-*` glyphs from two sibling apps. They are **heavier
than this set** and are included only as evidence of frame-fill and precision,
not as a style target.

---

## 8. The 100 icons

**Style column:** `L` = open line, the default for everything · `S` = solid
(§5a, §5b).

Where a row says **must not read as X**, that is a requirement and §9 checks it.

### 8.1 Body sections — 8 · generate these first

**Simplified anatomical figures and torsos**, drawn in open line per §3.1. The
eight approved reference glyphs in §7.1 are the starting point; three of them
need re-posing because they converge in a row at 30px.

Torsos are **headless and cropped** — the neck line and the waist line simply
stop in round caps. Full figures have a **detached round head**.

| Icon | Subject | Drawing | Change from the reference |
|---|---|---|---|
| `bodyChest` | Front torso | Headless front torso cropped at neck and waist. Two shoulder curves, two open side lines, a collarbone pair, and a shallow pec underline across the chest. **No abs** — the abs belong to `bodyCore`. | **Remove the ab grid.** In the reference this glyph carries both pecs and abs, which is why it collides with `bodyCore`. |
| `bodyBack` | Rear torso | Headless rear torso, cropped the same way, with the classic V-taper. A single vertical spine line down the centre and two diverging lat lines each side. | Keep as drawn. |
| `bodyShoulders` | Shoulders and traps | Upper torso only — cropped **at the chest, above the ribs**. Two shoulder caps with a trap line running up to the neck opening, arms cut at the deltoid. Widest and shallowest of the eight. | **Crop higher.** The reference reaches too far down and reads as another back. |
| `bodyArmsFront` | Front double-bicep | Full upper figure: detached round head, open torso, both arms raised and bent, a clear bulge on the upper side of each arm. | Keep as drawn. |
| `bodyArmsBack` | Single triceps extension | **One arm, seen from behind, raised overhead and bent back at the elbow**, with the bulge on the *underside* of the upper arm. A partial torso only — no head. | **Re-pose entirely.** The reference is a rear double-bicep and is near-identical to `bodyArmsFront` at 30px. A single overhead arm is unmistakable against it. |
| `bodyLegs` | Legs | Hips to feet, front view. Two open outer lines, an inner line per thigh, a knee mark each side. Tallest and narrowest of the eight. | Keep as drawn. |
| `bodyCore` | Midsection | Front torso cropped **below the chest** — ribs to hips only. One vertical centre line with three horizontals across it, forming a six-cell grid. Compact, almost square. | **Crop lower.** Drop the shoulders and pecs so it cannot be confused with `bodyChest`. |
| `bodyOther` | Whole figure | Full standing figure, detached round head, arms out in a relaxed star. The only whole-body glyph, so it reads as "all / unspecified". | Keep as drawn. |

**The eight silhouettes, by design:** wide front torso · V-taper back · wide
shallow shoulders · two-armed figure · single raised arm · tall narrow legs ·
compact square midsection · whole figure.

**Stop after these eight.** Do not generate anything else until this family is
signed off.

### 8.2 Tabs — 4 + 4 active

| Icon | Style | Brief |
|---|---|---|
| `tabTrain` | L | A loaded barbell, front elevation: an open bar line with a plate pair each side and a collar. |
| `tabStats` | L | Three open vertical bars of increasing height standing on one baseline stroke. |
| `tabBody` | L | A bathroom scale: a rounded platform outline with a small closed readout ring. |
| `tabYou` | L | A detached round head over an open shoulder curve. |
| `tabTrainActive` | **S** | `tabTrain`'s outer silhouette, filled, plates knocked out. |
| `tabStatsActive` | **S** | `tabStats` filled, tallest bar knocked out. |
| `tabBodyActive` | **S** | `tabBody` filled, readout knocked out. |
| `tabYouActive` | **S** | `tabYou` filled, head knocked out. |

### 8.3 Exercise types — 8

| Icon | Style | Brief |
|---|---|---|
| `barbell` | L | A long open bar with a plate pair each side and collars outside them. |
| `dumbbell` | L | A short bar with one block head each side. **Must not read as `barbell`** — half the length, square heads. |
| `combo` | L | Two interlocking chain links, drawn so you can see which passes through which. |
| `warmup` | L | A flame: an open teardrop with a notched base and one inner tongue stroke. |
| `intervals` | L | A square-wave pulse — high, low, high, low — as one open stroke across the frame. |
| `treadmill` | L | Side profile: an inclined deck line, a closed drum ring at each end, an upright post with a console head. |
| `stairs` | L | Four steps rising left to right as one open stroke, with a stringer line beneath. |
| `cardio` | L | An open heart outline with an ECG stroke crossing it, the heart line breaking where the ECG passes. |

### 8.4 Chrome — 16

| Icon | Style | Brief |
|---|---|---|
| `back` | L | An open chevron pointing **left**, round caps. |
| `forward` | L | The mirror. |
| `close` | L | Two open strokes crossing at 90°, equal length. |
| `more` | L | Three small closed rings on a horizontal axis. |
| `search` | L | A closed ring with a short open handle to the lower right. |
| `filter` | L | A funnel: two converging open strokes into a short stem. |
| `sort` | L | Two open arrows side by side, one up one down, at full height. |
| `add` | L | A plus of two open strokes, equal arms. |
| `minus` | L | One open stroke matching `add`'s arm. |
| `check` | L | A tick: one open two-segment stroke. |
| `chevronUp` | L | The `back` chevron rotated. |
| `chevronDown` | L | The same, rotated. |
| `chevronLeft` | L | The same, rotated. |
| `chevronRight` | L | The same, rotated. |
| `refresh` | L | An open circular stroke with a gap at the top and one arrowhead. |
| `settings` | L | **A slider panel, not a cog** — three open track strokes with a small closed handle ring on each. A cog's teeth merge at 30px. |

### 8.5 Training — 14

| Icon | Style | Brief |
|---|---|---|
| `play` | L | An open triangle outline pointing right, rounded vertices. |
| `pause` | L | Two open vertical strokes. **Must not read as `sets`** — vertical vs horizontal. |
| `stop` | L | A rounded square outline. **Must not read as `save`.** |
| `skip` | L | A play triangle with one open vertical stroke at its tip. |
| `setDone` | L | A rounded square outline with an open check crossing its edge. |
| `rest` | L | A closed clock ring with one horizontal stroke across the centre instead of hands. |
| `timer` | L | A closed clock ring with a cap and stem above and two open hands. |
| `stopwatch` | L | As `timer` with a side button and one hand. |
| `plate` | L | A weight plate face-on: an outer ring, an inner hub ring, four open spoke strokes between. **Must not read as `target`.** |
| `reps` | L | Three stacked open chevrons pointing up. |
| `sets` | L | Three open horizontal strokes of **equal** length. Equal length stops it reading as a hamburger. |
| `flame` | L | A smaller, simpler `warmup` — outline plus one tongue. |
| `bolt` | **S** | A lightning bolt, straight edges, matching the app icon's mark. **The one fully solid glyph outside §5** — it quotes the app icon. |
| `target` | L | Three concentric closed rings. |

### 8.6 Status — 4 · solid, per §5a

| Icon | Style | Brief |
|---|---|---|
| `statusPending` | **S** | An open ring, thick, large empty centre. |
| `statusPartial` | **S** | A disc with a 50% wedge removed, clockwise from the top. |
| `statusComplete` | **S** | A disc with a check knocked out. |
| `statusSkipped` | **S** | A disc with a horizontal bar knocked out. |

### 8.7 Stats — 14

| Icon | Style | Brief |
|---|---|---|
| `chartBar` | L | Four open vertical bars of varying height on one baseline stroke. |
| `chartLine` | L | An open polyline with a small closed ring at each vertex, inside an open axis frame. |
| `calendar` | L | A rounded body outline, two open top posts, a header stroke, and a grid of short strokes. |
| `streak` | L | Five open cells in a row, the first four each carrying a small tick. |
| `trophy` | L | An open cup outline with two handle strokes on a stepped base. |
| `tonnage` | L | Three plate outlines stacked in side profile, widest at the bottom. |
| `trendUp` | L | An open stroke rising left to right with an open arrowhead. |
| `trendDown` | L | The vertical mirror. |
| `trendFlat` | L | A horizontal version, same shaft weight. |
| `clock` | L | A closed ring with two open hands at 10:10. **Must not read as `timer`** — no cap, no stem. |
| `activity` | L | One open ECG stroke — flat, spike, flat. |
| `history` | L | A clock with an open counter-clockwise arrow arcing around its upper left. |
| `compare` | L | Two open bars of different height with a bracket stroke between them. |
| `export` | L | A document outline with a folded corner and an open arrow leaving its right edge. |

### 8.8 Body metrics — 5

| Icon | Style | Brief |
|---|---|---|
| `scale` | L | A bathroom scale face-on: platform outline with a closed readout ring and one needle stroke. |
| `tape` | L | An open looped band with short graduation strokes along its inner edge and a small buckle. |
| `diet` | L | A closed plate ring with one open radial divider stroke. **No cutlery** — three parallel smudges at 30px. |
| `ruler` | L | A rule outline with five graduation strokes of alternating length. |
| `bodyProfile` | L | A standing figure in side profile — detached head, open torso and leg strokes. |

### 8.9 Account & system — 10

| Icon | Style | Brief |
|---|---|---|
| `user` | L | A detached round head over an open shoulder curve. |
| `signOut` | L | An open doorway with an arrow stroke leaving it to the right. |
| `bell` | L | An open dome, a baseline stroke, a small clapper below. |
| `lock` | L | A body outline with an open shackle arc and a keyhole stroke. |
| `mail` | L | An envelope outline with an open V flap. |
| `eye` | L | A lens from two open arcs with a closed iris ring. |
| `eyeOff` | L | `eye` with a slash stroke carrying a **3u clearance gap** where it crosses the lens. |
| `cloudSynced` | L | An open cloud outline with a check inside. |
| `cloudOffline` | L | The same cloud with a slash, same clearance rule. |
| `info` | L | A closed ring with a dot over a short vertical stroke. |

### 8.10 Actions — 8

| Icon | Style | Brief |
|---|---|---|
| `edit` | L | A pencil outline at an angle, chisel tip, one ferrule stroke across it. |
| `trash` | L | A tapered bin outline with a lid stroke, a handle, two vertical rib strokes. |
| `duplicate` | L | Two offset rounded-rectangle outlines, the rear partly behind the front. |
| `dragHandle` | L | Six small closed rings in a 2×3 grid. |
| `share` | L | Three small closed rings joined by two open strokes. |
| `save` | L | A rounded square outline with a shutter block top and a label block bottom. |
| `warning` | L | A triangle outline with an open bar and a dot inside. |
| `error` | L | A closed ring with an open cross inside. **Must not read as `statusSkipped`** — outline vs solid disc. |

### 8.11 Empty states — 5

Drawn for **72px**, with up to 14 internal strokes.

| Icon | Style | Brief |
|---|---|---|
| `emptySessions` | L | An empty barbell rack: two upright strokes with cradles, **no bar** in them. |
| `emptyHistory` | L | A clock beside an empty list of three short strokes. |
| `emptyChart` | L | An open axis frame with a dashed baseline and no bars. |
| `emptyMetrics` | L | A bathroom scale outline with a blank readout ring. |
| `emptySearch` | L | A magnifier resting over an empty frame outline. |

---

## 9. Acceptance checklist

> **§9.0 and §9.1 come first.** v4 passed everything below them and was still
> unusable.

**§9.0 — Nameable**

- [ ] shown at **30px with no label**, a person can say what it is
- [ ] the eight `body*` are told apart in a row at 30px by **silhouette alone**,
      before any internal stroke is read

**§9.1 — Construction (the v4 failure)**

- [ ] the form is built from **open strokes that start and stop in round caps**
- [ ] there is **no closed outline around a body part** — no leaf, no teardrop
- [ ] closed loops appear only where the real form encloses (head, ring, wheel,
      plate, clock face)
- [ ] a head, if present, is a **detached empty circle** with a visible gap
- [ ] every internal stroke belongs to the form it sits in; nothing floats

**Format — the generator enforces these**

- [ ] `viewBox="0 0 64 64"`, no `width`/`height`
- [ ] exactly one `<path>`, no other shape elements, no `<g>`
- [ ] `fill-rule="evenodd"`, `fill="currentColor"`
- [ ] no `stroke`, no `transform`
- [ ] filename lowerCamelCase and matching the §8 name exactly
- [ ] every ribbon unioned — **no unintended holes** where two strokes cross

**Measured**

- [ ] **bounding box 52–53 u** on the dominant axis
- [ ] **ink coverage 8–12%**
- [ ] stroke **1.4–1.7 u**, visually uniform, round caps and joins
- [ ] **4–8 internal detail strokes** (≤10; ≤14 for `empty*`)
- [ ] no two parallel strokes closer than 4u, no counter under 6u

**Legibility**

- [ ] readable at **30px** on `#0F0F11`, `#17171A` and `#202024`
- [ ] readable at **30px** in `#F5F3F1`, `#FF6B2B` and `#A3A3AD`
- [ ] no glyph reads heavier or larger than its neighbours in a row at 34px
- [ ] **placed beside the eight reference glyphs, it looks like the same set**

**Named confusion pairs**

- [ ] `bodyChest` ≠ `bodyCore` (pecs, no abs · abs only, cropped below the chest)
- [ ] `bodyArmsFront` ≠ `bodyArmsBack` (two-armed figure · one raised arm)
- [ ] `bodyBack` ≠ `bodyShoulders` (full V-taper back · cropped above the ribs)
- [ ] `barbell` ≠ `dumbbell`
- [ ] `pause` ≠ `sets` · `stop` ≠ `save` · `plate` ≠ `target` · `clock` ≠ `timer`
- [ ] `error` ≠ `statusSkipped`
- [ ] `sets` ≠ a hamburger menu

---

## 10. Delivery

Drop the SVGs into `assets/icons-src/` — **not** into `_reference/` — and run:

```bash
npm run icons
```

The generator validates every file against §2 and refuses to emit anything if
one is malformed. Then open the hidden **Dev → Icons** screen in the app
(long-press the "Kinetic" wordmark on the session list) and review the matrix
from §6.

### Generation order

**Generate §8.1 — the eight `body*` — and nothing else.** Five of the eight are
"keep as drawn" against the reference; three need the re-poses named in the
table. Once that family is signed off: tabs, exercise types, chrome and status,
training/stats/metrics, then account/actions/empty states.
