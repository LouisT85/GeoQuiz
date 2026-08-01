"""Test de bout en bout GéoQuiz (Playwright).

Vérifie : menu, mode complet (clic carte faux/juste + drapeau), emplacement
passé avec drapeau encore jouable, mode silhouettes, mode capitales, mode
contre-la-montre, mode drapeaux sans carte, fin de partie et record.

    pip install playwright && playwright install chromium
    python3 tests/e2e_smoke.py
"""
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tests" / "output"
OUT.mkdir(exist_ok=True)
PORT = 8765

CLICK_COUNTRY = """([target, wantCorrect]) => {
  const c = window.GEO_COUNTRIES.find(c => c.name === target);
  for (const el of document.querySelectorAll('#map-svg path.country')) {
    const d = d3.select(el).datum();
    const key = d.id != null ? String(d.id) : 'name:' + d.properties.name;
    if ((key === c.id) === wantCorrect) {
      el.dispatchEvent(new MouseEvent('click', {bubbles: true}));
      return;
    }
  }
}"""

CLICK_GOOD_FLAG = """(target) => {
  const c = window.GEO_COUNTRIES.find(c => c.name === target);
  for (const btn of document.querySelectorAll('.flag-btn')) {
    if (btn.querySelector('img').src.includes('/' + c.iso2 + '.png')) { btn.click(); return; }
  }
}"""


