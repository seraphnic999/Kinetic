/**
 * Training-session store — offline-first.
 *
 * Sessions live in Supabase (`kinetic.training_sessions`) so they show up on
 * the web dashboard and follow the account across devices, and are mirrored
 * into AsyncStorage so the app opens, edits and trains with no connectivity.
 *
 * The cache is the app's read path: every screen reads it without touching the
 * network. `syncSessions()` reconciles it with the server in the background.
 *
 * Reconciliation is last-write-wins on `updatedAt` (epoch ms, stamped by
 * whichever device made the edit). Deletes are tombstones — a record with
 * `deletedAt` set — so a device that has been offline can tell "this row was
 * never pushed" (absent on the server) from "this row was deleted elsewhere"
 * (present with a tombstone). Tombstones stay in the cache; only the read
 * helpers filter them out.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabase';

const SESSIONS_KEY = '@kinetic_sessions';

export const generateId = () =>
  `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

// ── Record normalisation ──────────────────────────────────────────────────────
// Sessions saved before this store existed have neither `updatedAt` nor
// `syncedAt`; they read as edited-at-creation and never-pushed, which makes the
// first sync upload them.
const normalize = (s) => ({
  id:            s.id,
  name:          s.name ?? 'Session',
  exercises:     s.exercises ?? [],
  restTimerSecs: s.restTimerSecs ?? 60,
  createdAt:     s.createdAt ?? Date.now(),
  updatedAt:     s.updatedAt ?? s.createdAt ?? Date.now(),
  syncedAt:      s.syncedAt ?? null,
  deletedAt:     s.deletedAt ?? null,
});

/**
 * The newer of two versions of the same session. On an identical edit stamp the
 * tie-break is `syncedAt`, so the copy that knows the server already has this
 * edit wins — otherwise a confirmed push would be folded back into a pending
 * one and re-uploaded forever.
 */
const newer = (a, b) => {
  if (b.updatedAt !== a.updatedAt) return b.updatedAt > a.updatedAt ? b : a;
  return (b.syncedAt ?? 0) > (a.syncedAt ?? 0) ? b : a;
};

const byCreatedAt = (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0);

const live = (records) => records.filter(s => !s.deletedAt).sort(byCreatedAt);

// ── Cache ─────────────────────────────────────────────────────────────────────

/** Every cached record, tombstones included. */
const readCache = async () => {
  try {
    const json = await AsyncStorage.getItem(SESSIONS_KEY);
    return json ? JSON.parse(json).map(normalize) : [];
  } catch (e) {
    console.warn('[storage] readCache failed:', e?.message ?? e);
    return [];
  }
};

/**
 * Fold `records` into whatever the cache holds right now, keeping the newer
 * version of each session. Re-reading at write time keeps a slow sync from
 * clobbering an edit the user made while it was in flight.
 */
const mergeIntoCache = async (records) => {
  const merged = new Map();
  for (const r of await readCache()) merged.set(r.id, r);
  for (const r of records) {
    const cur = merged.get(r.id);
    merged.set(r.id, cur ? newer(cur, r) : r);
  }
  const all = [...merged.values()];
  try {
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(all));
  } catch (e) {
    console.warn('[storage] writeCache failed:', e?.message ?? e);
  }
  return all;
};

// ── Public read/write API ─────────────────────────────────────────────────────

/** Live (non-deleted) sessions, oldest first — the list the UI renders. */
export const loadSessions = async () => live(await readCache());

/**
 * Create or update one session. Writes the cache first so the UI and a
 * subsequent training run are correct offline, then pushes in the background.
 */
export const upsertSession = async (session) => {
  const record = normalize({ ...session, updatedAt: Date.now(), syncedAt: null });
  const all = await mergeIntoCache([record]);
  pushPending(all);           // fire-and-forget; on failure it stays pending
  return record;
};

/** Tombstone a session locally, then push the tombstone. */
export const deleteSession = async (id) => {
  const existing = (await readCache()).find(s => s.id === id);
  if (!existing) return;
  const now = Date.now();
  const all = await mergeIntoCache([
    { ...existing, deletedAt: now, updatedAt: now, syncedAt: null },
  ]);
  pushPending(all);
};

/** Drop every cached session — on sign-out, so the next account starts clean. */
export const clearSessionCache = async () => {
  try {
    await AsyncStorage.removeItem(SESSIONS_KEY);
  } catch (e) {
    console.warn('[storage] clearSessionCache failed:', e?.message ?? e);
  }
};

// ── Supabase sync ─────────────────────────────────────────────────────────────

const toRow = (r, userId) => ({
  id:              r.id,
  user_id:         userId,
  name:            r.name,
  exercises:       r.exercises,
  rest_timer_secs: r.restTimerSecs,
  created_at:      new Date(r.createdAt).toISOString(),
  updated_at:      new Date(r.updatedAt).toISOString(),
  deleted_at:      r.deletedAt ? new Date(r.deletedAt).toISOString() : null,
});

const fromRow = (row) => ({
  id:            row.id,
  name:          row.name,
  exercises:     row.exercises ?? [],
  restTimerSecs: row.rest_timer_secs ?? 60,
  createdAt:     Date.parse(row.created_at),
  updatedAt:     Date.parse(row.updated_at),
  syncedAt:      Date.parse(row.updated_at),   // by definition, what the server holds
  deletedAt:     row.deleted_at ? Date.parse(row.deleted_at) : null,
});

const currentUserId = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
};

/**
 * Upload every record whose local edit is newer than what the server last
 * confirmed. Silent on failure — those records stay pending and the next sync
 * (or the next edit) retries them.
 */
async function pushPending(records) {
  const pending = records.filter(r => r.syncedAt == null || r.updatedAt > r.syncedAt);
  if (pending.length === 0) return;

  const userId = await currentUserId();
  if (!userId) return;   // signed out — keep them pending for the next sign-in

  const { error } = await supabase
    .from('training_sessions')
    .upsert(pending.map(r => toRow(r, userId)), { onConflict: 'user_id,id' });

  if (error) {
    console.warn('[storage] push failed:', error.message);
    return;
  }
  await mergeIntoCache(pending.map(r => ({ ...r, syncedAt: r.updatedAt })));
}

/**
 * Two-way reconcile with Supabase, then return the live sessions.
 * Falls back to the cache on any failure, so a caller can await it on a screen
 * that still has to work on a gym Wi-Fi dead spot.
 */
export const syncSessions = async () => {
  const local = await readCache();

  const userId = await currentUserId();
  if (!userId) return live(local);

  let remoteRows;
  try {
    const { data, error } = await supabase
      .from('training_sessions')
      .select('id,name,exercises,rest_timer_secs,created_at,updated_at,deleted_at');
    if (error) throw error;
    remoteRows = data ?? [];
  } catch (e) {
    console.warn('[storage] pull failed, staying on cache:', e?.message ?? e);
    await pushPending(local);   // may fail too; harmless
    return live(local);
  }

  const merged = new Map(remoteRows.map(row => [row.id, fromRow(row)]));
  const toPush = [];

  for (const l of local) {
    const r = merged.get(l.id);
    // Absent on the server, and deletes are tombstones, so a missing row was
    // simply never pushed.
    if (!r || l.updatedAt > r.updatedAt) {
      merged.set(l.id, l);
      toPush.push(l);
    }
  }

  const all = await mergeIntoCache([...merged.values()]);
  if (toPush.length > 0) await pushPending(toPush);

  return live(all);
};
