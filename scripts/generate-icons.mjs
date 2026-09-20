// Generates src/components/Icon.js from the SVGs in assets/icons-src.
//
//     npm run icons
//
// Never hand-edit Icon.js: the ICON_NAMES list and the path table are emitted
// together here, so they cannot drift apart.
//
// ── WHY THIS IS TOLERANT ─────────────────────────────────────────────────────
// The first four icon batches failed on things a script can fix — inconsistent
// glyph sizes and inconsistent stroke weights — because the brief was asking a
// drawing tool for mechanical consistency. It doesn't have to:
//
//   * SCALE is normalised here. Every glyph is measured and rescaled to fill
//     53 of the 64 units on its dominant axis, then centred, with a small
//     optical correction for sparse shapes (see OPTICAL). A generator that
//     draws at any size produces a set that is uniform anyway.
//
//   * STROKE WEIGHT is a render property, not path data. Line glyphs are
//     emitted as stroked paths and drawn at ONE constant width for the whole
//     set (see STROKE below), so they cannot disagree with each other.
//
//   * INPUT SHAPE is flexible: any number of <path>, plus <circle>, <ellipse>,
//     <line>, <polyline>, <polygon> and <rect>, with `transform` attributes
//     baked in, all folded into one path.
//
// What is left for the brief is the only thing a script cannot do: the drawing.
// See docs/ICON-PROMPT.md.
//
// ── MODE ─────────────────────────────────────────────────────────────────────
// A glyph is STROKED if its source is line art (fill="none", or a stroke
// attribute is present) and FILLED otherwise. Both are supported because the
// set is mostly line art but a few glyphs (status*, tab*Active, bolt) are
// deliberately solid.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "assets", "icons-src");
const outFile = join(root, "src", "components", "Icon.js");

/** Units of the 64 grid a glyph fills on its dominant axis. */
const TARGET = 53;

/**
 * Optical size corrections, applied on top of the bbox normalisation.
 *
 * Normalising every glyph to the same bounding box is not the same as making
 * them look the same size. A magnifier is a disc — it has mass, and at 53u it
 * reads correctly. A plus is two thin lines: at the same 53u it reads
 * noticeably LARGER than everything around it, because it spans the full box
 * with almost no ink in it. Every real icon set draws a plus smaller than a
 * magnifier for exactly this reason.
 *
 * So sparse, mostly-empty glyphs get scaled down a little. Tune by eye on the
 * Dev → Icons screen; anything absent from this table is left at 1.0.
 */
const OPTICAL = {
  add: 0.82, minus: 0.82, close: 0.82, check: 0.88,
  chevronUp: 0.74, chevronDown: 0.74, chevronLeft: 0.74, chevronRight: 0.74,
  back: 0.74, forward: 0.74, sort: 0.92,
  // Corner-to-corner diagonals span the full frame with very little ink, so
  // they read larger than the glyphs beside them.
  trendUp: 0.9, trendDown: 0.9,
  // Dot glyphs. Authored as solid discs already at their final size, so the
  // factor here is the one that cancels the 53u normalisation (33/53) rather
  // than an aesthetic correction — a row of dots blown up to fill the frame
  // becomes a row of blobs.
  more: 0.62, dragHandle: 0.62,
};
/** Stroke width for every line glyph in the set, in grid units. */
const STROKE = 1.5;

// ── SVG element → path data ──────────────────────────────────────────────────

const num = (s) => parseFloat(s);
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : null;
};

/** A circle/ellipse as two arcs — no <circle> survives into the output. */
const ellipsePath = (cx, cy, rx, ry) =>
  `M${cx - rx},${cy}A${rx},${ry} 0 1 0 ${cx + rx},${cy}A${rx},${ry} 0 1 0 ${cx - rx},${cy}Z`;

