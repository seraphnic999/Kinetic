/**
 * Sound utilities for Kinetic.
 * Uses expo-audio (SDK 56+) instead of the deprecated expo-av.
 *
 * Three sounds:
 *   beep_rest.wav     — ascending two-tone, played when rest timer OR warmup expires
 *   beep_interval.wav — short pip, played on each interval phase change
 *   beep_complete.wav — "ta-da" fanfare, played when a training session finishes
 */
import { Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

let _restPlayer     = null;
let _intervalPlayer = null;
let _completePlayer = null;

export const initAudio = async () => {
  if (Platform.OS === 'web') return; // web uses AudioContext (handled per-play)
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,        // Android: play even when ringer is silent/vibrate
      interruptionMode: 'mixWithOthers', // don't steal audio focus for short UI beeps
      shouldPlayInBackground: false,
    });
  } catch (e) {
    console.warn('[sounds] setAudioModeAsync failed:', e);
  }
};

export const loadSounds = async () => {
  if (Platform.OS === 'web') return;
  try {
    _restPlayer = createAudioPlayer(require('../../assets/beep_rest.wav'));
  } catch (e) {
    console.warn('[sounds] Could not create rest beep player:', e);
  }
  try {
    _intervalPlayer = createAudioPlayer(require('../../assets/beep_interval.wav'));
  } catch (e) {
    console.warn('[sounds] Could not create interval beep player:', e);
  }
  try {
    _completePlayer = createAudioPlayer(require('../../assets/beep_complete.wav'));
  } catch (e) {
    console.warn('[sounds] Could not create complete fanfare player:', e);
  }
};

export const unloadSounds = async () => {
  try { _restPlayer?.remove();     } catch (_) {}
  try { _intervalPlayer?.remove(); } catch (_) {}
  try { _completePlayer?.remove(); } catch (_) {}
  _restPlayer     = null;
  _intervalPlayer = null;
  _completePlayer = null;
};

// ─── Web Audio API beep helper ────────────────────────────────────────────────
let _audioCtx = null;
const _getCtx = () => {
  if (Platform.OS !== 'web') return null;
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return _audioCtx;
  } catch (_) { return null; }
};

const _webBeep = (freq, duration, vol = 0.5, startOffset = 0) => {
  const ctx = _getCtx();
  if (!ctx) return;
  const startAt = ctx.currentTime + startOffset;
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, startAt);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.start(startAt);
  osc.stop(startAt + duration);
};

// ─── Public play functions ────────────────────────────────────────────────────

/** Rest timer or warmup expired — ascending two-tone */
export const playRestBeep = async () => {
  if (Platform.OS === 'web') {
    _webBeep(880,  0.28, 0.75);
    setTimeout(() => _webBeep(1100, 0.42, 0.75), 280);
    return;
  }
  try {
    if (_restPlayer) {
      await _restPlayer.seekTo(0);
      _restPlayer.play();
    }
  } catch (e) {
    console.warn('[sounds] playRestBeep failed:', e);
  }
};

/** Interval phase change — short sharp pip */
export const playIntervalBeep = async () => {
  if (Platform.OS === 'web') {
    _webBeep(1320, 0.22, 0.75);
    return;
  }
  try {
    if (_intervalPlayer) {
      await _intervalPlayer.seekTo(0);
      _intervalPlayer.play();
    }
  } catch (e) {
    console.warn('[sounds] playIntervalBeep failed:', e);
  }
};

/** Session finished — "ta-da" fanfare */
export const playCompleteSound = async () => {
  if (Platform.OS === 'web') {
    // Quick ascending arpeggio + held bright chord, mirrors the native WAV
    _webBeep(523.25, 0.15, 0.6, 0);     // C5
    _webBeep(659.25, 0.15, 0.6, 0.085); // E5
    _webBeep(783.99, 0.15, 0.6, 0.17);  // G5
    _webBeep(1046.50, 0.5, 0.55, 0.255);// C6 (held)
    _webBeep(1318.51, 0.5, 0.4, 0.255); // E6
    _webBeep(1567.98, 0.5, 0.35, 0.255);// G6
    return;
  }
  try {
    if (_completePlayer) {
      await _completePlayer.seekTo(0);
      _completePlayer.play();
    }
  } catch (e) {
    console.warn('[sounds] playCompleteSound failed:', e);
  }
};
