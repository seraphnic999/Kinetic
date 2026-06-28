import { Audio } from 'expo-av';

let _restSound = null;
let _intervalSound = null;

export const initAudio = async () => {
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: false,
    });
  } catch (e) {
    console.warn('[sounds] setAudioModeAsync failed:', e);
  }
};

export const loadSounds = async () => {
  try {
    const { sound: restSound } = await Audio.Sound.createAsync(
      require('../../assets/beep_rest.wav'),
      { shouldPlay: false, volume: 1.0 }
    );
    _restSound = restSound;
  } catch (e) {
    console.warn('[sounds] Could not load rest beep:', e);
  }

  try {
    const { sound: intervalSound } = await Audio.Sound.createAsync(
      require('../../assets/beep_interval.wav'),
      { shouldPlay: false, volume: 1.0 }
    );
    _intervalSound = intervalSound;
  } catch (e) {
    console.warn('[sounds] Could not load interval beep:', e);
  }
};

export const unloadSounds = async () => {
  try { if (_restSound)    await _restSound.unloadAsync();    } catch (_) {}
  try { if (_intervalSound) await _intervalSound.unloadAsync(); } catch (_) {}
  _restSound = null;
  _intervalSound = null;
};

// Ascending two-tone: "rest is over, time to work"
export const playRestBeep = async () => {
  try {
    if (_restSound) {
      await _restSound.setPositionAsync(0);
      await _restSound.playAsync();
    }
  } catch (e) {
    console.warn('[sounds] playRestBeep failed:', e);
  }
};

// Short pip: interval phase change or warmup complete
export const playIntervalBeep = async () => {
  try {
    if (_intervalSound) {
      await _intervalSound.setPositionAsync(0);
      await _intervalSound.playAsync();
    }
  } catch (e) {
    console.warn('[sounds] playIntervalBeep failed:', e);
  }
};
