# 🌍 GéoQuiz

[🇫🇷 Français](README.md) | 🇬🇧 English

**Learn geography by playing**: place countries on the world map, recognize flags and silhouettes. Bilingual interface 🇫🇷/🇬🇧 (switch in the top-right corner, translated country names). 100% static (HTML/CSS/JS + D3), no server dependency — free to host on GitHub Pages.

![GéoQuiz menu](docs/screenshots/menu.png)

## 🎮 Game modes

| Mode | How it works |
|---|---|
| 🌍 **Complete** | A country name appears: click its location on the map, then pick its flag out of 8. |
| 📍 **Map** | Name → location only. |
| 🚩 **Flags** | Name → flag only (8 options, same-continent distractors). |
| 🔤 **Flags (type it)** | A flag appears: type the country's name (free input). |
| 🧭 **Flag → Map** | A flag appears: click the country it belongs to. |
| 🧩 **Shapes** | A country's outline alone appears: find its name. |
| 🏛️ **Capitals** | Country → capital and capital → country (direction drawn at random each question). |
| ⏱️ **Time attack** | Locate as many countries as you can on the map in 60 seconds. |

Every mode can be played on the **whole world** or per **continent** (Africa, North America, South America, Asia, Europe, Oceania), with 10, 20 or all questions (time attack only stops at the clock).

![Complete mode: flag step after locating the country](docs/screenshots/mode-complet.png)

![Capitals mode: capital → country](docs/screenshots/mode-capitales.png)

## 🏆 Scoring, timer and high scores

- **Locating a country**: 100 pts, −25 per wrong click (minimum 10). The country you clicked by mistake is named — mistakes are for learning too!
- **Flag as 2nd step** (complete mode): 50 pts, −15 per mistake.
- **Multiple choice** (flags, shapes, capitals): 100 pts, −25 per mistake.
- **Time attack**: score = number of countries found before the 60 s run out — no bonuses, every second counts.
- **Free input**: accents, capitals, hyphens and articles are ignored, typos are tolerated (1 letter from 5 characters, 2 from 10) and aliases are accepted ("DRC", "Vatican", "Cabo Verde"…). French **and** English names are accepted whatever the interface language. Answering with another existing country costs −25; an unknown word costs nothing.
- **Time bonus**: up to +30 pts per question when you answer fast (global timer displayed at all times).
- **Streak bonus** 🔥: +5 pts per consecutive perfect question (capped at +25).
- **Skip**: reveals the answer (zooms on the country), 0 pts, the streak resets.
- **Personal bests** per mode × region × question count (localStorage).
- **Replay my mistakes**: at the end of a game, start a session with only the countries you missed.

![Shapes mode](docs/screenshots/mode-silhouettes.png)

## 🚀 Run the game

No build required:

```bash
# Option 1: open index.html directly in a browser
# Option 2: small local server
python3 -m http.server 8000   # then http://localhost:8000
```

### Deploy on GitHub Pages

1. Push the repo to GitHub.
2. **Settings → Pages → Source: Deploy from a branch**, branch `main`, folder `/ (root)`.
3. The game is live at `https://<user>.github.io/GeoQuiz/`.

## 📱 Install on your phone

GéoQuiz is a **PWA** (Progressive Web App): no APK, no store, no permission
to grant — it installs from the browser once the site is deployed
(GitHub Pages above, or any HTTPS hosting).

1. Open `https://<user>.github.io/GeoQuiz/` on your phone.
2. **Android (Chrome)**: menu ⋮ → **Add to Home screen** → *Install*
   (Chrome may also offer it by itself with a banner).
   **iPhone (Safari)**: Share button → **Add to Home Screen**.
3. The 🌍 icon appears like a real app: full screen, no address bar,
   and **playable offline** (everything is cached by the service worker,
   flags included — ~3 MB).

> After updating the game, bump the `CACHE` constant in `sw.js`
> (`geoquiz-v1` → `geoquiz-v2`) so phones pick up the new version on
> their next launch.

## 🗂️ Architecture

```
index.html            Structure of the 3 screens (menu, game, end of game)
css/style.css         Dark theme, responsive
js/map.js             D3 world map: rendering, zoom/pan, highlights, shapes
js/game.js            Game logic: modes, scoring, timer, question flow
js/app.js             Menu, navigation, high scores (localStorage), SW registration
js/data/countries.js  197 countries (FR/EN names, capitals, ISO, continent) — generated
js/data/world-topo.js TopoJSON Natural Earth 50m — generated
assets/flags/         250 local PNG flags (the game works offline)
assets/icons/         PWA icons — generated
manifest.webmanifest  PWA manifest (mobile installation)
sw.js                 Service worker: precaches the whole game (offline)
tools/generate_data.py   Regenerates the data files
tools/generate_icons.py  Regenerates the PWA icons
tests/e2e_smoke.py    End-to-end test (Playwright)
```

Vanilla JS by design: no framework, no bundler — data is embedded as `.js` so the game even works when opened via `file://`.

### Regenerate the data

```bash
python3 tools/generate_data.py
```

The pool = 193 UN members + Vatican, Taiwan, Kosovo and Palestine (the usual geography-quiz convention). Tuvalu, missing from the 50m base map, is only offered in flag modes.

### Tests

```bash
pip install playwright && playwright install chromium
python3 tests/e2e_smoke.py
```

## 🗺️ Roadmap

- [x] **Capitals** mode (country → capital and back)
- [x] **Time attack** mode (as many countries as possible in 60 s)
- [ ] Difficulty levels (hidden borders, microstates…)
- [ ] Sounds and haptic feedback
- [x] Installable PWA (offline, "Add to Home screen")
- [x] English version (🇫🇷/🇬🇧 switch)

## 🙏 Data & credits

- Borders: [Natural Earth](https://www.naturalearthdata.com/) via [world-atlas](https://github.com/topojson/world-atlas) (public domain)
- Country metadata: [mledoze/countries](https://github.com/mledoze/countries) (ODbL)
- Flags: [flagcdn.com](https://flagcdn.com/) (public domain)
- Map rendering: [D3.js](https://d3js.org/) (ISC)

## 📄 License

[PolyForm Noncommercial 1.0.0](LICENSE) — © Louis Tricoire.

The code is free to read and reuse for any **noncommercial** purpose
(learning, personal projects, education, research). Any commercial use
requires the author's prior permission.
