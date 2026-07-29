#!/usr/bin/env python3
"""Génère js/data/countries.js et js/data/world-topo.js.

Sources :
  - tools/countries-raw.json  (dataset mledoze/countries : noms FR, ISO, continents)
  - data/countries-50m.json   (TopoJSON world-atlas / Natural Earth 50m)

Le pool du quiz = membres ONU + Vatican, Taïwan, Kosovo, Palestine
(convention des quiz de géographie type Seterra).
Les données sont émises en .js (assignation globale) pour que le jeu
fonctionne aussi en ouvrant index.html directement (file://).
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXTRA_CCA2 = {"VA", "TW", "XK", "PS"}  # non-membres ONU inclus dans le pool

CONTINENT_FR = {
    "Africa": "Afrique",
    "Asia": "Asie",
    "Europe": "Europe",
    "Oceania": "Océanie",
}

# Noms FR des capitales quand ils diffèrent du nom anglais (mledoze ne
# fournit pas les capitales traduites). Clé = nom anglais du dataset.
CAPITAL_FR = {
    "Abu Dhabi": "Abou Dabi", "Addis Ababa": "Addis-Abeba", "Algiers": "Alger",
    "Andorra la Vella": "Andorre-la-Vieille", "Athens": "Athènes",
    "Baghdad": "Bagdad", "Baku": "Bakou", "Beijing": "Pékin",
    "Beirut": "Beyrouth", "Bern": "Berne", "Bishkek": "Bichkek",
    "Brussels": "Bruxelles", "Bucharest": "Bucarest", "Cairo": "Le Caire",
    "Chișinău": "Chisinau", "City of San Marino": "Saint-Marin",
    "Copenhagen": "Copenhague", "Damascus": "Damas", "Dhaka": "Dacca",
    "Dushanbe": "Douchanbé", "Guatemala City": "Guatemala", "Hanoi": "Hanoï",
    "Havana": "La Havane", "Jerusalem": "Jérusalem", "Kabul": "Kaboul",
    "Kathmandu": "Katmandou", "Kuwait City": "Koweït", "Kyiv": "Kiev",
    "Lisbon": "Lisbonne", "London": "Londres", "Manila": "Manille",
    "Mexico City": "Mexico", "Mogadishu": "Mogadiscio", "Moscow": "Moscou",
    "Muscat": "Mascate", "N'Djamena": "N'Djaména", "Nicosia": "Nicosie",
    "Panama City": "Panama", "Port of Spain": "Port-d'Espagne",
    "Riyadh": "Riyad", "Sana'a": "Sanaa", "Santo Domingo": "Saint-Domingue",
    "Seoul": "Séoul", "Singapore": "Singapour", "South Tarawa": "Tarawa-Sud",
    "St. George's": "Saint-Georges", "Tashkent": "Tachkent",
    "Tbilisi": "Tbilissi", "Tehran": "Téhéran", "Ulan Bator": "Oulan-Bator",
    "Valletta": "La Valette", "Vatican City": "Cité du Vatican",
    "Vienna": "Vienne", "Warsaw": "Varsovie", "Washington D.C.": "Washington",
    "Yerevan": "Erevan",
}

# Noms FR des territoires non joués mais présents sur la carte (feedback
# quand le joueur clique dessus). Clé = id TopoJSON, ou "name:<nom NE>"
# pour les entités sans code ISO numérique.
TERRITORY_FR = {
    "580": "Îles Mariannes du Nord", "850": "Îles Vierges américaines",
    "316": "Guam", "016": "Samoa américaines", "630": "Porto Rico",
    "239": "Géorgie du Sud", "086": "Territoire britannique de l'océan Indien",
    "654": "Sainte-Hélène", "612": "Îles Pitcairn", "660": "Anguilla",
    "238": "Îles Malouines", "136": "Îles Caïmans", "060": "Bermudes",
    "092": "Îles Vierges britanniques", "796": "Îles Turques-et-Caïques",
    "500": "Montserrat", "832": "Jersey", "831": "Guernesey",
    "833": "Île de Man", "570": "Niue", "184": "Îles Cook", "533": "Aruba",
    "531": "Curaçao", "732": "Sahara occidental",
    "666": "Saint-Pierre-et-Miquelon", "876": "Wallis-et-Futuna",
    "663": "Saint-Martin", "652": "Saint-Barthélemy",
    "258": "Polynésie française", "540": "Nouvelle-Calédonie",
    "260": "Terres australes françaises", "248": "Îles Åland",
    "304": "Groenland", "234": "Îles Féroé", "446": "Macao",
    "344": "Hong Kong", "334": "Îles Heard-et-MacDonald",
    "574": "Île Norfolk", "534": "Saint-Martin (Sint Maarten)",
    "name:Somaliland": "Somaliland", "name:N. Cyprus": "Chypre du Nord",
    "name:Indian Ocean Ter.": "Territoire de l'océan Indien",
    "name:Siachen Glacier": "Glacier de Siachen",
}


def continent_of(c):
    region, sub = c["region"], c.get("subregion", "")
    if region == "Americas":
        return "Amérique du Sud" if sub == "South America" else "Amérique du Nord"
    return CONTINENT_FR.get(region)


def main():
    raw = json.loads((ROOT / "tools" / "countries-raw.json").read_text())
    topo = json.loads((ROOT / "data" / "countries-50m.json").read_text())

    # Le Kosovo n'a pas de code ISO numérique : id synthétique des deux côtés.
    for g in topo["objects"]["countries"]["geometries"]:
        if g.get("id") is None and g.get("properties", {}).get("name") == "Kosovo":
            g["id"] = "XK"
    for c in raw:
        if c["cca2"] == "XK":
            c["ccn3"] = "XK"

    topo_ids = {g.get("id") for g in topo["objects"]["countries"]["geometries"]}

    pool = []
    for c in raw:
        if not (c.get("unMember") or c["cca2"] in EXTRA_CCA2):
            continue
        cont = continent_of(c)
        if cont is None:
            print(f"!! continent inconnu : {c['cca2']}")
            continue
        # Capitale principale (ZA en a 3 : Pretoria, convention des quiz).
        cap_en = c["capital"][0]
        pool.append({
            "id": c["ccn3"],                              # jointure TopoJSON
            "iso2": c["cca2"].lower(),                    # fichiers drapeaux
            "name": c["translations"]["fra"]["common"],   # nom français
            "nameEn": c["name"]["common"],                # nom anglais
            "capital": CAPITAL_FR.get(cap_en, cap_en),    # capitale (FR)
            "capitalEn": cap_en,
            "continent": cont,
            "area": c.get("area", 0),
        })

    # Pays sans géométrie (Tuvalu en 50m) : gardés pour les modes drapeau,
    # exclus des modes carte/forme via le flag noGeo.
    for c in pool:
        if c["id"] not in topo_ids:
            c["noGeo"] = True
            print(f"noGeo (absent du TopoJSON) : {c['name']}")
    pool.sort(key=lambda c: c["name"])

    out = ROOT / "js" / "data" / "countries.js"
    out.write_text(
        "// Généré par tools/generate_data.py — ne pas éditer à la main.\n"
        "window.GEO_COUNTRIES = "
        + json.dumps(pool, ensure_ascii=False, indent=1)
        + ";\nwindow.GEO_TERRITORIES = "
        + json.dumps(TERRITORY_FR, ensure_ascii=False, indent=1)
        + ";\n"
    )
    print(f"{len(pool)} pays -> {out.relative_to(ROOT)}")

    # Antarctique retiré : inutile pour le quiz, gagne de la place à l'écran.
    topo["objects"]["countries"]["geometries"] = [
        g for g in topo["objects"]["countries"]["geometries"] if g.get("id") != "010"
    ]
    out_topo = ROOT / "js" / "data" / "world-topo.js"
    out_topo.write_text(
        "// Généré par tools/generate_data.py — ne pas éditer à la main.\n"
        "window.WORLD_TOPO = " + json.dumps(topo, separators=(",", ":")) + ";\n"
    )
    print(f"TopoJSON -> {out_topo.relative_to(ROOT)}")

    for cont in sorted({c["continent"] for c in pool}):
        n = sum(1 for c in pool if c["continent"] == cont)
        print(f"  {cont}: {n}")


if __name__ == "__main__":
    main()
