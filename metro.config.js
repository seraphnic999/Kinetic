const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Custom transformer: replaces codegenNativeComponent imports with
// requireNativeComponent fallbacks so babel-plugin-codegen never fires.
// See metro-transformer.js for full explanation.
config.transformer = {
  ...config.transformer,
  babelTransformerPath: path.resolve(__dirname, 'metro-transformer.js'),
};

// The virtualview files have complex Flow generics that Hermes (Android JS engine)
// cannot parse even after the codegenNativeComponent import is removed.
// These are purely internal RN experimental files — nothing in our app or in
// react-native-screens imports them at runtime, so empty stubs are safe.
const EMPTY_STUB_PATHS = [
  '/react-native/src/private/components/virtualview/',
];

config.resolver = {
  ...config.resolver,
  resolveRequest: (context, moduleName, platform) => {
    const resolution = context.resolveRequest(context, moduleName, platform);
    if (resolution?.filePath) {
      const fp = resolution.filePath.replace(/\\/g, '/');
      if (EMPTY_STUB_PATHS.some(p => fp.includes(p))) {
        return { type: 'empty' };
      }
    }
    return resolution;
  },
};

module.exports = config;
