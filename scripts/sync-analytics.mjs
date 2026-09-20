// Copies shared/analytics.js into the two places that must import it.
//
//   npm run sync:analytics    write the copies
//   npm run check:analytics   fail if they have drifted (runs before export)
//
// Why copies rather than an import: the Next.js app under web/ has its own
// package root and cannot import across it, and Metro will not follow a symlink
// out of the project. The old arrangement was a hand-maintained "byte-for-byte
// copy" whose own header admitted the two had already drifted apart once.
// A generated copy with a check is the same idea with the honesty enforced.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "shared", "analytics.js");
const targets = [
  join(root, "src", "utils", "analytics.js"),
  join(root, "web", "lib", "analytics.js"),
];

const BANNER = `// GENERATED FILE — do not edit.
//
// Source of truth: shared/analytics.js
// Regenerate:      npm run sync:analytics
//
// Edits here are lost on the next sync, and \`npm run check:analytics\` fails
// the build if this file and the source have drifted.

`;

const body = readFileSync(source, "utf8");
const want = BANNER + body;
const check = process.argv.includes("--check");

let drifted = [];
for (const t of targets) {
  if (!existsSync(dirname(t))) continue;
  const have = existsSync(t) ? readFileSync(t, "utf8") : null;
  if (have === want) continue;
  if (check) { drifted.push(t); continue; }
  writeFileSync(t, want, "utf8");
  console.log("wrote", t.slice(root.length + 1));
}

if (check) {
  if (drifted.length) {
    console.error("\nanalytics copies are out of date:\n");
    for (const d of drifted) console.error("  " + d.slice(root.length + 1));
    console.error("\nRun `npm run sync:analytics`.\n");
    process.exit(1);
  }
  console.log("analytics copies are in sync.");
} else if (!drifted.length) {
  console.log("analytics copies are in sync.");
}
