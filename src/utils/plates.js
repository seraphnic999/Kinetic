/**
 * What to hang on each side of the bar.
 *
 * Deliberately NOT automatic. There is no equipment field on an exercise —
 * §12.3 settled body-section glyphs, not a data field — so the app cannot tell
 * a barbell bench press from a 65 kg lat pulldown, and printing plate maths
 * for a machine would be nonsense. The breakdown is therefore something you
 * ask for, on the lift where it means something, and it can never be wrong
 * about a lift where it does not.
 *
 * Greedy from the heaviest plate down, which is also how you load a bar: the
 * big ones go on first because they have to be nearest the collar.
 */

/** A commercial gym's rack, heaviest first. Kilograms, per plate. */
export const STANDARD_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

/** An Olympic bar. */
export const DEFAULT_BAR_KG = 20;

/**
 * Break `totalKg` into plates per side.
 *
 * Returns `{ ok, perSide, barKg, loadedKg, shortfallKg, reason }`:
 *
 *   ok          the total is reachable exactly with this rack
 *   perSide     plates for ONE side, heaviest first
 *   loadedKg    what the bar actually weighs with those plates
 *   shortfallKg what could not be made up — 0 when ok
 *
 * `reason` is set only when there is nothing useful to show, so the caller can
 * say something specific rather than rendering an empty row.
 */
export function platesFor(totalKg, barKg = DEFAULT_BAR_KG, rack = STANDARD_PLATES) {
  const total = Number(totalKg);
  const bar = Number(barKg);

  if (!Number.isFinite(total) || total <= 0) {
    return { ok: false, perSide: [], barKg: bar, loadedKg: 0, shortfallKg: 0, reason: 'no weight set' };
  }
  if (total < bar) {
    return { ok: false, perSide: [], barKg: bar, loadedKg: 0, shortfallKg: 0,
             reason: `lighter than the ${fmt(bar)} kg bar` };
  }
  if (total === bar) {
    return { ok: true, perSide: [], barKg: bar, loadedKg: bar, shortfallKg: 0, reason: 'just the bar' };
  }

  // Everything below works in per-side terms, which is the number you act on.
  let remainingPerSide = (total - bar) / 2;
  const perSide = [];

  // Work in whole grams to keep 2.5 + 1.25 arithmetic exact — 0.1 + 0.2 style
  // drift here would show a phantom 0.01 kg shortfall on a perfectly loadable
  // bar, which is worse than useless on a screen you are trusting.
  let remG = Math.round(remainingPerSide * 1000);
  for (const p of [...rack].sort((a, b) => b - a)) {
    const pG = Math.round(p * 1000);
    while (remG >= pG) {
      perSide.push(p);
      remG -= pG;
    }
  }

  const shortfallKg = (remG / 1000) * 2;
  const loadedKg = total - shortfallKg;

  return {
    ok: remG === 0,
    perSide,
    barKg: bar,
    loadedKg,
    shortfallKg,
    reason: null,
  };
}

/** Trailing zeros are noise: 20, not 20.0 — but 2.5 stays 2.5. */
function fmt(n) {
  const r = Math.round((Number(n) || 0) * 100) / 100;
  return Number.isInteger(r) ? String(r) : String(r);
}

/** "20 · 20 · 10 · 2.5" — one side, ready to read off. */
export const perSideLabel = (perSide) =>
  (perSide ?? []).map(fmt).join(' · ');
