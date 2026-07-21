/**
 * Generates a human-readable CSV training report from a session summary.
 *
 * Structure:
 *   Section 1 — Session header (name, date, duration)
 *   Section 2 — Timeline (every action with elapsed time + set duration)
 *   Section 3 — Exercise breakdown (per-exercise stats)
 */
import { formatTime } from './time';

// CSV-escape a value: wrap in quotes if it contains commas, quotes, or newlines
const esc = (v) => {
  const s = String(v ?? '');
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? `"${s.replace(/"/g, '""')}"`
    : s;
};
const row = (...cells) => cells.map(esc).join(',');

const ACTION_LABEL = {
  session_start:  'Session Started',
  session_end:    'Session Ended',
  warmup_start:   'Warmup Started',
  warmup_end:     'Warmup Complete',
  rest_start:     'Rest Started',
  rest_end:       'Rest Over',
  set_start:      'Set Started',
  set_done:       'Set Done',
  interval_phase: 'Interval Phase Change',
  intervals_done: 'Intervals Complete',
};

export function generateTrainingCsv(summary) {
  const lines = [];
  const startDate = new Date(summary.startTime ?? Date.now());

  // ── Section 1: Header ─────────────────────────────────────────────────────
  lines.push('KINETIC TRAINING REPORT');
  lines.push(row('Session', summary.sessionName ?? 'Session'));
  lines.push(row('Date',     startDate.toLocaleDateString('en', { weekday:'long', year:'numeric', month:'long', day:'numeric' })));
  lines.push(row('Start',    startDate.toLocaleTimeString('en', { hour:'2-digit', minute:'2-digit' })));
  lines.push(row('Duration', formatTime(summary.totalDurationSecs ?? 0)));
  lines.push(row('Exercises', `${(summary.exercises ?? []).filter(e => e.status === 'complete').length} / ${(summary.exercises ?? []).length} complete`));
  lines.push('');

  // ── Section 2: Timeline ───────────────────────────────────────────────────
  const tl = summary.timeline ?? [];
  if (tl.length) {
    lines.push('TIMELINE');
    lines.push(row('Elapsed', 'Event', 'Exercise', 'Body Section', 'Details'));
    for (const ev of tl) {
      const elapsed  = formatTime(ev.t ?? 0);
      const label    = ACTION_LABEL[ev.action] ?? ev.action;
      const exName   = ev.exerciseName ?? '';
      const bodySec  = ev.bodySection  ?? '';
      let detail = '';

      if (ev.action === 'set_start') {
        detail = `Set #${ev.setNumber ?? '?'}`;
      }
      if (ev.action === 'set_done') {
        const parts = [];
        if (ev.weight  != null) parts.push(`${ev.weight}kg`);
        if (ev.reps    != null) parts.push(`${ev.reps} reps`);
        parts.push(`Set #${ev.setNumber ?? '?'} (${ev.setsLeft ?? '?'} left)`);
        if (ev.durationSecs != null) parts.push(`Duration: ${ev.durationSecs}s`);
        detail = parts.join(' • ');
      }
      if (ev.action === 'rest_start')   detail = ev.durationSecs ? `${ev.durationSecs}s` : '';
      if (ev.action === 'warmup_start') detail = ev.durationSecs ? `${formatTime(ev.durationSecs)} planned` : '';
      if (ev.action === 'interval_phase') {
        const total = (ev.repsDone ?? 0) + (ev.repsLeft ?? 0);
        detail = `→ ${ev.phase ?? ''} · Rep ${ev.repsDone ?? '?'}/${total}`;
      }

      lines.push(row(elapsed, label, exName, bodySec, detail));
    }
    lines.push('');
  }

  // ── Section 3: Exercises ──────────────────────────────────────────────────
  lines.push('EXERCISES');
  lines.push(row('#', 'Name', 'Type', 'Body Section', 'Status', 'Sets Done', 'Sets Planned', 'Weight (kg)', 'Reps', 'Notes'));

  (summary.exercises ?? []).forEach((ex, i) => {
    const status = { complete:'Complete', partial:'Partial', pending:'Skipped' }[ex.status] ?? ex.status;
    const num = i + 1;

    if (ex.type === 'regular') {
      lines.push(row(num, ex.name, 'Regular', ex.bodySection ?? '', status,
        ex.completedSets ?? '', ex.plannedSets ?? '', ex.weight ?? '', ex.reps ?? '', ''));
    } else if (ex.type === 'warmup') {
      lines.push(row(num, `Warmup — ${ex.warmupType ?? ''}`, 'Warmup', '', status,
        '', '', '', '', formatTime(ex.plannedDurationSecs ?? 0)));
    } else if (ex.type === 'intervals') {
      lines.push(row(num, 'Intervals', 'Intervals', '', status,
        ex.completedReps ?? '', ex.plannedReps ?? '', '', '',
        `${ex.intervalLengthSecs ?? '?'}s run per interval`));
    } else if (ex.type === 'combo') {
      lines.push(row(num, ex.name ?? 'Combo', 'Combo', '', status,
        ex.completedSets ?? '', ex.plannedSets ?? '', '', '', ''));
      (ex.subExercises ?? []).forEach(sub => {
        lines.push(row('', `  → ${sub.name ?? ''}`, '', sub.bodySection ?? '',
          '', '', '', sub.weight ?? '', sub.reps ?? '', ''));
      });
    }
  });

  return lines.join('\n');
}
