const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// react-native@0.85.x ships two VirtualView components in src/private/
// whose Flow types for onModeChange are incompatible with the version of
// @react-native/babel-plugin-codegen bundled inside babel-preset-expo.
// Neither is used by our app — stub both with empty modules.
const STUB_PATTERNS = [
  'VirtualViewNativeComponent',
  'VirtualViewExperimentalNativeComponent',
];

const originalResolveRequest = config.resolver?.resolveRequest;
config.resolver = {
  ...config.resolver,
  resolveRequest: (context, moduleName, platform) => {
    if (STUB_PATTERNS.some(p => moduleName.includes(p))) {
      return { type: 'empty' };
    }
    if (originalResolveRequest) {
      return originalResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = config;
