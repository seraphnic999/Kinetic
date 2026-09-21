// ═══════════════════════════════════════════════════════════════════════════
// KINETIC — "CONSOLE" DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════════════════
// See docs/DESIGN.md for the full reasoning. The short version:
//
// Kinetic is the readout on the machine you are standing next to. Near-black
// ground, seven-segment numerals, and ONE hot channel at a time:
//
//     ember = live      the set you are doing, the button that starts the next
//                       thing. Never two ember elements on screen at once.
//     ice   = waiting   rest, recovery, a clock running against you doing
//                       nothing. Ember goes cold while ice is lit.
//     gold  = banked    completed sets, records, the streak. NEVER an action,
//                       only ever a result.
//
// Everything else is grayscale. `warn` means partial/unfinished and nothing
// else; `danger` means destructive and nothing else. The old palette had six
// accents at full saturation and `amber` alone carried five meanings across 27
// call sites, which is why nothing on a screen read as a signal.
//
// ── MIGRATION ──────────────────────────────────────────────────────────────
// There is no legacy alias block any more. It existed for the length of the
// rollout so no screen had to be migrated twice; every screen is now on these
// names and the aliases were deleted at stage 7 (docs/DESIGN.md §10). If a
// build error names `Colors.primary`, `Colors.textPrimary`, `Shadows` or
// `DIGITAL_FONT`, it is a call site that never migrated — fix the call site.
// ═══════════════════════════════════════════════════════════════════════════

// ── Type faces ─────────────────────────────────────────────────────────────
// Loaded in App.js from the bundle — never from a URL. A gym with no signal is
// the app's design target, and a remote font there renders the system fallback
// in every timer.
//
// Weight lives in the FAMILY NAME, not in `fontWeight`. These are static
// per-weight files: setting both on Android invites synthetic bolding on top
// of an already-bold face. Token styles below therefore carry no fontWeight.
export const Fonts = {
  // Live countdowns ONLY. Seven-segment emulation — no lowercase, no weights.
  // "DSEG7 renders a clock. Barlow renders a record."
  digits: 'DSEG7Classic',

  // Titles, exercise names, stat values, every number that is not a countdown.
  display:       'BarlowSemiCondensed_700Bold',
  displaySemi:   'BarlowSemiCondensed_600SemiBold',
  displayMedium: 'BarlowSemiCondensed_500Medium',

  // Everything read as language.
  body:       'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi:   'Inter_600SemiBold',
};

// ── Colours ────────────────────────────────────────────────────────────────
export const Colors = {
  // Ground — six steps. `line` is deliberately NOT equal to any surface value;
  // the old theme shared #2C2C2E between `border` and `surfaceRaised`, which is
  // why cards had no edge.
  void:     '#08080A',  // scrims, the true black behind sheets
  base:     '#0F0F11',  // page ground
  surface:  '#17171A',  // cards, rows
  raised:   '#202024',  // inputs, chips, controls sitting on a card
  nested:   '#2A2A30',  // controls inside a card inside a card
  line:     '#34343C',  // hairline borders

  // The three channels
  ember:    '#FF6B2B',  // LIVE
  emberHot: '#FF8A4C',  // pressed, and "start" where "done" is ember
  emberDim: 'rgba(255,107,43,0.14)',
  ice:      '#4FC3F7',  // WAITING
  iceDim:   'rgba(79,195,247,0.14)',
  gold:     '#FFC93C',  // BANKED
  goldDim:  'rgba(255,201,60,0.14)',

  // Semantics — two, not five
  warn:      '#FF9A3C',  // partial / unfinished / attention. One job.
  warnDim:   'rgba(255,154,60,0.14)',
  danger:    '#FF453A',  // destructive only
  dangerDim: 'rgba(255,69,58,0.14)',

  // Text. Verified against the grounds above (docs/DESIGN.md §2.5):
  //   text 16.16:1 · textMuted 7.16:1 · textFaint 4.22:1 — all on `surface`.
  // The old `textMuted` #505050 measured 2.11:1 and was the colour of every
  // chart axis, calendar label and caption in the app.
  text:      '#F5F3F1',  // a hair warm; pure #FFF glares on near-black
  textMuted: '#A3A3AD',
  textFaint: '#7A7A86',
};

/**
 * Label colour for a filled accent button.
 *
 * Always `base`, never white: dark-on-ember measures 6.74:1 where white-on-ember
 * is 2.84:1 and fails. This applies to `danger` too — the one place the old code
 * got it wrong, putting white on red at 3.41:1.
 */
export const onAccent = Colors.base;

