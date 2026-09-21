/**
 * The outbox for finished sessions.
 *
 * Before this existed, `syncWorkout(summary)` was called fire-and-forget and
 * every failure path inside it was `console.warn(); return;`. The summary was
 * never written anywhere local. So a session finished in a basement gym with
 * no signal — or on an expired token — was **permanently lost**, and the only
 * trace was a warning in a log nobody reads. An hour of training is not a
 * thing to lose that way.
 *
 * The rule here is the one that makes the loss impossible: **persist first,
 * send second, delete only on confirmed success.** Everything else — retry
 * timing, ordering, how many attempts — is a detail. That ordering is not.
 *
 * Retries are driven by app launch and by returning to the foreground rather
 * than by a connectivity listener. Adding `@react-native-community/netinfo`
 * would drain a few seconds earlier at the cost of a native dependency and a
 * prebuild; a finished session is not urgent, it only has to survive. Opening
 * the app is the moment that matters, and it is already observable.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = '@kinetic_sync_queue';

/** Give up *sending* after this many tries — but never discard the entry. */
export const MAX_ATTEMPTS = 8;

/**
 * A client id that is unique per user without a crypto source.
 *
 * The first 12 hex digits are the session's start time in milliseconds, so two
 * of one person's sessions can only collide by starting in the same
 * millisecond, which is not a thing a human does. The rest is random, which
 * covers the multi-device case. Shaped as a v4 UUID because the column is
 * `uuid` and Postgres will reject anything else.
 */
export const clientIdFor = (startedAtMs) => {
  const ms = Number(startedAtMs) || Date.now();
  const stamp = ms.toString(16).padStart(12, '0').slice(-12);
  const r = (n) => Array.from({ length: n },
    () => Math.floor(Math.random() * 16).toString(16)).join('');
  // 8-4-4-4-12, version nibble 4, variant nibble 8..b
  const variant = '89ab'[Math.floor(Math.random() * 4)];
  return `${stamp.slice(0, 8)}-${stamp.slice(8, 12)}-4${r(3)}-${variant}${r(3)}-${r(12)}`;
};

const read = async () => {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch (e) {
    // A corrupt queue must not take the app down, but it must be loud: this
    // is the file that exists to not lose things.
    console.warn('[syncQueue] could not read queue:', e?.message ?? e);
    return [];
  }
};

const write = async (items) => {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
    return true;
  } catch (e) {
    console.warn('[syncQueue] could not write queue:', e?.message ?? e);
    return false;
  }
};

/**
 * Put a payload in the outbox. Returns the entry, or null if it could not be
 * persisted — in which case the caller should NOT pretend it is safe.
 */
export const enqueue = async (clientId, payload) => {
  const items = await read();
  if (items.some(i => i.clientId === clientId)) return items.find(i => i.clientId === clientId);

  const entry = {
    clientId,
    payload,
    queuedAt: Date.now(),
    attempts: 0,
    lastError: null,
    lastAttemptAt: null,
  };
  const ok = await write([...items, entry]);
  return ok ? entry : null;
};

export const remove = async (clientId) => {
  const items = await read();
  const next = items.filter(i => i.clientId !== clientId);
  if (next.length !== items.length) await write(next);
};

export const markAttempt = async (clientId, error) => {
  const items = await read();
  const next = items.map(i => i.clientId === clientId
    ? { ...i, attempts: i.attempts + 1, lastError: error ?? null, lastAttemptAt: Date.now() }
    : i);
  await write(next);
};

/** Everything still waiting, oldest first. */
export const pending = async () => {
  const items = await read();
  return [...items].sort((a, b) => a.queuedAt - b.queuedAt);
};

export const pendingCount = async () => (await read()).length;

/**
 * Entries that have exhausted MAX_ATTEMPTS. They stay in the queue — the point
 * is never to drop training — but they stop being retried automatically, so
 * the UI can say something rather than silently trying for ever.
 */
export const stuck = async () => (await read()).filter(i => i.attempts >= MAX_ATTEMPTS);

/** Test and recovery hook; not used by the app. */
export const clearQueue = () => AsyncStorage.removeItem(QUEUE_KEY);
