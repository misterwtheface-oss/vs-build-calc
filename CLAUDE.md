# VS Build Calc — Project Notes

## Data Model: Weapon Evolution Requirements

Evolution requirements are stored on the **transforming weapon (source)**, not the evolved result.

- `weapon.requirements` = array of passive/weapon names needed to evolve this weapon
- `weapon.trans_result` = name of what this weapon becomes

**Example:**
- `Whip.requirements = ["Hollow Heart"]`, `Whip.trans_result = "Bloody Tear"`
- → Whip needs Hollow Heart to become Bloody Tear
- `BloodyTear.requirements = ["Vento Sacro"]`, `BloodyTear.trans_result = "Fuwalafuwaloo"`
- → Bloody Tear needs Vento Sacro (union partner) to become Fuwalafuwaloo
- `Fuwalafuwaloo.requirements = []` — final form, no further evo

**Implication for rendering:**
To find what a weapon needs to evolve, read `weapon.requirements` directly. Final forms have empty requirements and null trans_result.
