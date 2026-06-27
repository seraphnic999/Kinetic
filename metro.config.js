const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// react-native@0.85.x includes VirtualViewExperimentalNativeComponent.js
// which has a Flow type for onModeChange that's incompatible with the
// @react-native/babel-plugin-codegen version bundled inside babel-preset-expo.
// We stub it with an empty module since we don't use it.
const originalResolveRequest = config.resolver?.resolveRequest;
config.resolver = {
  ...config.resolver,
  resolveRequest: (context, moduleName, platform) => {
    if (moduleName.includes('VirtualViewExperimentalNativeComponent')) {
      return { type: 'empty' };
    }
    if (originalResolveRequest) {
      return originalResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = config;
