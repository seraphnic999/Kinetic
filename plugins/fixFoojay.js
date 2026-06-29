/**
 * Expo config plugin: fixes the foojay IBM_SEMERU crash.
 * 
 * Root cause: @react-native/gradle-plugin/settings.gradle.kts uses
 * foojay-resolver-convention 0.5.0 which references JvmVendorSpec.IBM_SEMERU.
 * This field was REMOVED in Gradle 9.0. The generated project uses Gradle 9.3.1.
 * 
 * Fix: downgrade Gradle to 8.10.2 where IBM_SEMERU still exists.
 * EAS cloud builds use Linux where this doesn't manifest; local Windows needs this.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs   = require('fs');
const path = require('path');

module.exports = function fixFoojay(config) {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const root = config.modRequest.platformProjectRoot;
      const wrapperProps = path.join(root, 'gradle', 'wrapper', 'gradle-wrapper.properties');

      if (fs.existsSync(wrapperProps)) {
        let src = fs.readFileSync(wrapperProps, 'utf8');
        const before = src;

        // Downgrade Gradle 9.x to 8.10.2 — foojay 0.5.0 works fine on 8.x
        src = src.replace(
          /distributionUrl=.*gradle-[\d.]+-bin\.zip/,
          'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.10.2-bin.zip'
        );

        if (src !== before) {
          fs.writeFileSync(wrapperProps, src, 'utf8');
          console.log('[fixFoojay] Downgraded Gradle to 8.10.2 in gradle-wrapper.properties');
        } else {
          console.log('[fixFoojay] gradle-wrapper.properties already patched or not found');
        }
      } else {
        console.log('[fixFoojay] gradle-wrapper.properties not found at: ' + wrapperProps);
      }

      return config;
    },
  ]);
};