def main():
    server = subprocess.Popen(
        ["python3", "-m", "http.server", str(PORT)],
        cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    time.sleep(1.2)
    errors = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            page.on("console", lambda m: m.type == "error" and errors.append(m.text))
            page.on("pageerror", lambda e: errors.append(str(e)))

            page.goto(f"http://localhost:{PORT}/")
            page.wait_for_selector("#mode-grid .mode-card")
            assert page.locator(".mode-card").count() == 8
            assert page.locator("[data-continent]").count() == 7
            print("menu OK :", page.locator("#menu-pool").text_content())

            # ── Switch de langue FR/EN ──
            page.click("#lang-switch button[data-lang='en']")
            assert page.locator("#btn-play").text_content().startswith("Play")
            assert page.locator(".mode-card[data-mode='forme'] .mode-label").text_content() == "Shapes"
            assert "playable countries" in page.locator("#menu-pool").text_content()
            page.click("#lang-switch button[data-lang='fr']")
            assert page.locator("#btn-play").text_content().startswith("Jouer")
            print("switch de langue OK")

            # ── Mode complet ──
            page.click("#btn-play")
            page.wait_for_selector("#screen-game:not(.hidden)")
            assert page.locator("#lang-switch").is_hidden()  # pas de switch en partie
            assert page.locator("#map-svg path.country").count() > 200
            target = page.locator(".target-name").text_content()

            page.evaluate(CLICK_COUNTRY, [target, False])  # clic faux
            assert page.locator("#q-feedback").text_content().startswith("Raté")
            page.wait_for_timeout(800)                     # le rouge ne s'efface plus
            assert page.locator("#map-svg path.country.wrong").count() == 1
            page.evaluate(CLICK_COUNTRY, [target, True])   # clic juste
            page.wait_for_selector(".flag-btn", timeout=3000)
            assert page.locator(".flag-btn").count() == 8
            page.evaluate(CLICK_GOOD_FLAG, target)
            page.wait_for_timeout(400)
            assert int(page.locator("#stat-score").text_content()) > 0
            print(f"mode complet OK : {target!r}, score", page.locator("#stat-score").text_content())

            page.wait_for_timeout(1400)  # question suivante
            assert page.locator("#map-svg path.country.wrong").count() == 0
            target = page.locator(".target-name").text_content()
            page.click("#btn-skip")      # emplacement abandonné -> révélation
            page.wait_for_timeout(400)
            assert "C'était là" in page.locator("#q-feedback").text_content()

            # …mais le drapeau reste à jouer, et il rapporte des points.
            page.wait_for_selector(".flag-btn", timeout=3000)
            assert page.locator(".target-name").text_content() == target
            before = int(page.locator("#stat-score").text_content())
            page.evaluate(CLICK_GOOD_FLAG, target)
            page.wait_for_timeout(400)
            assert int(page.locator("#stat-score").text_content()) > before
            print("emplacement passé, drapeau toujours jouable OK")

            # ── Mode silhouettes (Europe) ──
            page.click("#btn-quit")
            page.click(".mode-card[data-mode='forme']")
            page.click("[data-continent='Europe']")
            page.click("#btn-play")
            page.wait_for_selector(".shape-svg path", timeout=3000)
            assert page.locator(".name-btn").count() == 8
            print("mode silhouettes OK")

            # ── Mode capitales (direction tirée au sort) ──
            page.click("#btn-quit")
            page.click(".mode-card[data-mode='capitale']")
            page.click("[data-continent='Monde']")
            page.click("#btn-play")
            page.wait_for_selector(".name-btn", timeout=3000)
            assert page.locator("#map-wrap").is_hidden()
            assert page.locator(".name-btn").count() == 8
            direction = page.evaluate("""() => {
              const target = document.querySelector('.target-name').textContent;
              const c = window.GEO_COUNTRIES.find(
                x => x.name === target || x.capital === target);
              const buttons = [...document.querySelectorAll('.name-btn')];
              buttons.find(b => b.dataset.id !== c.id).click();   // faux d'abord
              return c.name === target ? 'pays -> capitale' : 'capitale -> pays';
            }""")
            assert "capitale" in page.locator("#q-feedback").text_content()
            page.evaluate("""() => {
              const target = document.querySelector('.target-name').textContent;
              const c = window.GEO_COUNTRIES.find(
                x => x.name === target || x.capital === target);
              [...document.querySelectorAll('.name-btn')]
                .find(b => b.dataset.id === c.id).click();
            }""")
            page.wait_for_timeout(400)
            assert int(page.locator("#stat-score").text_content()) > 0
            print(f"mode capitales OK ({direction})")

            # ── Mode contre-la-montre (60 s, score = pays trouvés) ──
            page.click("#btn-quit")
            page.click(".mode-card[data-mode='chrono']")
            assert page.locator("#count-row").is_hidden()  # chrono : pas de nb de questions
            page.click("#btn-play")
            page.wait_for_selector("#screen-game:not(.hidden)")
            assert page.locator("#stat-timer").text_content() in ("1:00", "0:59")
            target = page.locator(".target-name").text_content()
            page.evaluate(CLICK_COUNTRY, [target, True])
            page.wait_for_timeout(300)
            assert page.locator("#stat-score").text_content() == "1"
            print(f"mode contre-la-montre OK : {target!r} trouvé, chrono",
                  page.locator("#stat-timer").text_content())

            # ── Mode saisie libre : correspondance tolérante ──
            checks = page.evaluate("""() => {
              const by = iso => window.GEO_COUNTRIES.find(c => c.iso2 === iso);
              const m = window.GeoQuiz.matchGuess;
              return [
                m('bresil', by('br')).verdict === 'correct',       // accents ignorés
                m('  la France ', by('fr')).verdict === 'correct', // article + espaces
                m('allemagn', by('de')).verdict === 'correct',     // typo (distance 1)
                m('rdc', by('cd')).verdict === 'correct',          // alias
                m('vatican', by('va')).verdict === 'correct',      // alias
                m('germany', by('de')).verdict === 'correct',      // nom anglais
                m('ivory coast', by('ci')).verdict === 'correct',  // nom anglais
                m('gambie', by('zm')).verdict === 'other',         // autre pays reconnu
                m('xyzabcd', by('fr')).verdict === 'unknown',      // inconnu, pas de pénalité
              ];
            }""")
            assert all(checks), f"matchGuess KO : {checks}"
            page.click("#btn-quit")
            page.click(".mode-card[data-mode='saisie']")
            assert not page.locator("#count-row").is_hidden()  # réaffiché hors chrono
            page.click("[data-continent='Monde']")
            page.click("#btn-play")
            page.wait_for_selector(".type-input", timeout=3000)
            # Le champ doit avoir le focus : on écrit sans cliquer dessus.
            assert page.evaluate(
                "document.activeElement === document.querySelector('.type-input')")
            target = page.evaluate("""() => {
              const src = document.querySelector('.target-flag').src;
              const iso2 = src.split('/').pop().replace('.png', '');
              return window.GEO_COUNTRIES.find(c => c.iso2 === iso2).name;
            }""")
            wrong = "Japon" if target != "Japon" else "France"
            page.fill(".type-input", wrong)
            page.keyboard.press("Enter")
            assert "Non, ce n'est pas" in page.locator("#q-feedback").text_content()
            page.fill(".type-input", target)
            page.keyboard.press("Enter")
            page.wait_for_timeout(400)
            assert int(page.locator("#stat-score").text_content()) > 0
            print(f"mode saisie OK : {target!r}")

            # ── Mode drapeaux (sans carte), partie complète ──
            page.click("#btn-quit")
            page.click(".mode-card[data-mode='drapeau']")
            page.click("[data-continent='Monde']")
            page.click("#btn-play")
            page.wait_for_selector(".flag-btn", timeout=3000)
            assert page.locator("#map-wrap").is_hidden()
            for _ in range(10):
                page.wait_for_selector(".flag-btn", timeout=4000)
                target = page.locator(".target-name").text_content()
                page.evaluate(CLICK_GOOD_FLAG, target)
                page.wait_for_timeout(1500)
            page.wait_for_selector("#screen-end:not(.hidden)", timeout=5000)
            print("fin de partie OK :", page.locator("#end-score").text_content())
            page.screenshot(path=str(OUT / "fin-de-partie.png"))

            browser.close()
    finally:
        server.terminate()

    if errors:
        print("\nERREURS CONSOLE :", *errors, sep="\n  ")
        sys.exit(1)
    print("\nTOUS LES TESTS PASSENT ✔")


if __name__ == "__main__":
    main()
