# VS Build Calc — In-Progress Items

## 1. Locked weapon slot UX — selector vs info panel (BROKEN)

Current implementation changed locked slot click to open the weapon selector,
which removed info panel access. The Devolve button lives in the info panel,
so players can no longer devolve locked starters.

**Target behavior:**
- Clicking a locked weapon slot still opens the info panel (Devolve / Evolve
  stage controls must remain accessible)
- The selector for a locked slot should show the FULL weapon list, but dim
  everything EXCEPT the weapon's evo lineage descendants — only those are
  clickable (same visual as the consumed/sepia class, applied to all non-lineage
  weapons)

**Fix needed:**
- Revert slotAction for locked-with-item back to `view-slot` (info panel)
- Open the filtered selector from the info panel stage section instead
  (new "Change" or inline-evolve button)
- In weaponOverlayHTML when isLockedEvo: non-lineage weapons get `dim` class
  rather than being hidden entirely

---

## 2. Auto-add passive — requirements mapping (NOT WORKING)

Selecting any weapon from the selector should auto-add its required passives.
This is confirmed broken; passive is never added.

**Data model — what the actual data shows:**
- `Whip.requirements = ["Hollow Heart"]`  — passive req lives on the BASE weapon
- `Bloody Tear.requirements = ["Vento Sacro"]` — union partner on the union input
- `Vento Sacro.requirements = ["Bloody Tear"]` — symmetric
- `Fuwalafuwaloo.requirements = []`  — union result has no requirements
- CLAUDE.md says requirements are on the evolved (child) weapon — conflicts with
  actual data; CLAUDE.md needs updating

**Questions to resolve before implementing:**
1. Is "base_weapon.requirements = [passive]" the universal pattern, or do some
   evolved weapons also carry passive requirements directly on themselves?
2. Are there weapons with BOTH a passive requirement AND a weapon (union partner)
   in the same requirements array?
3. Is CLAUDE.md wrong, or is it describing a different attribute?

**Current code path (closeOverlay weapon branch):**
Calls collectChainPassives(collectWeaponChain(wDef.name)) — walks backward
chain and collects passives from each weapon's requirements array. Should find
Hollow Heart via Whip when Bloody Tear is selected. Needs debug logging to
confirm it executes and returns correctly.

---

## 3. Evolved (non-base) weapon selection must consume/require components

Selecting any non-Base weapon from the selector should:
- Clear all backward-chain members from other slots (already in closeOverlay,
  needs verification)
- Auto-add required passives (depends on item 2 being fixed)

Example: selecting Fuwalafuwaloo clears Bloody Tear slot + Vento Sacro slot,
adds Hollow Heart.

---

## 4. Auto-add passive — full debug pass

Likely causes for passive never being added:
- collectChainPassives may not find passives if requirements pattern differs
  from assumption (depends on item 2 clarification)
- passiveByName(pname) lookup could fail silently if name doesn't match
- player.passives.findIndex(p => !p) returns -1 when slots are full — weapon
  still placed, passive silently skipped with no feedback

Debug steps: add console.log inside collectChainPassives loop to confirm
execution path and return values before next implementation session.

---

## 5. Duplicate starter weapon when weapon pre-selected before character pick

Bug:
1. User selects e.g. Lightning Ring in slot 1 (no character yet)
2. User picks Porta, whose starter is Lightning Ring
3. Lightning Ring ends up in both slot 0 (Porta's starter) and slot 1 (user pick)

Fix: in closeOverlay type==='char' branch, after placing new starter weapons,
scan all non-starter slots for weapons whose name matches any starter weapon
and clear them. Current logic only clears the OLD character's starter slots.
