# Build JSON Schema (`schema: 1`)

A **build** is a saved, name-keyed snapshot of a full planner loadout — characters, weapons,
passives, arcana, stage, gifts, familiars, and absorb-unions — for one or more players (co-op).
Builds are the interchange format between the `vampire-survivors-theorycraft` skill and this site.

- **Repo builds**: one `builds/<id>.json` file per build. Run `node tools/build-builds.mjs` to
  bundle every `builds/*.json` into `builds/builds.js` (which sets `window.VS_BUILDS`). The site
  loads that bundle via a `<script>` tag, so it works on `file://` and GitHub Pages alike — the
  same no-`fetch()` approach used by `data/data.js`.
- **User builds**: created in the app's **Builds** overlay and stored in `localStorage`
  (`vsbc.builds`). A user can **Export** one to JSON and hand it to a maintainer to promote it into
  the repo permanently.

Loading a build fills the **planner only**. It never touches the Seal Advisor, Power-Ups, or
Manage Collection state.

## Naming rule (important)

Every item is referenced by its **exact `.name` string** as it appears in `data/data.js` — the same
names the theorycraft skill uses. In particular:

- **Characters** are keyed by their full unique name, *including variant prefixes*, e.g.
  `"Antonio Belpaese"` or `"(Unblinded) Imelda Belpaese"` — **not** the `base_name`.
- **Arcana** names include the numeral, e.g. `"Gemini (I)"`, `"Sarabande of Healing (VI)"`.
- Weapons/passives use their plain name, e.g. `"Bloody Tear"`, `"Hollow Heart"`.

Names that don't resolve at load time (e.g. a data rename) are **skipped with a warning toast**;
the rest of the build still loads. Keep names in sync with the current `data/data.js`.

## Top-level fields

| Field         | Type              | Req | Notes |
|---------------|-------------------|-----|-------|
| `schema`      | number            | ✔   | Must be `1`. |
| `id`          | string (slug)     | ✔   | Unique kebab-case id; also the filename (`builds/<id>.json`). |
| `name`        | string            | ✔   | Display name. |
| `author`      | string            |     | Credit. |
| `description` | string            |     | Short blurb. |
| `tags`        | string[]          |     | e.g. `["solo","crit","whip"]`. |
| `dataVersion` | string            |     | Free-form marker of the data snapshot authored against (e.g. `"2026-08"`). |
| `playerCount` | number (1–4)      | ✔   | Number of player entries. |
| `stage`       | string \| null    |     | Stage name, or `null`. |
| `arcana`      | (string\|null)[]  |     | Up to 3 **positional** arcana slots; `null` = empty slot. |
| `players`     | Player[]          | ✔   | Length should equal `playerCount`. |

## Player object

| Field           | Type                        | Notes |
|-----------------|-----------------------------|-------|
| `character`     | string \| null              | Full character name (with variant prefix). |
| `charLevel`     | number                      | Defaults to `1`. |
| `weapons`       | string[]                    | Weapon names, in slot order (compact — omit empties). |
| `passives`      | string[]                    | Passive names, in slot order. |
| `extraPassives` | string[]                    | Non-slot passive instances (e.g. Weapon Power-Up). Optional. |
| `giftWeapon`    | string \| null              | Super Candybox II Turbo free weapon pick. Optional. |
| `giftPassive`   | string \| null              | Arma Dio free passive pick. Optional. |
| `familiars`     | string[]                    | Familiar Forge picks (live in the hidden row). Optional. |
| `absorbed`      | `{ [result]: string[] }`    | Absorb-union map. Optional. |

### Absorb-unions (`absorbed`)

A union **result** that hides its inputs into the Hidden row (currently **Clock Tower**,
**Alucard Shield**). The result weapon should also appear in `weapons`; the hidden inputs are
listed under it and should **not** be repeated in `weapons`.

```json
"absorbed": {
  "Clock Tower": ["Endo Gears", "Peri Pendulum", "Myo Lift", "Epi Head"]
}
```

## Legality rules (enforced)

A build is a snapshot of a **final loadout**, and it must be *achievable* under the game's rules —
the same rules the planner enforces when you build by clicking. `builds/validate.js` is the single
source of truth; it runs on **import** (illegal builds are rejected), on **load** (problems are
surfaced and the planner self-heals), and in **`tools/build-builds.mjs`** (an illegal repo build is
dropped from the bundle). Produce builds that satisfy all of these:

**Slots & duplicates**
- Weapon/passive counts must fit the per-mode caps: **1P 6/6, 2P 4/4, 3P 3/3, 4P 2/2**. Counterpart
  weapons (Gemini duplicates), absorb-union hidden inputs, and stage-supplied free items don't count
  against the cap; stage-exclusive passives (below) don't count against the passive cap.
- **No duplicate** weapon or passive *within a single player*. (Co-op allows the same weapon/passive
  across *different* players.)
- At most **3 arcana**, no duplicates, and a manual arcana slot may not repeat a character's
  starting arcana.

**Evolution requirements** (the big one — requirements live on the *source* weapon)
- If a player equips an evolved/union weapon, every **passive** required along its evolution chain
  must be present somewhere in the build (any player), or be a stage-exclusive item the build
  actually grants. Example: `Bloody Tear` requires `Hollow Heart`; a build with Bloody Tear but no
  Hollow Heart is **illegal**. Union partners are satisfied implicitly by naming the union result.

**Stage-exclusive passives** (`Silver Ring`, `Gold Ring`, `Metaglio Left`, `Metaglio Right`, `Academy Badge`)
- These are only obtainable as **stage-floor pickups** — the build's `stage` must actually supply
  the item (directly, or via an equipped conditional-gating arcana). A ring on a stage that doesn't
  drop it, or with no stage set, is **illegal**.
- **Academy Badge** additionally may come from an Academy character
  (**Eleanor Uziron**, **Maruto Cuts**, **Keitha Muort**). Academy Badge on any other character
  *and* a stage that doesn't grant it is **illegal**.

**Character-gated weapons**
- Chaos-morph finals (e.g. `Anima of Mortaccio`, `Yatta Daikarin`, `Carozza!`, `Profusione D'Amore`)
  may only be equipped by their mapped character.

**Gifts (one each per whole build)**
- At most one `giftWeapon` (Super Candybox II Turbo) and one `giftPassive` (Arma Dio) across all
  players.

**Absorb-unions**
- `absorbed` keys must be `Clock Tower` or `Alucard Shield`, the result should be equipped, and a
  weapon can't be both slotted and absorbed. Alucard Shield absorbs 5 weapons.

Unknown item names (data drift) are **warnings**, not errors — they're skipped on load.

## Full example

```json
{
  "schema": 1,
  "id": "bloody-tear-crit-solo",
  "name": "Bloody Tear Crit Solo",
  "author": "misterwtheface",
  "description": "Whip -> Bloody Tear crit-stacking opener.",
  "tags": ["solo", "crit", "whip"],
  "dataVersion": "2026-08",
  "playerCount": 1,
  "stage": "Mad Forest",
  "arcana": ["Gemini (I)", "Sarabande of Healing (VI)", null],
  "players": [
    {
      "character": "Antonio Belpaese",
      "charLevel": 1,
      "weapons": ["Bloody Tear", "King Bible", "Fire Wand"],
      "passives": ["Hollow Heart", "Spinach", "Duplicator"],
      "extraPassives": [],
      "giftWeapon": null,
      "giftPassive": null,
      "familiars": [],
      "absorbed": {}
    }
  ]
}
```