function elementToPath(tag) {
  const name = tag.match(/^<(\w+)/)[1];
  const a = (n) => attr(tag, n);
  switch (name) {
    case "path":
      return a("d");
    case "circle": {
      const r = num(a("r") ?? 0);
      return r > 0 ? ellipsePath(num(a("cx") ?? 0), num(a("cy") ?? 0), r, r) : null;
    }
    case "ellipse":
      return ellipsePath(num(a("cx") ?? 0), num(a("cy") ?? 0), num(a("rx") ?? 0), num(a("ry") ?? 0));
    case "line":
      return `M${num(a("x1") ?? 0)},${num(a("y1") ?? 0)}L${num(a("x2") ?? 0)},${num(a("y2") ?? 0)}`;
    case "polyline":
    case "polygon": {
      const pts = (a("points") ?? "").trim().split(/[\s,]+/).map(num);
      if (pts.length < 4) return null;
      let d = `M${pts[0]},${pts[1]}`;
      for (let i = 2; i < pts.length - 1; i += 2) d += `L${pts[i]},${pts[i + 1]}`;
      return name === "polygon" ? d + "Z" : d;
    }
    case "rect": {
      const x = num(a("x") ?? 0), y = num(a("y") ?? 0);
      const w = num(a("width") ?? 0), h = num(a("height") ?? 0);
      const rx = num(a("rx") ?? 0);
      if (!(w > 0 && h > 0)) return null;
      if (!rx) return `M${x},${y}H${x + w}V${y + h}H${x}Z`;
      const r = Math.min(rx, w / 2, h / 2);
      return `M${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}` +
             `V${y + h - r}A${r},${r} 0 0 1 ${x + w - r},${y + h}` +
             `H${x + r}A${r},${r} 0 0 1 ${x},${y + h - r}` +
             `V${y + r}A${r},${r} 0 0 1 ${x + r},${y}Z`;
    }
    default:
      return null;
  }
}

// ── Path tokenising, transforming, flattening ────────────────────────────────

const ARGS = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/** -> [{ cmd, rel, args:[…] }] */
function parsePath(d) {
  const toks = d.match(/[A-Za-z]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const out = [];
  let i = 0, cmd = null;
  while (i < toks.length) {
    if (/[A-Za-z]/.test(toks[i])) { cmd = toks[i]; i++; }
    if (!cmd) throw new Error("path does not start with a command");
    const C = cmd.toUpperCase();
    const n = ARGS[C];
    if (n === undefined) throw new Error(`unsupported path command "${cmd}"`);
    if (n === 0) { out.push({ cmd: C, rel: false, args: [] }); continue; }
    const args = toks.slice(i, i + n).map(Number);
    if (args.length < n) break;
    i += n;
    out.push({ cmd: C, rel: cmd === cmd.toLowerCase(), args });
    if (C === "M") cmd = cmd === "m" ? "l" : "L";   // implicit lineto
  }
  return out;
}

/** Uniform scale `s` then translate (tx,ty), applied to parsed segments. */
function transformSegs(segs, s, tx, ty) {
  return segs.map(({ cmd, rel, args }) => {
    const a = args.slice();
    const px = (v) => (rel ? v * s : v * s + tx);
    const py = (v) => (rel ? v * s : v * s + ty);
    switch (cmd) {
      case "M": case "L": case "T":
        a[0] = px(a[0]); a[1] = py(a[1]); break;
      case "H": a[0] = px(a[0]); break;
      case "V": a[0] = py(a[0]); break;
      case "C":
        a[0] = px(a[0]); a[1] = py(a[1]); a[2] = px(a[2]);
        a[3] = py(a[3]); a[4] = px(a[4]); a[5] = py(a[5]); break;
      case "S": case "Q":
        a[0] = px(a[0]); a[1] = py(a[1]); a[2] = px(a[2]); a[3] = py(a[3]); break;
      case "A":
        a[0] *= s; a[1] *= s; a[5] = px(a[5]); a[6] = py(a[6]); break;
    }
    return { cmd, rel, args: a };
  });
}

const fmt = (n) => {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
};

const segsToString = (segs) =>
  segs.map(({ cmd, rel, args }) =>
    (rel ? cmd.toLowerCase() : cmd) + args.map(fmt).join(" ")).join("");

/** Sample an elliptical arc. Endpoints alone are not enough: a circle drawn as
 *  two half arcs has both endpoints on one diameter, which would measure the glyph
 *  as flat and rescale it wrongly. */
function arcPoints(x0, y0, rx, ry, rot, laf, sf, x1, y1) {
  if (!rx || !ry || (x0 === x1 && y0 === y1)) return [[x1, y1]];
  const phi = (rot * Math.PI) / 180, cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (x0 - x1) / 2, dy = (y0 - y1) / 2;
  const xp = cp * dx + sp * dy, yp = -sp * dx + cp * dy;
  rx = Math.abs(rx); ry = Math.abs(ry);
  const lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lam > 1) { const k = Math.sqrt(lam); rx *= k; ry *= k; }
  const den = rx * rx * yp * yp + ry * ry * xp * xp;
  const nume = rx * rx * ry * ry - den;
  let co = den ? Math.sqrt(Math.max(0, nume / den)) : 0;
  if (laf === sf) co = -co;
  const cxp = (co * rx * yp) / ry, cyp = (-co * ry * xp) / rx;
  const cx = cp * cxp - sp * cyp + (x0 + x1) / 2;
  const cy = sp * cxp + cp * cyp + (y0 + y1) / 2;
  const ang = (ux, uy, vx, vy) => {
    const n = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    const a = n ? Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / n))) : 0;
    return ux * vy - uy * vx < 0 ? -a : a;
  };
  const ux = (xp - cxp) / rx, uy = (yp - cyp) / ry;
  const vx = (-xp - cxp) / rx, vy = (-yp - cyp) / ry;
  const th1 = ang(1, 0, ux, uy);
  let dth = ang(ux, uy, vx, vy);
  if (!sf && dth > 0) dth -= 2 * Math.PI;
  else if (sf && dth < 0) dth += 2 * Math.PI;
  const pts = [];
  for (let k = 1; k <= 24; k++) {
    const t = th1 + (dth * k) / 24;
    const ax = rx * Math.cos(t), ay = ry * Math.sin(t);
    pts.push([cp * ax - sp * ay + cx, sp * ax + cp * ay + cy]);
  }
  return pts;
}

