# VS Build Calculator — Progress

Vampire Survivors build planner. Live at: `https://misterwtheface-oss.github.io/vs-build-calc/`

---

## Design System

**Color palette** (red/gold VS aesthetic):
| Token | Value | Role |
|---|---|---|
| `--bg` | `#120404` | Page background |
| `--surface` | `#1e0808` | Panel / card surface |
| `--surface2` | `#2c1010` | Hover / elevated surface |
| `--border` | `#b88820` | Default border (bright gold) |
| `--border-hi` | `#e8b820` | Active / prominent border |
| `--gold` | `#e8b820` | Highlight gold (selected states, hover) |
| `--can-evolve` | `#ffe840` | Bright yellow — evolution/union ready glow |
| `--text` | `#f0e8d0` | Body text (cream/parchment) |
| `--text-muted` | `#a08858` | Secondary text |

**Fonts:** Cinzel (headings/labels) + Crimson Text (body) — medieval/gothic feel.

---

## Landing Page — DONE

- Title: *Vampire Survivors Build Calculator* (Cinzel, large)
- Subtitle: *Select number of players to begin* (italic, muted)
- 2×2 grid of player count tiles
- Each tile: **270 × 150px fixed size**, `--border-hi` gold border, dark red background
- Content: pixel art player sprites (48px, `image-rendering: pixelated`) + player count label
- Hover: border brightens to `--gold`, subtle gold glow box-shadow
- Player sprites: `assets/icons/ui/player_1.png` through `player_4.png`

---

## Planning Page — IN PROGRESS

### Layout — DONE
- `#planning` is `height: 100vh` — the entire page fits the viewport, no document scroll
- `.planning-header` is fixed at top (`flex-shrink: 0`)
- `.planning-main` scrolls independently (`overflow-y: auto`)
- `.info-sidebar` fills remaining height; split into pinned identity header + scrollable body
- Overlay panels (`.ovl-right`) follow the same pinned-top / scrollable-body pattern

### Player Panels — DONE
- Grid layout adapts to player count: 1P (1-col centered), 2P (2-col), 3P (3-col), 4P (2-col)
- Each panel: character slot (large), weapon slots, passive slots
- Slots use type-specific `empty.png` as default visual — no CSS containers, icons carry their own frame
- Starter weapons are **locked**: shown with lock indicator, cannot be removed or swapped
- Lock is **lineage-based** — any evolved form of a starter weapon stays locked in that slot
- Character switch correctly clears prior character's starter locks before applying new ones
- `EMPTY_ICONS` map keyed by slot type: `char`, `weapon`, `passive`, `arcana`, `stage`

### Hidden (Counterpart) Weapons — DONE
- Counterpart weapons render to the right of the weapon slots at reduced opacity
- Visibility condition: Gemini (I) arcana must be active
- Counterparts persist when the base weapon evolves (lineage-based check via `weaponLineage()`)
- Clicking a counterpart slot opens the info sidebar showing that weapon's details
- `getHiddenCounterparts(playerIdx)` — walks evo paths with `Counterpart` in the pattern

### Evolve / Union System — DONE
- Ready evolutions: yellow glow (`--can-evolve`) on the base weapon slot
- Ready unions: yellow glow on all union input slots
- Clicking a ready slot shows an **Evolve →** or **Union →** button in the info sidebar
- Evolve: replaces base weapon with evolved form in the same slot
- Union: all input weapons are removed and result placed in the first input slot
- Opt-in only — never auto-applies; users can ignore it (e.g. to avoid Vandalier)
- `method` column in `weapons.csv` drives detection: `"Evolution"` vs `"Union"` vs `null` (final)
- `getReadyEvolutions(playerIdx)` / `getReadyUnions(playerIdx)` — check passive/weapon reqs against actual slots

### Global Bar (Arcana + Stage) — DONE
- Arcana and Stage are **global** — one shared selection for all players
- Displayed as a bar below the player grid: 3 arcana slots + 1 stage slot
- 1-player mode: bar constrained to match the player panel width
- 2/3/4-player mode: bar spans full grid width

