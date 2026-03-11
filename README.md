# Traveller Action HUD

A minimal floating Action HUD for **Mongoose Traveller 2e** (`mgt2e`) on Foundry VTT (v12/v13).

Gives quick one-click access to an actor's skill checks, attribute (characteristic) checks, and weapon attacks — without having to open the character sheet.

---

## Features

| Tab | What it shows |
|-----|---------------|
| **Skills** | All skills (+ specialisations) the actor has, sorted alphabetically with their current modifier |
| **Attrs** | All six (or seven with PSI) characteristics — score + DM in a compact 3-column grid |
| **Weapons** | All weapon items carried by the actor, with damage dice |

- **Draggable** — grab the header and move it anywhere on screen.
- **Minimisable** — collapse to just the header bar.
- **Pinnable** — pin the HUD so it doesn't clear when you deselect a token.
- **Auto-updates** — re-renders when token selection changes or the actor's items change.
- **Smart rolling** — calls the system's native `actor.rollSkill()`, `actor.rollCharacteristic()`, and `weapon.rollAttack()` when available; falls back to a clean 2d6 + DM chat roll with Effect and success tier labels otherwise.

---

## Installation

### Via Foundry manifest URL
_(replace with your hosted URL)_
```
https://your-host/traveller-action-hud/module.json
```

### Manual installation
1. Copy the `traveller-action-hud/` folder into your Foundry `Data/modules/` directory.
2. Restart Foundry (or reload modules).
3. Enable the module in **Game Settings → Manage Modules**.

---

## Usage

The HUD appears automatically when the world loads.  
You can also toggle it via the **⚡ bolt icon** in the Token Controls (left sidebar).

- **Select a token** on the canvas to load that actor's data into the HUD.
- If no token is selected, the HUD falls back to your assigned character (if any).
- Click any button to fire the roll.

---

## Compatibility

| Foundry | mgt2e system | Status |
|---------|-------------|--------|
| v13     | 0.18+       | ✅ Verified |
| v12     | 0.16+       | ✅ Should work |
| v11     | ≤0.15       | ⚠️ Untested |

---

## Roll Fallback Logic

The HUD tries to use the system's own roll methods first:

```
actor.rollSkill(skillPath)           ← mgt2e native skill roll dialog
actor.rollCharacteristic(charKey)    ← mgt2e native characteristic roll dialog
weapon.rollAttack()                  ← mgt2e native weapon attack dialog
```

If those aren't available (e.g. if the API changes), it falls back to a plain **2d6 + DM** roll posted to chat, labelled with:
- **Exceptional Success** (15+)
- **Success** (8–14)
- **Failure** (2–7)
- **Exceptional Failure** (2 or under, natural)
- **Effect** = total − 8

---

## File Structure

```
traveller-action-hud/
├── module.json
├── README.md
├── scripts/
│   └── action-hud.js   ← All HUD logic
└── styles/
    └── action-hud.css  ← All HUD styling
```
