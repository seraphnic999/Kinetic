/**
 * Should you add weight this time?
 *
 * The rule, chosen deliberately over an e1RM-trend model: **if you completed
 * every planned set at the target reps last time, suggest one plate pair more.**
 *
 * It is not the cleverest rule. It is the one you can predict. A suggestion is
 * only worth anything if you can tell in advance what it will say and disagree
 * with it — a trend model that occasionally says "hold" for reasons you cannot
 * reconstruct trains you to ignore the number, and an ignored suggestion is
 * worse than none, because it still takes up the space.
 *
 * It suggests. It never sets, never blocks, and never reproaches you for not
 * taking it. The caller pre-fills on tap; that is the whole interaction.
 */

/** One plate pair on the smallest plates most racks carry. */
export const STEP_KG = 2.5;

/**
 * @param last        the cached entry from exerciseHistory: `{ weightKg, reps,
 *                    setsPlanned, setsCompleted, dayKey }`, or null
 * @param targetReps  this session's planned reps for the exercise
 *
 * Returns `{ suggest, weightKg, reason }`:
 *   suggest   true when there is a bump worth offering
 *   weightKg  the weight to offer (only meaningful when `suggest`)
 *   reason    short, human, and always the ACTUAL reason — shown to you
 */
export function overloadSuggestion(last, targetReps, currentKg = null) {
  if (!last || !(last.weightKg > 0)) {
    return { suggest: false, weightKg: null, reason: null };
  }

  const planned   = Number(last.setsPlanned);
  const completed = Number(last.setsCompleted);
  const reps      = Number(last.reps);
  const target    = Number(targetReps);

  // Sessions logged before sets were carried through the engine have no set
  // counts. Staying silent is right: inventing a suggestion from half the
  // evidence is how a feature stops being trustworthy.
  if (!(planned > 0) || !Number.isFinite(completed)) {
    return { suggest: false, weightKg: null, reason: null };
  }

  if (completed < planned) {
    return {
      suggest: false, weightKg: null,
      reason: `${completed} of ${planned} sets last time`,
    };
  }

  // Reps are compared against THIS session's target, not last session's, so
  // dropping the rep scheme on purpose (5×5 after 3×10) does not read as a
  // failure and silently suppress the suggestion for weeks.
  if (Number.isFinite(target) && target > 0 && Number.isFinite(reps) && reps < target) {
    return {
      suggest: false, weightKg: null,
      reason: `${reps} reps last time, ${target} planned`,
    };
  }

  const next = Math.round((last.weightKg + STEP_KG) * 100) / 100;

  // Never suggest going backwards. The weight loaded now can already be above
  // last session's — a template that was edited, or a weight raised earlier in
  // this very session — and "use 102.5 kg" under a field reading 120 is not a
  // suggestion, it is the app telling you to undo your own progress.
  if (Number.isFinite(Number(currentKg)) && Number(currentKg) >= next) {
    return { suggest: false, weightKg: null, reason: null };
  }

  return {
    suggest: true,
    weightKg: next,
    reason: planned === 1 ? 'you hit it last time' : `you hit all ${planned} sets last time`,
  };
}
