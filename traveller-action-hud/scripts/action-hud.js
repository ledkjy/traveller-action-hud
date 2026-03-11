/**
 * Traveller Action HUD
 * A minimal floating HUD for quick access to skill checks, attribute checks,
 * and weapon attacks in the Mongoose Traveller 2e (mgt2e) system.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const MODULE_ID = "traveller-action-hud";
const SUPPORTED_ACTOR_TYPES = ["traveller", "npc", "creature"];

// Mongoose Traveller 2e characteristic keys and their display labels
const CHARACTERISTICS = {
  str: "STR",
  dex: "DEX",
  end: "END",
  int: "INT",
  edu: "EDU",
  soc: "SOC",
  psi: "PSI"
};

// ─── HUD Application ──────────────────────────────────────────────────────────

class TravellerActionHUD extends Application {
  constructor(options = {}) {
    super(options);
    this._actor = null;
    this._minimized = false;
    this._activeTab = "skills";
    this._pinned = false;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "traveller-action-hud",
      template: null, // We render our own HTML
      popOut: false,
      resizable: false,
      width: 280,
      height: "auto"
    });
  }

  /** Return the currently relevant actor (selected token → owned character) */
  _resolveActor() {
    // Prefer a selected token on the canvas
    const controlled = canvas?.tokens?.controlled ?? [];
    if (controlled.length === 1) {
      const token = controlled[0];
      if (token.actor && SUPPORTED_ACTOR_TYPES.includes(token.actor.type)) {
        return token.actor;
      }
    }
    // Fall back to the user's assigned character
    if (game.user.character && SUPPORTED_ACTOR_TYPES.includes(game.user.character.type)) {
      return game.user.character;
    }
    return null;
  }

  /** Build the full DOM element for the HUD */
  async _buildHTML(actor) {
    const skills   = this._getSkills(actor);
    const weapons  = this._getWeapons(actor);
    const chars    = this._getCharacteristics(actor);

    const actorName = actor ? actor.name : "No Actor";
    const actorType = actor ? actor.type : "";

    const hudEl = document.createElement("div");
    hudEl.id = "traveller-action-hud";
    hudEl.classList.add("traveller-hud");
    if (this._minimized) hudEl.classList.add("minimized");

    hudEl.innerHTML = `
      <div class="hud-header">
        <span class="hud-actor-name" title="${actorType}">${actorName}</span>
        <div class="hud-header-buttons">
          <button class="hud-btn-pin ${this._pinned ? "active" : ""}" title="Pin HUD (keep open when deselecting tokens)">📌</button>
          <button class="hud-btn-minimize" title="${this._minimized ? "Expand" : "Minimize"}">${this._minimized ? "▲" : "▼"}</button>
        </div>
      </div>

      ${actor ? `
      <div class="hud-body">
        <div class="hud-tabs">
          <button class="hud-tab ${this._activeTab === "skills"  ? "active" : ""}" data-tab="skills">Skills</button>
          <button class="hud-tab ${this._activeTab === "chars"   ? "active" : ""}" data-tab="chars">Attrs</button>
          <button class="hud-tab ${this._activeTab === "weapons" ? "active" : ""}" data-tab="weapons">Weapons</button>
        </div>

        <div class="hud-panels">

          <!-- SKILLS PANEL -->
          <div class="hud-panel ${this._activeTab === "skills" ? "active" : ""}" data-panel="skills">
            ${skills.length ? `
              <div class="hud-action-list">
                ${skills.map(s => `
                  <button class="hud-action-btn roll-skill"
                    data-skill="${s.key}"
                    data-label="${s.label}"
                    title="${s.label} (${s.value >= 0 ? "+" : ""}${s.value})">
                    <span class="btn-name">${s.label}</span>
                    <span class="btn-value">${s.value >= 0 ? "+" : ""}${s.value}</span>
                  </button>
                `).join("")}
              </div>
            ` : `<p class="hud-empty">No skills found.</p>`}
          </div>

          <!-- CHARACTERISTICS PANEL -->
          <div class="hud-panel ${this._activeTab === "chars" ? "active" : ""}" data-panel="chars">
            ${chars.length ? `
              <div class="hud-action-list hud-chars-grid">
                ${chars.map(c => `
                  <button class="hud-action-btn roll-char"
                    data-char="${c.key}"
                    data-label="${c.label}"
                    title="${c.label}: ${c.score} (DM ${c.dm >= 0 ? "+" : ""}${c.dm})">
                    <span class="btn-name">${c.label}</span>
                    <span class="btn-value">${c.score}</span>
                    <span class="btn-dm">${c.dm >= 0 ? "+" : ""}${c.dm}</span>
                  </button>
                `).join("")}
              </div>
            ` : `<p class="hud-empty">No attributes found.</p>`}
          </div>

          <!-- WEAPONS PANEL -->
          <div class="hud-panel ${this._activeTab === "weapons" ? "active" : ""}" data-panel="weapons">
            ${weapons.length ? `
              <div class="hud-action-list">
                ${weapons.map(w => `
                  <button class="hud-action-btn roll-weapon"
                    data-weapon-id="${w.id}"
                    data-label="${w.name}"
                    title="${w.name} — ${w.damage} (${w.skill})">
                    <span class="btn-name">${w.name}</span>
                    <span class="btn-value">${w.damage}</span>
                  </button>
                `).join("")}
              </div>
            ` : `<p class="hud-empty">No weapons equipped.</p>`}
          </div>

        </div>
      </div>
      ` : `<div class="hud-no-actor">Select a token or assign a character.</div>`}
    `;

    return hudEl;
  }

  // ─── Data helpers ───────────────────────────────────────────────────────────

  _getSkills(actor) {
    if (!actor?.system?.skills) return [];
    const skills = [];
    const raw = actor.system.skills;

    for (const [key, skill] of Object.entries(raw)) {
      if (!skill || typeof skill !== "object") continue;
      // mgt2e stores skill level as skill.value or skill.total
      const value = skill.total ?? skill.value ?? skill.level ?? 0;
      const label = game.i18n.localize(`MGT2.Skills.${key}`) || skill.label || key;

      // Handle specialisations: sub-skills stored as nested objects
      const hasSpecs = skill.specialisations && Object.keys(skill.specialisations).length > 0;

      if (hasSpecs) {
        for (const [specKey, spec] of Object.entries(skill.specialisations)) {
          if (!spec || typeof spec !== "object") continue;
          const specValue = spec.total ?? spec.value ?? spec.level ?? 0;
          const specLabel = game.i18n.localize(`MGT2.Skills.${key}.${specKey}`) || spec.label || `${label} (${specKey})`;
          skills.push({ key: `${key}.specialisations.${specKey}`, label: specLabel, value: specValue });
        }
      } else {
        skills.push({ key, label, value });
      }
    }

    return skills.sort((a, b) => a.label.localeCompare(b.label));
  }

  _getCharacteristics(actor) {
    if (!actor?.system?.characteristics) return [];
    const chars = [];
    const raw = actor.system.characteristics;

    for (const [key, data] of Object.entries(raw)) {
      if (!data || typeof data !== "object") continue;
      const score = data.value ?? data.current ?? 0;
      // Traveller DM: floor((score - 6) / 3) but capped — standard formula
      const dm = this._charDM(score);
      const label = CHARACTERISTICS[key.toLowerCase()]
        ?? game.i18n.localize(`MGT2.Characteristics.${key}`)
        ?? key.toUpperCase();
      chars.push({ key, label, score, dm });
    }

    return chars.sort((a, b) => {
      const order = ["str","dex","end","int","edu","soc","psi"];
      return (order.indexOf(a.key.toLowerCase()) + 1 || 99) - (order.indexOf(b.key.toLowerCase()) + 1 || 99);
    });
  }

  _charDM(score) {
    // MGT2 DM table: 0=−3, 1–2=−2, 3–5=−1, 6–8=+0, 9–11=+1, 12–14=+2, 15=+3
    if (score <= 0)  return -3;
    if (score <= 2)  return -2;
    if (score <= 5)  return -1;
    if (score <= 8)  return  0;
    if (score <= 11) return  1;
    if (score <= 14) return  2;
    return 3;
  }

  _getWeapons(actor) {
    if (!actor?.items) return [];
    return actor.items
      .filter(i => i.type === "weapon")
      .map(i => ({
        id:     i.id,
        name:   i.name,
        damage: i.system?.damage ?? "?",
        skill:  i.system?.skill ?? ""
      }));
  }

  // ─── Rendering ──────────────────────────────────────────────────────────────

  async render(force = false, options = {}) {
    this._actor = this._resolveActor();

    let el = document.getElementById("traveller-action-hud");
    const newEl = await this._buildHTML(this._actor);

    // Preserve position if already present
    if (el) {
      newEl.style.left = el.style.left;
      newEl.style.top  = el.style.top;
      el.replaceWith(newEl);
    } else {
      // Default position: bottom-left of viewport
      newEl.style.left = "20px";
      newEl.style.top  = `${window.innerHeight - 420}px`;
      document.body.appendChild(newEl);
    }

    this._activateListeners(newEl);
    this._makeDraggable(newEl);
    return this;
  }

  close() {
    const el = document.getElementById("traveller-action-hud");
    if (el) el.remove();
  }

  // ─── Event listeners ────────────────────────────────────────────────────────

  _activateListeners(html) {
    // Minimise
    html.querySelector(".hud-btn-minimize")?.addEventListener("click", () => {
      this._minimized = !this._minimized;
      this.render();
    });

    // Pin
    html.querySelector(".hud-btn-pin")?.addEventListener("click", () => {
      this._pinned = !this._pinned;
      this.render();
    });

    // Tab switching
    html.querySelectorAll(".hud-tab").forEach(btn => {
      btn.addEventListener("click", e => {
        this._activeTab = e.currentTarget.dataset.tab;
        this.render();
      });
    });

    // Skill roll buttons
    html.querySelectorAll(".roll-skill").forEach(btn => {
      btn.addEventListener("click", e => {
        const { skill, label } = e.currentTarget.dataset;
        this._rollSkill(skill, label);
      });
    });

    // Characteristic roll buttons
    html.querySelectorAll(".roll-char").forEach(btn => {
      btn.addEventListener("click", e => {
        const { char: charKey, label } = e.currentTarget.dataset;
        this._rollChar(charKey, label);
      });
    });

    // Weapon attack buttons
    html.querySelectorAll(".roll-weapon").forEach(btn => {
      btn.addEventListener("click", e => {
        const { weaponId, label } = e.currentTarget.dataset;
        this._rollWeapon(weaponId, label);
      });
    });
  }

  // ─── Roll handlers ──────────────────────────────────────────────────────────

  _rollSkill(skillPath, label) {
    const actor = this._actor;
    if (!actor) return ui.notifications.warn("No actor selected.");

    // mgt2e exposes rollSkill on the actor sheet / actor directly
    // Try the actor method first, then fall back to a manual roll
    if (typeof actor.rollSkill === "function") {
      return actor.rollSkill(skillPath);
    }

    // Fallback: resolve skill value from path and roll manually
    const skillData = this._resolveSkillData(actor, skillPath);
    const skillDM   = skillData?.total ?? skillData?.value ?? skillData?.level ?? 0;
    this._doManualRoll({ label, bonus: skillDM, flavor: `Skill Check: ${label}` });
  }

  _rollChar(charKey, label) {
    const actor = this._actor;
    if (!actor) return ui.notifications.warn("No actor selected.");

    // mgt2e exposes rollCharacteristic
    if (typeof actor.rollCharacteristic === "function") {
      return actor.rollCharacteristic(charKey);
    }

    // Fallback
    const charData = actor.system?.characteristics?.[charKey];
    const score    = charData?.value ?? charData?.current ?? 0;
    const dm       = this._charDM(score);
    this._doManualRoll({ label, bonus: dm, flavor: `Characteristic Check: ${label} (${score})` });
  }

  _rollWeapon(weaponId, label) {
    const actor = this._actor;
    if (!actor) return ui.notifications.warn("No actor selected.");

    const weapon = actor.items.get(weaponId);
    if (!weapon) return ui.notifications.warn("Weapon not found.");

    // mgt2e weapon items expose a rollAttack method
    if (typeof weapon.rollAttack === "function") {
      return weapon.rollAttack();
    }

    // Fallback: roll 2d6 + linked skill DM + linked char DM
    const skillKey = weapon.system?.skill;
    let bonus = 0;
    if (skillKey && actor.system?.skills?.[skillKey]) {
      const sk = actor.system.skills[skillKey];
      bonus += sk?.total ?? sk?.value ?? sk?.level ?? 0;
    }
    const damageDice = weapon.system?.damage ?? "2d6";
    this._doManualRoll({ label, bonus, flavor: `Attack: ${label} (${damageDice})` });
  }

  /** Generic 2d6 roll with a DM bonus, posted to chat */
  async _doManualRoll({ label, bonus, flavor }) {
    const sign    = bonus >= 0 ? "+" : "";
    const formula = `2d6${sign}${bonus}`;
    const roll    = new Roll(formula);
    await roll.evaluate();

    const total = roll.total;
    let resultTag = "";
    if (total >= 15) resultTag = `<span class="hud-result exceptional-success">Exceptional Success!</span>`;
    else if (total >= 8) resultTag = `<span class="hud-result success">Success</span>`;
    else if (total >= 2) resultTag = `<span class="hud-result failure">Failure</span>`;
    else resultTag = `<span class="hud-result exceptional-failure">Exceptional Failure!</span>`;

    const effect = total - 8;
    const effectStr = `Effect: ${effect >= 0 ? "+" : ""}${effect}`;

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this._actor }),
      flavor:  `${flavor}<br>${resultTag} &mdash; ${effectStr}`
    });
  }

  // ─── Utility ────────────────────────────────────────────────────────────────

  _resolveSkillData(actor, path) {
    // path may be "gun_combat" or "gun_combat.specialisations.slug_thrower"
    const parts = path.split(".");
    let obj = actor.system.skills;
    for (const p of parts) {
      if (!obj) return null;
      obj = obj[p];
    }
    return obj;
  }

  _makeDraggable(el) {
    const header = el.querySelector(".hud-header");
    if (!header) return;

    let startX, startY, initLeft, initTop;

    header.addEventListener("mousedown", e => {
      if (e.target.closest("button")) return; // don't drag on button clicks
      e.preventDefault();
      startX   = e.clientX;
      startY   = e.clientY;
      initLeft = parseInt(el.style.left) || 0;
      initTop  = parseInt(el.style.top)  || 0;

      const onMove = mv => {
        el.style.left = `${initLeft + mv.clientX - startX}px`;
        el.style.top  = `${initTop  + mv.clientY - startY}px`;
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup",   onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup",   onUp);
    });
  }
}

