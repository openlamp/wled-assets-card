# wled-assets-card

**A custom [Home Assistant](https://www.home-assistant.io) Lovelace card that decorates
a WLED light with the localized names and illustrations from
[`wled-assets`](https://github.com/openlamp/wled-assets) — tap a palette or effect to apply it.**

> **A client *for* WLED, on top of Home Assistant's own `wled` integration — not affiliated
> with or endorsed by the WLED or Home Assistant projects.** It reads the entities HA already
> exposes and decorates them; it never touches the lamp firmware.

Home Assistant's native `wled` integration lists effects and palettes by their **raw English
identifiers** (`Aurora`, `Rivendell`, `Fire 2012`…), picked from a plain dropdown. This card
joins each of those names — the **stable join key**, per
[`wled-assets/SCHEMA.md`](https://github.com/openlamp/wled-assets/blob/main/SCHEMA.md) — to:

- a **localized name** (+ description) in `en fr de es it ja ko zh`, and
- a **pre-rendered thumbnail**: a gradient-filled **palette illustration** or an **animated
  effect preview**,

and turns every one into a **one-tap control**. It's a pure client-side decoration: it falls
back to the plain English name whenever a translation or asset is missing, so you are never
worse off than the stock dropdown.

<sub>Part of the **[OpenLamp](https://github.com/openlamp)** family, alongside
LumiDeck (a Stream Deck controller for WLED) and
[`wled-assets`](https://github.com/openlamp/wled-assets) (the shared asset layer this card consumes).</sub>

> ⚠️ **Alpha / prototype.** Renders correctly against the real 72 palettes + 217 effects
> (0 broken thumbnails), but rough edges remain. Feedback and issues welcome.

## What it looks like

Run [`examples/preview.html`](examples/preview.html) — a standalone harness that mocks a
`hass` object and points at a real `wled-assets` checkout, no Home Assistant required.

## Install

### Assets (once)

Copy a checkout of [`wled-assets`](https://github.com/openlamp/wled-assets) into your HA
config so it is served locally:

```
config/www/wled-assets/          →  served at  /local/wled-assets/
```

### The card

**Manual**

1. Copy `wled-assets-card.js` to `config/www/wled-assets-card.js`.
2. Settings → Dashboards → ⋮ → Resources → **Add** → URL `/local/wled-assets-card.js`,
   type **JavaScript Module**.

**HACS** (custom repository)

HACS → ⋮ → Custom repositories → add `https://github.com/openlamp/wled-assets-card`,
category **Dashboard** → install. HACS registers the resource for you.

## Configuration

```yaml
type: custom:wled-assets-card
entity: light.l1          # required — your WLED light entity
# everything below is optional:
language: fr              # default: hass language, fallback en
palette_entity: select.l1_color_palette   # default: auto-derived from `entity`
assets_base: /local/wled-assets            # where wled-assets is served
show: [colors, palettes, effects]  # which sections, in order
columns: 4                # grid columns (3 on narrow / mobile)
title: "L1 — Salon"       # default: the light's friendly_name
raw_command: rest_command.wled_l1_raw   # optional — unlocks Background/Custom colour
```

`raw_command` is the name of a Home Assistant `rest_command` that POSTs a raw WLED
`/json/state` patch (`{{ patch | tojson }}`) to the lamp. It unlocks the *Background*
and *Custom* colour slots (which have no HA entity) and gives exact colour control on
RGBCW lamps, where HA's `light` entity can keep reporting `color_temp` after an RGB
change. Example:

```yaml
# configuration.yaml (or rest_command.yaml)
rest_command:
  wled_l1_raw:
    url: "http://{{ states('sensor.l1_ip') }}/json/state"
    method: POST
    content_type: "application/json"
    payload: "{{ patch | tojson }}"
```

| Option | Default | Notes |
|---|---|---|
| `entity` | — | **Required.** A WLED `light.*` entity. Effects come from its `effect_list`. |
| `palette_entity` | auto | The WLED integration's `select.<light>_color_palette`. Auto-derived; override if the naming differs. |
| `language` | `hass.language` → `en` | One of `en fr de es it ja ko zh`. |
| `assets_base` | `/local/wled-assets` | Base URL where `wled-assets` is served. |
| `show` | `[colors, palettes, effects]` | Sections to render, in order. `colors` = On/Off, brightness, the asset-identified colour slots (Effect / Background / Custom colour) and tunable white (CCT) — shown per the light's real `supported_color_modes`. |
| `raw_command` | — | Optional `rest_command` (name, with or without the `rest_command.` prefix) that POSTs a raw WLED `/json/state` patch. Unlocks Background/Custom colour + exact RGBCW control. |
| `columns` | `4` | Grid columns (auto-drops to 3 ≤ 600 px). |
| `title` | friendly name | Card header. |

## How it works

- **Colours** — the base controls, grounded in wled-assets' `controls`/`segment`/`ui`
  layers: **On/Off** (`segment` *On/Off*), **brightness** (`ui` *Brightness*), the WLED
  **colour slots** the assets identify — *Effect colour* / *Background colour* /
  *Custom colour* (`controls`), each with its localized name + illustration and a colour
  picker — and a warm↔cool **white** slider (`color_temp_kelvin`). *Effect colour*
  (`col[0]`) applies via `light.turn_on rgb_color`; *Background*/*Custom* (`col[1..2]`)
  have no HA entity, so they appear only when `raw_command` is set (see below).
  Controls appear only for the modes the light's `supported_color_modes` advertises.
- **Effects** — read from `light.<id>` attributes: `effect_list` (the choices) and `effect`
  (the current one). Tapping a cell calls `light.turn_on` with `effect: <English name>`.
- **Palettes** — read from the WLED integration's `select.<id>_color_palette`: its
  `options` (the choices) and `state` (current). Tapping calls `select.select_option`.
- **Join** — each English name is slugified
  (`name.toLowerCase().replace(/[^a-z0-9]+/g,'-')`, trimmed) to find its thumbnail
  (`images/palettes/<slug>.png`, `images/effects/<slug>.gif`) and looked up in
  `i18n/{palettes,effects}.json` for the localized `{name, desc}`. Missing asset or
  translation → the plain English name, no image. Never worse than stock.

The card is a self-contained vanilla web component — no build step, no dependencies.

## Compatibility

Requires the Home Assistant **WLED** integration configured for the lamp (it provides both
the `light` entity and the `..._color_palette` select). Coexists cleanly with other WLED
clients (e.g. LumiDeck): WLED pushes live state over
its WebSocket, so changes made elsewhere are reflected in HA — and in this card — in real time.

## Credits & attribution

Built by **[@Beennnn](https://github.com/Beennnn)** — part of the
**[OpenLamp](https://github.com/openlamp)** family — with the help of Claude (Anthropic).

Not affiliated with, nor endorsed by, the WLED or Home Assistant projects.
[WLED](https://github.com/wled/WLED) is an independent open-source project (originally by
Aircoookie, now maintained by the WLED community); this card merely **interoperates** with
the entities Home Assistant's WLED integration exposes, and uses the name "WLED" only to
describe that compatibility.

## License

**[MIT](LICENSE)** — permissive, so anyone can adopt or fork it freely. WLED itself is
EUPL-1.2; this card only interoperates with it over the public interface (no code is
derived from WLED), so it carries no copyleft obligation.
