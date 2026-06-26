/**
 * Format seconds into MM:SS digital clock format
 * e.g. 65 → "01:05", 3600 → "60:00"
 */
export const formatTime = (totalSeconds) => {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (Math.floor(totalSeconds) % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};
