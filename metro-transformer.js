'use strict';

/**
 * Custom Metro transformer for Kinetic.
 *
 * Problem: babel-preset-expo bundles an older @react-native/babel-plugin-codegen
 * that cannot parse newer NativeComponent spec formats used by:
 *   - react-native@0.85.x  (src/private/ and specs_DEPRECATED/)
 *   - react-native-screens@4.25.x  (src/fabric/)
 *
 * The plugin is triggered when it finds a `codegenNativeComponent` import.
 * It then tries to parse the file's Flow/TS types to generate a view config,
 * and crashes on types it doesn't understand.
 *
 * Solution: Before babel runs, detect any file that imports
 * `codegenNativeComponent` and replace that import with a runtime call to
 * `requireNativeComponent` — the old-arch equivalent that works in Expo Go.
 * The babel-plugin-codegen never fires because its trigger import is gone.
 *
 * This is safe because Expo Go runs the old architecture, where
 * requireNativeComponent is the correct registration path.
 */

const path = require('path');

const DEFAULT_TRANSFORMER = path.join(
  path.dirname(require.resolve('expo/package.json')),
  'node_modules/@expo/metro-config/build/babel-transformer.js'
);

const defaultTransformer = require(DEFAULT_TRANSFORMER);

// Matches either:
//   import codegenNativeComponent from '...';
//   import { codegenNativeComponent } from '...';
// on its own line (multiline flag off — we replace line by line via global match).
const CODEGEN_IMPORT_RE =
  /^[ \t]*import\s+(?:\{[^}]*\bcodegenNativeComponent\b[^}]*\}|codegenNativeComponent)\s+from\s+['"][^'"]+['"];?[ \t]*\r?\n?/gm;

const REPLACEMENT_LINES = [
  "/* kinetic-codegen-stub: codegenNativeComponent replaced with requireNativeComponent */",
  "const { requireNativeComponent: __rnc } = require('react-native');",
  "const codegenNativeComponent = function(name) {",
  "  try { return __rnc(name); } catch(e) { return {}; }",
  "};",
  "",
].join('\n');

module.exports.transform = function transform(params) {
  const { src, filename } = params;

  if (src && src.includes('codegenNativeComponent')) {
    const patched = src.replace(CODEGEN_IMPORT_RE, '');

    if (patched !== src) {
      // Inject replacement after any leading directives ('use strict', 'use client')
      const directiveLine = /^(?:'use strict'|"use strict"|'use client'|"use client");?\r?\n/.exec(patched);
      let newSrc;
      if (directiveLine) {
        newSrc =
          patched.slice(0, directiveLine[0].length) +
          REPLACEMENT_LINES +
          patched.slice(directiveLine[0].length);
      } else {
        newSrc = REPLACEMENT_LINES + patched;
      }

      return defaultTransformer.transform({ ...params, src: newSrc });
    }
  }

  return defaultTransformer.transform(params);
};
