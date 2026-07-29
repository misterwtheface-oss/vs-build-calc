/**
 * build-data.mjs
 * Converts CSV files from the vampire-survivors-theorycraft skill into
 * JSON data files consumed by the build planner frontend.
 *
 * Usage:
 *   node tools/build-data.mjs
 *
 * Reads from:
 *   <skill-dir>/references/data/*.csv
 *
 * Writes to:
 *   data/characters.json
 *   data/weapons.json
 *   data/passives.json
 *   data/evolutions.json
 *   data/stages.json
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

// Path to the skill's data CSVs — adjust if the skill moves
const SKILL_DATA = join(
  __dirname,
  '../../../.claude/skills/vampire-survivors-theorycraft/references/data'
);

const DATA_OUT = join(REPO_ROOT, 'data');

/** Parse a CSV string into an array of objects keyed by header row. */
function parseCsv(raw) {
  const lines = raw.trim().split(/\r?\n/);
  if (lines.length < 2) return []; // headers only — stub file
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((h, i) => [h.trim(), (values[i] ?? '').trim()]));
  });
}

function readCsv(filename) {
  try {
    return parseCsv(readFileSync(join(SKILL_DATA, filename), 'utf8'));
  } catch (err) {
    console.warn(`Warning: could not read ${filename} — ${err.message}`);
    return [];
  }
}

function writeJson(filename, data) {
  mkdirSync(DATA_OUT, { recursive: true });
  writeFileSync(join(DATA_OUT, filename), JSON.stringify(data, null, 2));
  console.log(`Wrote ${filename} (${data.length} records)`);
}

const characters = readCsv('characters.csv');
const weapons    = readCsv('weapons.csv');
const passives   = readCsv('passives.csv');
const evolutions = readCsv('evolutions.csv');
const stages     = readCsv('stages.csv');

writeJson('characters.json', characters);
writeJson('weapons.json', weapons);
writeJson('passives.json', passives);
writeJson('evolutions.json', evolutions);
writeJson('stages.json', stages);

console.log('Done. Run `node tools/build-index.mjs` to rebuild the builds index.');
