/**
 * Expo config plugin: fixes the foojay IBM_SEMERU crash with Gradle 9.3.1
 *
 * Two-pronged fix:
 * 1. gradle.properties: disable JVM toolchain auto-provisioning so the
 *    foojay plugin never tries to load DistributionsKt (which crashes).
 * 2. settings.gradle / settings.gradle.kts: upgrade foojay to 0.9.0
 *    which fixes the IBM_SEMERU field reference.
 */
const { withGradleProperties, withSettingsGradle } = require('@expo/config-plugins');

function fixGradleProperties(config) {
  return withGradleProperties(config, (config) => {
    const props = config.modResults.filter(
      item => !['org.gradle.java.installations.auto-provision',
                 'org.gradle.java.installations.auto-download'].includes(item.key)
    );
    props.push(
      { type: 'property', key: 'org.gradle.java.installations.auto-provision', value: 'false' },
      { type: 'property', key: 'org.gradle.java.installations.auto-download', value: 'false' }
    );
    config.modResults = props;
    return config;
  });
}

function fixSettingsGradle(config) {
  return withSettingsGradle(config, (config) => {
    config.modResults.contents = config.modResults.contents.replace(
      /id\s*[("]+org\.gradle\.toolchains\.foojay-resolver-convention[)"]+\s*version\s*[("]+[^)"]+[)"]+/g,
      'id("org.gradle.toolchains.foojay-resolver-convention") version "0.9.0"'
    );
    return config;
  });
}

module.exports = function fixFoojay(config) {
  config = fixGradleProperties(config);
  config = fixSettingsGradle(config);
  return config;
};
