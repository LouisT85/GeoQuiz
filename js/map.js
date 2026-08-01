/* Carte du monde interactive (D3) : rendu, zoom/pan, surbrillances de jeu. */
(function () {
  "use strict";

  const W = 1000;
  const H = 500;

  class WorldMap {
    /**
     * @param {SVGElement} svgEl
     * @param {Array} features   GeoJSON features (issues du TopoJSON)
     * @param {Object} opts      { onCountryClick(key, feature) }
     */
    constructor(svgEl, features, opts = {}) {
      this.svg = d3.select(svgEl);
      this.onCountryClick = opts.onCountryClick || (() => {});
      this.enabled = false;

      this.svg.attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");

      this.features = features;
      this.featureByKey = new Map(features.map((f) => [WorldMap.keyOf(f), f]));

      this.projection = d3.geoNaturalEarth1();
      this.projection.fitSize([W, H], { type: "FeatureCollection", features });
      this.path = d3.geoPath(this.projection);

      this.root = this.svg.append("g");
      this.countriesG = this.root.append("g");
      this.zoomK = 1;
      this.baseStroke = 0.5;
      this.refreshStroke();
      window.addEventListener("resize", () => this.refreshStroke());

      this.paths = this.countriesG
        .selectAll("path")
        .data(features)
        .join("path")
        .attr("class", "country")
        .attr("d", this.path)
        .on("click", (event, d) => {
          if (!this.enabled) return;
          this.onCountryClick(WorldMap.keyOf(d), d);
        });

      this.zoom = d3
        .zoom()
        .scaleExtent([1, 80])
        .translateExtent([[0, 0], [W, H]])
        .on("zoom", (event) => {
          this.root.attr("transform", event.transform);
          this.zoomK = event.transform.k;
          this.applyStroke();
        });
      this.svg.call(this.zoom).on("dblclick.zoom", null);
    }

    /** Clé stable d'une feature : id TopoJSON, sinon "name:<nom>". */
    static keyOf(f) {
      return f.id != null ? String(f.id) : `name:${(f.properties || {}).name}`;
    }

    pathOf(key) {
      return this.paths.filter((d) => WorldMap.keyOf(d) === key);
    }

    /**
     * Épaisseur des frontières. La carte est dessinée dans un repère de 1000
     * unités quelle que soit sa taille réelle : à valeur égale, le trait est
     * deux à trois fois plus fin sur un téléphone que sur un écran large. On
     * raisonne donc en pixels, avec un trait plus marqué sur petit écran.
     */
    refreshStroke() {
      const px = this.svg.node().getBoundingClientRect().width;
      if (px > 0) {
        const unitsPerPx = W / px;
        this.baseStroke = Math.min(2.4, (px < 620 ? 0.75 : 0.45) * unitsPerPx);
      }
      this.applyStroke();
    }

    /** Le trait garde la même épaisseur à l'écran quel que soit le zoom. */
    applyStroke() {
      this.countriesG.attr("stroke-width", this.baseStroke / this.zoomK);
    }

    setEnabled(b) {
      this.enabled = b;
      this.svg.classed("map-disabled", !b);
    }

    /** Clic raté : le pays reste rouge jusqu'à la question suivante. */
    markWrong(key) {
      this.pathOf(key).classed("wrong", true);
    }

    /** Pays trouvé : teinte verte persistante pendant la partie. */
    markFound(key) {
      this.pathOf(key).classed("found", true);
    }

    /** Révèle la réponse (après un « Passer ») : pulse + zoom dessus. */
    reveal(key) {
      const p = this.pathOf(key);
      p.classed("revealed", true).raise();
      if (this.featureByKey.has(key)) {
        this.autoMoved = true; // la caméra a bougé sans le joueur : on reviendra
        this.zoomToKey(key);
      }
    }

    /** À appeler au début de chaque question : efface les états transitoires. */
    clearTransient() {
      this.paths.classed("revealed", false).classed("wrong", false);
    }

    /** À appeler au début de chaque partie. */
    clearAll() {
      this.paths.classed("found", false).classed("revealed", false).classed("wrong", false);
    }

    /* ── Cadrage ─────────────────────────────────────────────── */

    /**
     * Boîtes englobantes des morceaux de terre d'un pays, en écartant ceux qui
     * traversent l'antiméridien : une fois projetés ils s'étalent sur toute la
     * largeur de la carte (Russie, Alaska, Fidji) et rendraient inutilisable
     * tout cadrage calculé dessus.
     */
    boxesOf(key) {
      const f = this.featureByKey.get(key);
      const geom = f && f.geometry;
      if (!geom) return [];
      const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
      const out = [];
      for (const coordinates of polys) {
        const b = this.path.bounds({ type: "Feature", geometry: { type: "Polygon", coordinates } });
        if (b[1][0] - b[0][0] > W / 3) continue;
        out.push({
          x0: b[0][0], y0: b[0][1], x1: b[1][0], y1: b[1][1],
          cx: (b[0][0] + b[1][0]) / 2, cy: (b[0][1] + b[1][1]) / 2,
        });
      }
      return out;
    }

    /**
     * Transformation cadrant un ensemble de pays. Les morceaux très excentrés
     * sont écartés du calcul — sans ça la Russie fait cadrer « Europe » sur le
     * monde entier — mais aucun pays du lot ne peut finir hors champ.
     */
    transformFor(keys) {
      if (!keys || !keys.length) return d3.zoomIdentity;
      const perCountry = keys.map((k) => this.boxesOf(k)).filter((b) => b.length);
      const all = perCountry.flat();
      if (!all.length) return d3.zoomIdentity;

      const median = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
      const mx = median(all.map((r) => r.cx));
      const my = median(all.map((r) => r.cy));
      const dists = all.map((r) => Math.hypot(r.cx - mx, r.cy - my));
      const limit = Math.max(median(dists), 1) * 3.2;

      let box = null;
      const grow = (r) => {
        box = box
          ? { x0: Math.min(box.x0, r.x0), y0: Math.min(box.y0, r.y0),
              x1: Math.max(box.x1, r.x1), y1: Math.max(box.y1, r.y1) }
          : { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 };
      };
      all.forEach((r, i) => { if (dists[i] <= limit) grow(r); });
      if (!box) return d3.zoomIdentity;

      // Filet de sécurité : un pays entièrement écarté reste jouable.
      for (const boxes of perCountry) {
        const visible = boxes.some(
          (r) => r.x1 >= box.x0 && r.x0 <= box.x1 && r.y1 >= box.y0 && r.y0 <= box.y1
        );
        if (visible) continue;
        grow(boxes.reduce((a, b) =>
          Math.hypot(a.cx - mx, a.cy - my) < Math.hypot(b.cx - mx, b.cy - my) ? a : b));
      }
      return this.transformOfBox(box, 12, 0.9);
    }

    transformOfBox(box, maxScale, fill) {
      const scale = Math.min(maxScale, fill / Math.max((box.x1 - box.x0) / W, (box.y1 - box.y0) / H));
      return d3.zoomIdentity
        .translate(W / 2, H / 2)
        .scale(Math.max(1, scale))
        .translate(-(box.x0 + box.x1) / 2, -(box.y0 + box.y1) / 2);
    }

    /** Zoom sur un pays : on vise sa plus grande masse d'un seul tenant. */
    zoomToKey(key) {
      const boxes = this.boxesOf(key);
      if (!boxes.length) return;
      const area = (r) => (r.x1 - r.x0) * (r.y1 - r.y0);
      const main = boxes.reduce((a, b) => (area(a) >= area(b) ? a : b));
      this.svg.transition().duration(800)
        .call(this.zoom.transform, this.transformOfBox(main, 50, 0.35));
    }

    /**
     * Vue de référence de la partie : la région choisie. Calculée une fois,
     * pour ne pas ramener le joueur au monde entier à chaque question.
     */
    setHome(keys) {
      this.refreshStroke(); // la carte est visible : on peut mesurer
      this.home = this.transformFor(keys);
      this.autoMoved = false;
      this.svg.transition().duration(700).call(this.zoom.transform, this.home);
    }

    /** Retour à la vue de référence (ou au monde entier hors partie). */
    goHome() {
      this.autoMoved = false;
      this.svg.transition().duration(600)
        .call(this.zoom.transform, this.home || d3.zoomIdentity);
    }

    zoomBy(factor) {
      this.svg.transition().duration(250).call(this.zoom.scaleBy, factor);
    }
  }

  /** Silhouette d'un pays, projection azimutale centrée (gère l'antiméridien). */
  function renderShape(svgEl, feature) {
    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();
    const w = 340, h = 230;
    svg.attr("viewBox", `0 0 ${w} ${h}`);
    const [lon, lat] = d3.geoCentroid(feature);
    const proj = d3
      .geoAzimuthalEqualArea()
      .rotate([-lon, -lat])
      .fitExtent([[14, 14], [w - 14, h - 14]], feature);
    svg.append("path").attr("class", "shape-path").attr("d", d3.geoPath(proj)(feature));
  }

  window.WorldMap = WorldMap;
  window.renderShape = renderShape;
})();
