# assets/icons-src

Source SVGs for the "Console" icon set. `src/components/Icon.js` is **generated**
from this directory and must never be hand-edited:

```bash
npm run icons
```

The generator validates every file against the format contract and refuses to
emit a table if anything is wrong, so a broken glyph is a build error rather
than a blank square on a phone.

## The contract, in short

- `viewBox="0 0 64 64"`, no `width`/`height`
- exactly one `<path>`, no other shape elements, no `<g>`
- `fill-rule="evenodd"` and `fill="currentColor"` on that path
- no `stroke` attribute — the line is drawn, outlined into a filled ribbon,
  then unioned into one compound path
- no `transform` — bake it into the coordinates
- filename is the icon name, lowerCamelCase: `bodyArmsFront.svg`

The full spec — style, stroke weight, geometry, the per-glyph briefs for all 92
and the acceptance checklist — is in **`docs/ICON-BRIEF.md`**. Read it before
generating anything.

## Nesting and `evenodd`

Because every glyph is one path with `fill-rule="evenodd"`, **enclosed
subpaths alternate**: depth 1 fills, depth 2 is a hole, depth 3 fills again.
That is what draws a contour — an outer outline with an inner outline inside it
is a ring, for free.

It also means **two overlapping subpaths cancel where they overlap**. A plus
sign cannot be two crossing rounded rectangles; it has to be one twelve-vertex
outline. Union the shapes before exporting.

## The three files already here

These are **reference glyphs**, not part of the 92. They exist so the pipeline
is proven end to end and so the set being drawn has something to match stroke
weight against. Each demonstrates one technique:

| File | Technique |
|---|---|
| `minus.svg` | a solid bar with true rounded terminals — the 5u stroke at full length |
| `stop.svg` | a contour ring from nested rounded rects — exterior radius 3u, interior 2u |
| `target.svg` | concentric rings plus the one solid accent, all via `evenodd` alternation |

Open the hidden **Dev → Icons** screen in the app to see them at every size on
every ground. When the real set lands, these three stay: `stop` and `target`
are both in the inventory, and `minus` is chrome.
