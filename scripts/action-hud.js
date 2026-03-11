/**
 * Traveller Action HUD
 * A minimal floating HUD for quick access to skill checks, attribute checks,
 * and weapon attacks in the Mongoose Traveller 2e (mgt2e) system.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const MODULE_ID = "traveller-action-hud";
const SUPPORTED_ACTOR_TYPES = ["traveller", "npc", "creature"];

// Canonical display order for characteristics
const CHAR_ORDER = ["str", "dex", "end", "int", "edu", "soc", "psi"];

// ─── HUD Application ──────────────────────────────────────────────────────────

class TravellerActionHUD extends Application {
  constructor(options = {}) {
    super(options);
    this._actor     = null;
    this._minimized = false;
    this._activeTab = "skills";
    this._pinned    = false;
    // Tracks which parent-skill groups are expanded  { "gun_combat": true, ... }
    this._expanded  = {};
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id:        "traveller-action-hud",
      template:  null,
      popOut:    false,
      resizable: false,
      width:     280,
      height:    "auto"
    });
  }

  // ─── Actor resolution ──────────────────────────────────────────────────────

  _resolveActor() {
    const controlled = canvas?.tokens?.controlled ?? [];
    if (controlled.length === 1) {
      const token = controlled[0];
      if (token.actor && SUPPORTED_ACTOR_TYPES.includes(token.actor.type))
        return token.actor;
    }
    if (game.user.character && SUPPORTED_ACTOR_TYPES.includes(game.user.character.type))
      return game.user.character;
    return null;
  }

  // ─── Data helpers ──────────────────────────────────────────────────────────

  /**
   * Returns an array of skill-group objects:
   *   { key, label, value, specialities: [ { key, path, label, value } ] }
   *
   * Skills without specialities have an empty specialities array.
   * Skills WITH specialities are rendered as a collapsible group.
   */
  _getSkillGroups(actor) {
    if (!actor?.system?.skills) return [];

    const groups = [];

    for (const [key, skill] of Object.entries(actor.system.skills)) {
      if (!skill || typeof skill !== "object") continue;

      const baseValue = skill.total ?? skill.value ?? skill.level ?? 0;
      const label     = this._localiseSkill(key, skill);

      // mgt2e uses British "specialities"; guard against both spellings.
      const rawSpecs    = skill.specialities ?? skill.specialisations ?? {};
      const specEntries = Object.entries(rawSpecs).filter(
        ([, s]) => s && typeof s === "object"
      );

      const specialities = specEntries.map(([specKey, spec]) => ({
        key:   specKey,
        // Dotted path used when calling rollSkill: "gun_combat.specialities.slug_thrower"
        path:  `${key}.specialities.${specKey}`,
        label: this._localiseSpec(key, specKey, spec, label),
        value: spec.total ?? spec.value ?? spec.level ?? 0
      })).sort((a, b) => a.label.localeCompare(b.label));

      groups.push({ key, label, value: baseValue, specialities });
    }

    return groups.sort((a, b) => a.label.localeCompare(b.label));
  }

  _localiseSkill(key, skill) {
    const i18nKey = `MGT2.Skills.${key}`;
    const loc = game.i18n.localize(i18nKey);
    if (loc && loc !== i18nKey) return loc;
    if (skill.label) return skill.label;
    return key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }

  _localiseSpec(parentKey, specKey, spec, parentLabel) {
    const i18nKey = `MGT2.Skills.${parentKey}.${specKey}`;
    const loc = game.i18n.localize(i18nKey);
    if (loc && loc !== i18nKey) return loc;
    if (spec.label) return spec.label;
    const friendly = specKey.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    return `${parentLabel} (${friendly})`;
  }

  /**
   * Returns only characteristics that are active/visible.
   *
   * mgt2e stores a `show` flag on each characteristic in both
   * actor.system.characteristics AND CONFIG.MGT2.CHARACTERISTICS.
   * Actor-level value wins; CONFIG is the fallback.
   */
  _getCharacteristics(actor) {
    if (!actor?.system?.characteristics) return [];

    const configChars = CONFIG?.MGT2?.CHARACTERISTICS ?? {};
    const chars = [];

    for (const [key, data] of Object.entries(actor.system.characteristics)) {
      if (!data || typeof data !== "object") continue;

      // Visibility: actor.show overrides CONFIG.show; default is visible.
      const actorShow  = data.show;
      const configShow = configChars[key]?.show ?? configChars[key.toUpperCase()]?.show;

      if (actorShow === false) continue;
      if (actorShow === undefined && configShow === false) continue;

      const score = data.value ?? data.current ?? 0;
      const dm    = this._charDM(score);

      const i18nKey = `MGT2.Characteristics.${key}`;
      let label = game.i18n.localize(i18nKey);
      if (!label || label === i18nKey)
        label = configChars[key]?.label ?? configChars[key.toUpperCase()]?.label ?? key.toUpperCase();

      chars.push({ key, label, score, dm });
    }

    return chars.sort((a, b) => {
      const ai = CHAR_ORDER.indexOf(a.key.toLowerCase());
      const bi = CHAR_ORDER.indexOf(b.key.toLowerCase());
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }

  _charDM(score) {
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
        id:       i.id,
        name:     i.name,
        damage:   i.system?.damage     ?? "?",
        // mgt2e stores parent skill key (e.g. "gun_combat")
        skillKey: i.system?.skill      ?? i.system?.skillKey ?? "",
        // …and the speciality key (e.g. "slug_thrower")
        specKey:  i.system?.speciality ?? i.system?.skillSpec ?? ""
      }));
  }

  // ─── HTML builder ──────────────────────────────────────────────────────────

  async _buildHTML(actor) {
    const skillGroups = this._getSkillGroups(actor);
    const weapons     = this._getWeapons(actor);
    const chars       = this._getCharacteristics(actor);

    const actorName = actor?.name ?? "No Actor";
    const actorType = actor?.type ?? "";

    const hudEl = document.createElement("div");
    hudEl.id = "traveller-action-hud";
    hudEl.classList.add("traveller-hud");
    if (this._minimized) hudEl.classList.add("minimized");

    hudEl.innerHTML = `
      <div class="hud-header">
        <span class="hud-actor-name" title="${actorType}">${actorName}</span>
        <div class="hud-header-buttons">
          <button class="hud-btn-pin ${this._pinned ? "active" : ""}" title="Pin HUD">📌</button>
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
            ${skillGroups.length ? `
              <div class="hud-action-list">
                ${skillGroups.map(g => this._renderSkillGroup(g)).join("")}
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
                ${weapons.map(w => {
                  const skillLabel = this._resolveWeaponSkillLabel(actor, w);
                  return `
                  <button class="hud-action-btn roll-weapon"
                    data-weapon-id="${w.id}"
                    title="${w.name} — ${w.damage} · ${skillLabel}">
                    <span class="btn-name">${w.name}</span>
                    <span class="btn-sub">${skillLabel}</span>
                    <span class="btn-value">${w.damage}</span>
                  </button>`;
                }).join("")}
              </div>
            ` : `<p class="hud-empty">No weapons equipped.</p>`}
          </div>

        </div>
      </div>
      ` : `<div class="hud-no-actor">Select a token or assign a character.</div>`}
    `;

    return hudEl;
  }

  /** Render one skill group row. */
  _renderSkillGroup(group) {
    const dmStr = `${group.value >= 0 ? "+" : ""}${group.value}`;

    if (group.specialities.length === 0) {
      return `
        <button class="hud-action-btn roll-skill"
          data-skill="${group.key}"
          data-label="${group.label}"
          title="${group.label} (${dmStr})">
          <span class="btn-name">${group.label}</span>
          <span class="btn-value">${dmStr}</span>
        </button>`;
    }

    const isOpen = !!this._expanded[group.key];
    return `
      <div class="hud-skill-group ${isOpen ? "open" : ""}">
        <div class="hud-skill-group-header">
          <button class="hud-action-btn roll-skill hud-group-roll"
            data-skill="${group.key}"
            data-label="${group.label}"
            title="Roll ${group.label} base (${dmStr})">
            <span class="btn-name">${group.label}</span>
            <span class="btn-value">${dmStr}</span>
          </button>
          <button class="hud-expand-btn" data-group="${group.key}"
            title="${isOpen ? "Collapse" : "Show specialities"}">
            ${isOpen ? "▲" : "▼"}
          </button>
        </div>
        <div class="hud-spec-list">
          ${group.specialities.map(s => {
            const sdm = `${s.value >= 0 ? "+" : ""}${s.value}`;
            return `
            <button class="hud-action-btn roll-skill hud-spec-btn"
              data-skill="${s.path}"
              data-label="${s.label}"
              title="${s.label} (${sdm})">
              <span class="btn-spec-name">${s.label}</span>
              <span class="btn-value">${sdm}</span>
            </button>`;
          }).join("")}
        </div>
      </div>`;
  }

  /**
   * Build the display label for a weapon's skill, e.g.:
   *   "Gun Combat (Slug Thrower)"  or just  "Melee"
   */
  _resolveWeaponSkillLabel(actor, weapon) {
    const { skillKey, specKey } = weapon;
    if (!skillKey) return "—";

    const skillData   = actor?.system?.skills?.[skillKey];
    const parentLabel = skillData
      ? this._localiseSkill(skillKey, skillData)
      : skillKey.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

    if (!specKey) return parentLabel;

    const specData  = skillData?.specialities?.[specKey] ?? skillData?.specialisations?.[specKey];
    const specLabel = specData
      ? this._localiseSpec(skillKey, specKey, specData, parentLabel)
      : specKey.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

    return `${parentLabel} (${specLabel})`;
  }

  // ─── Rendering ─────────────────────────────────────────────────────────────

  async render(force = false, options = {}) {
    this._actor = this._resolveActor();

    const el    = document.getElementById("traveller-action-hud");
    const newEl = await this._buildHTML(this._actor);

    if (el) {
      newEl.style.left = el.style.left;
      newEl.style.top  = el.style.top;
      el.replaceWith(newEl);
    } else {
      newEl.style.left = "20px";
      newEl.style.top  = `${window.innerHeight - 440}px`;
      document.body.appendChild(newEl);
    }

    this._activateListeners(newEl);
    this._makeDraggable(newEl);
    return this;
  }

  close() {
    document.getElementById("traveller-action-hud")?.remove();
  }

  // ─── Event listeners ───────────────────────────────────────────────────────

  _activateListeners(html) {
    html.querySelector(".hud-btn-minimize")?.addEventListener("click", () => {
      this._minimized = !this._minimized;
      this.render();
    });

    html.querySelector(".hud-btn-pin")?.addEventListener("click", () => {
      this._pinned = !this._pinned;
      this.render();
    });

    html.querySelectorAll(".hud-tab").forEach(btn =>
      btn.addEventListener("click", e => {
        this._activeTab = e.currentTarget.dataset.tab;
        this.render();
      })
    );

    // Expand / collapse speciality groups
    html.querySelectorAll(".hud-expand-btn").forEach(btn =>
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const group = e.currentTarget.dataset.group;
        this._expanded[group] = !this._expanded[group];
        this.render();
      })
    );

    html.querySelectorAll(".roll-skill").forEach(btn =>
      btn.addEventListener("click", e => {
        const { skill, label } = e.currentTarget.dataset;
        this._rollSkill(skill, label);
      })
    );

    html.querySelectorAll(".roll-char").forEach(btn =>
      btn.addEventListener("click", e => {
        const { char: charKey, label } = e.currentTarget.dataset;
        this._rollChar(charKey, label);
      })
    );

    html.querySelectorAll(".roll-weapon").forEach(btn =>
      btn.addEventListener("click", e => {
        this._rollWeapon(e.currentTarget.dataset.weaponId);
      })
    );
  }

  // ─── Roll handlers ─────────────────────────────────────────────────────────

  _rollSkill(skillPath, label) {
    const actor = this._actor;
    if (!actor) return ui.notifications.warn("No actor selected.");

    // Use the system's native method when available.
    // mgt2e expects either "gun_combat" or "gun_combat.specialities.slug_thrower".
    if (typeof actor.rollSkill === "function")
      return actor.rollSkill(skillPath);

    // Fallback
    const skillData = this._resolveDataPath(actor.system.skills, skillPath);
    const bonus     = skillData?.total ?? skillData?.value ?? skillData?.level ?? 0;
    this._doManualRoll({ label, bonus, flavor: `Skill Check: ${label}` });
  }

  _rollChar(charKey, label) {
    const actor = this._actor;
    if (!actor) return ui.notifications.warn("No actor selected.");

    if (typeof actor.rollCharacteristic === "function")
      return actor.rollCharacteristic(charKey);

    const data  = actor.system?.characteristics?.[charKey];
    const score = data?.value ?? data?.current ?? 0;
    this._doManualRoll({ label, bonus: this._charDM(score), flavor: `Characteristic Check: ${label} (${score})` });
  }

  /**
   * Weapon attack roll with correct speciality skill resolution.
   *
   * Priority when native rollAttack() is absent:
   *   1. Weapon specifies a speciality key AND the actor has that speciality → use it
   *   2. Actor has the parent skill → use parent level
   *   3. Bonus = 0 (untrained)
   */
  _rollWeapon(weaponId) {
    const actor  = this._actor;
    if (!actor) return ui.notifications.warn("No actor selected.");

    const weapon = actor.items.get(weaponId);
    if (!weapon) return ui.notifications.warn("Weapon not found.");

    if (typeof weapon.rollAttack === "function")
      return weapon.rollAttack();

    // ── Fallback bonus calculation ────────────────────────────────────────────
    const wData     = this._getWeapons(actor).find(w => w.id === weaponId);
    const skillKey  = wData?.skillKey ?? "";
    const specKey   = wData?.specKey  ?? "";
    let bonus = 0;

    if (skillKey) {
      const parentSkill = actor.system?.skills?.[skillKey];
      if (parentSkill) {
        if (specKey) {
          // Guard both British and American spelling variants
          const specData =
            parentSkill?.specialities?.[specKey] ??
            parentSkill?.specialisations?.[specKey];
          // Use speciality level if present, otherwise fall back to parent
          bonus = specData
            ? (specData.total ?? specData.value ?? specData.level ?? 0)
            : (parentSkill.total ?? parentSkill.value ?? parentSkill.level ?? 0);
        } else {
          bonus = parentSkill.total ?? parentSkill.value ?? parentSkill.level ?? 0;
        }
      }
    }

    const skillLabel = wData ? this._resolveWeaponSkillLabel(actor, wData) : skillKey;
    this._doManualRoll({
      label:  weapon.name,
      bonus,
      flavor: `Attack: ${weapon.name} (${wData?.damage ?? "?"}) · ${skillLabel}`
    });
  }

  async _doManualRoll({ label, bonus, flavor }) {
    const sign = bonus >= 0 ? "+" : "";
    const roll = new Roll(`2d6${sign}${bonus}`);
    await roll.evaluate();

    const total  = roll.total;
    const effect = total - 8;
    let tier;
    if      (total >= 15) tier = `<span class="hud-result exceptional-success">Exceptional Success!</span>`;
    else if (total >= 8)  tier = `<span class="hud-result success">Success</span>`;
    else if (total > 2)   tier = `<span class="hud-result failure">Failure</span>`;
    else                  tier = `<span class="hud-result exceptional-failure">Exceptional Failure!</span>`;

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this._actor }),
      flavor:  `${flavor}<br>${tier} &mdash; Effect: ${effect >= 0 ? "+" : ""}${effect}`
    });
  }

  // ─── Utility ───────────────────────────────────────────────────────────────

  _resolveDataPath(root, path) {
    return path.split(".").reduce((obj, key) => obj?.[key], root) ?? null;
  }

  _makeDraggable(el) {
    const header = el.querySelector(".hud-header");
    if (!header) return;
    let sx, sy, il, it;
    header.addEventListener("mousedown", e => {
      if (e.target.closest("button")) return;
      e.preventDefault();
      sx = e.clientX; sy = e.clientY;
      il = parseInt(el.style.left) || 0;
      it = parseInt(el.style.top)  || 0;
      const move = mv => {
        el.style.left = `${il + mv.clientX - sx}px`;
        el.style.top  = `${it + mv.clientY - sy}px`;
      };
      const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup",   up);
      };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup",   up);
    });
  }
}

// ─── Module singleton ─────────────────────────────────────────────────────────

let _hud = null;
function getHUD() {
  if (!_hud) _hud = new TravellerActionHUD();
  return _hud;
}

// ─── Foundry Hooks ────────────────────────────────────────────────────────────

Hooks.once("ready", () => {
  if (game.system.id !== "mgt2e") {
    console.warn(`[${MODULE_ID}] Requires the mgt2e system (current: ${game.system.id})`);
    return;
  }
  console.log(`[${MODULE_ID}] Ready.`);
  getHUD().render(true);

  Hooks.on("getSceneControlButtons", controls => {
    const tokenLayer = controls.find(c => c.name === "token");
    if (!tokenLayer) return;
    tokenLayer.tools.push({
      name:    "traveller-action-hud",
      title:   "Traveller Action HUD",
      icon:    "fas fa-bolt",
      toggle:  true,
      active:  true,
      onClick: active => active ? getHUD().render(true) : getHUD().close()
    });
  });
});

Hooks.on("controlToken", () => {
  if (!_hud) return;
  if (!_hud._pinned || _hud._resolveActor()) _hud.render();
});

Hooks.on("updateActor", actor => {
  if (_hud?._actor?.id === actor.id) _hud.render();
});

Hooks.on("createItem", item => {
  if (_hud?._actor && item.parent?.id === _hud._actor.id) _hud.render();
});

Hooks.on("deleteItem", item => {
  if (_hud?._actor && item.parent?.id === _hud._actor.id) _hud.render();
});

Hooks.on("canvasReady", () => {
  if (_hud) _hud.render();
});
