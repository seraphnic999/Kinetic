/**
 * App preferences — the handful of settings the You tab owns.
 *
 * Local only, on purpose: these are device behaviours (how loud, how long you
 * rest, whether a notification fires), not account data, and syncing them would
 * mean a phone changing how a tablet behaves.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@kinetic_prefs';

export const DEFAULTS = {
  /** Seconds of rest started automatically after a set is marked done. */
  restTimerSecs: 60,
  /** Beep on rest end and interval phase changes. */
  sounds: true,
  /** Fire a system notification when a timer finishes while backgrounded. */
  notifications: true,
};

let cache = null;

export async function getPrefs() {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

export async function setPref(key, value) {
  const next = { ...(await getPrefs()), [key]: value };
  cache = next;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // A failed write is not worth interrupting anyone over; the in-memory
    // value still applies for this run.
  }
  return next;
}

/**
 * Synchronous read for call sites that cannot await — returns the last loaded
 * value, or the defaults if nothing has been read yet. Always call `getPrefs()`
 * once at startup so this is warm.
 */
export const peekPrefs = () => cache ?? DEFAULTS;
