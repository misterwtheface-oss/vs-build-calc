# VS Build Calc — In-Progress Items

---

## Background: Evo Path Patterns & Data Model

### Requirements data model (CORRECTED — CLAUDE.md is wrong)
Requirements live on the **transforming weapon at each stage**, not on the result.

- `Whip.requirements = ["Hollow Heart"]`   → Whip needs Hollow Heart to become Bloody Tear
- `Bloody Tear.requirements = ["Vento Sacro"]` → Bloody Tear needs Vento Sacro (union partner) to become Fuwalafuwaloo
- `Fuwalafuwaloo.requirements = []`        → final form, nothing further

Pattern:
  Weapon_A + requirements(A) → Weapon_B
  Weapon_B + requirements(B) → Weapon_C (if further stages exist)

Requirements can be:
- A passive item (filter: D.passives.some(p => p.name === req)) — needs a slot
- A weapon (filter: D.weapons.some(w => w.name === req)) — union partner or special mechanic

### All evo path patterns in the data

| Pattern | Meaning |
|---|---|
| `Final` | Standalone final form, no evo needed |
| `Evo>Final` | Base + Passive(s) → Final (no max-level req) |
| `Evo(Max)>Final` | Base (maxed) + Passive(s) → Final |
| `Evo(Max)>HiddenFinal` | Like above, final form is hidden/secret |
| `TwoReqEvo>Final` | Base + TWO passives → Final |
| `TwoReqEvo(Max)>Final` | Same but also requires max level |
| `EzEvo>EzEvo>Final` | Two sequential evolutions, each with their own passive req (mid-stage carries its own requirement) |
| `EzEvo>EzEvo>Union>Final` | Two sequential evos then union to final |
| `Evo>Union>Final` | Base + Passive → Evo → Union with second weapon → Final |
| `Dual(Evo(Max))>HiddenFinal` | Two independently maxed+evo'd weapons union to hidden final |
| `Dual(Counterpart):Union>Final` | Two counterpart weapons union |
| `Counterpart:Final` | Counterpart weapon only, already final |
| `Counterpart:Evo>Union>Final` | Counterpart involved in evo-then-union chain |
| `Counterpart:Evo(Max)>Final` | Counterpart max evo to final |
| `Counterpart:TwoReqEvo>Final` | Counterpart with two-passive evo |
| `QuadUnion>HiddenFinal` | Four weapons union to hidden final |
| `TripleUnion>Final` | Three weapons union to final |
| `Gift(Treasure)>Final` | Weapon obtained as a gift/treasure, already final |
| `ChaosEvolution>Final` | Specific chaos mechanic evolution |
| `Familiar>Final` | Familiar mechanic |
| `GlimmerEvo>Final` | Glimmer variant evo |
| `GlimmerEzEvo>GlimmerEzEvo>Final` | Two-stage glimmer evo |
| `EzEvo>AlucardGiftFinal` | Special Alucard gift final |
| `FivePassive>Final` | Requires five passives |
| `Tuna>Final`, `Magic Weapon>Final`, etc. | Unique mechanic one-offs |
| `Belnades' Spell>Final`, `Vampire-Killing Tool>Final` | Special weapon mechanics |
| `Ambiguous Power>Final`, `Emerald Diorama>Final` | Unique mechanics |

### What `collectWeaponChain` + `collectChainPassives` handle today
`collectWeaponChain(name)` walks backward via `trans_result` only.
`collectChainPassives(chain)` reads each chain weapon's requirements, keeps passives.

This correctly handles: Evo, TwoReqEvo, EzEvo>EzEvo (multi-stage passives), Evo>Union
(finds passive on base, skips union partner weapons).

What likely needs special handling: Counterpart patterns, QuadUnion/TripleUnion,
FivePassive, Gift, Chaos, Familiar, Glimmer — these either have non-standard
data shapes or depend on character/arcana state beyond passive slots.

---

## Item 1 — Locked weapon slot: selector vs info panel (BROKEN)

The locked slot click was changed to open the weapon selector, which broke
info panel access. The Devolve button lives in the info panel.

**Target behavior:**
- Clicking a locked weapon slot still opens the **info panel** (Devolve / Evolve
  stage controls must remain accessible)
- The weapon selector opened from a locked slot shows the **full weapon list**
  but everything EXCEPT the weapon's evo lineage is **dimmed** (pointer-events:none)
  — only lineage descendants are clickable

**Fix needed:**
- Revert `slotAction` for locked-with-item back to `view-slot` (info panel)
- Open the filtered selector from a button in the info panel stage section
- In `weaponOverlayHTML` when `isLockedEvo`: non-lineage weapons get `dim` class
  (same pointer-events treatment as used/consumed), not removed from the list

---

## Item 2 — Auto-add passive: requirements correctly mapped but not verified working

Based on the corrected data model (requirements on the transforming weapon),
`collectChainPassives` should correctly find all passives across multi-stage chains.
Has not been confirmed working with live testing.

**Debug steps for next session:**
1. Add `console.log('chain passives:', [...collectChainPassives(chain)])` in the
   `closeOverlay` weapon branch after the chain is built
2. Confirm `passiveByName('Hollow Heart')` returns a valid object
3. Check `player.passives.findIndex(p => !p)` — returns -1 if all slots full,
   passive silently skipped with no user feedback (needs a toast)
4. Verify the code path is actually reached (log at entry of the weapon `if` block)

---

## Item 3 — Evolved weapon selection must consume/require components

Selecting any non-Base weapon (category !== 'Base') from the selector should:
- Clear all backward-chain members from other slots (implemented in closeOverlay,
  needs verification)
- Auto-add required passives (depends on Item 2 working)

Note: union partners in the chain are weapons, not passives. The chain-clearing
handles weapons; passive auto-add handles passives. Both should run together.

---

## Item 4 — Auto-add passive end-to-end confirmation

After Item 2 debug session, confirm the full round-trip:
1. Open selector → choose Bloody Tear
2. Hollow Heart appears in passive slots automatically
3. Whip's slot is cleared (if Whip was elsewhere)
4. If no passive slot available: toast "No room for Hollow Heart"

---

## Item 5 — Duplicate starter weapon when weapon pre-selected before character

Bug:
1. User picks e.g. Lightning Ring in slot 1 before choosing a character
2. User picks Porta, whose starter is Lightning Ring → Porta places it in slot 0
3. Lightning Ring now in both slot 0 (starter) and slot 1 (user pick) — duplicate

Fix location: `closeOverlay` `type === 'char'` branch.
After placing the new character's starter weapons, scan all non-starter slots
for weapons matching any starter weapon name and clear them. Current logic only
clears the old character's starter slots.
