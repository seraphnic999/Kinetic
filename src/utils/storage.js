import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSIONS_KEY = '@kinetic_sessions';

export const loadSessions = async () => {
  try {
    const json = await AsyncStorage.getItem(SESSIONS_KEY);
    return json ? JSON.parse(json) : [];
  } catch (e) {
    console.error('loadSessions error:', e);
    return [];
  }
};

export const saveSessions = async (sessions) => {
  try {
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.error('saveSessions error:', e);
  }
};

export const generateId = () =>
  `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