/** Sample points along the path, for the bounding box. */
function flatten(segs) {
  const pts = [];
  let x = 0, y = 0, sx = 0, sy = 0, px = 0, py = 0, prev = "";
  const push = (a, b) => pts.push([a, b]);
  const bez = (x0, y0, x1, y1, x2, y2, x3, y3) => {
    for (let k = 1; k <= 12; k++) {
      const u = k / 12, v = 1 - u;
      push(v*v*v*x0 + 3*v*v*u*x1 + 3*v*u*u*x2 + u*u*u*x3,
           v*v*v*y0 + 3*v*v*u*y1 + 3*v*u*u*y2 + u*u*u*y3);
    }
  };
  for (const { cmd, rel, args } of segs) {
    const A = args;
    let nx, ny;
    switch (cmd) {
      case "M":
        nx = rel ? x + A[0] : A[0]; ny = rel ? y + A[1] : A[1];
        sx = nx; sy = ny; push(nx, ny); x = nx; y = ny; break;
      case "L":
        nx = rel ? x + A[0] : A[0]; ny = rel ? y + A[1] : A[1];
        push(nx, ny); x = nx; y = ny; break;
      case "H":
        nx = rel ? x + A[0] : A[0]; push(nx, y); x = nx; break;
      case "V":
        ny = rel ? y + A[0] : A[0]; push(x, ny); y = ny; break;
      case "C": {
        const [c1x, c1y, c2x, c2y, ex, ey] = rel
          ? [x+A[0], y+A[1], x+A[2], y+A[3], x+A[4], y+A[5]] : A;
        bez(x, y, c1x, c1y, c2x, c2y, ex, ey);
        px = c2x; py = c2y; x = ex; y = ey; break;
      }
      case "S": {
        const [c2x, c2y, ex, ey] = rel ? [x+A[0], y+A[1], x+A[2], y+A[3]] : A;
        const c1x = "CS".includes(prev) ? 2*x - px : x;
        const c1y = "CS".includes(prev) ? 2*y - py : y;
        bez(x, y, c1x, c1y, c2x, c2y, ex, ey);
        px = c2x; py = c2y; x = ex; y = ey; break;
      }
      case "Q": {
        const [qx, qy, ex, ey] = rel ? [x+A[0], y+A[1], x+A[2], y+A[3]] : A;
        bez(x, y, x + 2/3*(qx-x), y + 2/3*(qy-y), ex + 2/3*(qx-ex), ey + 2/3*(qy-ey), ex, ey);
        px = qx; py = qy; x = ex; y = ey; break;
      }
      case "T": {
        const [ex, ey] = rel ? [x+A[0], y+A[1]] : A;
        const qx = "QT".includes(prev) ? 2*x - px : x;
        const qy = "QT".includes(prev) ? 2*y - py : y;
        bez(x, y, x + 2/3*(qx-x), y + 2/3*(qy-y), ex + 2/3*(qx-ex), ey + 2/3*(qy-ey), ex, ey);
        px = qx; py = qy; x = ex; y = ey; break;
      }
      case "A": {
        const [arx, ary, rot, laf, sf, axe, aye] = A;
        const ex = rel ? x + axe : axe, ey = rel ? y + aye : aye;
        for (const p of arcPoints(x, y, arx, ary, rot, laf, sf, ex, ey)) push(p[0], p[1]);
        x = ex; y = ey; break;
      }
      case "Z":
        x = sx; y = sy; break;
    }
    prev = cmd;
  }
  return pts;
}

