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

const VERSION = "0.2.0";

// Preset colours for the "Couleur" section (name per language + RGB). Colours
// aren't part of wled-assets (no illustration/localization there), so this small
// stage-friendly set lives in the card. Tapping a swatch → light.turn_on rgb_color.
const COLORS = [
  { en: "Red", fr: "Rouge", rgb: [255, 0, 0] },
  { en: "Orange", fr: "Orange", rgb: [255, 85, 0] },
  { en: "Amber", fr: "Ambre", rgb: [255, 170, 0] },
  { en: "Yellow", fr: "Jaune", rgb: [255, 238, 0] },
  { en: "Green", fr: "Vert", rgb: [0, 200, 0] },
  { en: "Cyan", fr: "Cyan", rgb: [0, 220, 220] },
  { en: "Blue", fr: "Bleu", rgb: [0, 90, 255] },
  { en: "Indigo", fr: "Indigo", rgb: [75, 0, 255] },
  { en: "Magenta", fr: "Magenta", rgb: [255, 0, 220] },
  { en: "Pink", fr: "Rose", rgb: [255, 105, 160] },
];

// Minimal UI strings for the colour section (en/fr; falls back to en).
const UI = {
  colors: { en: "🎨 Colour", fr: "🎨 Couleur" },
  custom: { en: "Custom", fr: "Perso" },
};

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
      show: config.show || ["colors", "palettes", "effects"],
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

  _light(data) {
    this._hass.callService("light", "turn_on", {
      entity_id: this._config.entity,
      ...data,
    });
  }

  // small localized-string + colour helpers
  _t(key) {
    const e = UI[key] || {};
    return e[this._lang] || e.en || key;
  }
  _rgbToHex(rgb) {
    if (!rgb) return "#ffffff";
    return "#" + rgb.slice(0, 3).map((x) => x.toString(16).padStart(2, "0")).join("");
  }
  _hexToRgb(h) {
    const m = h.replace("#", "").match(/.{2}/g).map((x) => parseInt(x, 16));
    return [m[0], m[1], m[2]];
  }

  // ---- colour section -----------------------------------------------------

  // Not backed by wled-assets — a direct controller for on/off, brightness,
  // RGB (swatches + custom picker) and tunable white (CCT), driven off the
  // light entity's real supported_color_modes so it only shows what the lamp can do.
  _colorsSection(st) {
    const a = st.attributes;
    const modes = a.supported_color_modes || [];
    const hasRgb = modes.some((m) => ["rgb", "rgbw", "rgbww", "hs", "xy"].includes(m));
    const hasCct = modes.includes("color_temp");
    const on = st.state === "on";
    const briPct = on && a.brightness != null ? Math.round((a.brightness / 255) * 100) : on ? 100 : 0;
    const kmin = a.min_color_temp_kelvin || 2000;
    const kmax = a.max_color_temp_kelvin || 6535;
    const curK = a.color_temp_kelvin || Math.round((kmin + kmax) / 2);

    const wrap = document.createElement("div");
    wrap.className = "section colors";

    const head = document.createElement("div");
    head.className = "sec-head";
    head.innerHTML = `<span class="sec-label">${this._t("colors")}</span>
      <button class="power ${on ? "on" : ""}" title="On/Off">⏻</button>`;
    head.querySelector(".power").addEventListener("click", () =>
      this._hass.callService("light", on ? "turn_off" : "turn_on", {
        entity_id: this._config.entity,
      })
    );
    wrap.appendChild(head);

    // Brightness (fires on release to avoid flooding the lamp)
    const bri = document.createElement("label");
    bri.className = "slider-row";
    bri.innerHTML = `<span class="ico">💡</span>
      <input type="range" min="1" max="100" value="${briPct || 1}">
      <span class="val">${briPct}%</span>`;
    bri.querySelector("input").addEventListener("input", (e) => {
      bri.querySelector(".val").textContent = e.target.value + "%";
    });
    bri.querySelector("input").addEventListener("change", (e) =>
      this._light({ brightness_pct: +e.target.value })
    );
    wrap.appendChild(bri);

    // RGB swatches + custom picker
    if (hasRgb) {
      const grid = document.createElement("div");
      grid.className = "grid swatches";
      grid.style.setProperty("--cols", this._config.columns);
      COLORS.forEach((c) => {
        const name = c[this._lang] || c.en;
        const cell = document.createElement("button");
        cell.className = "cell";
        cell.title = name;
        cell.innerHTML = `<span class="thumb swatch" style="background:rgb(${c.rgb.join(",")})"></span><span class="name">${name}</span>`;
        cell.addEventListener("click", () => this._light({ rgb_color: c.rgb }));
        grid.appendChild(cell);
      });
      const custom = document.createElement("label");
      custom.className = "cell";
      custom.innerHTML = `<span class="thumb picker" style="background:${this._rgbToHex(a.rgb_color)}"><input type="color" value="${this._rgbToHex(a.rgb_color)}"></span><span class="name">${this._t("custom")}</span>`;
      const inp = custom.querySelector("input");
      inp.addEventListener("input", (e) => {
        custom.querySelector(".picker").style.background = e.target.value;
      });
      inp.addEventListener("change", (e) => this._light({ rgb_color: this._hexToRgb(e.target.value) }));
      grid.appendChild(custom);
      wrap.appendChild(grid);
    }

    // Tunable white (CCT)
    if (hasCct) {
      const cct = document.createElement("label");
      cct.className = "slider-row cct";
      cct.innerHTML = `<span class="ico">⚪</span>
        <input type="range" min="${kmin}" max="${kmax}" step="50" value="${curK}">
        <span class="val">${curK}K</span>`;
      cct.querySelector("input").addEventListener("input", (e) => {
        cct.querySelector(".val").textContent = e.target.value + "K";
      });
      cct.querySelector("input").addEventListener("change", (e) =>
        this._light({ color_temp_kelvin: +e.target.value })
      );
      wrap.appendChild(cct);
    }

    return wrap;
  }

  // ---- render -------------------------------------------------------------

  _render() {
    const st = this._hass.states[this._config.entity];
    if (!st) {
      this.shadowRoot.innerHTML = `<ha-card><div class="warn">Entité introuvable : ${this._config.entity}</div></ha-card>`;
      return;
    }

    const sections = [];

    if (this._config.show.includes("colors")) {
      sections.push(this._colorsSection(st));
    }

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
        .power { background:none; border:1px solid var(--divider-color,#8884); border-radius:999px; color:inherit; cursor:pointer; width:30px; height:30px; font-size:.95rem; line-height:1; }
        .power.on { color:var(--primary-color,#03a9f4); border-color:var(--primary-color,#03a9f4); }
        .slider-row { display:flex; align-items:center; gap:10px; margin:6px 2px 4px; }
        .slider-row .ico { font-size:1rem; opacity:.85; }
        .slider-row input[type=range] { flex:1; min-width:0; accent-color:var(--primary-color,#03a9f4); }
        .slider-row .val { font-size:.75rem; opacity:.7; min-width:46px; text-align:right; font-variant-numeric:tabular-nums; }
        .slider-row.cct input[type=range] { -webkit-appearance:none; appearance:none; height:8px; border-radius:6px;
                background:linear-gradient(90deg,#ffb763,#fff,#bcd2ff); }
        .grid.swatches { max-height:none; }
        .thumb.swatch { border-radius:8px; }
        .thumb.picker { position:relative; overflow:hidden; }
        .thumb.picker input[type=color] { position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer; border:none; padding:0; background:none; }
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
