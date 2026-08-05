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

function parseCsv(raw) {
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
    let field = '';
    while (pos < n && raw[pos] !== ',' && raw[pos] !== '\n' && raw[pos] !== '\r') field += raw[pos++];
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
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (fields[i] ?? '').trim(); });
      results.push(obj);
    }
  }
  return results;
}

function readCsv(filename) {
  try {
    return parseCsv(readFileSync(join(SKILL_DATA, filename), 'utf8'));
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

function parseScaling(raw) {
  if (!raw || raw.trim() === '-') return [];
  return raw.split('|').map(s => s.trim()).filter(Boolean).flatMap(part => {
    const colonIdx = part.indexOf(':');
    if (colonIdx < 0) return [];
    const key  = part.slice(0, colonIdx).trim();
    const rest = part.slice(colonIdx + 1).trim();
    const perMatch = rest.match(/^([-\d.]+)\s+per\s+(\d+\s+)?level(?:\s*,\s*max:\s*([-\d.]+))?/i);
    if (perMatch) {
      const value       = parseFloat(perMatch[1]);
      const intervalStr = perMatch[2] ? perMatch[2].trim() : null;
      const interval    = intervalStr !== null ? parseInt(intervalStr) : null;
      const max         = perMatch[3] !== undefined ? parseFloat(perMatch[3]) : null;
      return [{ key, value, interval, max }];
    }
    const flatMatch = rest.match(/^([-\d.]+)$/);
    if (flatMatch) return [{ key, value: parseFloat(flatMatch[1]), interval: 0, max: null }];
    return [];
  });
}

// ─── Process characters ───────────────────────────────────────────────────

function splitItems(raw) {
  return (raw || '').split('|').map(s => s.trim()).filter(s => s && s !== '-');
}

const rawChars = readCsv('characters.csv');
const characters = rawChars.map(r => ({
  name: r.name,
  icon: iconPath(r.icon_path),
  sprite_static: iconPath(r.sprite_static_path),
  sprite_gif: iconPath(r.sprite_gif_path),
  base_name: r.base_name || r.name,
  starting_weapons: [r.starting_weapon_1, r.starting_weapon_2, r.starting_weapon_3]
    .map(w => (w || '').trim()).filter(w => w && w !== '-'),
  hidden_items:  splitItems(r.hidden_items),
  max_items:     splitItems(r.max_items),
  starting_arcana: (r.starting_arcana || '').trim().replace(/^-$/, '') || null,
  description: (r.character_description || '').trim(),
  notes: (r.additional_effects_clarification || '').trim(),
  scaling: parseScaling(r.scaling),
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

// ─── Process weapons ──────────────────────────────────────────────────────

const rawWeapons = readCsv('weapons.csv');
const weapons = rawWeapons.filter(r => r.weapon && r.weapon !== '-').map(r => {
  const arcana_ratings = {};
  ARCANA_COL_KEYS.forEach(col => {
    if (r[col] && r[col] !== '-') arcana_ratings[col] = r[col];
  });
  const reqs = [r.requirement_1, r.requirement_2, r.requirement_3]
    .map(x => (x || '').trim()).filter(x => x && x !== '-');
  return {
    name: r.weapon,
    icon: iconPath(r.icon_path),
    category: (r.category || 'Base').trim(),
    method: nullIfDash(r.method),
    description: (r.description || '').trim(),
    level_ups: (r.level_ups || '').split('|').map(s => s.trim()).filter(Boolean),
    trans_conditions: (r.trans_conditions || '').trim(),
    trans_result: nullIfDash(r.trans_result),
    requirements: reqs,
    final_state: (r.final_state || '').trim(),
    arcana_ratings,
    rarity: parseInt(r.rarity) || 0,
  };
});

// ─── Process passives ─────────────────────────────────────────────────────

const rawPassives = readCsv('passives.csv');
const passives = rawPassives.filter(r => r.item).map(r => ({
  name: r.item,
  icon: iconPath(r.icon_path),
  max_level: parseInt(r.max_level) || 0,
  rarity: parseInt(r.rarity) || 0,
  description: (r.description || '').trim(),
  level_ups: (r['level_up_text'] || '').split('|').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean),
  level_up_values: parsePowerUpLevels(r['level_up_value']),
}));

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
    description: (r.description || '').trim(),
    notes: (r.additional_effects_clarification || '').trim(),
  };
});

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

// ─── Write output ─────────────────────────────────────────────────────────

mkdirSync(DATA_OUT, { recursive: true });

const out = `// Generated by tools/build-data.mjs — do not edit by hand
window.VS_DATA = ${JSON.stringify({ characters, weapons, passives, arcana, banishLayout, stats, evoPaths }, null, 2)};
`;

writeFileSync(join(DATA_OUT, 'data.js'), out);

console.log(`characters: ${characters.length}`);
console.log(`weapons:    ${weapons.length}`);
console.log(`passives:   ${passives.length}`);
console.log(`arcana:     ${arcana.length}`);
console.log(`evoPaths:   ${evoPaths.length}`);
console.log('Wrote data/data.js');
