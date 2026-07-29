/**
 * build-index.mjs
 * Regenerates builds/index.json from all build JSON files in builds/.
 *
 * Usage:
 *   node tools/build-index.mjs
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILDS_DIR = join(__dirname, '../builds');

const files = readdirSync(BUILDS_DIR).filter(
  f => f.endsWith('.json') && f !== 'index.json'
);

const builds = files.map(file => {
  try {
    const data = JSON.parse(readFileSync(join(BUILDS_DIR, file), 'utf8'));
    return {
      file,
      name: data.name ?? file.replace('.json', ''),
      character: data.character ?? null,
      mode: data.mode ?? 'Solo',
      goal: data.goal ?? null,
    };
  } catch {
    console.warn(`Skipping ${file} — could not parse`);
    return null;
  }
}).filter(Boolean);

writeFileSync(
  join(BUILDS_DIR, 'index.json'),
  JSON.stringify({ builds }, null, 2)
);

console.log(`index.json updated — ${builds.length} build(s) indexed`);
