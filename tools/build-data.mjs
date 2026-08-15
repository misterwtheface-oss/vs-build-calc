/**
 * build-data.mjs
 * Converts CSV files from the vampire-survivors-theorycraft skill
 * into data/data.js consumed by the build planner.
 *
 * Usage: node tools/build-data.mjs   (from vs-build-calc root)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { inflateSync } from 'zlib';

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

// Like iconPath, but only returns the path when the asset actually exists in the repo — many
// pickups/consumables carry a sprite_path with no sprite art, and render should fall back to the
// square icon rather than a broken/empty image.
function spritePathIfExists(raw) {
  const p = iconPath(raw);
  return p && existsSync(join(REPO_ROOT, p)) ? p : '';
}

// ─── Dominant color from a PNG (build-time, for affinity banners) ──────────
// Self-contained decoder (zlib only, no deps). Supports 8-bit color types
// 0/2/3/4/6, non-interlaced — the affinity icon set. Anything else / any decode
// failure returns FALLBACK_COLOR so the build never breaks over an odd asset.
//
// "Primary color": bucket opaque, non-extreme pixels by 32-step RGB, pick the
// heaviest bucket, and return the true average of that bucket. This resists the
// muddy-gray you get from averaging every pixel together. Tunable later.
const FALLBACK_COLOR = '#6a4010';
// Banners read better muted — scale the extracted color's brightness down so vivid icon
// colors don't glare behind the label text. Tunable.
const BANNER_MUTE = 0.62;

function toHex(r, g, b) {
  const h = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b);
}
function muteHex(r, g, b) { return toHex(r * BANNER_MUTE, g * BANNER_MUTE, b * BANNER_MUTE); }

function decodePngRGBA(buf) {
  // Signature check
  const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== SIG[i]) return null;
  let pos = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  let palette = null, trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); pos += 4;
    const type = buf.toString('ascii', pos, pos + 4); pos += 4;
    const data = buf.subarray(pos, pos + len); pos += len; pos += 4; // skip CRC
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'PLTE') { palette = data; }
    else if (type === 'tRNS') { trns = data; }
    else if (type === 'IDAT') { idat.push(data); }
    else if (type === 'IEND') break;
  }
  // Accept bit depths 1/2/4/8/16 (sub-byte only meaningful for palette/grayscale; 16-bit read
  // as its high byte). Interlaced PNGs are out of scope → fallback.
  if (interlace !== 0 || ![1, 2, 4, 8, 16].includes(bitDepth)) return null;
  const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const ch = CHANNELS[colorType];
  if (!ch) return null;
  if (bitDepth < 8 && !(colorType === 0 || colorType === 3)) return null; // sub-byte: gray/palette only
  let raw;
  try { raw = inflateSync(Buffer.concat(idat)); } catch { return null; }
  const bppBits  = bitDepth * ch;
  const bpp      = Math.ceil(bppBits / 8);            // bytes per pixel, for the filter recon
  const stride   = Math.ceil((width * bppBits) / 8);  // bytes per scanline
  if (raw.length < (stride + 1) * height) return null;
  // Unfilter scanlines into `out`.
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[dst + x - bpp] : 0;             // left
      const b = y > 0 ? out[dst - stride + x] : 0;             // up
      const c = (x >= bpp && y > 0) ? out[dst - stride + x - bpp] : 0; // up-left
      let v = raw[src + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      out[dst + x] = v & 0xff;
    }
  }
  const maxSample = (1 << bitDepth) - 1;
  // Read channel `c` of the pixel at (col, row) as 0–255 — handles packed sub-byte samples
  // and 16-bit (via its high byte).
  function sample(row, col, c) {
    if (bitDepth === 16) return out[row * stride + (col * ch + c) * 2];  // high byte
    if (bitDepth === 8) return out[row * stride + col * ch + c];
    const bitPos = (col * ch + c) * bitDepth;         // ch is 1 for sub-byte formats
    const byteIdx = row * stride + (bitPos >> 3);
    const shift = 8 - bitDepth - (bitPos & 7);
    return (out[byteIdx] >> shift) & maxSample;
  }
  return { width, height, colorType, palette, trns,
    pixel(i) {
      const row = (i / width) | 0, col = i % width;
      if (colorType === 6) return [sample(row, col, 0), sample(row, col, 1), sample(row, col, 2), sample(row, col, 3)];
      if (colorType === 2) return [sample(row, col, 0), sample(row, col, 1), sample(row, col, 2), 255];
      if (colorType === 4) { const g = sample(row, col, 0); return [g, g, g, sample(row, col, 1)]; }
      if (colorType === 0) { const s = sample(row, col, 0); const g = bitDepth < 8 ? Math.round(s * 255 / maxSample) : s; return [g, g, g, 255]; }
      if (colorType === 3) { // palette index
        const idx = sample(row, col, 0);
        const p = palette ? [palette[idx * 3], palette[idx * 3 + 1], palette[idx * 3 + 2]] : [0, 0, 0];
        const al = trns && idx < trns.length ? trns[idx] : 255;
        return [p[0], p[1], p[2], al];
      }
      return [0, 0, 0, 0];
    } };
}

function dominantColor(absPath) {
  let img;
  try { img = decodePngRGBA(readFileSync(absPath)); } catch { return FALLBACK_COLOR; }
  if (!img) return FALLBACK_COLOR;
  const buckets = new Map(); // key → { r, g, b, n }
  let sumR = 0, sumG = 0, sumB = 0, sumN = 0; // opaque average (fallback for mono icons)
  const N = img.width * img.height;
  for (let i = 0; i < N; i++) {
    const [r, g, b, a] = img.pixel(i);
    if (a < 128) continue;                       // skip transparent
    sumR += r; sumG += g; sumB += b; sumN++;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx > 240 && mn > 240) continue;          // skip near-white
    if (mx < 18) continue;                         // skip near-black
    const key = (r >> 5) + ',' + (g >> 5) + ',' + (b >> 5);
    let bk = buckets.get(key);
    if (!bk) { bk = { r: 0, g: 0, b: 0, n: 0 }; buckets.set(key, bk); }
    bk.r += r; bk.g += g; bk.b += b; bk.n++;
  }
  // Pick the bucket scoring highest on frequency × colorfulness, so a vivid hue wins over a
  // larger dark/gray mass (outlines, shadows). The +8 keeps low-saturation icons from zeroing.
  let best = null, bestScore = -1;
  for (const bk of buckets.values()) {
    const r = bk.r / bk.n, g = bk.g / bk.n, b = bk.b / bk.n;
    const colorful = Math.max(r, g, b) - Math.min(r, g, b);
    const score = bk.n * (colorful + 8);
    if (score > bestScore) { bestScore = score; best = { r, g, b }; }
  }
  if (best) return muteHex(best.r, best.g, best.b);
  if (sumN) return muteHex(sumR / sumN, sumG / sumN, sumB / sumN); // all near-white/black icon
  return FALLBACK_COLOR;
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
    if (key === 'stat_choice') return []; // handled separately by parseStatChoices
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

// `stat_choice` rows in level_scaling → player-picked per-level bonuses. Each is a `value per N
// level [from level GATE]` term; the player chooses WHICH stat it lands on (a dropdown per gate).
// Blackmore = 5 gated (10/20/30/40/50); Joachim = 1 bare (gate 1). Emits { value, interval, gate }.
function parseStatChoices(raw) {
  const cell = (raw || '').replace(/^\{|\}$/g, '').trim();
  if (!cell || cell === '-') return [];
  return cell.split('|').map(s => s.trim()).filter(Boolean).flatMap(part => {
    if (!/^stat_choice\s*:/i.test(part)) return [];
    const rest = part.replace(/^stat_choice\s*:/i, '').trim();
    const valM = rest.match(/^(-?\d+(?:\.\d+)?)/);
    if (!valM) return [];
    const perM  = rest.match(/per\s+(\d+)?/i);
    const gateM = rest.match(/from\s+level\s+(\d+)/i);
    return [{ value: parseFloat(valM[1]), interval: perM && perM[1] ? parseInt(perM[1]) : 1, gate: gateM ? parseInt(gateM[1]) : 1 }];
  });
}

// ─── Parse reference_scaling ──────────────────────────────────────────────
// Character bonuses derived from OTHER build elements. Brace-wrapped, pipe-separated:
//   stat: value per <ref> [max M]
// <ref> is either
//   "<refValue> <refStat>"  → per-increment off another stat's ABOVE-BASE total (refValue may be
//                             negative, e.g. `-0.01 cooldown`); one `value` per `refValue` step.
//   "[Item]" / "[A, B, C]"  → per equipped copy of the referenced weapon/passive, SUMMED.
// Emits { key, value, max, refStat, refValue } or { key, value, max, refItems:[…] }.
function parseReferenceScaling(raw) {
  const cell = unwrap(raw);
  if (!cell) return [];
  return cell.split('|').map(s => s.trim()).filter(Boolean).flatMap(part => {
    const colon = part.indexOf(':');
    if (colon < 0) return [];
    const key  = part.slice(0, colon).trim();
    const rest = part.slice(colon + 1).trim();
    const valM = rest.match(/^(-?\d+(?:\.\d+)?)/);
    if (!valM) return [];
    const value = parseFloat(valM[1]);
    const maxM  = rest.match(/max\s+(-?\d+(?:\.\d+)?)/i);
    const max   = maxM ? parseFloat(maxM[1]) : null;
    const perM  = rest.match(/per\s+(.+?)(?:\s+max\s+-?\d|$)/i);
    if (!perM) { console.warn(`reference_scaling: no "per" in "${part}"`); return []; }
    const refRaw = perM[1].trim();
    const rule = { key, value, max };
    const itemM = refRaw.match(/^\[(.*)\]$/);
    if (itemM) {
      rule.refItems = itemM[1].split(',').map(s => s.trim()).filter(Boolean);
    } else {
      const m = refRaw.match(/^(-?\d+(?:\.\d+)?)\s+(.+)$/);
      if (!m) { console.warn(`reference_scaling: bad ref "${refRaw}" in "${part}"`); return []; }
      rule.refValue = parseFloat(m[1]);
      rule.refStat  = m[2].trim();
    }
    return [rule];
  });
}

// ─── Parse manual_scaling ─────────────────────────────────────────────────
// User-controlled bonuses tied to a conditional SOURCE (a per-player slider/toggle). Grammar:
//   stat: source <SourceName> min <minExpr> max <maxExpr> by <mode>
// mode = `boolean` (toggle 0/max) · `pct` (1%-step slider) · `<number>` (stepped slider).
// min/max are a plain number OR a derivative expr resolved at runtime against post-bonus totals:
//   `<stat>` | `<stat>*<n>` | `<n>*<stat>` | `<stat>/<n>` → { stat, factor }; number → { num };
//   anything more exotic (e.g. `(9999/6)*[Freeze]`, `1/(1+speed)`) is kept raw + flagged.
function parseManualExpr(s) {
  s = (s || '').trim();
  if (/^-?\d+(?:\.\d+)?$/.test(s)) return { num: parseFloat(s) };
  let m = s.match(/^([a-z_]+)\s*\*\s*(-?\d+(?:\.\d+)?)$/i); if (m) return { stat: m[1], factor: parseFloat(m[2]) };
  m = s.match(/^(-?\d+(?:\.\d+)?)\s*\*\s*([a-z_]+)$/i);     if (m) return { stat: m[2], factor: parseFloat(m[1]) };
  m = s.match(/^([a-z_]+)\s*\/\s*(-?\d+(?:\.\d+)?)$/i);     if (m) return { stat: m[1], factor: 1 / parseFloat(m[2]) };
  m = s.match(/^([a-z_]+)$/i);                              if (m) return { stat: m[1], factor: 1 };
  // Trait-count forms: `[Trait]` counts equipped items with that affinity; `n*[Trait]` /
  // `(a/b)*[Trait]` scale that count (Crystal Cries `(9999/6)*[Freeze]`, Heir of Fate `[Fire]`).
  m = s.match(/^\(?\s*([\d.]+)\s*\/\s*([\d.]+)\s*\)?\s*\*\s*\[([^\]]+)\]$/); if (m) return { const: parseFloat(m[1]) / parseFloat(m[2]), trait: m[3].trim() };
  m = s.match(/^([\d.]+)\s*\*\s*\[([^\]/(),*+]+)\]$/);                       if (m) return { const: parseFloat(m[1]), trait: m[2].trim() };
  m = s.match(/^\[([^\]/(),*+]+)\]$/);                                      if (m) return { const: 1, trait: m[1].trim() }; // trait names only — no arithmetic
  return { raw: s }; // unresolved (complex arcana expr, e.g. 1/(1+speed), [a,b]) — runtime skips the rule
}
function parseManualScaling(raw) {
  const cell = unwrap(raw);
  if (!cell) return [];
  return cell.split('|').map(s => s.trim()).filter(Boolean).flatMap(part => {
    const colon = part.indexOf(':');
    if (colon < 0) return [];
    const key  = part.slice(0, colon).trim();
    const rest = part.slice(colon + 1).trim();
    const srcM = rest.match(/source\s+(.+?)\s+min\b/i);
    const minM = rest.match(/\bmin\s+(.+?)\s+max\b/i);
    const maxM = rest.match(/\bmax\s+(.+?)\s+by\b/i);
    const byM  = rest.match(/\bby\s+(\S+)\s*$/i);
    if (!srcM || !minM || !maxM || !byM) { console.warn(`manual_scaling: malformed "${part}"`); return []; }
    const byRaw = byM[1].trim();
    let mode, step = null;
    if (/^boolean$/i.test(byRaw)) mode = 'boolean';
    else if (/^pct$/i.test(byRaw)) mode = 'pct';
    else { mode = 'step'; step = parseFloat(byRaw); if (!isFinite(step)) { console.warn(`manual_scaling: bad step "${byRaw}"`); return []; } }
    return [{ key, source: srcM[1].trim(), min: parseManualExpr(minM[1]), max: parseManualExpr(maxM[1]), mode, step }];
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

// Non-canonical elevation keys normalized to the canonical one ('primary'). Fix in the CSV
// to silence the warning; kept as an alias so old rows keep working meanwhile.
const AFFINITY_KEY_ALIASES = { priority: 'primary' };

// Parse an object's `affinity` column into ordered, optionally-keyed groups. Grammar
// (brace-wrapped cell): `{ [key:] [a, b, c] | [key:] [d, e] | … }` — `|` separates lists,
// `[]` wraps a list, `,` separates items, an optional `key:` flags a list (e.g. `Primary:`).
// A bare (unkeyed) list → key:null (the default, lower-priority group). Legacy cells with no
// `[` fall back to a single default list split on `|` (old pipe-list format), easing migration.
// Emits [{ key, items }] preserving authoring order; supports >2 lists and unknown keys.
// Known keys: `Primary:` (elevated); `null` = default. NOTE conflicts do NOT go here — they
// live in a separate `conflict` column so they never feed affinities.csv (would read as an
// association). `AFFINITY_NEGATIVE_KEYS` below stays as a guard against a stray `Conflict:` key.
function parseAffinityGroups(raw, ctx = '') {
  const cell = unwrap(raw);
  if (!cell) return [];
  if (!cell.includes('[')) {
    const items = cell.split('|').map(s => s.trim()).filter(Boolean);
    return items.length ? [{ key: null, items }] : [];
  }
  return splitOutsideBrackets(cell, '|').map(s => s.trim()).filter(Boolean).map(seg => {
    // key = any text before the ":[" that opens the list, e.g. "Primary" or an arcana name
    // like "Slash (XVI)" (spaces/parens allowed). `primary` is normalized lowercase (canonical
    // op); everything else keeps its original case so an arcana-name key matches by name.
    const m = seg.match(/^([^\[]*?)\s*:\s*\[/);
    let key = m ? m[1].trim() : null;
    if (key) {
      const lower = key.toLowerCase();
      if (AFFINITY_KEY_ALIASES[lower]) {
        console.warn(`affinity: key "${key}" → "${AFFINITY_KEY_ALIASES[lower]}" (${ctx}) — standardize the CSV`);
        key = AFFINITY_KEY_ALIASES[lower];
      } else if (lower === 'primary') key = 'primary';
    }
    const inner = (seg.match(/\[([^\]]*)\]/) || [, ''])[1];
    const items = inner.split(',').map(s => s.trim()).filter(Boolean);
    return { key, items };
  }).filter(g => g.items.length);
}

// Groups whose items are NOT positive associations (excluded from the flat `affinity` union).
const AFFINITY_NEGATIVE_KEYS = new Set(['conflict']);

// Emit both affinity fields from one parse (avoids double-parsing / double-warning). The flat
// `affinity` union is POSITIVE traits only (drops conflict etc.); `affinity_groups` keeps all.
function affinityFields(raw, ctx = '') {
  const affinity_groups = parseAffinityGroups(raw, ctx);
  const affinity = affinity_groups.filter(g => !AFFINITY_NEGATIVE_KEYS.has(String(g.key).toLowerCase())).flatMap(g => g.items);
  return { affinity_groups, affinity };
}

// The dedicated conflict column (`affinity_conflict`) → flat list of bad-trait names. Authored
// with the same grammar (usually `{Conflict:[Move Speed, Greed]}`, but a bare `{a|b}` works
// too); the key is irrelevant here — every item in this column is a conflict.
function conflictList(raw) { return parseAffinityGroups(raw).flatMap(g => g.items); }

// The affinities.csv `info` column → per-object interaction blurbs for a trait. Grammar:
//   { KEY:[free-text blurb] | KEY:[…] | … }   (or `{-}` for none)
// KEY is one object name, an arcana name with its numeral (`Blood Astronomia (XXI)` — kept
// verbatim, since arcana objects are named WITH the numeral and dropping it collides with the
// like-named weapon), or a bracketed comma-list sharing one blurb (`[Four Seasons, Godai
// Shuffle]`). Unlike the affinity grammar the blurb is NOT comma-split — it's prose. Emits
// `[{objects:[name…], blurb}]`.
function splitTopLevel(s, sep) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') depth = Math.max(0, depth - 1);
    if (ch === sep && depth === 0) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
function parseInfoEntries(raw, ctx = '') {
  const cell = unwrap(raw);            // strips the outer `{ … }` and normalizes `{-}` → ''
  if (!cell) return [];
  const entries = [];
  for (const group of splitTopLevel(cell, '|').map(g => g.trim()).filter(Boolean)) {
    const at = group.indexOf(':[');
    if (at < 0) { console.warn(`info: group without ":[" (${ctx}): ${group}`); continue; }
    let key = group.slice(0, at).trim();
    let blurb = group.slice(at + 1).trim().replace(/^\[/, '').replace(/\]$/, '').replace(/\s+/g, ' ').trim();
    if (key.startsWith('[') && key.endsWith(']')) key = key.slice(1, -1);
    const objects = key.split(',').map(s => s.trim()).filter(Boolean);
    if (objects.length && blurb) entries.push({ objects, blurb });
  }
  return entries;
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
    // `between LO and HI` = level window for a per-N grant (Young Maria: familiars from Lv2–50).
    // Parse before `at`/amount so its two numbers aren't mistaken for a level list / amount.
    const btw = work.match(/between\s+(\d+)\s+and\s+(\d+)/i);             if (btw) work = work.replace(btw[0], ' ');
    const at  = work.match(/at\s+(?:levels?\s+)?([\d\s,]+)/i);            if (at)  { work = work.replace(at[0], ' ').replace(/\blevels?\b/i, ' '); }
    const amt = work.match(/(\d+(?:\.\d+)?)/); // remaining lone number = amount
    for (const name of refs) {
      const kind = kindOf(name);
      if (!kind) console.warn(`grants: unresolved reference "${name}" — "${rule}" (${ctx})`);
      const g = { op, name, kind, place, amount: amt ? parseFloat(amt[1]) : 1 };
      if (per) g.interval = parseInt(per[1]);
      if (max) g.max = parseFloat(max[1]);
      if (at)  g.at = at[1].trim().split(/[\s,]+/).filter(Boolean).map(Number);
      if (btw) { g.betweenLo = parseInt(btw[1]); g.betweenHi = parseInt(btw[2]); }
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
  // My added context for effects unclear from the official blurb — shown below `description`.
  effect_clarifications: unwrap(r.effect_clarifications),
  notes: '',                                        // no source column in the new schema
  // Grouped affinity schema: `affinity_groups` = ordered [{key,items}] (key:'primary' etc.);
  // `affinity` stays a flat union for anything that just wants the whole list.
  ...affinityFields(r.affinity, r.name),
  // Conflicts live in their OWN column (NOT `affinity`, which feeds affinities.csv) so a bad
  // trait never becomes an association. Brace-wrapped, pipe-separated: `{Curse|Cooldown}`.
  conflict: conflictList(r.affinity_conflict),
  scaling: parseScaling(r.level_scaling),
  stat_choices: parseStatChoices(r.level_scaling),
  reference_scaling: parseReferenceScaling(r.reference_scaling),
  manual_scaling: parseManualScaling(r.manual_scaling),
  charge_ability: unwrap(r.charge_ability),
  grants: [], // filled in a second pass below (needs weapon/passive/arcana names for kind)
  stats: {
    // Multiplicative stats (max_health, magnet) split flat vs. percent:
    //   *_flat → additive to the stat's base (pre-multiplier); bare key → percentage factor.
    // `magnet` column holds percentages (0.25 = +25%); `magnet_flat` is a new column (default 0).
    max_health_flat: parseFloat(r.max_health_flat) || 0,
    magnet_flat:     parseFloat(r.magnet_flat)     || 0,
    magnet:          parseFloat(r.magnet)          || 0,
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
    sprite: spritePathIfExists(r.sprite_path), // full weapon sprite art; '' if no asset → icon at render
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
    // Weapon affinity groups: `Primary:` (elevated) + arcana-name keys (traits valid only WITH
    // that arcana) + unlisted default. Conflicts stay in their own column.
    ...affinityFields(r.affinity, r.weapon),
    conflict: conflictList(r.affinity_conflict), // traits BAD for this weapon (own column; not `affinity`)
    arcana: splitItems(r.arcana), // Arcana associated with this weapon (brace/pipe list of names)
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
    conflict: conflictList(r.affinity_conflict), // traits BAD for this passive (own column; not `affinity`)
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
  // Color identity for this arcana — colors the container of an arcana-conditional trait group.
  // Prefer an explicit `color` column; otherwise derive from the card art (muted, like traits).
  const icon = iconPath(r.icon_path);
  const color = unwrap(r.color) || (icon ? dominantColor(join(REPO_ROOT, icon)) : FALLBACK_COLOR);
  return {
    name: r.name,
    icon,
    color,
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
    // Character-bonus columns (same grammar as characters) — fed into the SAME calc engine, but
    // applied GLOBALLY to all players (like power-ups). manual_scaling grants its source to each
    // player's Character Sources (per-player independent sliders). `grants` filled in a 2nd pass.
    scaling: parseScaling(r.level_scaling),
    reference_scaling: parseReferenceScaling(r.reference_scaling),
    manual_scaling: parseManualScaling(r.manual_scaling),
    _grantRaw: r.add_item,
    grants: [],
    ...affinityFields(r.affinity, r.name),
    conflict: conflictList(r.affinity_conflict), // traits BAD for this arcana (own column; not `affinity`)
  };
});

// ─── Process affinities ───────────────────────────────────────────────────
// Affinity = an internal tag-association between build objects (never surfaced by that
// name in the UI). Each row lists the objects it relates to per category. `base_affinity`
// gives a shallow parent/child hierarchy: a row is a PARENT when it names itself as its
// base (Armor, Arcana, Character, and self-parents like Amount); a CHILD points at a
// different parent (Retaliation → Armor). Membership is pre-authored per row, so no rollup.
// `color` is the banner color, derived at build time from the icon's dominant color.
// `info_entries` are per-object interaction blurbs parsed from the `info` column (see parseInfoEntries).

const rawAffinities = readCsv('affinities.csv', true);
const affinities = rawAffinities.filter(r => r.affinity).map(r => {
  const name = unwrap(r.affinity) || r.affinity.trim();
  const base_affinity = unwrap(r.base_affinity) || name;
  const icon = iconPath(r.icon_path);
  const color = icon ? dominantColor(join(REPO_ROOT, icon)) : FALLBACK_COLOR;
  return {
    name,
    icon,
    color,
    base_affinity,
    is_parent: name === base_affinity,
    description: unwrap(r.description),
    // Per-object interaction blurbs: `[{objects:[name…], blurb}]` (parsed from the `info` column).
    info_entries: parseInfoEntries(r.info, name),
    related: {
      weapons:    splitItems(r.related_to_weapons),
      passives:   splitItems(r.related_to_passives),
      characters: splitItems(r.related_to_characters),
      arcana:     splitItems(r.related_to_arcana),
    },
  };
});

// Manual banner-color swaps: these pairs read better with each other's derived color.
const AFFINITY_COLOR_SWAPS = [['Max Health', 'Armor']];
for (const [a, b] of AFFINITY_COLOR_SWAPS) {
  const A = affinities.find(x => x.name === a), B = affinities.find(x => x.name === b);
  if (A && B) { const t = A.color; A.color = B.color; B.color = t; }
  else console.warn(`color swap: "${a}"/"${b}" — one side not found`);
}

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
  arcana.forEach(a => { a.grants = parseRuleBlocks(a._grantRaw, kindOf, a.name); delete a._grantRaw; });
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
window.VS_DATA = ${JSON.stringify({ characters, weapons, passives, arcana, affinities, banishLayout, stats, evoPaths, stages }, null, 2)};
`;

writeFileSync(join(DATA_OUT, 'data.js'), out);

console.log(`characters: ${characters.length}`);
console.log(`weapons:    ${weapons.length}`);
console.log(`passives:   ${passives.length}`);
console.log(`arcana:     ${arcana.length}`);
console.log(`affinities: ${affinities.length}`);
console.log(`evoPaths:   ${evoPaths.length}`);
console.log(`stages:     ${stages.length}`);
console.log('Wrote data/data.js');
