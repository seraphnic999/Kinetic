'use strict';

/**
 * Custom Metro transformer for Kinetic.
 *
 * Problem: babel-preset-expo bundles an older @react-native/babel-plugin-codegen
 * that crashes on newer NativeComponent spec formats in:
 *   - react-native@0.85.x  (src/private/specs_DEPRECATED/)
 *   - react-native-screens@4.25.x  (src/fabric/)
 *
 * Two different file types require different treatment:
 *
 * 1. FLOW (.js) files — react-native private/specs_DEPRECATED
 *    The babel-plugin-codegen crashes on them, AND Hermes (Android JS engine)
 *    fails to parse their complex Flow type annotations even after we remove
 *    the codegen import. Fix: replace the ENTIRE file with minimal plain JS
 *    that calls requireNativeComponent with the same native component name.
 *    This produces valid Hermes-parseable code with no Flow types.
 *
 * 2. TYPESCRIPT (.ts/.tsx) files — react-native-screens/src/fabric/
 *    Hermes is NOT used to parse TypeScript files (babel's TS parser handles
 *    them). Fix: remove just the codegenNativeComponent import and inject a
 *    requireNativeComponent-based replacement. The rest of the file (including
 *    TS types that babel will strip) processes normally.
 *
 * Both fixes use requireNativeComponent because Expo Go runs old-arch,
 * where requireNativeComponent is the correct native component registration path.
 */

const path = require('path');

const DEFAULT_TRANSFORMER = path.join(
  path.dirname(require.resolve('expo/package.json')),
  'node_modules/@expo/metro-config/build/babel-transformer.js'
);

const defaultTransformer = require(DEFAULT_TRANSFORMER);

// ─── TypeScript approach: replace import, keep rest of file ──────────────────

const CODEGEN_IMPORT_RE =
  /^[ \t]*import\s+(?:\{[^}]*\bcodegenNativeComponent\b[^}]*\}|codegenNativeComponent)\s+from\s+['"][^'"]+['"];?[ \t]*\r?\n?/gm;

const TS_REPLACEMENT =
  "/* kinetic: codegenNativeComponent → requireNativeComponent */\n" +
  "var __rnc = require('react-native').requireNativeComponent;\n" +
  "var codegenNativeComponent = function(name) {\n" +
  "  try { return __rnc(name); } catch(e) { return {}; }\n" +
  "};\n";

function patchTypeScriptFile(src) {
  const patched = src.replace(CODEGEN_IMPORT_RE, '');
  if (patched === src) return null; // nothing replaced

  // Insert after leading directive if present
  const dir = /^(?:'use strict'|"use strict"|'use client'|"use client");?[ \t]*\r?\n/.exec(patched);
  if (dir) {
    return patched.slice(0, dir[0].length) + TS_REPLACEMENT + patched.slice(dir[0].length);
  }
  return TS_REPLACEMENT + patched;
}

// ─── Flow approach: replace entire file with minimal plain JS ─────────────────

// Extract the native component name from codegenNativeComponent call:
//   codegenNativeComponent<Type>('NativeName', ...)  or
//   (codegenNativeComponent<Type>(\n  'NativeName', ...
const NATIVE_NAME_RE = /codegenNativeComponent(?:<[^>]+>)?\s*\(\s*\n?\s*['"]([^'"]+)['"]/;

function buildFlowReplacement(src) {
  const m = src.match(NATIVE_NAME_RE);
  const name = m ? m[1] : null;

  if (name) {
    return (
      "'use strict';\n" +
      "var __rnc = require('react-native').requireNativeComponent;\n" +
      "var __NC;\n" +
      "try { __NC = __rnc(" + JSON.stringify(name) + "); } catch(e) { __NC = {}; }\n" +
      "module.exports = __NC;\n" +
      "module.exports['default'] = __NC;\n"
    );
  }
  // Fallback: no name found, return empty-ish module
  return "'use strict';\nmodule.exports = {};\nmodule.exports['default'] = {};\n";
}

// ─── Main transform hook ──────────────────────────────────────────────────────

// Only transform files that actually IMPORT codegenNativeComponent.
//
// CRITICAL: src.includes('codegenNativeComponent') was too broad.
// react-native/index.js exports it as a public API getter:
//   get codegenNativeComponent() { return require(...).default; }
// That caused the ENTIRE react-native module to be replaced with {}, wiping
// out TurboModuleRegistry, NativeModules, and everything else.
//
// Using an import-statement regex is precise: only spec files that actually
// import and call codegenNativeComponent get replaced.
const IMPORTS_CODEGEN_RE = /^import\s+(?:(?:\{[^}]*\b)?codegenNativeComponent\b[^}]*\}?|codegenNativeComponent)\s+from\s+/m;

module.exports.transform = function transform(params) {
  const { src, filename, options } = params;

  if (src && IMPORTS_CODEGEN_RE.test(src)) {
    const nameMatch = src.match(NATIVE_NAME_RE);
    const name = nameMatch ? nameMatch[1] : null;

    const newSrc = name
      ? (
          "'use strict';\n" +
          "var __rnc = require('react-native').requireNativeComponent;\n" +
          "var __NC;\n" +
          "try { __NC = __rnc(" + JSON.stringify(name) + "); } catch(e) { __NC = {}; }\n" +
          "module.exports = __NC;\n"
        )
      : "'use strict';\nmodule.exports = {};\n";

    return defaultTransformer.transform({ ...params, src: newSrc });
  }

  return defaultTransformer.transform(params);
};
