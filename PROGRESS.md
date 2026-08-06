# VS Build Calc — In-Progress Items

---

## TODO — Chaos evo characters: map evo path to sprite

The 4 Chaos-evolution characters (Lolo/Hiss/Meow/Purr, Kina, Imakoo, and the
Chaos Disaster group) were added as **character tiles** before the sprite system
existed. Their starting items reference "…Tech" abilities (Chaos Disaster Tech,
Swallow Slice Tech, Airwave Tech, Hell's Fury Tech, Blood Rage Tech) that aren't
in the weapons data, so they show as unresolved in cross-refs. Come back and map
the Chaos **evo path → sprite** for these characters.

Related: weapon icon `chaos_altemanna.png` is still missing (Chaos evo ingredient
"Chaos Altemanna"); other Chaos ingredients (Malachite/Rosalia/Lazulia) aren't in
the data yet either.

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

## Item 7 — Auto-devolve didn't cascade through unions (✅ DONE)

`autoDevolveBrokenEvos` only checked weapons produced by a standard `Evolution`,
so union finals (Fuwalafuwaloo, Million Cut) never devolved when a DEEP-chain
passive was dropped. Rewrote it to be chain-aware: a weapon is broken if any
passive in its full `collectWeaponChain`/`collectChainPassives` set is missing.
On devolve, the earlier in-game branch (by `banishLayout` root index) reclaims
the slot; union partners spill into empty slots or drop with a
"No room to restore X" toast. Iterates until stable, so dropping Hollow Heart
turns Fuwalafuwaloo → Whip + Vento Sacro (full loadout → Whip kept, Vento Sacro
dropped w/ toast). Also added an `autoDevolveBrokenEvos()` call when a passive
slot is REPLACED via the overlay (not just removed via the × button).

## Item 6 — Union final involving a locked starter (✅ DONE)

A union result (e.g. Million Cut = Thousand Edge + Valmanway; Fuwalafuwaloo =
Bloody Tear + Vento Sacro) was un-selectable from the unlocked partner's slot
when the other input was a locked starter's evolution, because the selector
blocked ALL `collectDescendants` of locked starters.

- Fix A: added `collectLinearDescendants` (stops at a `method === 'Union'` step)
  and used it for the locked-starter block loop in `weaponOverlayHTML`. Linear
  evo forms stay locked to their slot; union results are selectable from the
  partner slot.
- Fix B: in `closeOverlay`, the union result collapses onto the LOCKED starter
  slot if any chain member occupies one (`targetSlot`), else the slot selected
  from. Verified: Valmanway→Million Cut lands in the locked Thousand Edge slot;
  Vento Sacro→Fuwalafuwaloo lands in the locked Bloody Tear slot.

## Item 1 — Locked weapon slot: selector vs info panel (✅ DONE)

Fixed: locked slot LEFT-click → `view-slot` (info panel) again; locked slot
RIGHT-click → locked-evo selector (removed the old `slot-locked` early-return in
`handleAppContextMenu`; no dedicated button — keep it simple). The selector shows
the FULL weapon list with non-lineage weapons `dim` (pointer-events:none), only
lineage forms clickable.

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

## Item 2 — Auto-add passive (✅ DONE — logic verified, toast added)

Verified against real data: `collectWeaponChain` + `collectChainPassives` correctly
gather Hollow Heart for Bloody Tear and the full union chain for Fuwalafuwaloo.
Added a `warn` toast "No passive slot for: X" when auto-add finds no free slot.
Bugfix: the room check used `passives.findIndex(p=>!p)`, which returns -1 on an
empty/sparse array and falsely reported "no room" even with slots free — replaced
with a bounded loop over `counts.passives`.

## Item 2 (original notes) — Auto-add passive: requirements correctly mapped but not verified working

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

## Item 3 — Evolved weapon selection must consume/require components (✅ DONE)

Chain-clearing runs in the same `closeOverlay` weapon branch as the auto-add
(clears other slots whose weapon is in `collectWeaponChain(sel)`), alongside the
passive auto-add. Both run together on confirm. Backward chain verified correct.

## Item 3 (original notes) — Evolved weapon selection must consume/require components

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

## Item 5 — Duplicate starter weapon (✅ DONE)

Fixed in `closeOverlay` char branch: replaced the fragile `if (!weapons[i])`
placement with a lineage-aware rebuild. For each starter slot it prefers an
already-equipped weapon in that starter's lineage (base + forward evo forms via
`collectDescendants`, most-evolved wins) and locks it into the slot; else places
the base starter. User's other weapons are preserved, dropping anything in a new
starter's lineage or the replaced character's starter lineage. Verified via
simulation: Fuwalafuwaloo in slot 6 + Antonio → Fuwa locked in slot 0; base
LR-before-Porta cases and character-switch cases all correct.

## Item 5 (original notes) — Duplicate starter weapon when weapon pre-selected before character

Bug:
1. User picks e.g. Lightning Ring in slot 1 before choosing a character
2. User picks Porta, whose starter is Lightning Ring → Porta places it in slot 0
3. Lightning Ring now in both slot 0 (starter) and slot 1 (user pick) — duplicate

Fix location: `closeOverlay` `type === 'char'` branch.
After placing the new character's starter weapons, scan all non-starter slots
for weapons matching any starter weapon name and clear them. Current logic only
clears the old character's starter slots.
