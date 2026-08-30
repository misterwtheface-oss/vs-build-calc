# Build JSON Schema (`schema: 2`)

A **build** is a saved, name-keyed snapshot of a full planner loadout — characters, weapons,
passives, arcana, stage, gifts, familiars, and absorb-unions — for one or more players (co-op).
Builds are the interchange format between the `vampire-survivors-theorycraft` skill and this site.

**Design principle — persist intent, derive the rest.** A build stores only what the user *chose*;
the loader **places** each item into the correct slot type (normal / transient / hidden) by
replaying the planner's rules, then self-heals + validates. So character-granted items (Academy
Badge, Sacred familiars, Scorej's hidden rings), stage pickups, hidden weapons, and granted arcana
*items* are **not** stored — they're reconstructed on load. Only user picks are stored: core slots,
**granted-slot fills** (`weaponsExtra`/`passivesExtra`), base + granted **arcana**, absorb-unions,
gifts, familiars, extra passives.

**Version.** Current is `schema: 2`. `schema: 1` builds still load (the added v2 fields default to
empty; a v1 flat list places into core slots and self-heals).

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
| `schema`      | number            | ✔   | `1` or `2` (current is `2`; v1 still loads). |
| `id`          | string (slug)     | ✔   | Unique kebab-case id; also the filename (`builds/<id>.json`). |
| `name`        | string            | ✔   | Display name. |
| `author`      | string            |     | Credit. |
| `description` | string            |     | Short blurb. |
| `notes`       | string            |     | Freeform "why I picked this" note, shown under the build name. |
| `tags`        | string[]          |     | e.g. `["solo","crit","whip"]`. Legacy free-text; the UI now shows derived trait banners instead. |
| `traits`      | string[]          |     | Cached top-3 trait names (banners). Derived at save time; the site recomputes from live data when available, so this is just a portable fallback. |
| `dataVersion` | string            |     | Free-form marker of the data snapshot authored against (e.g. `"2026-08"`). |
| `playerCount` | number (1–4)      | ✔   | Number of player entries. |
| `stage`       | string \| null    |     | Stage name, or `null`. |
| `inverseMode` | boolean           |     | **Inverse Game Mode** — grants a 4th Arcana slot. Omitted when off (defaults `false`). |
| `sharePassives` | boolean         |     | **Share Passives** (co-op) — a passive on any player counts toward every player's evolutions and shares its stats. Defaults **`true`**; stored as `false` only when explicitly disabled in a 2+ player build (absent → shared). |
| `arcana`      | (string\|null)[]  |     | **Positional** arcana slots; `null` = empty. Base 3 + Inverse Mode's 4th slot + any character-**granted** arcana slots (Blackmore, Nathan Graves), so length may exceed 3. Granted arcana *items* (John Morris) are derived, not listed here. |
| `players`     | Player[]          | ✔   | Length should equal `playerCount`. |

## Player object

| Field           | Type                        | Notes |
|-----------------|-----------------------------|-------|
| `character`     | string \| null              | Full character name (with variant prefix). |
| `charLevel`     | number                      | Defaults to `1`. |
| `weapons`       | string[]                    | **Core** weapon picks, in slot order (compact — omit empties). Excludes granted-slot fills and derived items. |
| `passives`      | string[]                    | **Core** passive picks, in slot order. |
| `weaponsExtra`  | string[]                    | v2. User picks in character **granted** weapon slots (Santa Ladonna). Ride transient slots; don't count against the core cap. Optional. |
| `passivesExtra` | string[]                    | v2. User picks in character **granted** passive slots (Santa Ladonna, Engineer Gino). Optional. |
| `extraPassives` | string[]                    | Non-slot passive instances (e.g. Weapon Power-Up). Optional. |
| `giftWeapon`    | string \| null              | Super Candybox II Turbo free weapon pick. Optional. |
| `giftPassive`   | string \| null              | Arma Dio free passive pick. Optional. |
| `familiars`     | string[]                    | Familiar Forge picks (live in the hidden row). Optional. |
| `absorbed`      | `{ [result]: string[] }`    | Absorb-union map. Optional. |
| `santaHidden`   | string[]                    | Santa Ladonna's formed secret trio — the **evolved** forms (`La Borra`, `Unholy Vespers`, `Heaven Sword`) that became hidden. Optional; a build may instead just list the three **base** weapons (`Santa Water`, `King Bible`, `Cross`) in `weapons` and the loader re-forms them. |
| `sourceIndex`   | `{ [source]: number }`      | v2. manual_scaling source-slider positions (integer step index). Optional. |
| `statChoices`   | `{ [gate]: string }`        | v2. stat_choice picks — chosen stat key per level gate (Blackmore/Joachim). Optional. |

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
- At most **3 + Inverse Mode (4th slot, `inverseMode: true`) + Queen Sigma (one extra slot if any
  player is her) + character-granted arcana slots** (Blackmore/Nathan Graves add slots), no
  duplicates, and a manual arcana slot may not repeat a character's starting arcana.
- **Granted-slot fills** (`weaponsExtra`/`passivesExtra`) must fit the character's granted
  extra-slot budget at its level (e.g. Santa Ladonna's weapon slot only exists at Lv80).

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

**Santa Ladonna's secret trio**
- If **Santa Ladonna** equips **Santa Water + King Bible + Cross**, all three auto-evolve (into
  `La Borra`, `Unholy Vespers`, `Heaven Sword`) and become **hidden**, freeing their three weapon
  slots — bypassing the normal evolution requirements. The planner derives this on load, so express
  it either by listing the three **bases** in `weapons`, or by the derived `santaHidden` field. It
  reverses (bases restored) if the character is changed away from Santa Ladonna.

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
