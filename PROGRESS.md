# vs-build-calc — Progress

Vampire Survivors build planner frontend. Planned URL: https://misterwtheface-oss.github.io/vs-build-calc/

## Session Log

### 2026-07-30 — Initial scaffold
- Repo initialized with git, identity set to misterwtheface / misterwtheface@gmail.com
- `index.html` stub created with architecture comments (7 UI components planned)
- `tools/build-data.mjs` created — converts skill CSVs → `data/*.json`
- `tools/build-index.mjs` created — rebuilds `builds/index.json`
- `builds/index.json` initialized (empty)
- Icon directories scaffolded: `assets/icons/{characters,weapons,passives}/`
- Initial commit made (`c627151`)
- GitHub remote **not yet created**

---

## Status

| Item | Status |
|------|--------|
| Local scaffold | Done |
| Initial git commit | Done |
| GitHub remote (`misterwtheface-oss/vs-build-calc`) | Pending |
| GitHub Pages (from `master`) | Pending |
| `data/*.json` populated | Pending — run `node tools/build-data.mjs` after CSV import |
| Planner UI (`index.html`) | Stub only |
| Character picker | Not started |
| Weapon/passive slot grid | Not started |
| Evolution panel | Not started |
| Stage selector | Not started |
| Save/share build | Not started |
| Load build dropdown | Not started |
| Icon assets | Pending — awaiting PNGs |

---

## Data Pipeline

```
skill CSVs                         frontend JSON
references/data/characters.csv  →  data/characters.json
references/data/weapons.csv     →  data/weapons.json
references/data/passives.csv    →  data/passives.json
references/data/evolutions.csv  →  data/evolutions.json
references/data/stages.csv      →  data/stages.json
```

Run: `node tools/build-data.mjs` (from vs-build-calc root)

Skill data location: `.claude/skills/vampire-survivors-theorycraft/references/data/`

---

## Next Steps

1. Create GitHub remote and push: `gh repo create misterwtheface-oss/vs-build-calc --public --source . --remote origin --push`
2. Enable GitHub Pages on `master` in repo settings
3. Populate CSVs in skill → run `build-data.mjs` → verify `data/*.json` output
4. Build planner UI once data is ready
5. Add PNGs to `assets/icons/` when available
