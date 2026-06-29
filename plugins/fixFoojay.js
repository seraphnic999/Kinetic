/**
 * Expo config plugin: upgrades foojay-resolver-convention from 0.8.0 → 0.9.0
 *
 * The version Expo generates (0.8.0) crashes with Gradle 9.3.1 because it
 * references JvmVendorSpec.IBM_SEMERU which no longer resolves correctly.
 * Version 0.9.0 fixes this.
 */
const { withSettingsGradle } = require('@expo/config-plugins');

module.exports = function fixFoojay(config) {
  return withSettingsGradle(config, (config) => {
    config.modResults.contents = config.modResults.contents.replace(
      /id\s+"org\.gradle\.toolchains\.foojay-resolver-convention"\s+version\s+"[^"]+"/,
      'id "org.gradle.toolchains.foojay-resolver-convention" version "0.9.0"'
    );
    return config;
  });
};
