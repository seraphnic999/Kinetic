# Icon prompts — the remaining 92 glyphs

One file per batch in `docs/icon-prompts/`, each self-contained: paste the
file, attach `docs/icon-references/0-house-style.png`, done.

`0-house-style.png` is a contact sheet of your own approved eight — using it
as the reference means every future batch is matched against the set that is
already in the app, not against a stock image.

| Batch | Glyphs | Mode |
|---|---|---|
| [`01-nav.txt`](icon-prompts/01-nav.txt) — Navigation | 8 | line |
| [`02-chrome.txt`](icon-prompts/02-chrome.txt) — Chrome actions | 8 | line |
| [`03-exercise.txt`](icon-prompts/03-exercise.txt) — Exercise types | 8 | line |
| [`04-tabs.txt`](icon-prompts/04-tabs.txt) — Tab bar | 4 | line |
| [`05-solid.txt`](icon-prompts/05-solid.txt) — Solid glyphs | 9 | solid |
| [`06-trainingA.txt`](icon-prompts/06-trainingA.txt) — Training A | 7 | line |
| [`07-trainingB.txt`](icon-prompts/07-trainingB.txt) — Training B | 6 | line |
| [`08-statsA.txt`](icon-prompts/08-statsA.txt) — Stats A | 7 | line |
| [`09-statsB.txt`](icon-prompts/09-statsB.txt) — Stats B | 7 | line |
| [`10-metrics.txt`](icon-prompts/10-metrics.txt) — Body metrics | 5 | line |
| [`11-account.txt`](icon-prompts/11-account.txt) — Account and system | 10 | line |
| [`12-actions.txt`](icon-prompts/12-actions.txt) — Actions | 8 | line |
| [`13-empty.txt`](icon-prompts/13-empty.txt) — Empty states | 5 | line |

**Total 92.** The eight `body*` glyphs are already done and installed.

## After each batch

```bash
cp ~/Downloads/<batch>/*.svg assets/icons-src/
npm run icons
```

Scale and stroke weight are normalised by the generator, so a batch that
comes back at the wrong size or weight still lands consistent. What to check
on the Dev → Icons screen is only: can you name each glyph at 30px, and are
the ones in a group clearly different from each other.

## Suggested order

`02-chrome`, `01-nav` and `12-actions` first — the most conventional shapes,
so they confirm the prompt works before anything harder. `05-solid` last: it
is the only batch in a different mode.
