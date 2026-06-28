const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// react-native@0.85.x has many private/deprecated NativeComponent specs
// whose Flow codegen types are incompatible with babel-preset-expo's bundled
// @react-native/babel-plugin-codegen.
//
// Previous attempts used resolveRequest + module name matching, which only
// catches named imports. The real issue is relative imports INSIDE react-native
// (e.g. require('./VirtualViewNativeComponent')) — those pass a relative path
// as moduleName, so the path check never fires.
//
// Fix: always let the default resolver run first to get the absolute file path,
// THEN check whether that path is inside src/private. This intercepts all
// import styles — named, relative, and absolute.
config.resolver = {
  ...config.resolver,
  resolveRequest: (context, moduleName, platform) => {
    // Run default resolution to get the actual file path
    const resolution = context.resolveRequest(context, moduleName, platform);

    if (resolution?.filePath) {
      // Normalise to forward slashes so the check works on Windows too
      const fp = resolution.filePath.replace(/\\/g, '/');
      if (fp.includes('/react-native/src/private/')) {
        return { type: 'empty' };
      }
    }

    return resolution;
  },
};

module.exports = config;
