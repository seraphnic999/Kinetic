/**
 * Expo config plugin: fixes the foojay IBM_SEMERU crash with Gradle 9.3.1
 * 
 * Root cause: Expo SDK 56 generates settings.gradle.kts (Kotlin DSL) but
 * withSettingsGradle only modifies settings.gradle (Groovy DSL) — so the
 * patch was silently not applying. Using withDangerousMod to write directly.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs   = require('fs');
const path = require('path');

module.exports = function fixFoojay(config) {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const root = config.modRequest.platformProjectRoot; // = F:\Kinetic\android

      // Expo SDK 51+ uses Kotlin DSL (.kts). Fall back to Groovy for older.
      const candidates = [
        path.join(root, 'settings.gradle.kts'),
        path.join(root, 'settings.gradle'),
      ];

      for (const filePath of candidates) {
        if (!fs.existsSync(filePath)) continue;

        let src = fs.readFileSync(filePath, 'utf8');
        const before = src;

        // Replace ANY foojay version with 0.9.0
        // Handles both Groovy:  version "0.8.0"
        // and Kotlin DSL:       version("0.8.0")  or  .version("0.8.0")
        src = src.replace(
          /(foojay-resolver-convention[^)\n]*?)[.( ]*version[( "']+([\d.]+)[) "']+/g,
          (_, prefix) => `${prefix} version("0.9.0")`
        );

        if (src !== before) {
          fs.writeFileSync(filePath, src, 'utf8');
          console.log(`[fixFoojay] Patched ${path.basename(filePath)}: foojay → 0.9.0`);
        } else {
          console.log(`[fixFoojay] No foojay line found in ${path.basename(filePath)} — contents:`);
          console.log(src.slice(0, 400));
        }
        break; // only patch first found
      }

      return config;
    },
  ]);
};
