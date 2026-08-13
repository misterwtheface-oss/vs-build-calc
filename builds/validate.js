/*
 * validate.js — canonical build-legality validator for vs-build-calc.
 *
 * A build is a static SNAPSHOT of a final loadout. This asks "is this loadout actually
 * achievable under the game's rules?" — mirroring the guard rails the planner enforces at
 * click-time (evoQuickAdd et al.), but expressed directly over the data so it can run in the
 * browser (import/load gating) AND in Node (author-time bundler check). It is the single
 * source of truth for build legality; the theorycraft skill produces builds that satisfy it.
 *
 * Usage:
 *   Browser:  window.VS_VALIDATE_BUILD(build, window.VS_DATA) -> { errors, warnings }
 *   Node:     const { validateBuild } = require('./builds/validate.js')
 *
 * `errors` = illegal (reject on import / drop from the bundle). `warnings` = soft / auto-healed
 * on load (e.g. unknown item names are skipped; a redundant pick is dropped).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;      // Node
  if (typeof window === 'object') window.VS_VALIDATE_BUILD = api.validateBuild; // Browser
})(this, function () {
  'use strict';

  // Mirrors SLOT_COUNTS in index.html.
  const SLOT_COUNTS = { 1: { weapons: 6, passives: 6 }, 2: { weapons: 4, passives: 4 },
                        3: { weapons: 3, passives: 3 }, 4: { weapons: 2, passives: 2 } };
  // Stage-exclusive passives: never take a core slot; obtainable only as a stage-floor pickup
  // (rings/metaglios) or, for Academy Badge, from one of 3 characters. One per build.
  const STAGE_EXCLUSIVE = new Set(['Silver Ring', 'Gold Ring', 'Metaglio Left', 'Metaglio Right', 'Academy Badge']);
  const ACADEMY_BADGE = 'Academy Badge';
  const ACADEMY_CHARS = ['Eleanor Uziron', 'Maruto Cuts', 'Keitha Muort'];
  const ABSORB_UNIONS = new Set(['Clock Tower', 'Alucard Shield']);
  const ALUCARD_ABSORB_COUNT = 5;

  function validateBuild(build, data) {
    const errors = [], warnings = [];
    const E = m => errors.push(m);
    const W = m => warnings.push(m);
    if (!build || typeof build !== 'object') { E('Build is not an object'); return { errors, warnings }; }
    if (build.schema !== 1) E(`Unsupported schema (expected 1, got ${build.schema})`);

    const D = data || {};
    const weapons = D.weapons || [], passives = D.passives || [], arcana = D.arcana || [],
          characters = D.characters || [], stages = D.stages || [];
    const wByName = indexBy(weapons), pByName = indexBy(passives),
          aByName = indexBy(arcana), cByName = indexBy(characters), sByName = indexBy(stages);

    // ── Chaos-morph finals: byFinal[finalName] = { character, base } (character-gated). ──
    const chaosByFinal = {};
    (D.evoPaths || []).forEach(ep => {
      if (ep.pattern === 'ChaosEvolution>Final') chaosByFinal[ep.b1_r] = { character: ep.b1_2, base: ep.b1_3 };
    });

    // Backward chain: every weapon that evolves/unions (directly or transitively) INTO `name`,
    // following trans_result. Union partners are captured because each partner's trans_result is
    // the union result. Matches collectWeaponChain() in index.html.
    const chainCache = {};
    function weaponChain(name) {
      if (chainCache[name]) return chainCache[name];
      const chain = new Set([name]), stack = [name];
      while (stack.length) {
        const cur = stack.pop();
        for (const w of weapons) {
          if (w.trans_result === cur && w.name !== cur && !chain.has(w.name)) { chain.add(w.name); stack.push(w.name); }
        }
      }
      chainCache[name] = chain;
      return chain;
    }
    const requirementsOf = name => (wByName[name] && wByName[name].requirements) || [];

    // Does the stage (+ equipped arcana) yield this item? Mirrors stageProvidesItem().
    const pc = clampInt(build.playerCount, 1, 4, 1);
    const counts = SLOT_COUNTS[pc];
    const stageObj = build.stage ? sByName[build.stage] : null;
    const arcanaSlots = (build.arcana || []).filter(v => v != null);
    const arcanaSet = new Set(arcanaSlots);
    function stageProvides(item) {
      if (!stageObj) return false;
      if ((stageObj.items || []).includes(item)) return true;
      return (stageObj.conditional || []).some(g => (g.items || []).includes(item) && arcanaSet.has(g.arcana));
    }

    // Resolved characters + a global "does any player equip this passive?" helper.
    const players = Array.isArray(build.players) ? build.players : [];
    if (!players.length) E('Build has no players');
    if (players.length > pc) W(`players array (${players.length}) longer than playerCount (${pc})`);
    const charObjs = players.map(p => (p && p.character != null) ? cByName[p.character] : null);
    const isAcademyChar = c => !!c && ACADEMY_CHARS.some(n => c.name.startsWith(n));

    const allEquippedPassives = new Set();
    players.forEach(p => {
      if (!p) return;
      (p.passives || []).forEach(n => n && allEquippedPassives.add(n));
      (p.extraPassives || []).forEach(n => n && allEquippedPassives.add(n));
    });
    // A required passive is satisfied if any player equips it, OR it's a stage-exclusive that a
    // character grants / the stage supplies (those ride a transient slot, not a core slot).
    function passiveSatisfied(req, charObj) {
      if (allEquippedPassives.has(req)) return true;
      if (STAGE_EXCLUSIVE.has(req)) {
        if (req === ACADEMY_BADGE && isAcademyChar(charObj)) return true;
        if (stageProvides(req)) return true;
      }
      return false;
    }

    // ── Global caps: arcana ──
    if ((build.arcana || []).length > 3) E(`Too many arcana (${build.arcana.length}); max 3 slots`);
    dupes(arcanaSlots).forEach(n => E(`Duplicate arcana: ${n}`));
    arcanaSlots.forEach(n => { if (!aByName[n]) W(`Unknown arcana "${n}" — will be skipped on load`); });
    if (build.stage && !stageObj) W(`Unknown stage "${build.stage}" — will be skipped on load`);

    // A manual arcana slot must not duplicate a character's starting arcana (the planner treats
    // that as already-in-build). starting_arcana may be a "|"-separated list (e.g. Chaos).
    const startingArcana = new Set();
    charObjs.forEach(c => (c && c.starting_arcana ? String(c.starting_arcana).split('|') : [])
      .forEach(s => { const t = s.trim(); if (t) startingArcana.add(t); }));
    arcanaSlots.forEach(n => { if (startingArcana.has(n)) E(`${n} is already a starting arcana of an equipped character`); });

    // ── Gifts: one Turbo weapon + one Arma passive per WHOLE build ──
    if (players.filter(p => p && p.giftWeapon).length > 1) E('More than one gift weapon in the build (only one per build)');
    if (players.filter(p => p && p.giftPassive).length > 1) E('More than one gift passive in the build (only one per build)');

    // ── Per-player checks ──
    players.forEach((p, i) => {
      if (!p) return;
      const who = players.length > 1 ? `P${i + 1}: ` : '';
      const charObj = charObjs[i];
      if (p.character != null && !charObj) W(`${who}unknown character "${p.character}" — will be skipped on load`);

      const pWeapons = (p.weapons || []).filter(Boolean);
      const pPassives = (p.passives || []).filter(Boolean);

      // Unknown names → warnings (load skips them).
      pWeapons.forEach(n => { if (!wByName[n]) W(`${who}unknown weapon "${n}" — will be skipped on load`); });
      pPassives.forEach(n => { if (!pByName[n]) W(`${who}unknown passive "${n}" — will be skipped on load`); });

      // Duplicates within a player (co-op allows dupes ACROSS players, never within one).
      dupes(pWeapons).forEach(n => E(`${who}duplicate weapon: ${n}`));
      dupes(pPassives).forEach(n => E(`${who}duplicate passive: ${n}`));

      // Slot caps. Counterpart weapons (Gemini duplicates) and absorbed-hidden weapons don't
      // take a slot; stage-supplied free weapons ride transient slots. Stage-exclusive passives
      // ride transient slots too, so they don't count against the passive cap.
      const absorbedHidden = new Set();
      Object.values(p.absorbed || {}).forEach(list => (list || []).forEach(n => absorbedHidden.add(n)));
      const coreWeapons = pWeapons.filter(n => {
        const w = wByName[n];
        return !(w && w.category === 'Counterpart') && !absorbedHidden.has(n) && !stageProvides(n);
      });
      if (coreWeapons.length > counts.weapons) E(`${who}${coreWeapons.length} weapons exceeds the ${counts.weapons}-slot cap for ${pc}-player`);
      const corePassives = pPassives.filter(n => !STAGE_EXCLUSIVE.has(n));
      if (corePassives.length > counts.passives) E(`${who}${corePassives.length} passives exceeds the ${counts.passives}-slot cap for ${pc}-player`);

      // A weapon can't be both equipped in a slot and hidden in an absorb-union.
      pWeapons.forEach(n => { if (absorbedHidden.has(n)) E(`${who}${n} is both equipped and absorbed`); });

      // Stage-exclusive / Academy passive gating.
      pPassives.forEach(n => {
        if (!STAGE_EXCLUSIVE.has(n)) return;
        if (n === ACADEMY_BADGE) {
          if (!isAcademyChar(charObj) && !stageProvides(n))
            E(`${who}${ACADEMY_BADGE} requires an Academy character (Eleanor/Maruto/Keitha)${build.stage ? ` or a stage that grants it (not ${build.stage})` : ' or a stage that grants it'}`);
        } else if (!stageProvides(n)) {
          E(`${who}${n} isn't available${build.stage ? ` on ${build.stage}` : ' — no stage set that supplies it'}`);
        }
      });

      // Chaos-morph finals are character-gated.
      pWeapons.concat([...absorbedHidden]).forEach(n => {
        const info = chaosByFinal[n];
        if (info && (!charObj || charObj.name !== info.character))
          E(`${who}${n} can only be formed by ${info.character}`);
      });

      // Requirements present: for each realized evolution in a weapon's chain, its required
      // passives must be in the build (weapon/union-partner requirements are inherent to the
      // chain). Only count chain weapons whose trans_result is ALSO in the chain — i.e. evos
      // that actually happened en route — so a plain base isn't blocked by its own forward req.
      const allChainTargets = pWeapons.concat([...absorbedHidden]);
      const flaggedReq = new Set();
      allChainTargets.forEach(target => {
        if (!wByName[target]) return;
        const chain = weaponChain(target);
        chain.forEach(cn => {
          const cw = wByName[cn];
          if (!cw || !chain.has(cw.trans_result)) return; // this hop didn't evolve within the chain
          requirementsOf(cn).forEach(req => {
            if (wByName[req]) return; // weapon requirement (union partner) — satisfied by the chain
            if (!pByName[req]) return; // not a known passive; ignore
            const key = target + '|' + req;
            if (flaggedReq.has(key)) return;
            if (!passiveSatisfied(req, charObj)) { E(`${who}${target} requires ${req}, which isn't in the build`); flaggedReq.add(key); }
          });
          // Arcana-gated evolutions (e.g. Gemini counterparts): soft-check the trans_conditions.
          const cond = cw.trans_conditions;
          if (cond && aByName[cond] && !arcanaSet.has(cond) && !startingArcana.has(cond))
            W(`${who}${target} normally needs the ${cond} arcana equipped`);
        });
      });

      // Gift validity.
      if (p.giftWeapon != null && !wByName[p.giftWeapon]) W(`${who}unknown gift weapon "${p.giftWeapon}"`);
      if (p.giftPassive != null && !pByName[p.giftPassive]) W(`${who}unknown gift passive "${p.giftPassive}"`);

      // Absorb-unions.
      Object.entries(p.absorbed || {}).forEach(([result, hidden]) => {
        if (!ABSORB_UNIONS.has(result)) { E(`${who}"${result}" is not an absorb-union (only ${[...ABSORB_UNIONS].join(', ')})`); return; }
        if (!pWeapons.includes(result)) W(`${who}absorb-union ${result} lists hidden inputs but isn't equipped`);
        (hidden || []).forEach(n => { if (!wByName[n]) W(`${who}unknown absorbed weapon "${n}" under ${result}`); });
        if (result === 'Alucard Shield' && (hidden || []).length !== ALUCARD_ABSORB_COUNT)
          W(`${who}Alucard Shield should absorb ${ALUCARD_ABSORB_COUNT} weapons (got ${(hidden || []).length})`);
      });
    });

    return { errors, warnings };
  }

  // ── helpers ──
  function indexBy(list) { const m = Object.create(null); for (const o of list) if (o && o.name != null) m[o.name] = o; return m; }
  function dupes(arr) { const seen = new Set(), out = new Set(); for (const x of arr) { if (seen.has(x)) out.add(x); else seen.add(x); } return [...out]; }
  function clampInt(v, lo, hi, dflt) { const n = parseInt(v); return isNaN(n) ? dflt : Math.max(lo, Math.min(hi, n)); }

  return { validateBuild };
});