// ─── Module Singleton ─────────────────────────────────────────────────────────

let _hud = null;

function getHUD() {
  if (!_hud) _hud = new TravellerActionHUD();
  return _hud;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

Hooks.once("ready", () => {
  // Only activate for the mgt2e system
  if (game.system.id !== "mgt2e") {
    console.warn(`[${MODULE_ID}] This module requires the mgt2e system. Current: ${game.system.id}`);
    return;
  }

  console.log(`[${MODULE_ID}] Initialised.`);

  // Render HUD on first load
  getHUD().render(true);

  // Add a button to the token controls to toggle the HUD
  Hooks.on("getSceneControlButtons", controls => {
    const tokenLayer = controls.find(c => c.name === "token");
    if (!tokenLayer) return;
    tokenLayer.tools.push({
      name:    "traveller-action-hud",
      title:   "Traveller Action HUD",
      icon:    "fas fa-bolt",
      toggle:  true,
      active:  true,
      onClick: active => {
        if (active) getHUD().render(true);
        else        getHUD().close();
      }
    });
  });
});

// Re-render when token selection changes
Hooks.on("controlToken", () => {
  const hud = _hud;
  if (!hud) return;
  if (!hud._pinned || hud._resolveActor()) {
    hud.render();
  }
});

// Re-render when actor data changes (e.g. items added/removed)
Hooks.on("updateActor", (actor) => {
  if (!_hud) return;
  if (_hud._actor?.id === actor.id) _hud.render();
});

Hooks.on("createItem", (item) => {
  if (!_hud || !_hud._actor) return;
  if (item.parent?.id === _hud._actor.id) _hud.render();
});

Hooks.on("deleteItem", (item) => {
  if (!_hud || !_hud._actor) return;
  if (item.parent?.id === _hud._actor.id) _hud.render();
});

// Clean up on scene change
Hooks.on("canvasReady", () => {
  if (_hud) _hud.render();
});
