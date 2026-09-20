/**
 * Units — kilograms, and the pound shadow.
 *
 * Kinetic logs, stores and thinks in kilograms. There is no unit toggle and no
 * `weight_lb` column; `weight_kg` / `waist_cm` / `speed_kmh` are the only truth.
 *
 * Every kilogram figure on a *weight* surface carries a small pound readout
 * beside it, so a machine in a gym abroad can be set without arithmetic. It is
 * a READOUT, never an input — you cannot type into it, step it, or sort by it,
 * the way a speedometer prints mph under km/h.
 *
 * Rounding is to the nearest WHOLE POUND, deliberately — not to the nearest 2.5
 * or 5. Rounding to plate increments would state a weight you are not actually
 * lifting; picking the nearest available pin is the same call you already make
 * on a kg machine with 2.5 kg steps.
 *
 * Where it belongs, and where it does not (docs/DESIGN.md §3.5):
 *
 *   YES  per-exercise weights · e1RM · best set · last set · body weight
 *   NO   session/weekly tonnage · volume charts · body-split percentages ·
 *        the ± plate chips (a `+2.5` chip with `+5.5 lb` under it is
 *        unreadable at that size) · waist, which is a different conversion
 *
 * The rule of thumb: if you would never set a machine to it, it gets no shadow.
 */

/** Pounds per kilogram. The international avoirdupois pound, exactly. */
export const KG_TO_LB = 2.20462262;

/**
 * Kilograms → pounds, rounded to the nearest whole pound.
 * Returns null for null/undefined/non-finite input so callers can skip the
 * shadow entirely rather than render "NaN lb".
 */
export const lb = (kg) => {
  const n = typeof kg === 'number' ? kg : parseFloat(kg);
  return Number.isFinite(n) ? Math.round(n * KG_TO_LB) : null;
};

/** Kilograms → "182 lb". Empty string when there is nothing to convert. */
export const lbLabel = (kg) => {
  const v = lb(kg);
  return v == null ? '' : `${v} lb`;
};

/**
 * Kilograms → "82.5 kg" / "80 kg" — one decimal, but only when it says
 * something. A column of weights should not read 80.0, 82.5, 90.0.
 */
export const kgLabel = (kg) => {
  const n = typeof kg === 'number' ? kg : parseFloat(kg);
  if (!Number.isFinite(n)) return '';
  const rounded = Math.round(n * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} kg`;
};

/**
 * Both, on one line: "82.5 kg · 182 lb".
 *
 * For tight rows where the shadow cannot sit on its own line beneath the
 * figure. Where there IS room, render the two as separate <Text> elements so
 * the pound value can take `Typography.caption` in `Colors.textFaint` — this
 * helper cannot style half of a string.
 */
export const kgWithLb = (kg) => {
  const k = kgLabel(kg);
  if (!k) return '';
  return `${k} · ${lbLabel(kg)}`;
};
