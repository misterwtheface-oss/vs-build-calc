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
| `--text` | `#f0e8d0` | Body text (cream/parchment) |
| `--text-muted` | `#a08858` | Secondary text |

**Fonts:** Cinzel (headings/labels) + Crimson Text (body) — medieval/gothic feel.

**Pending design decision:** Blue buttons (interactive actions) — approved direction, not yet applied.

---

## Landing Page — DONE

- Title: *Vampire Survivors Build Calculator* (Cinzel, large)
- Subtitle: *Select number of players to begin* (italic, muted)
- 2×2 grid of player count tiles
- Each tile: **270 × 150px fixed size**, `--border-hi` gold border, dark red background
- Content: pixel art player sprites (48px, `image-rendering: pixelated`) + player count label
- Hover: border brightens to `--gold`, subtle gold glow box-shadow
- No stat/slot count subtitle — tiles are clean icon + label only
- Player sprites: `assets/icons/ui/player_1.png` through `player_4.png`

---

## Planning Page — IN PROGRESS

### Player Panels — DONE
- Grid layout adapts to player count: 1P (1-col centered), 2P (2-col), 3P (3-col), 4P (2-col)
- Each panel: character slot (large), weapon slots, passive slots
- Slots use type-specific `empty.png` as default visual — no CSS containers, icons carry their own frame
- Starter weapons for a character are **locked**: shown with info on click, cannot be removed or swapped
- `EMPTY_ICONS` map keyed by slot type: `char`, `weapon`, `passive`, `arcana`, `stage`

### Global Bar (Arcana + Stage) — DONE
- Arcana and Stage are **global** — one shared selection for all players, not per-player
- Displayed as a bar below the player grid: 3 arcana slots + 1 stage slot
- Arcana slot height: auto, to accommodate tall portrait arcana icons (no cropping)
- Stage slot: 120px wide landscape format using `assets/icons/stages/empty.png`
- 1-player mode: bar constrained to match the player panel width (max-width 900px, centered)
- 2/3/4-player mode: bar spans full grid width

### Info Sidebar — DONE
- Right column of the planning layout, `260px` wide, sticky
- **Left-click** any slot → fills sidebar with item details (icon, name, description, type-specific info)
- **Right-click** any slot → opens the full selection overlay
- Char sidebar: starting weapons row + full stat table
- Weapon sidebar: evolves-into row + required passives
- Passive sidebar: used-for evolutions list
- Arcana/Stage sidebar: icon, name, description
- Empty state: placeholder prompt ("Left-click a slot to see details / Right-click to change")
- Stat display: positive = green, negative = red; **cooldown is inverted** (negative = good)

### Overlays — DONE
- Character overlay: 4-column grid of character portraits filling full width, scroll preserved on variant cycle
- Item overlay: weapon/passive selection with arcana rating highlights
- Arcana overlay: shows arcana relevant to equipped weapons
- Stage overlay: stage selection

### Not Yet Started
- Associations in the info sidebar (which arcana synergize with equipped weapons, etc.)
- Blue button styling for action buttons (Back, Confirm, etc.)
- Mobile/responsive polish

---

## Assets

- Character icons: `assets/icons/characters/` (318 images; ~12 newer DLC characters missing, user sourcing)
- Weapon icons: `assets/icons/weapons/` (360 images; ~34 newer DLC weapons missing, user sourcing)
- Passive icons: `assets/icons/passives/` (34 images — complete)
- Arcana icons: `assets/icons/arcana/` (32 images)
- Stage icons: `assets/icons/stages/` (24 images including `empty.png`)
- UI icons: `assets/icons/ui/player_1–4.png` (pixel art player sprites)
- All missing icons fall back to type-specific `empty.png` via `onerror`
- Icon check tool: `node tools/check-icons.mjs` (reports missing by category)

---

## Architecture

- Single `index.html` — all CSS and JS embedded, no build step
- Works on `file://` and GitHub Pages (no CORS issues)
- `data/data.js` sets `window.VS_DATA` global (avoids JSON fetch CORS)
- Event delegation on `#app` and `#overlay-root` — bound once in `DOMContentLoaded`
- `state.infoPanel` — `null | { type, playerIdx, slotIdx }` — drives the info sidebar
- `slotHTML()` — generates all slot HTML, supports `locked`, `hidden`, `evolved`, `removable` flags
- `buildInfoSidebar(panel)` — renders sidebar content based on `state.infoPanel`
- Rebuild data: `node tools/build-data.mjs` from repo root

---

## Deployment

- Repo: `misterwtheface-oss/vs-build-calc` (GitHub, public)
- Live: `https://misterwtheface-oss.github.io/vs-build-calc/`
- GitHub Pages: master branch, `/` root path
- **Pending commit/push:** all session work (slot icon redesign, 4-col char overlay, scroll fix, locked weapons, inverted cooldown, info sidebar)
