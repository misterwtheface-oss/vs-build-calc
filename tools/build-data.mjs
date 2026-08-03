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

// ─── Process characters ───────────────────────────────────────────────────

const rawChars = readCsv('characters.csv');
const characters = rawChars.map(r => ({
  name: r.name,
  icon: iconPath(r.icon_path),
  base_name: r.base_name || r.name,
  starting_weapons: [r.starting_weapon_1, r.starting_weapon_2, r.starting_weapon_3]
    .map(w => (w || '').trim()).filter(w => w && w !== '-'),
  starting_arcana: (r.starting_arcana || '').trim().replace(/^-$/, '') || null,
  description: (r.character_description || '').trim(),
  notes: (r.additional_effects_clarification || '').trim(),
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
    description: (r.description || '').trim(),
    level_ups: (r.level_ups || '').split('|').map(s => s.trim()).filter(Boolean),
    trans_conditions: (r.trans_conditions || '').trim(),
    trans_result: (r.trans_result || '').trim(),
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
  // 6th unnamed column holds per-level descriptions (pipe-separated)
  level_ups: (r[''] || '').split('|').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean),
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

// ─── Write output ─────────────────────────────────────────────────────────

mkdirSync(DATA_OUT, { recursive: true });

const out = `// Generated by tools/build-data.mjs — do not edit by hand
window.VS_DATA = ${JSON.stringify({ characters, weapons, passives, arcana, banishLayout }, null, 2)};
`;

writeFileSync(join(DATA_OUT, 'data.js'), out);

console.log(`characters: ${characters.length}`);
console.log(`weapons:    ${weapons.length}`);
console.log(`passives:   ${passives.length}`);
console.log(`arcana:     ${arcana.length}`);
console.log('Wrote data/data.js');
