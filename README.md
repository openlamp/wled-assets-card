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
[LumiDeck](https://github.com/Beennnn/lumideck) (a Stream Deck controller for WLED) and
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
show: [palettes, effects] # which sections, in order
columns: 4                # grid columns (3 on narrow / mobile)
title: "L1 — Salon"       # default: the light's friendly_name
```

| Option | Default | Notes |
|---|---|---|
| `entity` | — | **Required.** A WLED `light.*` entity. Effects come from its `effect_list`. |
| `palette_entity` | auto | The WLED integration's `select.<light>_color_palette`. Auto-derived; override if the naming differs. |
| `language` | `hass.language` → `en` | One of `en fr de es it ja ko zh`. |
| `assets_base` | `/local/wled-assets` | Base URL where `wled-assets` is served. |
| `show` | `[palettes, effects]` | Sections to render, in order. |
| `columns` | `4` | Grid columns (auto-drops to 3 ≤ 600 px). |
| `title` | friendly name | Card header. |

## How it works

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
clients (e.g. [LumiDeck](https://github.com/Beennnn/lumideck)): WLED pushes live state over
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

**[EUPL-1.2](LICENSE)** — the same licence as WLED and LumiDeck, chosen to keep the project
(and any forks) open and aligned with the WLED ecosystem.