### Info Sidebar — DONE
- Right column, `260px` wide, fills planning page height
- **Pinned top section:** icon + name + description always visible; separated by a gold border
- **Scrollable body:** evo chains, requirements, stats, action buttons scroll below
- **Left-click** any slot → fills sidebar with item details
- **Right-click** any slot → opens the full selection overlay
- Char sidebar: starting weapons row + full stat table
- Weapon sidebar: evo chain + evolve/union action button if ready
- Passive sidebar: evo chains for weapons that use this passive (filtered to equipped weapons)
- Arcana/Stage sidebar: icon, name, description
- Stat display: positive = green, negative = red; **cooldown is inverted** (negative = good)

### Evo Chain Display — DONE
- `buildEvoChainHTML(weapon)` — renders all evo paths for a weapon in the sidebar
- `buildPassiveEvoHTML(passive, playerIdx)` — renders paths that use a passive, optionally filtered to equipped weapons
- Passive overlay shows **all** evo paths for a passive; planner sidebar shows only paths relevant to equipped weapons
- Multiple paths shown with path name label + horizontal divider between groups
- **Pattern support:** simple evo, two-req evo, union, dual union, counterpart, triple/quad union, chaos, collection, gift, glimmer, EzEvo chains
- `eNode` renders icons with optional `MAX` label or `sub` text (absolutely positioned, don't affect row height)
- Vertical bar layout (`evo-u2f` grid, `evo-merge`, `evo-multi-union`) uses `justify-content: start` / `inline-flex` to prevent auto-column expansion that caused large gaps between branch and bar

### Overlays — DONE
- Character overlay: grid of character portraits, scroll preserved on variant cycle
- Item overlay: weapon/passive selection with arcana/char highlight rings
- Passive overlay right panel: pinned icon/name/desc + scrollable evo chains
- Weapon overlay right panel: pinned icon/name/category + scrollable requirements and chain
- Arcana overlay: shows arcana relevant to equipped weapons
- Stage overlay: stage selection

### Not Yet Started
- Associations in the info sidebar (which arcana synergize with equipped weapons, etc.)
- Blue button styling for action buttons
- Mobile/responsive polish

---

## Data Model

- `weapons.csv` `method` column: `"Evolution"` = single-weapon evo with passive reqs; `"Union"` = input to a multi-weapon union; `-` (null) = final form
- Evolution requirements live on the **evolved weapon** (child), not the base weapon (parent)
  - `base_weapon.trans_result` = name of the evolution
  - `evolved_weapon.requirements` = array of passive/weapon names needed
- `weaponLineage(name)` — walks `trans_result` chain forward, returns Set of all forms
- `evoPathsFor(name)` — returns all evo paths where `related_to` includes the weapon/passive name
- `evoPaths` in `data.js` — built from `evo_paths.csv` by `tools/build-data.mjs`

---

## Assets

- Character icons: `assets/icons/characters/` (318 images)
- Weapon icons: `assets/icons/weapons/` (360 images)
- Passive icons: `assets/icons/passives/` (34 images — complete)
- Arcana icons: `assets/icons/arcana/` (32 images)
- Stage icons: `assets/icons/stages/` (24 images including `empty.png`)
- UI icons: `assets/icons/ui/player_1–4.png`
- All missing icons fall back to type-specific `empty.png` via `onerror`
- Icon check tool: `node tools/check-icons.mjs`

---

## Architecture

- Single `index.html` — all CSS and JS embedded, no build step
- Works on `file://` and GitHub Pages (no CORS issues)
- `data/data.js` sets `window.VS_DATA` global (avoids JSON fetch CORS)
- Event delegation on `#app` and `#overlay-root` — bound once in `DOMContentLoaded`
- `state.infoPanel` — `null | { type, playerIdx, slotIdx, hiddenName? }` — drives the info sidebar
- `slotHTML()` — generates all slot HTML, supports `locked`, `hidden`, `evolved`, `removable` flags
- `buildInfoSidebar(panel)` — renders sidebar content based on `state.infoPanel`
- `refreshOverlay()` — re-renders the active overlay in-place, preserving center scroll position
- Rebuild data: `node tools/build-data.mjs` from repo root

---

## Deployment

- Repo: `misterwtheface-oss/vs-build-calc` (GitHub, public)
- Live: `https://misterwtheface-oss.github.io/vs-build-calc/`
- GitHub Pages: master branch, `/` root path
