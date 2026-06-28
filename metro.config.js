const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The @react-native/babel-plugin-codegen bundled inside babel-preset-expo
// cannot parse newer NativeComponent spec formats. We stub the specific
// spec files that trigger the error so the bundler can complete.
//
// Patterns match the resolved absolute file path (after normalising \ → /):
//   1. react-native/src/private/   — private/deprecated RN components
//   2. src/fabric/*NativeComponent* — Fabric-arch spec files only (NOT all of src/fabric)
//   3. specs_DEPRECATED/*           — old deprecated spec dir in react-native
//
// IMPORTANT: /src/fabric/ alone is too broad and stubs helper files that
// ARE needed at runtime (causes "undefined is not a function" on the phone).
const STUB_PATTERNS = [
  /\/react-native\/src\/private\//,
  /\/src\/fabric\/.*NativeComponent[^/]*\.(js|ts)x?$/,
  /\/specs_DEPRECATED\//,
];

config.resolver = {
  ...config.resolver,
  resolveRequest: (context, moduleName, platform) => {
    const resolution = context.resolveRequest(context, moduleName, platform);

    if (resolution?.filePath) {
      const fp = resolution.filePath.replace(/\\/g, '/');
      if (STUB_PATTERNS.some(p => p.test(fp))) {
        return { type: 'empty' };
      }
    }

    return resolution;
  },
};

module.exports = config;