// ── Transforms ───────────────────────────────────────────────────────────────
// Inkscape emits `transform` on elements constantly (rotating an arrowhead into
// place, for example), so bouncing those files would mean hand-editing every
// drawing. They are baked into the coordinates here instead.

const IDENT = [1, 0, 0, 1, 0, 0];
const mul = (m, n) => [
  m[0]*n[0] + m[2]*n[1], m[1]*n[0] + m[3]*n[1],
  m[0]*n[2] + m[2]*n[3], m[1]*n[2] + m[3]*n[3],
  m[0]*n[4] + m[2]*n[5] + m[4], m[1]*n[4] + m[3]*n[5] + m[5],
];
const apply = (m, x, y) => [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]];

/** "rotate(-75,26.7,19.6) translate(2,3)" -> [a,b,c,d,e,f] */
function parseTransform(str) {
  let m = IDENT;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let hit;
  while ((hit = re.exec(str))) {
    const v = hit[2].trim().split(/[\s,]+/).map(Number);
    let t;
    switch (hit[1]) {
      case "matrix":    t = [v[0], v[1], v[2], v[3], v[4], v[5]]; break;
      case "translate": t = [1, 0, 0, 1, v[0] || 0, v[1] || 0]; break;
      case "scale":     t = [v[0], 0, 0, v.length > 1 ? v[1] : v[0], 0, 0]; break;
      case "rotate": {
        const a = ((v[0] || 0) * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
        const r = [c, sn, -sn, c, 0, 0];
        t = v.length > 1
          ? mul(mul([1, 0, 0, 1, v[1], v[2]], r), [1, 0, 0, 1, -v[1], -v[2]])
          : r;
        break;
      }
      case "skewX":     t = [1, 0, Math.tan((v[0] * Math.PI) / 180), 1, 0, 0]; break;
      case "skewY":     t = [1, Math.tan((v[0] * Math.PI) / 180), 0, 1, 0, 0]; break;
      default:          t = IDENT;
    }
    m = mul(m, t);
  }
  return m;
}

const isIdentity = (m) => m.every((v, i) => Math.abs(v - IDENT[i]) < 1e-9);
/** True when the matrix is translate + uniform scale, so exact curves survive. */
const isSimple = (m) =>
  Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-9 && Math.abs(m[0] - m[3]) < 1e-9;

/** Bake a general matrix by flattening to a polyline — used only for rotated or
 *  skewed elements, where an arc's radii and axis would otherwise all change. */
function bakeByFlattening(segs, m) {
  const out = [];
  let open = false;
  for (const [x, y] of flatten(segs)) {
    const [px, py] = apply(m, x, y);
    out.push((open ? "L" : "M") + fmt(px) + " " + fmt(py));
    open = true;
  }
  return out.join("");
}

// ── Build ────────────────────────────────────────────────────────────────────

if (!existsSync(srcDir)) {
  console.error(`\nNo such directory: ${srcDir}\n`);
  process.exit(2);
}

const files = readdirSync(srcDir).filter((f) => f.endsWith(".svg")).sort();
const errors = [];
const warnings = [];
const icons = [];

for (const file of files) {
  const name = file.slice(0, -4);
  const svg = readFileSync(join(srcDir, file), "utf8");
  const where = `${file}:`;

  if (!/^[a-z][A-Za-z0-9]*$/.test(name)) {
    errors.push(`${where} filename is not a lowerCamelCase identifier`);
    continue;
  }

  // <defs> holds definitions, not drawing — gradients, masks, symbols. Scooping
  // its contents into the glyph merges a mask's own geometry into the artwork,
  // which is silent and looks like a corrupt icon rather than an error.
  const drawable = svg.replace(/<defs\b[\s\S]*?<\/defs>/g, "");

  const tags = drawable.match(/<(?:path|circle|ellipse|line|polyline|polygon|rect)\b[^>]*>/g) ?? [];
  if (!tags.length) { errors.push(`${where} contains no drawable element`); continue; }

  // Masks and clip paths cannot be folded into one compound path. The set
  // expresses a cut-out as an evenodd hole instead, so say so rather than
  // silently dropping the mask and emitting a solid blob.
  const masked = tags.find((t) => /\s(?:mask|clip-path)="url\(/.test(t));
  if (masked) {
    errors.push(`${where} uses a <mask>/<clipPath> — draw the cut-out as a hole ` +
                `in one compound path with fill-rule="evenodd" instead`);
    continue;
  }

  // Mode is per ELEMENT, not per file. A glyph may mix both — `streak` is four
  // filled boxes and one outlined one, and classifying the whole file by its
  // first fill="none" flattened it into five identical outlines.
  //
  // Presentation attributes inherit, so an element with no fill/stroke of its
  // own takes the <svg> root's. Line art is the default when neither says
  // anything, because that is what the set is.
  const rootTag = drawable.match(/<svg[^>]*>/)?.[0] ?? "";
  const rootFill = rootTag.match(/\sfill="([^"]*)"/)?.[1] ?? null;
  const isFilled = (tag) => {
    const f = tag.match(/\sfill="([^"]*)"/)?.[1] ?? rootFill;
    return f != null && f !== "none";
  };

  let segs = [];        // everything, for the bounding box
  let fillSegs = [];    // elements drawn filled
  let strokeSegs = [];  // elements drawn as line art
  let bad = false;
  for (const tag of tags) {
    const d = elementToPath(tag);
    if (!d) continue;
    let es;
    try { es = parsePath(d); }
    catch (e) { errors.push(`${where} ${e.message}`); bad = true; break; }

    const tf = tag.match(/\stransform="([^"]*)"/);
    if (tf) {
      const m = parseTransform(tf[1]);
      if (!isIdentity(m)) {
        if (isSimple(m)) {
          es = transformSegs(es, m[0], m[4], m[5]);
        } else {
          try { es = parsePath(bakeByFlattening(es, m)); }
          catch (e) { errors.push(`${where} could not bake transform: ${e.message}`); bad = true; break; }
        }
      }
    }
    segs = segs.concat(es);
    (isFilled(tag) ? fillSegs : strokeSegs).push(...es);
  }
  if (bad) continue;
  if (!segs.length) { errors.push(`${where} produced no path data`); continue; }

  // Normalise: scale to fill TARGET on the dominant axis, then centre.
  const pts = flatten(segs);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const w = x1 - x0, h = y1 - y0;
  if (!(w > 0.5 || h > 0.5)) { errors.push(`${where} glyph has no size`); continue; }

  const s = (TARGET / Math.max(w, h)) * (OPTICAL[name] ?? 1);
  const tx = (64 - w * s) / 2 - x0 * s;
  const ty = (64 - h * s) / 2 - y0 * s;
  const xf = (v) => (v.length ? segsToString(transformSegs(v, s, tx, ty)) : null);
  const d = xf(strokeSegs);
  const fd = xf(fillSegs);

  if (Math.abs(s - 1) > 0.02) {
    warnings.push(`${where} rescaled ×${s.toFixed(2)} (was ${w.toFixed(0)}×${h.toFixed(0)})`);
  }
  icons.push({ name, d, fd });
}

