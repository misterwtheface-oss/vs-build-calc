import { readFileSync, existsSync } from 'fs';
import { createRequire } from 'module';

const src = readFileSync('./data/data.js', 'utf8');
const global_window = {};
const fn = new Function('window', src);
fn(global_window);
const { characters, weapons, passives } = global_window.VS_DATA;

function check(items, label) {
  const missing = items.filter(item => {
    if (!item.icon) return false;
    return !existsSync('.' + (item.icon.startsWith('/') ? item.icon : '/' + item.icon));
  });
  console.log(`\n=== ${label}: ${missing.length} missing / ${items.length} total ===`);
  for (const m of missing) console.log(`  [${m.name}] -> ${m.icon}`);
}

check(characters, 'Characters');
check(weapons,    'Weapons');
check(passives,   'Passives');
