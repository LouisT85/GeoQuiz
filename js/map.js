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
      this.countriesG = this.root.append("g").attr("stroke-width", 0.5);

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
          this.countriesG.attr("stroke-width", 0.5 / event.transform.k);
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

    setEnabled(b) {
      this.enabled = b;
      this.svg.classed("map-disabled", !b);
    }

    /** Clic raté : flash rouge temporaire. */
    flashWrong(key) {
      const p = this.pathOf(key);
      p.classed("wrong", true);
      setTimeout(() => p.classed("wrong", false), 650);
    }

    /** Pays trouvé : teinte verte persistante pendant la partie. */
    markFound(key) {
      this.pathOf(key).classed("found", true);
    }

    /** Révèle la réponse (après un « Passer ») : pulse + zoom dessus. */
    reveal(key) {
      const p = this.pathOf(key);
      p.classed("revealed", true).raise();
      const f = this.featureByKey.get(key);
      if (f) this.zoomToFeature(f);
    }

    /** À appeler au début de chaque question : efface les états transitoires. */
    clearTransient() {
      this.paths.classed("revealed", false).classed("wrong", false);
    }

    /** À appeler au début de chaque partie. */
    clearAll() {
      this.paths.classed("found", false).classed("revealed", false).classed("wrong", false);
    }

    zoomToFeature(f, maxScale = 50) {
      const [[x0, y0], [x1, y1]] = this.path.bounds(f);
      const scale = Math.min(
        maxScale,
        0.35 / Math.max((x1 - x0) / W, (y1 - y0) / H)
      );
      const t = d3.zoomIdentity
        .translate(W / 2, H / 2)
        .scale(Math.max(1, scale))
        .translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
      this.svg.transition().duration(800).call(this.zoom.transform, t);
    }

    /** Cadre la vue sur un ensemble de pays (filtre continent). */
    fitTo(keys) {
      if (!keys || !keys.length) return this.resetZoom();
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const key of keys) {
        const f = this.featureByKey.get(key);
        if (!f) continue;
        const b = this.path.bounds(f);
        x0 = Math.min(x0, b[0][0]); y0 = Math.min(y0, b[0][1]);
        x1 = Math.max(x1, b[1][0]); y1 = Math.max(y1, b[1][1]);
      }
      if (!isFinite(x0)) return this.resetZoom();
      const scale = Math.min(12, 0.9 / Math.max((x1 - x0) / W, (y1 - y0) / H));
      const t = d3.zoomIdentity
        .translate(W / 2, H / 2)
        .scale(Math.max(1, scale))
        .translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
      this.svg.transition().duration(700).call(this.zoom.transform, t);
    }

    resetZoom() {
      this.svg.transition().duration(600).call(this.zoom.transform, d3.zoomIdentity);
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