if (errors.length) {
  console.error(`\nRefusing to generate — ${errors.length} problem(s):\n`);
  for (const e of errors) console.error("  " + e);
  console.error("\nSee docs/ICON-PROMPT.md for the delivery format.\n");
  process.exit(1);
}

const table = icons
  .map((i) => {
    const parts = [];
    if (i.d) parts.push(`d: '${i.d}'`);
    if (i.fd) parts.push(`fd: '${i.fd}'`);
    return `  ${i.name}: { ${parts.join(", ")} },`;
  })
  .join("\n");

const out = `// GENERATED FILE — do not edit by hand.
// Run \`npm run icons\` to regenerate from assets/icons-src/*.svg.
//
// The "Open Line" icon set: ${icons.length} glyph${icons.length === 1 ? "" : "s"} on a 64x64 viewBox.
//
// Two things were normalised at generation time and are therefore uniform
// across the whole set by construction, not by anyone's discipline:
//   * scale — every glyph fills ${TARGET} of the 64 units on its dominant axis
//   * stroke — line glyphs are drawn at STROKE below, one value for the set
//
// Each glyph carries \`d\` (line art, stroked at STROKE) and/or \`fd\` (filled).
// Most have only \`d\`; the deliberately solid ones (status*, tab*Active, bolt)
// have only \`fd\`; a few mix both.
//
// See docs/ICON-PROMPT.md for the drawing brief.

import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { Colors, IconSize } from '../theme';

/** Stroke width for every line glyph, in 64-grid units. */
export const STROKE = ${STROKE};

/** Every icon in the set, for the hidden Dev/Icons proof sheet. */
export const ICON_NAMES = [
${icons.map((i) => `  '${i.name}',`).join("\n")}
];

const PATHS = {
${table}
};

/**
 * @param {object}   props
 * @param {string}   props.name   one of ICON_NAMES
 * @param {number}  [props.size]  defaults to IconSize.row
 * @param {string}  [props.color] defaults to Colors.text
 * @param {object}  [props.style]
 */
export function Icon({ name, size = IconSize.row, color = Colors.text, style, ...rest }) {
  const g = PATHS[name];
  if (!g) {
    // Plain JS gives us no compile-time union, so this is the safety net: a
    // typo'd name is loud in development and simply absent in production
    // rather than crashing a screen mid-workout.
    if (__DEV__) console.warn(\`[Icon] unknown name "\${name}" — see ICON_NAMES in src/components/Icon.js\`);
    return null;
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" style={style} {...rest}>
      {g.fd ? <Path d={g.fd} fill={color} fillRule="evenodd" /> : null}
      {g.d ? (
        <Path
          d={g.d}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </Svg>
  );
}

export default Icon;
`;

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, out, "utf8");

const lines = icons.filter((i) => i.d && !i.fd).length;
const solid = icons.filter((i) => i.fd && !i.d).length;
const mixed = icons.length - lines - solid;
console.log(`Wrote src/components/Icon.js — ${icons.length} icons ` +
            `(${lines} line, ${solid} solid${mixed ? `, ${mixed} mixed` : ""}).`);
if (warnings.length) {
  console.log(`\nNormalised ${warnings.length}:`);
  for (const w of warnings) console.log("  " + w);
}
