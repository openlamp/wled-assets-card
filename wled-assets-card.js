/*
 * wled-assets-card — a custom Lovelace card that decorates a WLED light entity
 * with the localized names + illustrations from the `wled-assets` layer
 * (https://github.com/openlamp/wled-assets).
 *
 * WHY: Home Assistant's native `wled` integration exposes effects/palettes by
 * their raw English WLED identifiers (Aurora, Rivendell, Fire 2012…). This card
 * joins each of those names — the STABLE join key, per wled-assets/SCHEMA.md —
 * to a localized name (+ description) and a pre-rendered thumbnail (palette PNG /
 * animated effect GIF), and turns each into a one-tap control. It is purely a
 * client-side decoration: it never touches the lamp firmware, and it falls back
 * to the plain English name whenever a translation or asset is missing, so a
 * user is never worse off than plain WLED.
 *
 * PROTOTYPE — alpha. Self-contained vanilla web component, no build step.
 */

const VERSION = "0.1.0-proto";

// Slug rule reverse-engineered from the real wled-assets image filenames:
//   "Chase 2" -> chase-2 · "Fire 2012" -> fire-2012 · "Noise2D" -> noise2d
//   "Colors 1&2" -> colors-1-2 · "* Random Cycle" -> random-cycle · "C9" -> c9
// i.e. lowercase, every run of non-alphanumerics collapses to one hyphen,
// leading/trailing hyphens trimmed. Must match wled-assets exactly.
function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

class WledAssetsCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._i18n = { palettes: null, effects: null }; // lazy-fetched dictionaries
    this._built = false;                             // one full render, then patch
    this._config = null;
    this._hass = null;
  }

  // ---- Lovelace card contract -------------------------------------------

  static getStubConfig() {
    return { entity: "", show: ["palettes", "effects"] };
  }

  setConfig(config) {
    if (!config.entity) throw new Error("wled-assets-card: `entity` is required");
    this._config = {
      entity: config.entity,
      palette_entity: config.palette_entity || null, // auto-derived if null
      language: config.language || null,             // else hass.language, else en
      assets_base: (config.assets_base || "/local/wled-assets").replace(/\/$/, ""),
      show: config.show || ["palettes", "effects"],
      columns: config.columns || 4,
      title: config.title ?? null,
    };
    this._built = false;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    if (!this._i18n.palettes || !this._i18n.effects) {
      this._loadDictionaries().then(() => this._render());
    } else {
      this._render();
    }
  }

  getCardSize() {
    return 8;
  }

  // ---- data ---------------------------------------------------------------

  get _lang() {
    return this._config.language || (this._hass && this._hass.language) || "en";
  }

  async _loadDictionaries() {
    const base = this._config.assets_base;
    const grab = async (file) => {
      try {
        const r = await fetch(`${base}/i18n/${file}`);
        if (!r.ok) throw new Error(r.status);
        return (await r.json()).entries || {};
      } catch (e) {
        console.warn(`wled-assets-card: could not load ${file}`, e);
        return {}; // graceful: everything falls back to the English key
      }
    };
    const [palettes, effects] = await Promise.all([
      grab("palettes.json"),
      grab("effects.json"),
    ]);
    this._i18n = { palettes, effects };
  }

  // localized {name, desc} for an English WLED key, with en → key fallbacks
  _loc(dict, key) {
    const entry = dict && dict[key];
    if (!entry) return { name: key, desc: "" };
    const l = entry[this._lang] || entry.en || {};
    return { name: l.name || key, desc: l.desc || "" };
  }

  // Find the WLED "Color palette" select entity that pairs with the light.
  _paletteEntity() {
    if (this._config.palette_entity) return this._config.palette_entity;
    // The wled integration names it e.g. select.l1_color_palette — derive by
    // taking the light's object_id and probing the conventional select id.
    const objId = this._config.entity.split(".")[1];
    const guess = `select.${objId}_color_palette`;
    if (this._hass.states[guess]) return guess;
    // last resort: any select whose id starts with the light object id and ends with palette
    const hit = Object.keys(this._hass.states).find(
      (e) => e.startsWith("select.") && e.includes(objId) && e.includes("palette")
    );
    return hit || null;
  }

  // ---- actions ------------------------------------------------------------

  _applyEffect(name) {
    this._hass.callService("light", "turn_on", {
      entity_id: this._config.entity,
      effect: name,
    });
  }

  _applyPalette(name, paletteEntity) {
    this._hass.callService("select", "select_option", {
      entity_id: paletteEntity,
      option: name,
    });
  }

  // ---- render -------------------------------------------------------------

  _render() {
    const st = this._hass.states[this._config.entity];
    if (!st) {
      this.shadowRoot.innerHTML = `<ha-card><div class="warn">Entité introuvable : ${this._config.entity}</div></ha-card>`;
      return;
    }

    const sections = [];

    if (this._config.show.includes("palettes")) {
      const pe = this._paletteEntity();
      if (pe && this._hass.states[pe]) {
        const sel = this._hass.states[pe];
        const options = sel.attributes.options || [];
        sections.push(
          this._section("palettes", "🎨 Palettes", options, sel.state, {
            dict: this._i18n.palettes,
            imgDir: "images/palettes",
            imgExt: "png",
            onPick: (n) => this._applyPalette(n, pe),
          })
        );
      }
    }

    if (this._config.show.includes("effects")) {
      const effects = st.attributes.effect_list || [];
      sections.push(
        this._section("effects", "✨ Effets", effects, st.attributes.effect, {
          dict: this._i18n.effects,
          imgDir: "images/effects",
          imgExt: "gif",
          onPick: (n) => this._applyEffect(n),
        })
      );
    }

    const title =
      this._config.title ??
      `${st.attributes.friendly_name || this._config.entity}`;

    this.shadowRoot.innerHTML = `
      ${this._style()}
      <ha-card>
        <div class="head">
          <span class="title">${title}</span>
          <span class="badge">wled-assets · ${this._lang}</span>
        </div>
        <div class="body"></div>
      </ha-card>
    `;
    const body = this.shadowRoot.querySelector(".body");
    sections.forEach((s) => body.appendChild(s));
    this._built = true;
  }

  _section(kind, label, items, current, opts) {
    const base = this._config.assets_base;
    const wrap = document.createElement("div");
    wrap.className = "section";

    const header = document.createElement("div");
    header.className = "sec-head";
    header.innerHTML = `<span class="sec-label">${label}</span><input class="filter" type="text" placeholder="filtrer…" />`;
    wrap.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "grid";
    grid.style.setProperty("--cols", this._config.columns);
    wrap.appendChild(grid);

    const cells = items.map((name) => {
      const { name: locName, desc } = this._loc(opts.dict, name);
      const slug = slugify(name);
      const cell = document.createElement("button");
      cell.className = "cell" + (name === current ? " active" : "");
      cell.title = desc ? `${locName} — ${desc}` : locName;
      cell.dataset.search = `${locName} ${name}`.toLowerCase();
      cell.innerHTML = `
        <span class="thumb">
          <img loading="lazy" src="${base}/${opts.imgDir}/${slug}.${opts.imgExt}"
               alt="" onerror="this.style.display='none';this.parentElement.classList.add('noimg')" />
        </span>
        <span class="name">${locName}</span>
      `;
      cell.addEventListener("click", () => {
        opts.onPick(name);
        grid.querySelectorAll(".cell.active").forEach((c) => c.classList.remove("active"));
        cell.classList.add("active");
      });
      grid.appendChild(cell);
      return cell;
    });

    header.querySelector(".filter").addEventListener("input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      cells.forEach((c) => {
        c.style.display = !q || c.dataset.search.includes(q) ? "" : "none";
      });
    });

    return wrap;
  }

  _style() {
    return `
      <style>
        ha-card { padding: 12px 14px 16px; }
        .head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
        .title { font-weight:600; font-size:1.05rem; }
        .badge { font-size:.68rem; opacity:.6; padding:2px 6px; border:1px solid var(--divider-color,#8884); border-radius:999px; }
        .section { margin-top:14px; }
        .sec-head { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
        .sec-label { font-weight:600; font-size:.9rem; opacity:.85; }
        .filter { flex:1; min-width:0; background:var(--secondary-background-color,#0002); border:1px solid var(--divider-color,#8884);
                  border-radius:8px; padding:5px 9px; color:var(--primary-text-color,inherit); font-size:.82rem; }
        .grid { display:grid; grid-template-columns:repeat(var(--cols,4), 1fr); gap:8px; max-height:340px; overflow:auto;
                padding:2px; scrollbar-width:thin; }
        .cell { display:flex; flex-direction:column; align-items:center; gap:5px; padding:7px 4px 6px; cursor:pointer;
                background:var(--secondary-background-color,#0002); border:1.5px solid transparent; border-radius:12px;
                color:var(--primary-text-color,inherit); font:inherit; transition:border-color .12s, transform .06s; }
        .cell:hover { transform:translateY(-1px); border-color:var(--divider-color,#8886); }
        .cell.active { border-color:var(--primary-color,#03a9f4); box-shadow:0 0 0 1px var(--primary-color,#03a9f4) inset; }
        .thumb { width:100%; aspect-ratio:1/1; display:flex; align-items:center; justify-content:center;
                 background:radial-gradient(circle at 50% 40%, #ffffff10, #00000018); border-radius:8px; overflow:hidden; }
        .thumb img { width:100%; height:100%; object-fit:contain; image-rendering:auto; }
        .thumb.noimg::after { content:"◑"; font-size:1.4rem; opacity:.35; }
        .name { font-size:.72rem; line-height:1.15; text-align:center; word-break:break-word;
                display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
        .warn { padding:16px; color:var(--error-color,#c62828); }
        @media (max-width:600px){ .grid{ grid-template-columns:repeat(3,1fr); } }
      </style>
    `;
  }
}

customElements.define("wled-assets-card", WledAssetsCard);

// Make it discoverable in the "Add card" picker.
window.customCards = window.customCards || [];
window.customCards.push({
  type: "wled-assets-card",
  name: "WLED Assets Card",
  preview: false,
  description:
    "Localized names + illustrations (wled-assets) for a WLED light: tap a palette or effect to apply it.",
});

console.info(`%c wled-assets-card %c ${VERSION} `, "background:#03a9f4;color:#000;border-radius:4px 0 0 4px", "background:#333;color:#fff;border-radius:0 4px 4px 0");
