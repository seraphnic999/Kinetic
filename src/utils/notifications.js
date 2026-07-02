/**
 * Scheduled local notification helpers for Kinetic timer expiry.
 *
 * When timers expire while the app is backgrounded (screen locked,
 * different app open, etc.) the JS runtime is suspended and our
 * in-app sounds can't play. Scheduling a local notification fires the
 * OS-level alarm at the exact expiry timestamp, producing an audible
 * alert even with the screen off.
 *
 * The custom WAV files bundled via the expo-notifications plugin are
 * used as the notification sound, so users hear the same audio cue
 * whether the app is foregrounded or backgrounded.
 *
 * Lifecycle:
 *   - Schedule when a timer STARTS
 *   - Cancel if the timer completes while foregrounded (in-app sound
 *     plays instead, notification would be redundant)
 *   - Cancel when the timer is manually stopped/reset
 *   - cancel ALL on session end
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure how notifications appear when the app IS in the foreground.
// We set this to 'none' because we play in-app sounds ourselves — the
// notification is only needed for the backgrounded case.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge:  false,
  }),
});

let _permissionGranted = false;

export const requestNotificationPermissions = async () => {
  if (Platform.OS === 'web') { _permissionGranted = false; return; }
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    _permissionGranted = status === 'granted';
  } catch (e) {
    console.warn('[notifications] permission request failed:', e);
    _permissionGranted = false;
  }
};

/**
 * Schedule a local notification to fire `seconds` from now.
 * Returns the notification identifier (pass to cancelTimerNotification).
 * Returns null if permissions not granted or on web.
 */
export const scheduleTimerNotification = async (seconds, body, soundFile = 'beep_rest.wav') => {
  if (!_permissionGranted || Platform.OS === 'web' || seconds <= 0) return null;
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Kinetic',
        body,
        sound: soundFile,   // must match filename declared in app.json plugin sounds array
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: { seconds: Math.ceil(seconds), repeats: false },
    });
    return id;
  } catch (e) {
    console.warn('[notifications] schedule failed:', e);
    return null;
  }
};

/** Cancel a previously scheduled notification (e.g. timer completed in-app). */
export const cancelTimerNotification = async (id) => {
  if (!id) return;
  try { await Notifications.cancelScheduledNotificationAsync(id); } catch (_) {}
};

/** Cancel every pending timer notification (call on session end). */
export const cancelAllTimerNotifications = async () => {
  try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch (_) {}
};
