/**
 * Expo config plugin — fixes two local Android build/runtime issues:
 * 1. Gradle 9.x foojay crash → downgrade wrapper to 8.13
 * 2. New Architecture (BridgelessReact) → disable via gradle.properties
 *    New Arch causes "EventEmitter of undefined" crash because our
 *    requireNativeComponent stubs are incompatible with the Fabric renderer.
 */
const { withDangerousMod, withGradleProperties } = require('@expo/config-plugins');
const fs   = require('fs');
const path = require('path');

function fixGradleVersion(config) {
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
}

function fixNewArch(config) {
  return withGradleProperties(config, (config) => {
    config.modResults = config.modResults.filter(item => item.key !== 'newArchEnabled');
    config.modResults.push({ type: 'property', key: 'newArchEnabled', value: 'false' });
    return config;
  });
}

module.exports = function fixFoojay(config) {
  config = fixGradleVersion(config);
  config = fixNewArch(config);
  return config;
};
