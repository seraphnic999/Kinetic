/**
 * Export the whole training history as CSV.
 *
 * `generateCsv.js` builds a rich report for ONE session from its in-memory
 * summary, and it is only reachable on the Summary screen — which you see once,
 * right after training, and can never return to. Historic sessions could not be
 * exported at all.
 *
 * This is the other shape: one flat row per exercise across every synced
 * session, which is what you want in a spreadsheet. Both exist on purpose.
 */
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { supabase } from '../config/supabase';
import { lb } from './units';

const esc = (v) => {
  const s = String(v ?? '');
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? `"${s.replace(/"/g, '""')}"` : s;
};
const row = (...cells) => cells.map(esc).join(',');

const HEADER = [
  'session_date', 'session_name', 'session_duration_secs',
  'perf_order', 'exercise_type', 'exercise_name', 'body_section', 'status',
  'weight_kg', 'weight_lb', 'sets_planned', 'sets_completed', 'reps',
  'volume_kg', 'duration_secs', 'cardio_type', 'speed_kmh', 'incline_pct',
  'intervals_planned', 'intervals_done',
];

/**
 * @returns {Promise<{ csv: string, sessions: number, rows: number }>}
 */
export async function buildHistoryCsv() {
  const { data: { session: auth } } = await supabase.auth.getSession();
  if (!auth) throw new Error('Not signed in.');

  const { data, error } = await supabase
    .from('workout_sessions')
    .select(`
      id, name, started_at, duration_secs,
      workout_exercises (
        exercise_type, exercise_name, body_section, status, perf_order,
        weight_kg, sets_planned, sets_completed, reps, duration_secs,
        cardio_type, speed_kmh, incline_pct, intervals_planned, intervals_done,
        load_type, bar_kg
      )
    `)
    .order('started_at', { ascending: false });

  if (error) throw new Error(error.message);

  const lines = [row(...HEADER)];
  let rows = 0;

  for (const s of data ?? []) {
    const exercises = (s.workout_exercises ?? [])
      .slice()
      .sort((a, b) => (a.perf_order ?? 0) - (b.perf_order ?? 0));

    // A session with no exercise rows still belongs in the export — otherwise
    // "12 sessions" in the app and 11 in the spreadsheet is an unexplained gap.
    if (!exercises.length) {
      lines.push(row(s.started_at, s.name, s.duration_secs, '', '', '', '', '',
                     '', '', '', '', '', '', '', '', '', '', '', ''));
      rows += 1;
      continue;
    }

    for (const e of exercises) {
      const volume = e.exercise_type === 'regular'
        ? (e.weight_kg || 0) * (e.sets_completed || 0) * (e.reps || 0)
        : '';
      lines.push(row(
        s.started_at, s.name, s.duration_secs,
        e.perf_order, e.exercise_type, e.exercise_name, e.body_section, e.status,
        e.weight_kg, e.weight_kg != null ? lb(e.weight_kg) : '',
        e.sets_planned, e.sets_completed, e.reps,
        volume === '' ? '' : Math.round(volume),
        e.duration_secs, e.cardio_type, e.speed_kmh, e.incline_pct,
        e.intervals_planned, e.intervals_done,
      ));
      rows += 1;
    }
  }

  return { csv: lines.join('\n'), sessions: (data ?? []).length, rows };
}

/** Build the CSV and hand it to the share sheet (or download it, on web). */
export async function shareHistoryCsv() {
  const { csv, sessions, rows } = await buildHistoryCsv();
  const filename = `kinetic_history_${new Date().toISOString().slice(0, 10)}.csv`;

  if (Platform.OS === 'web') {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    return { sessions, rows };
  }

  const file = new File(Paths.cache, filename);
  file.write(csv);
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    dialogTitle: 'Export training history',
  });
  return { sessions, rows };
}
