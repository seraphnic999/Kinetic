/**
 * Expo config plugin — fixes local Android build issues:
 * 1. Gradle 9.x foojay crash → downgrade wrapper to 8.13
 *
 * Note: New Architecture MUST stay enabled. In old-arch mode, ExpoModulesCore
 * sets up globalThis.expo asynchronously via bridge, so it's not ready when
 * module 77 (expo-modules-core EventEmitter) loads → crash.
 * In new-arch, ExpoModulesCore uses JSI to install globalThis.expo synchronously
 * before any JS runs → works correctly.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs   = require('fs');
const path = require('path');

module.exports = function fixFoojay(config) {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const wrapperProps = path.join(
        config.modRequest.platformProjectRoot,
        'gradle', 'wrapper', 'gradle-wrapper.properties'
      );
      if (fs.existsSync(wrapperProps)) {
        let src = fs.readFileSync(wrapperProps, 'utf8');
        const patched = src.replace(
          /distributionUrl=.*gradle-[\d.]+-bin\.zip/,
          'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.13-bin.zip'
        );
        if (patched !== src) {
          fs.writeFileSync(wrapperProps, patched, 'utf8');
          console.log('[fixFoojay] Gradle wrapper → 8.13');
        }
      }
      return config;
    },
  ]);
};
