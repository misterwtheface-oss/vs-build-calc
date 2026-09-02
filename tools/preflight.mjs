#!/usr/bin/env node
// Preflight deploy gate for VS Build Calc.
//
// Run this before every push to master (`node tools/preflight.mjs`). It's the automated half of
// our deploy checklist — the "test cases come back good" gate that runs before the manual on-device
// pass. It mirrors the ad-hoc checks we'd otherwise run by hand:
//
//   [1] index.html's inline <script> parses          — catches JS syntax errors before they ship.
//   [2] data/data.js parses and sets window.VS_DATA   — catches a corrupt/empty data build.
//   [3] every icon referenced in data.js is COMMITTED — checked against git-tracked filenames with
//        EXACT case (GitHub Pages is case-sensitive Linux and ships only committed files), so it
//        catches an uncommitted icon AND a case mismatch (Resurrection.png vs resurrection.png) that
//        existsSync would miss on Windows. Missing/miscased .png = FAIL; a missing character
//        _sprite.gif is only a WARN (charSpriteHTML falls back gif -> static -> icon, no broken image).
//
// Exit code is non-zero if anything FAILS, so it can gate a push (or a git pre-push hook). This does
// NOT replace the manual on-device check — it's the fast automated floor beneath it.

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
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

// ── [3] icon references in data.js are COMMITTED, with EXACT case ──
// GitHub Pages serves on Linux (case-sensitive) and only ships COMMITTED files. So we check each
// referenced icon against git-tracked filenames with exact case — not existsSync, which is
// case-insensitive on Windows (it happily "found" Resurrection.png for a resurrection.png ref that
// then 404'd live) and can't tell a committed file from an untracked local one. Falls back to disk
// existence only if git is unavailable.
console.log('\n[3] icon asset references (data.js)');
try {
  const js = readFileSync(join(ROOT, 'data/data.js'), 'utf8');
  // Paths sit inside JSON strings, so match up to the closing quote. Filenames are sanitized to
  // lowercase/underscores but a few include & (e.g. charlotte_&_jonathan_sprite.gif).
  const refs = [...new Set(js.match(/assets\/icons\/[^"]+?\.(?:png|gif)/g) || [])];
  let tracked = null;
  try {
    tracked = new Set(execSync('git ls-files assets/icons', { cwd: ROOT }).toString().split('\n').filter(Boolean));
  } catch { /* not a git repo / git unavailable → fall back to disk existence */ }
  const trackedLower = tracked && new Map([...tracked].map(f => [f.toLowerCase(), f]));
  // Classify: 'ok' | 'case' (committed but wrong case) | 'untracked' (on disk, not committed) | 'missing'.
  const classify = p => {
    if (!tracked) return existsSync(join(ROOT, p)) ? { s: 'ok' } : { s: 'missing' };
    if (tracked.has(p)) return { s: 'ok' };
    const correct = trackedLower.get(p.toLowerCase());
    if (correct) return { s: 'case', correct };
    return existsSync(join(ROOT, p)) ? { s: 'untracked' } : { s: 'missing' };
  };
  const problems = refs.map(p => ({ p, ...classify(p) })).filter(x => x.s !== 'ok');
  const isGif = p => p.toLowerCase().endsWith('.gif');
  const pngProblems = problems.filter(x => !isGif(x.p));
  const gifProblems = problems.filter(x => isGif(x.p));
  // A referenced .png that isn't committed at the exact case would 404 on the live site → FAIL.
  for (const x of pngProblems) {
    if (x.s === 'case') fail(`icon case mismatch (404 on Linux): data.js "${x.p}" but committed as "${x.correct}"`);
    else if (x.s === 'untracked') fail(`icon present locally but NOT committed (would 404): ${x.p}`);
    else fail(`missing icon (would 404 on the live site): ${x.p}`);
  }
  // Character sprite gifs are a permanently-absent set with a graceful gif->static->icon fallback,
  // so collapse them to one line. Pass --verbose to see the full list.
  const verbose = process.argv.includes('--verbose');
  if (gifProblems.length) {
    if (verbose) gifProblems.forEach(x => warn('missing sprite gif — graceful fallback, ok: ' + x.p));
    else warn(`${gifProblems.length} character sprite gif${gifProblems.length === 1 ? '' : 's'} absent — graceful fallback, ok (--verbose to list)`);
  }
  const suffix = tracked ? 'committed (exact case)' : 'present';
  if (!problems.length) ok(`all ${refs.length} referenced icons ${suffix}`);
  else if (!pngProblems.length) ok(`all ${refs.length - gifProblems.length} required icons ${suffix}`);
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
