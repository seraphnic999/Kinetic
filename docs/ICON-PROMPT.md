# Kinetic icons — generator prompt

Give the generator **this file plus the image `icon-references/2-strong-icons-line.jpg`**.

Nothing else. The long spec (`ICON-BRIEF.md`) is for us, not for the generator —
it kept producing glyphs that satisfied its rules and looked wrong.

---

## The prompt

> Draw icons in exactly the style of the attached reference image: **simple,
> thin-line pictograms of the human body**.
>
> - **Line art only.** Every shape is an open stroke with rounded ends, the way
>   the reference draws them — a torso is two side lines and a shoulder line
>   that simply stop. No filled shapes, no closed outlines around a body part,
>   no shading.
> - **A head, where there is one, is a separate empty circle** with a small gap
>   above the shoulders. Never a face.
> - **Four to eight short internal lines** for muscle detail, and no more.
> - Draw each icon **as large as it will go** in its canvas, centred.
> - One icon per file.
>
> **File format**
>
> - SVG, `viewBox="0 0 64 64"`, no `width` or `height` attributes
> - `fill="none"`, `stroke="currentColor"`, `stroke-width="1.5"`,
>   `stroke-linecap="round"`, `stroke-linejoin="round"`
> - Any number of `<path>`, `<circle>`, `<line>`, `<polyline>` elements
> - No `transform` attributes — bake positions into the coordinates
> - Filename is the icon name exactly, e.g. `bodyChest.svg`
>
> **Draw these eight:**
>
> ```
> bodyChest       front torso, chest muscles, no abs
> bodyBack        back torso, V-taper, spine line and lat lines
> bodyShoulders   shoulders and traps only, cropped above the ribs
> bodyArmsFront   figure with both arms raised and flexed
> bodyArmsBack    one arm raised overhead and bent back at the elbow
> bodyLegs        legs from hip to feet, front view
> bodyCore        midsection only, ribs to hips, abs grid
> bodyOther       whole standing figure, arms out
> ```
>
> Make the eight clearly different from each other at small size. In
> particular: `bodyChest` has no abs and `bodyCore` has no chest;
> `bodyArmsBack` is one arm where `bodyArmsFront` is two.

---

## Why it is this short

Two of the three things earlier briefs spent most of their words on are now
enforced by `scripts/generate-icons.mjs` instead, so the generator cannot get
them wrong:

| | Who handles it now |
|---|---|
| **Glyph size / frame fill** | The generator measures every glyph and rescales it to fill 53 of the 64 units, then centres it. Draw at any size. |
| **Stroke width** | Line glyphs are emitted as stroked paths and rendered at one constant width for the whole set. The `1.5` in the prompt is only so the source looks right when you open it. |
| **Format tolerance** | Multiple elements, circles, polylines and lines are all folded into one path automatically. |

So the prompt only has to carry the drawing.

`npm run icons` reports every rescale it applied — if it says a glyph was
rescaled by more than about ±30%, that glyph was drawn at an odd size and is
worth a look, but it will still come out uniform.

## After a batch arrives

```bash
cp ~/Downloads/<batch>/*.svg assets/icons-src/
npm run icons
```

Then long-press the "Kinetic" wordmark on the session list to open
**Dev → Icons** and check the set at 30 / 34 / 38 px on all three grounds.

The only two questions that matter there:

1. **Can you name each glyph with no label at 30px?**
2. **Are the eight clearly different from each other in a row?**

## The rest of the set

Once these eight are signed off, the same prompt works for the other 92 —
swap the eight-name block for the next group from `ICON-LIST.txt`, and take
the per-glyph subjects from `ICON-BRIEF.md` §8. Keep the style paragraph and
the file-format block exactly as they are.
