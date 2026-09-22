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
    // shouldShowAlert is deprecated in SDK 56 and shouldShowBanner /
    // shouldShowList are REQUIRED — the old shape left both unset, so
    // foreground presentation was whatever the default happened to be.
    shouldShowBanner: false,
    shouldShowList:   false,
    shouldPlaySound:  false,
    shouldSetBadge:   false,
  }),
});

/**
 * Android notification channels — one per sound.
 *
 * On Android 8 and above the SOUND IS A PROPERTY OF THE CHANNEL, not of the
 * notification. `content.sound` is simply ignored there. No channels were ever
 * created, so every timer that fired in the background used whatever the
 * default channel plays — not the bundled beeps, and on some devices nothing
 * at all. The custom WAVs have been shipped in the APK and unused.
 *
 * A channel's settings are also FROZEN after creation: Android keeps the
 * user's version, and re-creating with the same id changes nothing. So the ids
 * carry a version suffix — changing a sound later means a new id, not an edit.
 */
const CHANNELS = {
  'beep_rest.wav':     { id: 'rest-v1',     name: 'Rest timer' },
  'beep_interval.wav': { id: 'interval-v1', name: 'Interval changes' },
  'beep_complete.wav': { id: 'complete-v1', name: 'Timer complete' },
};

let _channelsReady = false;

export const ensureNotificationChannels = async () => {
  if (Platform.OS !== 'android' || _channelsReady) return;
  try {
    for (const [sound, { id, name }] of Object.entries(CHANNELS)) {
      await Notifications.setNotificationChannelAsync(id, {
        name,
        importance: Notifications.AndroidImportance.HIGH,
        sound,                       // the bundled WAV, by filename
        vibrationPattern: [0, 250, 150, 250],
        // A rest timer finishing is the whole point of the notification, so it
        // should arrive even when the phone is set to show nothing on the lock
        // screen — the screen is usually face-down on a bench.
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        enableVibrate: true,
      });
    }
    _channelsReady = true;
  } catch (e) {
    console.warn('[notifications] channel setup failed:', e);
  }
};

let _permissionGranted = false;

export const requestNotificationPermissions = async () => {
  if (Platform.OS === 'web') { _permissionGranted = false; return; }
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    _permissionGranted = status === 'granted';
    if (_permissionGranted) await ensureNotificationChannels();
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
        // iOS reads this; Android ignores it and uses the channel's sound.
        sound: soundFile,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      // expo-notifications 56 rejects a bare { seconds } trigger — it needs an
      // explicit type. Without it EVERY timer notification failed to schedule
      // and the only trace was a console warning, so rest, warmup, interval
      // and cardio alerts have all been silently dead in the background.
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.ceil(seconds),
        repeats: false,
        // Without this the notification lands on the default channel and the
        // bundled sound never plays, however correctly it is named above.
        channelId: CHANNELS[soundFile]?.id ?? CHANNELS['beep_rest.wav'].id,
      },
    });
    return id;
  } catch (e) {
    console.warn('[notifications] schedule failed:', e);
    return null;
  }
};

/**
 * Cancel a previously scheduled notification (e.g. timer completed in-app).
 * Accepts either an identifier or the still-pending promise returned by
 * scheduleTimerNotification, so a timer stopped within milliseconds of starting
 * still gets its notification cancelled once scheduling resolves.
 */
export const cancelTimerNotification = async (idOrPending) => {
  const id = await idOrPending;
  if (!id) return;
  try { await Notifications.cancelScheduledNotificationAsync(id); } catch (_) {}
};

/** Cancel every pending timer notification (call on session end). */
export const cancelAllTimerNotifications = async () => {
  try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch (_) {}
};
