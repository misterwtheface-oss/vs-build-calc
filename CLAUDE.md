# VS Build Calc — Project Notes

## Data Model: Weapon Evolution Requirements

Evolution requirements are stored on the **evolved weapon (child)**, not on the base weapon (parent).

- `base_weapon.trans_result` = name of the evolved weapon
- `evolved_weapon.requirements` = array of passive/weapon names needed to perform that evolution

**Example:**
- `Whip.trans_result = "Bloody Tear"`
- `BloodyTear.requirements = ["Hollow Heart"]`
- → To evolve Whip into Bloody Tear, the player needs Hollow Heart

**Union weapons** (require two evolved weapons):
- `BloodyTear.trans_result = "Fuwalafuwaloo"`
- `Fuwalafuwaloo.requirements = ["Bloody Tear", "Vento Sacro"]`
- → Both Bloody Tear AND Vento Sacro are required to form Fuwalafuwaloo

**Implication for rendering:**
When displaying what a base weapon needs to evolve, read `requirements` from the **child** (the evolution), not from the base weapon itself. When showing a union's full chain, evo2.requirements will contain weapon names (not just passives).
