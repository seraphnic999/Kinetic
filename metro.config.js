const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Custom transformer handles all codegenNativeComponent incompatibilities.
// See metro-transformer.js for full explanation.
config.transformer = {
  ...config.transformer,
  babelTransformerPath: path.resolve(__dirname, 'metro-transformer.js'),
};

// The virtualview files use complex Flow generics that even our transformer
// can't fix cleanly (multi-level type constraints). They are truly internal
// experimental RN files — nothing reachable from our app uses them.
config.resolver = {
  ...config.resolver,
  resolveRequest: (context, moduleName, platform) => {
    const resolution = context.resolveRequest(context, moduleName, platform);
    if (resolution?.filePath) {
      const fp = resolution.filePath.replace(/\\/g, '/');
      if (fp.includes('/react-native/src/private/components/virtualview/')) {
        return { type: 'empty' };
      }
    }
    return resolution;
  },
};

module.exports = config;
