const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Use our custom transformer which patches codegenNativeComponent imports
// before babel sees them, preventing crashes in babel-preset-expo's bundled
// codegen parser. See metro-transformer.js for full explanation.
config.transformer = {
  ...config.transformer,
  babelTransformerPath: path.resolve(__dirname, 'metro-transformer.js'),
};

module.exports = config;
