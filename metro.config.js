const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// react-native@0.85.x ships internal private/deprecated components whose
// Flow codegen types are incompatible with the @react-native/babel-plugin-codegen
// version bundled inside babel-preset-expo. None of these are used by Kinetic.
// Stub the entire src/private tree to prevent the bundler hitting them one by one.
const RN_PRIVATE = path.join('react-native', 'src', 'private');

const originalResolveRequest = config.resolver?.resolveRequest;
config.resolver = {
  ...config.resolver,
  resolveRequest: (context, moduleName, platform) => {
    // Normalise both forward and back slashes for Windows compatibility
    const normalised = moduleName.replace(/\\/g, '/');
    if (
      normalised.includes('react-native/src/private') ||
      normalised.includes('react-native\\src\\private')
    ) {
      return { type: 'empty' };
    }
    if (originalResolveRequest) {
      return originalResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = config;
