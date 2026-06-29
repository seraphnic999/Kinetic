/**
 * Sound utilities for Kinetic.
 * Uses expo-audio (SDK 56+) instead of the deprecated expo-av.
 *
 * Two sounds:
 *   beep_rest.wav     — ascending two-tone, played when rest timer expires
 *   beep_interval.wav — short pip, played on each interval phase change
 */
import { Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

let _restPlayer     = null;
let _intervalPlayer = null;

export const initAudio = async () => {
  if (Platform.OS === 'web') return; // web uses AudioContext (handled per-play)
  try {
    await setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
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
};

export const unloadSounds = async () => {
  try { _restPlayer?.remove();     } catch (_) {}
  try { _intervalPlayer?.remove(); } catch (_) {}
  _restPlayer     = null;
  _intervalPlayer = null;
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

const _webBeep = (freq, duration, vol = 0.5) => {
  const ctx = _getCtx();
  if (!ctx) return;
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
};

// ─── Public play functions ────────────────────────────────────────────────────

/** Rest timer expired — ascending two-tone */
export const playRestBeep = async () => {
  if (Platform.OS === 'web') {
    _webBeep(880,  0.28, 0.75);
    setTimeout(() => _webBeep(1100, 0.42, 0.75), 280);
    return;
  }
  try {
    if (_restPlayer) {
      _restPlayer.seekTo(0);
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
      _intervalPlayer.seekTo(0);
      _intervalPlayer.play();
    }
  } catch (e) {
    console.warn('[sounds] playIntervalBeep failed:', e);
  }
};
