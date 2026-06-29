import { registerRootComponent } from 'expo';
import App from './App';

// ── On-screen crash reporter ──────────────────────────────────────────────────
// Stores fatal JS errors before React is up; App.js reads and renders them.
global.__KINETIC_CRASH__ = null;
const _orig = ErrorUtils.getGlobalHandler?.();
ErrorUtils.setGlobalHandler?.((error, isFatal) => {
  if (isFatal && !global.__KINETIC_CRASH__) {
    global.__KINETIC_CRASH__ = {
      name:    error?.name    ?? 'Error',
      message: error?.message ?? String(error),
      stack:   (error?.stack  ?? '').slice(0, 1200),
    };
  }
  _orig?.(error, isFatal);
});

registerRootComponent(App);
