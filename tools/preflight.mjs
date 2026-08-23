#!/usr/bin/env node
// Preflight deploy gate for VS Build Calc.
//
// Run this before every push to master (`node tools/preflight.mjs`). It's the automated half of
// our deploy checklist — the "test cases come back good" gate that runs before the manual on-device
// pass. It mirrors the ad-hoc checks we'd otherwise run by hand:
//
//   [1] index.html's inline <script> parses          — catches JS syntax errors before they ship.
//   [2] data/data.js parses and sets window.VS_DATA   — catches a corrupt/empty data build.
//   [3] every icon referenced in data.js exists       — catches broken image refs (e.g. a new trait
//        icon that wasn't committed). Missing .png = FAIL; a missing character _sprite.gif is only a
//        WARN, because charSpriteHTML falls back gif -> static -> icon and never shows a broken image.
//
// Exit code is non-zero if anything FAILS, so it can gate a push (or a git pre-push hook). This does
// NOT replace the manual on-device check — it's the fast automated floor beneath it.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0, warns = 0;
const fail = m => { console.error('  ✗ ' + m); fails++; };
const warn = m => { console.warn('  ! ' + m); warns++; };
const ok   = m => console.log('  ✓ ' + m);

// ── [1] index.html inline script parses ──
console.log('\n[1] index.html inline script');
try {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const scripts = html.match(/<script>([\s\S]*?)<\/script>/g) || [];
  let biggest = '';
  for (const s of scripts) if (s.length > biggest.length) biggest = s;
  if (!biggest) fail('no inline <script> block found in index.html');
  else {
    const body = biggest.replace(/^<script>/, '').replace(/<\/script>$/, '');
    new Function(body); // throws on a syntax error
    ok(`inline script parses (${body.length.toLocaleString()} chars)`);
  }
} catch (e) {
  fail('inline script parse error: ' + e.message);
}

// ── [2] data/data.js parses and sets window.VS_DATA ──
console.log('\n[2] data/data.js');
let data = null;
try {
  const js = readFileSync(join(ROOT, 'data/data.js'), 'utf8');
  const win = {};
  new Function('window', js)(win); // data.js does `window.VS_DATA = …`
  data = win.VS_DATA;
  if (!data) fail('data.js ran but did not set window.VS_DATA');
  else {
    const counts = ['characters', 'weapons', 'passives', 'arcana', 'affinities', 'evoPaths', 'stages']
      .filter(k => data[k]).map(k => `${k}:${data[k].length}`).join('  ');
    ok(`parses & sets VS_DATA — ${counts}`);
  }
} catch (e) {
  fail('data.js parse error: ' + e.message);
}

// ── [3] icon references in data.js exist on disk ──
console.log('\n[3] icon asset references (data.js)');
try {
  const js = readFileSync(join(ROOT, 'data/data.js'), 'utf8');
  // Paths sit inside JSON strings, so match up to the closing quote. Filenames are sanitized to
  // lowercase/underscores but a few include & (e.g. charlotte_&_jonathan_sprite.gif).
  const refs = [...new Set(js.match(/assets\/icons\/[^"]+?\.(?:png|gif)/g) || [])];
  const missing = refs.filter(p => !existsSync(join(ROOT, p)));
  const missPng = missing.filter(p => p.toLowerCase().endsWith('.png'));
  const missGif = missing.filter(p => p.toLowerCase().endsWith('.gif'));
  for (const p of missPng) fail('missing icon (would 404 on the live site): ' + p);
  // Character sprite gifs are a permanently-absent set (none are produced) with a graceful
  // gif->static->icon fallback, so collapse them to one line — listing each would bury a real
  // missing .png. Pass --verbose to see the full gif list.
  const verbose = process.argv.includes('--verbose');
  if (missGif.length) {
    if (verbose) missGif.forEach(p => warn('missing sprite gif — graceful fallback, ok: ' + p));
    else warn(`${missGif.length} character sprite gif${missGif.length === 1 ? '' : 's'} absent — graceful fallback, ok (--verbose to list)`);
  }
  if (!missing.length) ok(`all ${refs.length} referenced icons present`);
  else if (!missPng.length) ok(`all ${refs.length - missGif.length} required icons present`);
} catch (e) {
  fail('icon sweep error: ' + e.message);
}

// ── summary ──
console.log('');
if (fails) {
  console.error(`PREFLIGHT FAILED — ${fails} error(s), ${warns} warning(s). Do not push.`);
  process.exit(1);
}
console.log(`PREFLIGHT OK — ${warns} warning(s). Safe to push (after the manual on-device pass).`);
