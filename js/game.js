/* Logique de jeu : modes, scoring, chrono, déroulement des questions. */
(function () {
  "use strict";

  const SCORING = {
    map:    { base: 100, malus: 25, min: 10 }, // trouver un pays sur la carte
    flag2:  { base: 50,  malus: 15, min: 5  }, // drapeau en 2e étape (mode complet)
    choice: { base: 100, malus: 25, min: 10 }, // question à choix unique (drapeau, forme)
    timeBonusMax: 30, // +max(0, 30 − secondes écoulées) par question réussie
    streakStep: 5,    // bonus de série : +5 par question sans faute consécutive
    streakCap: 25,
  };

  const MODES = {
    complet: { icon: "🌍", stages: ["map", "flag2"], needsGeo: true, usesMap: true },
    carte: { icon: "📍", stages: ["map"], needsGeo: true, usesMap: true },
    drapeau: { icon: "🚩", stages: ["flag"], needsGeo: false, usesMap: false },
    saisie: { icon: "🔤", stages: ["type"], needsGeo: false, usesMap: false },
    "drapeau-carte": { icon: "🧭", stages: ["flagmap"], needsGeo: true, usesMap: true },
    forme: { icon: "🧩", stages: ["shape"], needsGeo: true, usesMap: false, minArea: 300 },
    capitale: { icon: "🏛️", stages: ["capital"], needsGeo: false, usesMap: false },
    // timed : durée en secondes ; le score = nombre de pays trouvés.
    chrono: { icon: "⏱️", stages: ["map"], needsGeo: true, usesMap: true, timed: 60 },
  };

  // Clés internes des continents (celles des données) — l'affichage passe par t().
  const CONTINENTS = [
    "Monde", "Afrique", "Amérique du Nord", "Amérique du Sud",
    "Asie", "Europe", "Océanie",
  ];

  /* ── Internationalisation ────────────────────────────────────── */

  const I18N = {
    fr: {
      tagline: "Replace les pays sur la carte, reconnais les drapeaux et les silhouettes.",
      gameMode: "Mode de jeu", region: "Région", questionCount: "Nombre de questions",
      play: "Jouer →", all: "Tout ({n})", pool: "{n} pays jouables",
      record: "🏅 Record : {score} pts · {time}",
      noRecord: "Pas encore de record — à toi de jouer !",
      statQuestion: "Question", statScore: "Score", statStreak: "Série", statTime: "Temps",
      backMenu: "← Menu", skip: "Passer (0 pt)", skipStage: "Passer la carte (0 pt)",
      whereIs: "Où se trouve…",
      whichFlag2: "Bien joué ! Et quel est son drapeau ?",
      whichFlagAnyway: "Tant pis pour la carte — et son drapeau, tu le reconnais ?",
      mapGivenUp: "C'était là. Le drapeau reste à gagner !",
      whichFlagOf: "Quel est le drapeau de…",
      whichCountryFlag: "À quel pays appartient ce drapeau ?",
      typeCountry: "À quel pays appartient ce drapeau ? Écris son nom :",
      whichShape: "Quel est ce pays ?",
      whichCapitalOf: "Quelle est la capitale de…",
      whichCountryOfCapital: "De quel pays est-ce la capitale ?",
      typePlaceholder: "Nom du pays…", typeSubmit: "OK",
      mysteryFlag: "Drapeau mystère", flagAlt: "Drapeau",
      missedMap: "Raté ! Là, c'est : {name}.",
      wrongOption: "Non, ça c'est : {name}.",
      wrongShape: "Non, ce n'est pas : {name}.",
      wrongCapital: "Non, {capital} est la capitale de : {name}.",
      wrongCountryCapital: "Non, la capitale de {name}, c'est {capital}.",
      wrongTyped: "Non, ce n'est pas : {name}.",
      unknownTyped: "« {raw} » ne correspond à aucun pays connu — vérifie l'orthographe (pas de pénalité).",
      answerWas: "La réponse était : {name}.",
      gained: "+{n} pts", timeBonus: "temps +{n}", streakBonus: "série +{n}",
      countryFound: "✓ {name}",
      countriesScore: "{n} pays",
      recordChrono: "🏅 Record : {n} pays en 60 s",
      recordToBeatChrono: "Record à battre : {n} pays",
      endTitleGreat: "Sans faute, magistral !", endTitleGood: "Bien joué !", endTitleDone: "Partie terminée !",
      endTitleChrono: "Temps écoulé !",
      endPerfect: "sans faute", endTime: "temps total", endStreak: "meilleure série",
      newRecord: "🎉 Nouveau record personnel !", recordToBeat: "Record à battre : {score} pts",
      replayErrors: "🔁 Rejouer mes erreurs ({n})", replay: "Rejouer", menu: "Menu",
      continents: {
        "Monde": "Monde entier", "Afrique": "Afrique",
        "Amérique du Nord": "Amérique du Nord", "Amérique du Sud": "Amérique du Sud",
        "Asie": "Asie", "Europe": "Europe", "Océanie": "Océanie",
      },
      modes: {
        complet: { label: "Complet", desc: "Situe le pays sur la carte, puis retrouve son drapeau." },
        carte: { label: "Carte", desc: "Un nom de pays : clique sur son emplacement." },
        drapeau: { label: "Drapeaux", desc: "Retrouve le drapeau du pays parmi 8 propositions." },
        saisie: { label: "Drapeaux (à écrire)", desc: "Un drapeau s'affiche : écris le nom du pays." },
        "drapeau-carte": { label: "Drapeau → Carte", desc: "Un drapeau s'affiche : clique sur son pays." },
        forme: { label: "Silhouettes", desc: "Reconnais le pays à sa forme." },
        capitale: { label: "Capitales", desc: "Pays → capitale, et l'inverse." },
        chrono: { label: "Contre-la-montre", desc: "Situe un maximum de pays en 60 secondes." },
      },
    },
    en: {
      tagline: "Place countries on the map, recognize flags and silhouettes.",
      gameMode: "Game mode", region: "Region", questionCount: "Number of questions",
      play: "Play →", all: "All ({n})", pool: "{n} playable countries",
      record: "🏅 Best: {score} pts · {time}",
      noRecord: "No high score yet — your turn!",
      statQuestion: "Question", statScore: "Score", statStreak: "Streak", statTime: "Time",
      backMenu: "← Menu", skip: "Skip (0 pts)", skipStage: "Skip the map (0 pts)",
      whereIs: "Where is…",
      whichFlag2: "Nice! Now, which flag is it?",
      whichFlagAnyway: "Never mind the map — do you know its flag?",
      mapGivenUp: "That's where it was. The flag is still up for grabs!",
      whichFlagOf: "Which flag belongs to…",
      whichCountryFlag: "Which country does this flag belong to?",
      typeCountry: "Which country does this flag belong to? Type its name:",
      whichShape: "Which country is this?",
      whichCapitalOf: "What is the capital of…",
      whichCountryOfCapital: "Which country's capital is this?",
      typePlaceholder: "Country name…", typeSubmit: "OK",
      mysteryFlag: "Mystery flag", flagAlt: "Flag",
      missedMap: "Missed! That's {name}.",
      wrongOption: "No, that's {name}.",
      wrongShape: "No, it's not {name}.",
      wrongCapital: "No, {capital} is the capital of {name}.",
      wrongCountryCapital: "No, the capital of {name} is {capital}.",
      wrongTyped: "No, it's not {name}.",
      unknownTyped: "“{raw}” doesn't match any country I know — check the spelling (no penalty).",
      answerWas: "The answer was {name}.",
      gained: "+{n} pts", timeBonus: "time +{n}", streakBonus: "streak +{n}",
      countryFound: "✓ {name}",
      countriesScore: "{n} countries",
      recordChrono: "🏅 Best: {n} countries in 60s",
      recordToBeatChrono: "Best to beat: {n} countries",
      endTitleGreat: "Flawless, outstanding!", endTitleGood: "Well played!", endTitleDone: "Game over!",
      endTitleChrono: "Time's up!",
      endPerfect: "perfect", endTime: "total time", endStreak: "best streak",
      newRecord: "🎉 New personal best!", recordToBeat: "Best to beat: {score} pts",
      replayErrors: "🔁 Replay my mistakes ({n})", replay: "Play again", menu: "Menu",
      continents: {
        "Monde": "Whole world", "Afrique": "Africa",
        "Amérique du Nord": "North America", "Amérique du Sud": "South America",
        "Asie": "Asia", "Europe": "Europe", "Océanie": "Oceania",
      },
      modes: {
        complet: { label: "Complete", desc: "Locate the country on the map, then find its flag." },
        carte: { label: "Map", desc: "A country name: click its location." },
        drapeau: { label: "Flags", desc: "Pick the country's flag out of 8." },
        saisie: { label: "Flags (type it)", desc: "A flag appears: type the country's name." },
        "drapeau-carte": { label: "Flag → Map", desc: "A flag appears: click its country." },
        forme: { label: "Shapes", desc: "Recognize a country by its outline." },
        capitale: { label: "Capitals", desc: "Country → capital, and the reverse." },
        chrono: { label: "Time attack", desc: "Locate as many countries as you can in 60 seconds." },
      },
    },
  };

  let LANG = "fr";
  try {
    LANG = localStorage.getItem("geoquiz-lang") === "en" ? "en" : "fr";
  } catch { /* localStorage indisponible : français par défaut */ }

  function getLang() { return LANG; }
  function setLang(l) {
    LANG = l === "en" ? "en" : "fr";
    try { localStorage.setItem("geoquiz-lang", LANG); } catch { /* tant pis */ }
  }

  /** t("modes.forme.label") ou t("gained", {n: 12}) dans la langue courante. */
  function t(path, vars) {
    let v = I18N[LANG];
    for (const k of path.split(".")) v = v[k];
    if (typeof v === "string" && vars) {
      for (const [k, val] of Object.entries(vars)) v = v.split(`{${k}}`).join(val);
    }
    return v;
  }

  /** Nom d'un pays dans la langue courante. */
  function cname(c) {
    return LANG === "en" ? c.nameEn : c.name;
  }

  /** Capitale d'un pays dans la langue courante. */
  function capname(c) {
    return LANG === "en" ? c.capitalEn : c.capital;
  }

  /* ── Mode saisie : alias acceptés et correspondance tolérante ── */

  // Noms alternatifs acceptés (par iso2), comparés après normalisation.
  // Français et anglais confondus : les deux langues sont toujours acceptées.
  const TYPE_ALIASES = {
    us: ["USA", "États-Unis d'Amérique", "United States of America"],
    gb: ["UK", "Grande-Bretagne", "Great Britain"],
    nl: ["Hollande", "Holland"],
    mm: ["Myanmar", "Burma"],
    cz: ["République tchèque", "Czech Republic"],
    mk: ["Macédoine", "Macedonia"],
    sz: ["Swaziland"],
    va: ["Vatican"],
    tl: ["Timor-Leste", "Timor-Est", "East Timor"],
    tt: ["Trinidad et Tobago", "Trinidad"],
    cd: ["République démocratique du Congo", "RDC", "RD Congo", "Congo-Kinshasa",
         "Congo démocratique", "DRC", "Democratic Republic of the Congo"],
    cg: ["Congo-Brazzaville", "République du Congo", "Republic of the Congo"],
    do: ["Dominicaine", "Dominican Rep"],
    pw: ["Palaos", "Palau"],
    cf: ["Centrafrique", "Central African Rep"],
    kn: ["Saint-Kitts-et-Nevis", "Saint-Kitts", "Saint-Christophe", "Saint Kitts"],
    vc: ["Saint-Vincent", "Saint Vincent"],
    st: ["Sao Tomé", "Sao Tomé-et-Principe", "Sao Tome and Principe"],
    ae: ["Émirats", "UAE", "Emirates"],
    cv: ["Cap-Vert", "Cabo Verde"],
    mh: ["Marshall"],
    sb: ["Salomon", "Solomons"],
    pg: ["Papouasie", "PNG", "Papua"],
    mu: ["Maurice"],
    by: ["Belarus", "Biélorussie"],
    ba: ["Bosnie", "Bosnia"],
    kg: ["Kirghizstan", "Kyrgyz Republic"],
    ci: ["Cote d'Ivoire"],
  };

  function tokensOf(s) {
    return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z]+/g, " ").trim().split(/\s+/).filter(Boolean);
  }
  function normalizeName(s) {
    return tokensOf(s).join("");
  }
  function normalizeGuess(s) {
    const w = tokensOf(s);
    if (w.length > 1 && ["le", "la", "les", "l"].includes(w[0])) w.shift();
    return w.join("");
  }

  function levenshtein(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 99;
    const dp = Array.from({ length: a.length + 1 }, (_, i) => i);
    for (let j = 1; j <= b.length; j++) {
      let prev = dp[0];
      dp[0] = j;
      for (let i = 1; i <= a.length; i++) {
        const tmp = dp[i];
        dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    return dp[a.length];
  }

  let NAME_INDEX = null;
  function nameIndex() {
    if (!NAME_INDEX) {
      NAME_INDEX = new Map();
      for (const c of window.GEO_COUNTRIES) {
        for (const alias of [c.name, c.nameEn, ...(TYPE_ALIASES[c.iso2] || [])]) {
          NAME_INDEX.set(normalizeName(alias), c);
        }
      }
    }
    return NAME_INDEX;
  }

  /**
   * Verdicts : correct | other (autre pays reconnu → pénalité) |
   * unknown (orthographe inconnue → pas de pénalité) | empty.
   * Les fautes de frappe sont tolérées (distance 1 dès 5 lettres, 2 dès 10),
   * sauf si la saisie correspond exactement à un autre pays (Zambie/Gambie).
   */
  function matchGuess(raw, q) {
    const g = normalizeGuess(raw);
    if (!g) return { verdict: "empty" };
    const keys = [q.name, q.nameEn, ...(TYPE_ALIASES[q.iso2] || [])].map(normalizeName);
    if (keys.includes(g)) return { verdict: "correct" };
    const other = nameIndex().get(g);
    if (other && other.id !== q.id) return { verdict: "other", country: other };
    for (const k of keys) {
      const tol = k.length >= 10 ? 2 : k.length >= 5 ? 1 : 0;
      if (tol && levenshtein(g, k) <= tol) return { verdict: "correct" };
    }
    return { verdict: "unknown" };
  }

  const $ = (id) => document.getElementById(id);

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Pays jouables pour un mode + une région donnés. */
  function poolFor(modeId, continent) {
    const m = MODES[modeId];
    return window.GEO_COUNTRIES.filter(
      (c) =>
        (continent === "Monde" || c.continent === continent) &&
        (!m.needsGeo || !c.noGeo) &&
        (!m.minArea || c.area >= m.minArea)
    );
  }

  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  class Game {
    /**
     * cfg : { modeId, continent, questionPool, count, map, features,
     *         isErrorReplay, onEnd(summary) }
     */
    constructor(cfg) {
      this.cfg = cfg;
      this.mode = MODES[cfg.modeId];
      this.byId = new Map(window.GEO_COUNTRIES.map((c) => [c.id, c]));
      this.featureByKey = new Map(cfg.features.map((f) => [WorldMap.keyOf(f), f]));
      this.questions = shuffle(cfg.questionPool).slice(0, cfg.count);
      this.fitKeys =
        cfg.continent === "Monde" ? null : cfg.questionPool.map((c) => c.id);

      this.index = -1;
      this.score = 0;
      this.streak = 0;
      this.bestStreak = 0;
      this.perfectCount = 0;
      this.attempted = 0;
      this.errors = [];
      this.finished = false;
      this.stopped = false;
      this.pendingTimeout = null;

      // Contre-la-montre : compte à rebours, la partie s'arrête à 0.
      this.timeLimitMs = (this.mode.timed || 0) * 1000;

      this.startedAt = Date.now();
      this.timerId = setInterval(() => {
        const elapsed = Date.now() - this.startedAt;
        if (this.timeLimitMs) {
          const left = Math.max(0, this.timeLimitMs - elapsed);
          $("stat-timer").textContent = fmtTime(left);
          $("progress-fill").style.width = `${Math.min(100, (elapsed / this.timeLimitMs) * 100)}%`;
          if (left <= 0) this.end();
        } else {
          $("stat-timer").textContent = fmtTime(elapsed);
        }
      }, 250);

      $("stat-score").textContent = "0";
      $("stat-streak").textContent = "—";
      $("stat-timer").textContent = this.timeLimitMs ? fmtTime(this.timeLimitMs) : "0:00";
      $("game-mode-label").textContent =
        `${this.mode.icon} ${t(`modes.${cfg.modeId}.label`)} · ${t(`continents.${cfg.continent}`)}`;

      if (this.map) {
        this.map.clearAll();
        this.map.setHome(this.fitKeys);
      }
      this.startQuestion();
    }

    get map() {
      return this.mode.usesMap ? this.cfg.map : null;
    }

    /* ── Déroulement ─────────────────────────────────────────── */

    startQuestion() {
      if (this.stopped) return;
      this.index++;
      if (this.index >= this.questions.length) return this.end();

      this.q = this.questions[this.index];
      this.stageIdx = 0;
      this.wrongInQuestion = 0;
      this.wrongKeys = new Set();
      this.mapGivenUp = false;
      this.qPoints = 0;
      this.qStart = Date.now();
      this.resolved = false;

      this.setFeedback("", "");
      // En contre-la-montre le total serait trompeur (la partie s'arrête au
      // chrono) et la barre de progression suit le temps, pas les questions.
      $("stat-question").textContent = this.timeLimitMs
        ? `${this.index + 1}`
        : `${this.index + 1}/${this.questions.length}`;
      if (!this.timeLimitMs) {
        $("progress-fill").style.width =
          `${(this.index / this.questions.length) * 100}%`;
      }

      if (this.map) {
        this.map.clearTransient();
        // La vue du joueur est conservée d'une question à l'autre : on ne
        // recadre que si le jeu a bougé la caméra (révélation d'un pays).
        if (this.map.autoMoved) this.map.goHome();
      }
      this.renderStage();
    }

    renderStage() {
      const stage = this.mode.stages[this.stageIdx];
      this.stage = stage;
      this.stageWrong = 0;
      this.stageDone = false;

      const tgt = $("q-target");
      const opts = $("q-options");
      const instr = $("q-instruction");
      opts.innerHTML = "";
      tgt.innerHTML = "";
      $("btn-skip").textContent = this.canSkipStage() ? t("skipStage") : t("skip");

      if (stage === "map") {
        instr.textContent = t("whereIs");
        tgt.innerHTML = `<div class="target-name">${cname(this.q)}</div>`;
        this.map.setEnabled(true);
      } else if (stage === "flag" || stage === "flag2") {
        // Emplacement abandonné : pas de « bien joué », et on rappelle le pays
        // puisque le joueur n'a pas eu la satisfaction de le trouver.
        instr.textContent =
          stage === "flag"
            ? t("whichFlagOf")
            : this.mapGivenUp ? t("whichFlagAnyway") : t("whichFlag2");
        if (stage === "flag" || this.mapGivenUp) {
          tgt.innerHTML = `<div class="target-name">${cname(this.q)}</div>`;
        }
        if (this.map) this.map.setEnabled(false);
        this.renderOptions(opts, "flag");
      } else if (stage === "flagmap") {
        instr.textContent = t("whichCountryFlag");
        tgt.innerHTML =
          `<img class="target-flag" src="assets/flags/${this.q.iso2}.png" alt="${t("mysteryFlag")}">`;
        this.map.setEnabled(true);
      } else if (stage === "type") {
        instr.textContent = t("typeCountry");
        tgt.innerHTML =
          `<img class="target-flag" src="assets/flags/${this.q.iso2}.png" alt="${t("mysteryFlag")}">`;
        const form = document.createElement("form");
        form.className = "type-form";
        form.innerHTML =
          `<input class="type-input" type="text" placeholder="${t("typePlaceholder")}"
                  autocomplete="off" autocapitalize="off" spellcheck="false"
                  aria-label="${t("typePlaceholder")}">
           <button type="submit" class="btn-primary">${t("typeSubmit")}</button>`;
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          this.onTypeSubmit(form.querySelector("input"));
        });
        opts.appendChild(form);
        form.querySelector("input").focus();
      } else if (stage === "shape") {
        instr.textContent = t("whichShape");
        tgt.innerHTML = `<svg class="shape-svg"></svg>`;
        renderShape(tgt.querySelector("svg"), this.featureByKey.get(this.q.id));
        this.renderOptions(opts, "name");
      } else if (stage === "capital") {
        // Direction tirée au sort : pays → capitale ou capitale → pays.
        this.capitalToCountry = Math.random() < 0.5;
        if (this.capitalToCountry) {
          instr.textContent = t("whichCountryOfCapital");
          tgt.innerHTML = `<div class="target-name">${capname(this.q)}</div>`;
          this.renderOptions(opts, "name");
        } else {
          instr.textContent = t("whichCapitalOf");
          tgt.innerHTML = `<div class="target-name">${cname(this.q)}</div>`;
          this.renderOptions(opts, "capital");
        }
      }
    }

    /** Grille de 8 options (drapeaux ou noms), distracteurs du même continent. */
    renderOptions(container, kind) {
      const sameContinent = window.GEO_COUNTRIES.filter(
        (c) => c.id !== this.q.id && c.continent === this.q.continent
      );
      const others = window.GEO_COUNTRIES.filter(
        (c) => c.id !== this.q.id && c.continent !== this.q.continent
      );
      const distractors = shuffle(sameContinent)
        .concat(shuffle(others))
        .slice(0, 7);
      const options = shuffle([this.q, ...distractors]);

      container.className = `q-options ${kind === "flag" ? "grid-flags" : "grid-names"}`;
      for (const c of options) {
        const btn = document.createElement("button");
        btn.className = kind === "flag" ? "flag-btn" : "name-btn";
        btn.dataset.id = c.id;
        btn.innerHTML =
          kind === "flag"
            ? `<img src="assets/flags/${c.iso2}.png" alt="${t("flagAlt")}" draggable="false">`
            : kind === "capital" ? capname(c) : cname(c);
        btn.addEventListener("click", () => this.onOptionClick(btn, c));
        container.appendChild(btn);
      }
    }

    /* ── Événements ──────────────────────────────────────────── */

    onMapClick(key, feature) {
      if (this.resolved || this.stageDone) return;
      if (this.stage !== "map" && this.stage !== "flagmap") return;

      if (key === this.q.id) {
        this.map.markFound(key);
        this.stageSuccess("map");
      } else {
        // Le rouge persiste jusqu'à la question suivante : les emplacements
        // déjà tentés restent visibles et ne se paient qu'une fois.
        if (!this.wrongKeys.has(key)) {
          this.wrongKeys.add(key);
          this.stageWrong++;
          this.wrongInQuestion++;
        }
        this.map.markWrong(key);
        this.setFeedback(t("missedMap", { name: this.nameOf(key, feature) }), "bad");
      }
    }

    onTypeSubmit(input) {
      if (this.resolved || this.stageDone) return;
      const res = matchGuess(input.value, this.q);
      if (res.verdict === "empty") return;
      if (res.verdict === "correct") {
        input.value = cname(this.q);
        input.disabled = true;
        this.stageSuccess("choice");
      } else if (res.verdict === "other") {
        this.stageWrong++;
        this.wrongInQuestion++;
        this.setFeedback(t("wrongTyped", { name: cname(res.country) }), "bad");
        input.select();
      } else {
        this.setFeedback(t("unknownTyped", { raw: input.value.trim() }), "bad");
        input.select();
      }
    }

    onOptionClick(btn, country) {
      if (this.resolved || this.stageDone) return;
      if (country.id === this.q.id) {
        btn.classList.add("correct");
        this.stageSuccess(this.stage === "flag2" ? "flag2" : "choice");
      } else {
        btn.classList.add("wrong");
        this.stageWrong++;
        this.wrongInQuestion++;
        let msg;
        if (this.stage === "capital") {
          msg = this.capitalToCountry
            ? t("wrongCountryCapital", { name: cname(country), capital: capname(country) })
            : t("wrongCapital", { capital: capname(country), name: cname(country) });
        } else {
          msg = t(this.stage === "shape" ? "wrongShape" : "wrongOption", { name: cname(country) });
        }
        this.setFeedback(msg, "bad");
      }
    }

    /** Vrai quand « Passer » n'abandonne que l'étape : la carte du mode complet. */
    canSkipStage() {
      return this.stage === "map" && this.stageIdx < this.mode.stages.length - 1;
    }

    /** Emplacement abandonné : on montre le pays, le drapeau reste à jouer. */
    skipStage() {
      this.stageDone = true;
      this.mapGivenUp = true;
      this.wrongInQuestion++; // la question ne sera pas « sans faute »
      this.map.reveal(this.q.id);
      this.setFeedback(t("mapGivenUp"), "bad");
      this.pendingTimeout = setTimeout(() => {
        this.stageIdx++;
        this.renderStage();
      }, 1800);
    }

    skip() {
      if (this.resolved || this.stageDone) return;
      if (this.canSkipStage()) return this.skipStage();
      this.resolved = true;
      this.streak = 0;
      this.attempted++;
      this.errors.push(this.q);
      $("stat-streak").textContent = "—";

      // Révéler la réponse
      if (this.stage === "map" || this.stage === "flagmap") {
        this.map.reveal(this.q.id);
      } else if (this.stage === "type") {
        const input = $("q-options").querySelector(".type-input");
        if (input) {
          input.value = cname(this.q);
          input.disabled = true;
        }
      } else {
        for (const btn of $("q-options").children) {
          if (btn.dataset.id === this.q.id) btn.classList.add("correct");
          else btn.classList.add("faded");
        }
      }
      // Les étapes déjà réussies (ex. pays trouvé avant de passer le
      // drapeau en mode complet) restent acquises.
      if (this.qPoints && !this.timeLimitMs) {
        this.score += this.qPoints;
        $("stat-score").textContent = String(this.score);
      }
      const answer =
        this.stage === "capital" && !this.capitalToCountry
          ? `${capname(this.q)} (${cname(this.q)})`
          : cname(this.q);
      this.setFeedback(t("answerWas", { name: answer }), "bad");
      this.pendingTimeout = setTimeout(
        () => this.startQuestion(),
        this.timeLimitMs ? 1100 : 2200
      );
    }

    /* ── Scoring ─────────────────────────────────────────────── */

    stageSuccess(scoringKey) {
      this.stageDone = true;
      const sc = SCORING[scoringKey];
      const pts = Math.max(sc.base - this.stageWrong * sc.malus, sc.min);
      this.qPoints += pts;

      if (this.stageIdx < this.mode.stages.length - 1) {
        this.setFeedback(`+${pts} pts`, "good");
        this.stageIdx++;
        this.renderStage();
      } else {
        this.completeQuestion();
      }
    }

    completeQuestion() {
      this.resolved = true;
      this.attempted++;
      const perfect = this.wrongInQuestion === 0;

      if (perfect) {
        this.streak++;
        this.perfectCount++;
        this.bestStreak = Math.max(this.bestStreak, this.streak);
      } else {
        this.streak = 0;
        this.errors.push(this.q);
      }
      $("stat-streak").textContent = this.streak > 1 ? `🔥 ×${this.streak}` : this.streak === 1 ? "🔥" : "—";

      // Contre-la-montre : le score compte les pays trouvés, pas de bonus —
      // la récompense d'une bonne réponse, c'est le temps qu'il reste.
      if (this.timeLimitMs) {
        this.score++;
        $("stat-score").textContent = String(this.score);
        this.setFeedback(t("countryFound", { name: cname(this.q) }), "good");
        this.pendingTimeout = setTimeout(() => this.startQuestion(), 450);
        return;
      }

      const elapsedS = (Date.now() - this.qStart) / 1000;
      const timeBonus = Math.max(0, Math.round(SCORING.timeBonusMax - elapsedS));
      const streakBonus = perfect
        ? Math.min((this.streak - 1) * SCORING.streakStep, SCORING.streakCap)
        : 0;

      const gained = this.qPoints + timeBonus + streakBonus;
      this.score += gained;
      $("stat-score").textContent = String(this.score);

      const details = [];
      if (timeBonus) details.push(t("timeBonus", { n: timeBonus }));
      if (streakBonus) details.push(t("streakBonus", { n: streakBonus }));
      this.setFeedback(
        t("gained", { n: gained }) + (details.length ? ` (${details.join(", ")})` : ""),
        "good"
      );
      this.pendingTimeout = setTimeout(() => this.startQuestion(), 1300);
    }

    /* ── Fin ─────────────────────────────────────────────────── */

    end() {
      if (this.finished) return;
      this.stop();
      this.finished = true;
      $("progress-fill").style.width = "100%";
      const timeMs = this.timeLimitMs
        ? Math.min(Date.now() - this.startedAt, this.timeLimitMs)
        : Date.now() - this.startedAt;
      this.cfg.onEnd({
        score: this.score,
        timeMs,
        perfectCount: this.perfectCount,
        // Contre-la-montre : seules les questions traitées comptent.
        total: this.timeLimitMs ? this.attempted : this.questions.length,
        bestStreak: this.bestStreak,
        errors: this.errors,
        timed: !!this.timeLimitMs,
      });
    }

    stop() {
      this.stopped = true;
      clearInterval(this.timerId);
      clearTimeout(this.pendingTimeout);
    }

    /* ── Helpers ─────────────────────────────────────────────── */

    nameOf(key, feature) {
      const c = this.byId.get(key);
      if (c) return cname(c);
      // Territoires non joués : noms FR dans GEO_TERRITORIES, noms EN
      // directement dans le TopoJSON (Natural Earth).
      if (LANG === "fr" && window.GEO_TERRITORIES[key]) return window.GEO_TERRITORIES[key];
      return (feature && feature.properties && feature.properties.name) || "?";
    }

    setFeedback(text, cls) {
      const el = $("q-feedback");
      el.textContent = text;
      el.className = `q-feedback ${cls}`;
    }
  }

  window.GeoQuiz = {
    Game, MODES, CONTINENTS, SCORING, poolFor, fmtTime, shuffle, matchGuess,
    i18n: { t, cname, getLang, setLang },
  };
})();