// ── Typography ─────────────────────────────────────────────────────────────
// The 16px floor is not negotiable on a gym screen. `caption` at 12 is the
// smallest text allowed anywhere; the old chart axes were 8px and the calendar
// week labels 9px, which is decoration rather than information.
export const Typography = {
  // Live countdowns — DSEG7 only
  timerHero:   { fontFamily: Fonts.digits, fontSize: 76, letterSpacing: 2, fontVariant: ['tabular-nums'] },
  timerLarge:  { fontFamily: Fonts.digits, fontSize: 56, letterSpacing: 2, fontVariant: ['tabular-nums'] },
  timerInline: { fontFamily: Fonts.digits, fontSize: 30, letterSpacing: 1, fontVariant: ['tabular-nums'] },

  // Display
  statHuge: { fontFamily: Fonts.display, fontSize: 40, lineHeight: 40, fontVariant: ['tabular-nums'] },
  h1:       { fontFamily: Fonts.display, fontSize: 28, lineHeight: 32 },
  h2:       { fontFamily: Fonts.display, fontSize: 22, lineHeight: 26 },
  h3:       { fontFamily: Fonts.displaySemi, fontSize: 18, lineHeight: 24 },

  // Any number you compare — weights, reps, kg, percentages
  metric: { fontFamily: Fonts.displaySemi, fontSize: 17, lineHeight: 22, fontVariant: ['tabular-nums'] },

  // Reading
  bodyLarge: { fontFamily: Fonts.body, fontSize: 18, lineHeight: 26 },
  body:      { fontFamily: Fonts.body, fontSize: 16, lineHeight: 24 },
  bodySmall: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 20 },
  label:     { fontFamily: Fonts.bodySemi, fontSize: 11, lineHeight: 14, letterSpacing: 1.4, textTransform: 'uppercase' },
  caption:   { fontFamily: Fonts.body, fontSize: 12, lineHeight: 16 },
};

// ── Shape ──────────────────────────────────────────────────────────────────
// `xl` is new: TrainingScreen's quick-add sheet already referenced Radius.xl,
// which did not exist, so its top corners have been rendering square.
export const Radius = { sm: 10, md: 14, lg: 20, xl: 28, full: 999 };

export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 40 };

// The set is hairline open-stroke line art (1.5u, docs/ICON-BRIEF.md §3.2), so
// it is displayed LARGE rather than drawn heavy. 30px is the floor.
//
// ⚠ Icons are NEVER drawn in `textFaint`. At 1.5u on a near-black ground that
// is the one combination where the set disappears; `textMuted` is the quietest
// ink an icon may take. See ICON-BRIEF.md §6 — this rule is what lets the
// stroke stay as fine as the reference set.
export const IconSize = {
  pip:     18,  // status pips — the solid `status*` family only
  meta:    30,  // meta rows, inline marks — the line floor
  row:     34,  // list rows, chips, buttons, section markers
  tab:     38,  // tab bar
  section: 44,  // section heads, stat tiles
  empty:   72,  // empty-state glyphs
};

// Touch targets: 48 minimum, 56 for anything pressed mid-set with a sweaty
// hand — SET DONE, START, PAUSE, the weight chips.
export const Touch = { min: 48, gym: 56 };

// ── Depth ──────────────────────────────────────────────────────────────────
// Three levels, and a rule that differs from the sibling apps because this one
// has glow:
//
//   card      hairline, NO shadow. A black shadow on a near-black ground
//             renders nothing and costs a render pass.
//   floating  a real shadow — sheets, and the header once content scrolls under.
//   glow*     the LIVE element only, and never more than one on screen. That is
//             the payoff for the one-hot-channel rule: because only one thing
//             glows, the glow means something.
export const Elevation = {
  card: {
    borderWidth: 1,
    borderColor: Colors.line,
  },
  floating: {
    shadowColor:   Colors.void,
    shadowOffset:  { width: 0, height: -2 },
    shadowOpacity: 0.6,
    shadowRadius:  18,
    elevation:     12,
  },
  glowEmber: {
    shadowColor:   Colors.ember,
    shadowOffset:  { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius:  14,
    elevation:     8,
  },
  glowIce: {
    shadowColor:   Colors.ice,
    shadowOffset:  { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius:  12,
    elevation:     6,
  },
};

// ── Motion ─────────────────────────────────────────────────────────────────
// The rest ring drains on a linear 1s tick, not an eased animation. An
// instrument does not ease.
export const Motion = {
  sheetIn:      240,
  sheetOut:     180,
  tick:         120,
  pressOpacity: 0.75,
};

/** Backdrop behind a bottom sheet. */
export const SCRIM = 'rgba(8,8,10,0.72)';
