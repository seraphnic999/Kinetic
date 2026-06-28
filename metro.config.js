const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The version of @react-native/babel-plugin-codegen bundled inside
// babel-preset-expo cannot parse newer NativeComponent spec formats used by:
//   - react-native@0.85.x  (src/private/*)
//   - react-native-screens@4.25.x (src/fabric/*)
//   - ...and potentially other packages as they adopt new-arch specs
//
// In Expo Go (managed / old-arch workflow) these Fabric and private specs
// are not executed at runtime anyway — the old-arch paths are used instead.
// Stubbing them with empty modules is safe.
//
// Pattern: any resolved file that lives inside:
//   • .../react-native/src/private/
//   • any package's src/fabric/ directory
//   • any package's specs_DEPRECATED/ directory
const STUB_PATTERNS = [
  /\/react-native\/src\/private\//,
  /\/src\/fabric\//,
  /\/specs_DEPRECATED\//,
];

config.resolver = {
  ...config.resolver,
  resolveRequest: (context, moduleName, platform) => {
    // Always resolve first to get the absolute file path
    const resolution = context.resolveRequest(context, moduleName, platform);

    if (resolution?.filePath) {
      const fp = resolution.filePath.replace(/\\/g, '/');
      if (STUB_PATTERNS.some(pattern => pattern.test(fp))) {
        return { type: 'empty' };
      }
    }

    return resolution;
  },
};

module.exports = config;
