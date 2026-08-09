/**
 * build-data.mjs
 * Converts CSV files from the vampire-survivors-theorycraft skill
 * into data/data.js consumed by the build planner.
 *
 * Usage: node tools/build-data.mjs   (from vs-build-calc root)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT   = join(__dirname, '..');
// workspace root is two levels up from tools/
const SKILL_DATA  = join(__dirname, '../../.claude/skills/vampire-survivors-theorycraft/references/data');
const DATA_OUT    = join(REPO_ROOT, 'data');

// ─── RFC 4180 CSV parser ──────────────────────────────────────────────────

// `bracketAware` (opt-in per file): treat a comma/newline as a field delimiter only
// when outside quotes AND at {}/[]-depth 0, so hand-authored `{rule|blocks}` and
// `[lists]` may contain commas without a quote wrapper. Requires balanced wrappers
// per row; a stray brace shows up as a wrong field count (warned below). Other CSVs
// keep plain RFC 4180 (bracketAware=false) so their unquoted brackets can't regress.
function parseCsv(raw, bracketAware = false) {
  const results = [];
  let headers = null;
  let pos = 0;
  const n = raw.length;

  function parseField() {
    if (pos >= n) return '';
    if (raw[pos] === '"') {
      pos++;
      let field = '';
      while (pos < n) {
        if (raw[pos] === '"') {
          if (pos + 1 < n && raw[pos + 1] === '"') { field += '"'; pos += 2; }
          else { pos++; break; }
        } else {
          field += raw[pos++];
        }
      }
      return field;
    }
    let field = '', depth = 0;
    while (pos < n) {
      const c = raw[pos];
      if (bracketAware && (c === '{' || c === '[')) depth++;
      else if (bracketAware && (c === '}' || c === ']')) depth = Math.max(0, depth - 1);
      else if (depth === 0 && (c === ',' || c === '\n' || c === '\r')) break;
      field += raw[pos++];
    }
    return field.trim();
  }

  function parseLine() {
    const fields = [];
    while (pos < n) {
      fields.push(parseField());
      if (pos < n && raw[pos] === ',') { pos++; }
      else { if (pos < n && raw[pos] === '\r') pos++; if (pos < n && raw[pos] === '\n') pos++; break; }
    }
    return fields;
  }

  while (pos < n) {
    const fields = parseLine();
    if (!headers) {
      headers = fields.map(h => h.trim());
    } else if (fields.some(f => f !== '')) {
      if (fields.length !== headers.length) {
        console.warn(`CSV: row "${fields[0]}" has ${fields.length} fields, expected ${headers.length} — likely an unbalanced {}/[] wrapper.`);
      }
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (fields[i] ?? '').trim(); });
      results.push(obj);
    }
  }
  return results;
}

function readCsv(filename, bracketAware = false) {
  try {
    return parseCsv(readFileSync(join(SKILL_DATA, filename), 'utf8'), bracketAware);
  } catch (err) {
    console.warn(`Warning: could not read ${filename} — ${err.message}`);
    return [];
  }
}

// ─── Icon path helper ─────────────────────────────────────────────────────
// Converts "vampire-survivors-theorycraft\assets\icons\weapons\whip.jpg"
// → "assets/icons/weapons/whip.png"  (relative to index.html at repo root)

function iconPath(raw) {
  if (!raw || raw === '-') return '';
  const normalized = raw.replace(/\\/g, '/').replace(/\.jpe?g$/i, '.png');
  const match = normalized.match(/assets\/icons\/(.+)$/);
  return match ? 'assets/icons/' + match[1] : normalized;
}

// ─── Arcana → weapon-rating column map ───────────────────────────────────

// arcana.csv uses plain numeric strings for # (0,1,2,...,21) for both Arcana and Darkana
const ARCANA_NUM_TO_COL = {
  '0':  '0_game_killer',
  '1':  'i_gemini',
  '2':  'ii_twilight_requiem',
  '3':  'iii_twilight_princess',
  '4':  'iv_awake',
  '5':  'v_chaos_in_the_dark_night',
  '6':  'vi_sarabande_of_healing',
  '7':  'vii_iron_blue_will',
  '8':  'viii_mad_groove',
  '9':  'ix_divine_bloodline',
  '10': 'x_bloodline',
  '11': 'xi_waltz_of_pearls',
  '12': 'xii_out_of_bounds',
  '13': 'xiii_wicked_season',
  '14': 'xiv_jail_of_crystal',
  '15': 'xv_disco_of_gold',
  '16': 'xvi_slash',
  '17': 'xvii_lost_and_found_painting',
  '18': 'xviii_boogaloo_of_illusions',
  '19': 'xix_heart_of_fire',
  '20': 'xx_silent_old_sanctuary',
  '21': 'xxi_blood_astronomica',
};

const DARKANA_NUM_TO_COL = {
  '1':  'di_saphire_mist',
  '3':  'diii_hidden_anathema',
  '6':  'dvi_moonlight_bolero',
  '10': 'dx_hail_from_the_future',
  '12': 'dxii_crystal_cries',
  '21': 'dxxi_wandering_the_jet_black',
};

// Combined for weapons.csv column lookup
const NUM_TO_COL = { ...ARCANA_NUM_TO_COL };

const ARCANA_COL_KEYS = Object.values(NUM_TO_COL);

// ─── Parse character scaling ──────────────────────────────────────────────
// Format: "stat_key: value per [N] level [, max: cap]" pipe-separated
// interval=null → "per level" (no N), starts at level 2: bonus = value × (level - 1)
// interval=N    → "per N level", starts at level N:     bonus = value × floor(level / N)
// interval=0    → flat, level-independent

// Per-level stat scaling from the `level_scaling` column. Brace grammar (pipe-separated):
//   { key: value per N level max M | … }
// interval=N → per N levels · interval=null → per level (no N) · interval=0 → flat (no `per`).
// "level(s)" is optional; value/max may be signed. Emits the legacy scaling shape.
function parseScaling(raw) {
  const cell = (raw || '').replace(/^\{|\}$/g, '').trim();
  if (!cell || cell === '-') return [];
  return cell.split('|').map(s => s.trim()).filter(Boolean).flatMap(part => {
    const colonIdx = part.indexOf(':');
    if (colonIdx < 0) return [];
    const key  = part.slice(0, colonIdx).trim();
    const rest = part.slice(colonIdx + 1).trim();
    const valM = rest.match(/^(-?\d+(?:\.\d+)?)/);
    if (!valM) return [];
    const value = parseFloat(valM[1]);
    const maxM  = rest.match(/max\s+(-?\d+(?:\.\d+)?)/i);
    const max   = maxM ? parseFloat(maxM[1]) : null;
    const perM  = rest.match(/per\s+(?:levels?\s+)?(\d+)?(?:\s+levels?)?/i);
    if (!perM) return [{ key, value, interval: 0, max }];           // flat, no `per`
    const interval = perM[1] !== undefined ? parseInt(perM[1]) : null; // null = per level
    return [{ key, value, interval, max }];
  });
}

// ─── Parse item-grant / effect rule blocks ────────────────────────────────
// Shared project rule grammar (see docs): a cell is one or more `{ … }` blocks,
// pipe-separated. Inside a block:
//     { op: amount [Ref]  per N level   max M   at K }
//   {} = one rule block            | = separates blocks
//   [] = a reference OR comma-list of references (display names, applied per-member)
//   ,  = list-member separator (only meaning)      - = empty / no data
//   keywords: `per N level` → interval | `max M` → per-rule cap | `at K…` → fixed level(s)
//   a lone leading number = amount (copies granted per fire; default 1)
// `op` maps to placement. `max` caps THIS rule only; sources sum at render time.
// kind (weapon|passive|arcana) is inferred from the reference; unresolved refs warn.
// <<PARSE_RULE_BLOCKS_START>>
const GRANT_OP_PLACE = { add_hidden: 'hidden', add_extra: 'extra' };

// Split on `delim` only at bracket depth 0 (so a delimiter inside [] is literal).
function splitOutsideBrackets(str, delim) {
  const parts = []; let depth = 0, cur = '';
  for (const ch of str) {
    if (ch === '[') depth++;
    else if (ch === ']') depth = Math.max(0, depth - 1);
    if (ch === delim && depth === 0) { parts.push(cur); cur = ''; }
    else cur += ch;
  }
  parts.push(cur);
  return parts;
}

function parseRuleBlocks(raw, kindOf = () => null, ctx = '') {
  if (!raw || raw.trim() === '-') return [];
  // Braces only wrap the block; the rules live inside, pipe-separated. Strip the
  // wrapper braces and split rules on top-level `|` (a `|` inside [] is literal).
  const cell = raw.replace(/[{}]/g, ' ');
  const out = [];
  for (const seg of splitOutsideBrackets(cell, '|')) {
    const rule = seg.trim();
    if (!rule || rule === '-') continue; // empty cell was `{-}` → `-`
    const colon = rule.indexOf(':');
    if (colon < 0) { console.warn(`grants: rule missing "op:" — "${rule}" (${ctx})`); continue; }
    const op = rule.slice(0, colon).trim();
    const place = GRANT_OP_PLACE[op];
    if (!place) { console.warn(`grants: unknown op "${op}" — "${rule}" (${ctx})`); continue; }
    const rest = rule.slice(colon + 1).trim();
    // References: [Name] or [A, B, C] — applied element-wise.
    const refMatch = rest.match(/\[([^\]]*)\]/);
    const refs = refMatch ? refMatch[1].split(',').map(s => s.trim()).filter(Boolean) : [];
    if (!refs.length) { console.warn(`grants: no [reference] in "${rule}" (${ctx})`); continue; }
    // Strip the item [refs], then flatten any remaining brackets so a bracketed level
    // list (`at [12, 22]`) parses like the bare form. Params are keyword-anchored, so
    // the optional "level(s)" (either side of the number) can't be misread as amount.
    let work = rest.replace(/\[[^\]]*\]/, ' ').replace(/[\[\]]/g, ' ');
    const per = work.match(/per\s+(?:levels?\s+)?(\d+)(?:\s+levels?)?/i); if (per) work = work.replace(per[0], ' ');
    const max = work.match(/max\s+(\d+(?:\.\d+)?)/i);                     if (max) work = work.replace(max[0], ' ');
    const at  = work.match(/at\s+(?:levels?\s+)?([\d\s,]+)/i);            if (at)  { work = work.replace(at[0], ' ').replace(/\blevels?\b/i, ' '); }
    const amt = work.match(/(\d+(?:\.\d+)?)/); // remaining lone number = amount
    for (const name of refs) {
      const kind = kindOf(name);
      if (!kind) console.warn(`grants: unresolved reference "${name}" — "${rule}" (${ctx})`);
      const g = { op, name, kind, place, amount: amt ? parseFloat(amt[1]) : 1 };
      if (per) g.interval = parseInt(per[1]);
      if (max) g.max = parseFloat(max[1]);
      if (at)  g.at = at[1].trim().split(/[\s,]+/).filter(Boolean).map(Number);
      out.push(g);
    }
  }
  return out;
}
// <<PARSE_RULE_BLOCKS_END>>

// ─── Process characters ───────────────────────────────────────────────────

function splitItems(raw) {
  // New schema wraps these list columns in braces (`{Empty Tome}`, `{-}`), so strip
  // the wrapper first — otherwise names carry stray braces and `{-}` leaks as an item.
  return unwrap(raw).split('|').map(s => s.trim()).filter(s => s && s !== '-');
}

// Strip a `{ … }` wrapper (used by the brace-DSL columns) and normalize `{-}`/`-` to ''.
function unwrap(raw) {
  let s = (raw || '').trim();
  if (s.startsWith('{') && s.endsWith('}')) s = s.slice(1, -1).trim();
  return s === '-' ? '' : s;
}

const rawChars = readCsv('characters.csv', true);
const characters = rawChars.map(r => ({
  name: r.name,
  icon: iconPath(r.icon_path),
  sprite_static: iconPath(r.sprite_static_path),
  sprite_gif: iconPath(r.sprite_gif_path),
  base_name: r.base_name || r.name,
  // New schema compresses the three starter columns into one brace-wrapped,
  // pipe-separated `starting_loadout` (weapons + passives mixed, partitioned
  // downstream by isPassiveName).
  starting_weapons: splitItems(r.starting_loadout),
  hidden_items:  splitItems(r.hidden_items),
  max_items:     splitItems(r.max_items),
  // Brace-wrapped in the new schema ({-} / {Gemini (I)}); unwrap() strips braces and
  // maps a bare dash to '' so empties collapse to null and names match arcana by name.
  starting_arcana: unwrap(r.starting_arcana) || null,
  description: unwrap(r.character_description),
  custom_description: unwrap(r.custom_description), // shown in the UI later (extra context)
  notes: '',                                        // no source column in the new schema
  affinity: splitItems(r.affinity), // brace-wrapped priority list → array; future affinities.csv mapping
  scaling: parseScaling(r.level_scaling),
  // Phase-2 rule columns, passed through unparsed until their runtime features exist.
  reference_scaling: unwrap(r.reference_scaling),
  manual_scaling: unwrap(r.manual_scaling),
  charge_ability: unwrap(r.charge_ability),
  grants: [], // filled in a second pass below (needs weapon/passive/arcana names for kind)
  stats: {
    max_health: parseFloat(r.max_health)  || 0,
    recovery:   parseFloat(r.recovery)    || 0,
    armor:      parseFloat(r.armor)       || 0,
    move_speed: parseFloat(r.move_speed)  || 0,
    might:      parseFloat(r.might)       || 0,
    speed:      parseFloat(r.speed)       || 0,
    duration:   parseFloat(r.duration)    || 0,
    area:       parseFloat(r.area)        || 0,
    cooldown:   parseFloat(r.cooldown)    || 0,
    amount:     parseFloat(r.amount)      || 0,
    revival:    parseFloat(r.revival)     || 0,
    magnet:     parseFloat(r.magnet)      || 0,
    luck:       parseFloat(r.luck)        || 0,
    growth:     parseFloat(r.growth)      || 0,
    greed:      parseFloat(r.greed)       || 0,
    curse:      parseFloat(r.curse)       || 0,
  },
}));

// ─── Parse limit-break table ───────────────────────────────────────────────
// `limit_break` column: brace-wrapped, pipe-separated rows. Limit Break = a weapon keeps
// leveling past its last level; each row is a stat that can roll, its per-roll Value, its
// selection weight (Rarity), and a cap (Max; "-"/blank = uncapped). The source is inconsistent
// across weapons — two row layouts appear:
//   A) "Stat[:| ]Value,Rarity,Max"  e.g. "Might: 0.05,10,-"   (stat+value combined in field 0)
//   B) "Stat,Value[,Rarity[,Max]]"  e.g. "Might,0.0025"        (stat & value as separate fields)
// Detect A by a trailing number (opt. unit %/ms…) in field 0; else fall back to B.
// Emits { stat, value, rarity, max } rows ('' for missing/none).
function parseLimitBreak(raw) {
  const cell = unwrap(raw);
  if (!cell || cell === '-') return [];
  const none = v => (v === undefined || v === '' || v === '-') ? '' : v;
  return cell.split('|').map(s => s.trim()).filter(Boolean).map(row => {
    const parts = row.split(',').map(s => s.trim());
    const field = parts[0] || '';
    const m = field.match(/^(.*?)[:\s]+(-?\d[\d.]*(?:\s*[a-zA-Z%]+)?)$/); // stat + trailing value
    return m
      ? { stat: m[1].trim(), value: m[2], rarity: none(parts[1]), max: none(parts[2]) } // layout A
      : { stat: field,       value: none(parts[1]), rarity: none(parts[2]), max: none(parts[3]) }; // layout B
  }).filter(r => r.stat && r.stat !== '?'); // "?" = source placeholder / limit-break data TBD
}

// ─── Process weapons ──────────────────────────────────────────────────────

const rawWeapons = readCsv('weapons.csv');
const weapons = rawWeapons.filter(r => r.weapon && r.weapon !== '-').map(r => {
  const arcana_ratings = {};
  ARCANA_COL_KEYS.forEach(col => {
    if (r[col] && r[col] !== '-') arcana_ratings[col] = r[col];
  });
  // New schema brace-wraps every descriptive/relational weapon field ({Evolution},
  // {Union}, {Vento Sacro}, {-}); unwrap before any value comparison or the category/
  // method/requirement/evo-chain logic all break.
  const reqs = [r.requirement_1, r.requirement_2, r.requirement_3]
    .map(unwrap).filter(x => x && x !== '-');
  const name = r.weapon;
  const final_state = unwrap(r.final_state);
  // A self-referencing trans_result (== own name) is a source-data artifact that would
  // create an evo-chain cycle (infinite loop in chain walkers). Recover the real
  // evolution from final_state when it's distinct, otherwise treat it as a final form.
  let trans_result = nullIfDash(unwrap(r.trans_result));
  if (trans_result === name) trans_result = (final_state && final_state !== name) ? final_state : null;
  return {
    name,
    icon: iconPath(r.icon_path),
    category: unwrap(r.category) || 'Base',
    method: nullIfDash(unwrap(r.method)),
    description: unwrap(r.description),
    level_ups: unwrap(r.level_up_text).split('|').map(s => s.trim()).filter(Boolean),
    limit_break: parseLimitBreak(r.limit_break),
    trans_conditions: unwrap(r.trans_conditions),
    trans_result,
    requirements: reqs,
    final_state,
    // Collection/free-pick pool tag (Candybox-like items): pool members share the pool's
    // name here (e.g. the 8 whips = "Magic Whip"). N/A / - / empty → null.
    ode_category: (() => { const v = unwrap(r.ode_category); return (!v || v === '-' || v === 'N/A') ? null : v; })(),
    arcana_ratings,
    rarity: parseInt(unwrap(r.rarity)) || 0,
  };
});

// ─── Process passives ─────────────────────────────────────────────────────

// Parse a passive's brace-wrapped `level_up_value`: pipe-separated per level, each a
// stat (`key: value`), a grant (`add_hidden: 1 [Garlic]` — a hidden-weapon effect), or
// `-`. Stats go to level_up_values (empty {} for grant/`-` levels); grant segments are
// returned raw for the second pass (which resolves their `kind`).
function parsePassiveLevelValue(raw) {
  const cell = unwrap(raw);
  if (!cell || cell === '-') return { levels: [], grantRaw: '' };
  const levels = [], grantSegs = [];
  for (const part of splitOutsideBrackets(cell, '|')) {
    const p = part.trim();
    if (!p || p === '-') { levels.push({}); continue; }
    const ci = p.indexOf(':');
    const key = ci >= 0 ? p.slice(0, ci).trim() : p;
    if (GRANT_OP_PLACE[key]) { grantSegs.push('{' + p + '}'); levels.push({}); }
    else { const v = parseFloat(p.slice(ci + 1)); levels.push(isNaN(v) ? {} : { [key]: v }); }
  }
  return { levels, grantRaw: grantSegs.join('|') };
}

const rawPassives = readCsv('passives.csv', true);
const passives = rawPassives.filter(r => r.item).map(r => {
  const { levels, grantRaw } = parsePassiveLevelValue(r['level_up_value']);
  return {
    name: r.item,
    icon: iconPath(r.icon_path),
    max_level: parseInt(r.max_level) || 0,
    rarity: parseInt(r.rarity) || 0,
    description: unwrap(r.description),
    level_ups: unwrap(r['level_up_text']).split('|').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean),
    level_up_values: levels,
    consumed_on_evo: /^true$/i.test((r.consumed_on_evo || '').trim()),
    grants: [],           // hidden-weapon / item grants; resolved in the second pass
    _grantRaw: grantRaw,
  };
});

// ─── Process arcana ───────────────────────────────────────────────────────

const rawArcana = readCsv('arcana.csv');
const arcana = rawArcana.filter(r => r.name).map(r => {
  const numRaw = (r['#'] || '').trim();
  const type   = (r.type || 'Arcana').trim();
  // Both Arcana and Darkana share the same numeric # value — use it as base_num for stacking
  const base_num = numRaw;
  const weapon_col = type === 'Darkana'
    ? (DARKANA_NUM_TO_COL[numRaw] || null)
    : (ARCANA_NUM_TO_COL[numRaw]  || null);
  return {
    name: r.name,
    icon: iconPath(r.icon_path),
    number: numRaw,
    base_num,
    type,
    weapon_col,
    description: unwrap(r.description),
    // New schema dropped the prose `additional_effects_clarification`; no prose source
    // remains, so notes stays empty (the detail panel guards on truthiness). The
    // affects_* pipe-lists are captured as arrays for the future Arcana Info Panel rework.
    notes: '',
    affects_explicit: splitItems(r.affects_explicit),
    affects_implicit: splitItems(r.affects_implicit),
    affinity: splitItems(r.affinity),
  };
});

// ─── Synthesize phantom starter weapons ───────────────────────────────────
// Some characters start with an item that has no weapons.csv row. When it's a real
// (if icon-only) weapon like Random, emit a minimal Special weapon (excluded from the
// selector grid, non-evolving) pointing at the existing art so it can occupy a locked
// starter slot. Extend `phantomStarterIcon` as new cases surface.
// NOTE: the Glimmer "… Tech" innate attacks are deliberately NOT mapped here — they are
// character abilities, not weapons/items, and will be surfaced by the future Glimmer
// Tech overlay instead of forced into an item slot. They should be removed from the
// characters.csv starting_loadout; an unmapped one will warn below until it is.
function phantomStarterIcon(name) {
  if (name === 'Random') return 'assets/icons/weapons/random.png';
  return null;
}
{
  const wNames = new Set(weapons.map(w => w.name));
  const pNames = new Set(passives.map(p => p.name));
  const seen = new Set();
  characters.forEach(c => c.starting_weapons.forEach(nm => {
    if (wNames.has(nm) || pNames.has(nm) || seen.has(nm)) return;
    seen.add(nm);
    const icon = phantomStarterIcon(nm);
    if (!icon) { console.warn(`phantom starter "${nm}" (${c.name}) has no icon mapping — add one to phantomStarterIcon`); return; }
    weapons.push({
      name: nm, icon, category: 'Special', method: null, description: '',
      level_ups: [], limit_break: [], trans_conditions: '', trans_result: null, requirements: [],
      final_state: nm, ode_category: null, arcana_ratings: {}, rarity: 0,
    });
  }));
}

// ─── Attach character grants (second pass) ────────────────────────────────
// Runs after weapons/passives/arcana exist so `kind` resolves. `Passive Slot` /
// `Arcana Slot` are synthetic "add an empty slot" grants → kind:"slot".
{
  const SLOT_REFS = new Set(['Passive Slot', 'Arcana Slot', 'Weapon Slot']);
  const wN = new Set(weapons.map(w => w.name));
  const pN = new Set(passives.map(p => p.name));
  const aN = new Set(arcana.map(a => a.name));
  const kindOf = n => SLOT_REFS.has(n) ? 'slot'
    : wN.has(n) ? 'weapon' : pN.has(n) ? 'passive' : aN.has(n) ? 'arcana' : null;
  characters.forEach((c, i) => {
    c.grants = parseRuleBlocks(rawChars[i].add_item, kindOf, c.name);
  });
  // Passive grants (e.g. Mini <X> → a hidden weapon) resolved with the same kindOf.
  passives.forEach(p => { p.grants = parseRuleBlocks(p._grantRaw, kindOf, p.name); delete p._grantRaw; });
}

// ─── Process stats (power-ups) ───────────────────────────────────────────

function parsePowerUpLevels(raw) {
  if (!raw || raw.trim() === '-') return [];
  return raw.split('|').map(levelStr => {
    const mods = {};
    levelStr.split(',').forEach(mod => {
      const colonIdx = mod.indexOf(':');
      if (colonIdx < 0) return;
      const key = mod.slice(0, colonIdx).trim();
      const val  = parseFloat(mod.slice(colonIdx + 1).trim());
      if (key && !isNaN(val)) mods[key] = val;
    });
    return Object.keys(mods).length > 0 ? mods : null;
  }).filter(Boolean);
}

const rawStats = readCsv('stats.csv');
const stats = rawStats.filter(r => r.name).map(r => {
  const levels = parsePowerUpLevels(r.power_ups_value);
  return {
    name:       r.name.trim(),
    key:        r.name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
    icon:       iconPath(r.icon_path),
    description:(r.description || '').trim(),
    base_value: parseFloat(r.base_value) || 0,
    base_raw:   (r.base_value || '0').trim(),
    max_value:  r.max_value && r.max_value !== '-' ? parseFloat(r.max_value) : null,
    stacking:   (r.stacking || 'additive').trim(),
    levels,
    max_level:  levels.length,
  };
});

// ─── Parse banish layout ──────────────────────────────────────────────────
// banish_layout.csv: no headers, 8 columns per row, matches in-game collection window order

let banishLayout = [];
try {
  const rawBanish = readFileSync(join(SKILL_DATA, 'banish_layout.csv'), 'utf8');
  banishLayout = rawBanish
    .split(/\r?\n/)
    .filter(line => line.trim())
    .flatMap(line => line.split(',').map(s => s.trim() || null));
} catch (err) {
  console.warn(`Warning: could not read banish_layout.csv — ${err.message}`);
}

// ─── Process evo paths ───────────────────────────────────────────────────────

function nullIfDash(v) { return (!v || v.trim() === '-') ? null : v.trim(); }

const rawEvoPaths = readCsv('evo_paths.csv');
const evoPaths = rawEvoPaths.filter(r => r.evo_path).map(r => ({
  evo_path: r.evo_path.trim(),
  // Fix data error: bare "Evolution" should be Evo(Max)>Final
  pattern: r.pattern.trim() === 'Evolution' ? 'Evo(Max)>Final' : r.pattern.trim(),
  b1_1: nullIfDash(r.branch_1_1),
  b1_2: nullIfDash(r.branch_1_2),
  b1_3: nullIfDash(r.branch_1_3),
  b1_4: nullIfDash(r.branch_1_4),
  b1_r: nullIfDash(r.branch_1_r),
  b2_1: nullIfDash(r.branch_2_1),
  b2_2: nullIfDash(r.branch_2_2),
  b2_r: nullIfDash(r.branch_2_r),
  b3_1: nullIfDash(r.branch_3_1),
  b3_2: nullIfDash(r.branch_3_2),
  b3_r: nullIfDash(r.branch_3_r),
  related_to: (r.related_to || '').split('|').map(s => s.trim()).filter(Boolean),
}));

// ─── Process stages ──────────────────────────────────────────────────────
// stage_items is a pipe-delimited list of items freely found on the stage. Some items are
// gated behind an arcana and written as "<arcana_slug>: {A|B|C}" (e.g. Boss Rash uses
// "mad_groove_viii: {…}" — those items only appear WITH Mad Groove (VIII) equipped). We
// keep those separate as `conditional` groups so consumers can include them only when the
// gating arcana is in the build.

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// slug (e.g. "mad_groove_viii") → arcana name (e.g. "Mad Groove (VIII)")
const arcanaBySlug = {};
arcana.forEach(a => { arcanaBySlug[slugify(a.name)] = a.name; });

function parseStageItems(raw) {
  const result = { items: [], conditional: [] };
  if (!raw || raw.trim() === '-') return result;
  const groupRe = /([a-z0-9_]+)\s*:\s*\{([^}]*)\}/gi;
  let stripped = raw;
  let m;
  while ((m = groupRe.exec(raw)) !== null) {
    const slug  = m[1].toLowerCase();
    const items = m[2].split('|').map(x => x.trim()).filter(x => x && x !== '-');
    result.conditional.push({ arcana: arcanaBySlug[slug] || slug, items });
    stripped = stripped.replace(m[0], '');
  }
  result.items = stripped.split('|').map(x => x.trim()).filter(x => x && x !== '-');
  return result;
}

const rawStages = readCsv('stages.csv');
const stages = rawStages.filter(r => r.name).map(r => {
  const parsed = parseStageItems(r.stage_items);
  return {
    name: r.name.trim(),
    icon: iconPath(r.icon_path),
    description: (r.description || '').trim(),
    items: parsed.items,
    conditional: parsed.conditional,
  };
});

// ─── Write output ─────────────────────────────────────────────────────────

mkdirSync(DATA_OUT, { recursive: true });

const out = `// Generated by tools/build-data.mjs — do not edit by hand
window.VS_DATA = ${JSON.stringify({ characters, weapons, passives, arcana, banishLayout, stats, evoPaths, stages }, null, 2)};
`;

writeFileSync(join(DATA_OUT, 'data.js'), out);

console.log(`characters: ${characters.length}`);
console.log(`weapons:    ${weapons.length}`);
console.log(`passives:   ${passives.length}`);
console.log(`arcana:     ${arcana.length}`);
console.log(`evoPaths:   ${evoPaths.length}`);
console.log(`stages:     ${stages.length}`);
console.log('Wrote data/data.js');
