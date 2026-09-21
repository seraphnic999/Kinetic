/**
 * Expo config plugin — give the Android splash a dark ground.
 *
 * The problem this fixes, found while shipping v14 (docs/DESIGN.md §9):
 *
 * `expo-splash-screen` is not a dependency of this project, so the legacy
 * `expo.splash` block in app.json is only half honoured. Prebuild still emits
 * a `splashscreen_logo.png` per density and points the splash theme's
 * `android:windowBackground` straight at that bitmap — but it composites the
 * logo onto WHITE, and `@color/splashscreen_background` (which it also emits)
 * is never referenced by the splash theme at all.
 *
 * A bitmap set directly as `windowBackground` is stretched to fill the window,
 * so the result is a white screen with a distorted mark on it, for as long as
 * the process takes to start. On a near-black app that is the most visible
 * frame in the whole launch, and it has been there since v11.
 *
 * The fix is the shape the platform actually wants: a layer-list with a solid
 * ground and the logo as a CENTRED, un-scaled layer on top.
 *
 * Doing this as a plugin rather than by hand matters — `expo prebuild --clean`
 * wipes `android/`, so a hand-patched colors.xml survives exactly until the
 * next build. Same reasoning as fixFoojay next door.
 *
 * If `expo-splash-screen` is ever added to the project, delete this file: that
 * package owns the splash properly, including the Android 12 splash API.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs   = require('fs');
const path = require('path');

/** Ground colour — keep in step with `expo.backgroundColor` / Colors.base. */
const GROUND = '#0F0F11';

module.exports = function fixSplash(config) {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const res = path.join(config.modRequest.platformProjectRoot,
                            'app', 'src', 'main', 'res');
      if (!fs.existsSync(res)) return config;

      // 1. Point the emitted colour at base rather than white. It is used by
      //    ic_launcher_background.xml too, so this is not purely cosmetic.
      const colors = path.join(res, 'values', 'colors.xml');
      if (fs.existsSync(colors)) {
        const src = fs.readFileSync(colors, 'utf8');
        const out = src.replace(
          /(<color name="splashscreen_background">)[^<]*(<\/color>)/,
          `$1${GROUND}$2`,
        );
        if (out !== src) {
          fs.writeFileSync(colors, out, 'utf8');
          console.log(`[fixSplash] splashscreen_background → ${GROUND}`);
        }
      }

      // 2. A layer-list: solid ground, logo centred on top at its natural size.
      //    `android:gravity="center"` is the whole point — without it the
      //    bitmap is stretched edge to edge and the mark is distorted.
      const drawableDir = path.join(res, 'drawable');
      fs.mkdirSync(drawableDir, { recursive: true });
      fs.writeFileSync(
        path.join(drawableDir, 'splashscreen.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item android:drawable="@color/splashscreen_background"/>
  <item>
    <bitmap
      android:src="@drawable/splashscreen_logo"
      android:gravity="center"
      android:tileMode="disabled"/>
  </item>
</layer-list>
`,
        'utf8',
      );

      // 3. Aim the splash theme at the layer-list instead of the bare bitmap.
      const styles = path.join(res, 'values', 'styles.xml');
      if (fs.existsSync(styles)) {
        const src = fs.readFileSync(styles, 'utf8');
        const out = src.replace(
          /(<style name="Theme\.App\.SplashScreen"[^>]*>\s*<item name="android:windowBackground">)@drawable\/splashscreen_logo(<\/item>)/,
          '$1@drawable/splashscreen$2',
        );
        if (out !== src) {
          fs.writeFileSync(styles, out, 'utf8');
          console.log('[fixSplash] splash windowBackground → @drawable/splashscreen');
        } else {
          // Loud rather than silent: a prebuild-template change that renames
          // this style would otherwise reinstate the white flash unnoticed.
          console.warn('[fixSplash] Theme.App.SplashScreen windowBackground not matched — splash may still be white');
        }
      }

      return config;
    },
  ]);
};
