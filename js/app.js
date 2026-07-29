/* Menu, navigation entre écrans, records (localStorage), instanciation du jeu. */
(function () {
  "use strict";

  const { Game, MODES, CONTINENTS, poolFor, fmtTime } = window.GeoQuiz;
  const { t, setLang, getLang } = window.GeoQuiz.i18n;
  const $ = (id) => document.getElementById(id);

  const RECORDS_KEY = "geoquiz-records-v1";
  const MENU_KEY = "geoquiz-menu-v1";

  // Dernière config choisie restaurée au lancement : rejouer = un seul tap.
  const state = { modeId: "complet", continent: "Monde", countChoice: "10" };
  try {
    const saved = JSON.parse(localStorage.getItem(MENU_KEY)) || {};
    if (MODES[saved.modeId]) state.modeId = saved.modeId;
    if (CONTINENTS.includes(saved.continent)) state.continent = saved.continent;
    if (["10", "20", "tout"].includes(saved.countChoice)) state.countChoice = saved.countChoice;
  } catch { /* localStorage indisponible ou corrompu : défauts */ }

  let currentGame = null;
  let lastSummary = null;

  /* ── Données géo partagées (carte + silhouettes) ─────────────── */
  const features = topojson.feature(
    window.WORLD_TOPO,
    window.WORLD_TOPO.objects.countries
  ).features;

  const worldMap = new WorldMap($("map-svg"), features, {
    onCountryClick: (key, f) => currentGame && currentGame.onMapClick(key, f),
  });

  /* ── Records ─────────────────────────────────────────────────── */
  function loadRecords() {
    try {
      return JSON.parse(localStorage.getItem(RECORDS_KEY)) || {};
    } catch {
      return {};
    }
  }
  function recordKey() {
    // Le contre-la-montre ignore le nombre de questions : clé fixe.
    const count = MODES[state.modeId].timed ? "60s" : state.countChoice;
    return `${state.modeId}|${state.continent}|${count}`;
  }
  function maybeSaveRecord(summary) {
    const records = loadRecords();
    const prev = records[recordKey()];
    const better =
      !prev ||
      summary.score > prev.score ||
      (summary.score === prev.score && summary.timeMs < prev.timeMs);
    if (better) {
      records[recordKey()] = {
        score: summary.score,
        timeMs: summary.timeMs,
        date: new Date().toISOString().slice(0, 10),
      };
      localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
    }
    return better;
  }

  /* ── Menu ────────────────────────────────────────────────────── */
  function buildMenu() {
    const modeGrid = $("mode-grid");
    for (const [id, m] of Object.entries(MODES)) {
      const card = document.createElement("button");
      card.className = "mode-card";
      card.dataset.mode = id;
      card.innerHTML =
        `<span class="mode-icon">${m.icon}</span>` +
        `<span class="mode-label"></span>` +
        `<span class="mode-desc"></span>`;
      card.addEventListener("click", () => {
        state.modeId = id;
        refreshMenu();
      });
      modeGrid.appendChild(card);
    }

    const contRow = $("continent-row");
    for (const cont of CONTINENTS) {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.dataset.continent = cont;
      chip.addEventListener("click", () => {
        state.continent = cont;
        refreshMenu();
      });
      contRow.appendChild(chip);
    }

    const countRow = $("count-row");
    for (const c of ["10", "20", "tout"]) {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.dataset.count = c;
      chip.addEventListener("click", () => {
        state.countChoice = c;
        refreshMenu();
      });
      countRow.appendChild(chip);
    }

    $("btn-play").addEventListener("click", () => startGame());
    refreshMenuTexts();
    refreshMenu();
  }

  /** Textes du menu dépendant de la langue (relancé au changement de langue). */
  function refreshMenuTexts() {
    document.querySelectorAll(".mode-card").forEach((el) => {
      el.querySelector(".mode-label").textContent = t(`modes.${el.dataset.mode}.label`);
      el.querySelector(".mode-desc").textContent = t(`modes.${el.dataset.mode}.desc`);
    });
    document.querySelectorAll("[data-continent]").forEach((el) => {
      const c = el.dataset.continent;
      el.textContent = (c === "Monde" ? "🌐 " : "") + t(`continents.${c}`);
    });
  }

  function refreshMenu() {
    try { localStorage.setItem(MENU_KEY, JSON.stringify(state)); } catch { /* tant pis */ }
    const pool = poolFor(state.modeId, state.continent);
    const timed = !!MODES[state.modeId].timed;

    document.querySelectorAll(".mode-card").forEach((el) =>
      el.classList.toggle("selected", el.dataset.mode === state.modeId)
    );
    document.querySelectorAll("[data-continent]").forEach((el) =>
      el.classList.toggle("selected", el.dataset.continent === state.continent)
    );
    // Nombre de questions sans objet en contre-la-montre (le chrono décide).
    $("count-title").classList.toggle("hidden", timed);
    $("count-row").classList.toggle("hidden", timed);
    document.querySelectorAll("[data-count]").forEach((el) => {
      el.classList.toggle("selected", el.dataset.count === state.countChoice);
      el.textContent =
        el.dataset.count === "tout" ? t("all", { n: pool.length }) : el.dataset.count;
    });

    $("menu-pool").textContent = t("pool", { n: pool.length });
    const rec = loadRecords()[recordKey()];
    $("menu-record").textContent = rec
      ? timed
        ? t("recordChrono", { n: rec.score })
        : t("record", { score: rec.score, time: fmtTime(rec.timeMs) })
      : t("noRecord");
  }

  /* ── Écrans ──────────────────────────────────────────────────── */
  function show(screenId) {
    for (const id of ["screen-menu", "screen-game", "screen-end"]) {
      $(id).classList.toggle("hidden", id !== screenId);
    }
    // Pas de changement de langue en pleine partie.
    $("lang-switch").classList.toggle("hidden", screenId === "screen-game");
    // Sur mobile le menu est long : sans remise à zéro, l'écran suivant
    // apparaît déjà scrollé et le header (score, chrono) est hors champ.
    window.scrollTo(0, 0);
    $("game-layout").scrollTop = 0;
  }

  /* ── Partie ──────────────────────────────────────────────────── */
  function startGame(customPool, isErrorReplay) {
    const mode = MODES[state.modeId];
    const pool = customPool || poolFor(state.modeId, state.continent);
    if (!pool.length) return;
    const count = customPool
      ? customPool.length
      : mode.timed || state.countChoice === "tout"
        ? pool.length
        : Math.min(parseInt(state.countChoice, 10), pool.length);

    $("game-layout").classList.toggle("no-map", !mode.usesMap);
    worldMap.setEnabled(false);
    show("screen-game");

    currentGame = new Game({
      modeId: state.modeId,
      continent: state.continent,
      questionPool: pool,
      count,
      map: worldMap,
      features,
      isErrorReplay: !!isErrorReplay,
      onEnd: (summary) => showEnd(summary, !!isErrorReplay),
    });
  }

  let lastEnd = null;

  function showEnd(summary, isErrorReplay) {
    lastSummary = summary;
    currentGame = null;
    const isNewRecord = isErrorReplay ? false : maybeSaveRecord(summary);
    lastEnd = { summary, isErrorReplay, isNewRecord };
    fillEndScreen();
    show("screen-end");
  }

  /** Remplit l'écran de fin (relancé si la langue change pendant qu'il est affiché). */
  function fillEndScreen() {
    if (!lastEnd) return;
    const { summary, isErrorReplay, isNewRecord } = lastEnd;

    const ratio = summary.total ? summary.perfectCount / summary.total : 0;
    $("end-emoji").textContent = summary.timed ? "⏱️" : ratio === 1 ? "🏆" : ratio >= 0.6 ? "🌟" : "🌍";
    $("end-title").textContent = summary.timed
      ? t("endTitleChrono")
      : ratio === 1 ? t("endTitleGreat") : ratio >= 0.6 ? t("endTitleGood") : t("endTitleDone");
    $("end-score").textContent = summary.timed
      ? t("countriesScore", { n: summary.score })
      : `${summary.score} pts`;
    $("end-perfect").textContent = `${summary.perfectCount}/${summary.total}`;
    $("end-time").textContent = fmtTime(summary.timeMs);
    $("end-streak").textContent = summary.bestStreak > 0 ? `🔥 ×${summary.bestStreak}` : "—";

    let recordMsg = "";
    if (!isErrorReplay) {
      const prev = loadRecords()[recordKey()];
      recordMsg = isNewRecord
        ? t("newRecord")
        : summary.timed
          ? t("recordToBeatChrono", { n: prev.score })
          : t("recordToBeat", { score: prev.score });
    }
    $("end-record").textContent = recordMsg;

    const btnErr = $("btn-replay-errors");
    btnErr.classList.toggle("hidden", summary.errors.length === 0);
    btnErr.textContent = t("replayErrors", { n: summary.errors.length });
  }

  /* ── Contrôles globaux ───────────────────────────────────────── */
  $("btn-quit").addEventListener("click", () => {
    if (currentGame) currentGame.stop();
    currentGame = null;
    show("screen-menu");
    refreshMenu();
  });
  $("btn-skip").addEventListener("click", () => currentGame && currentGame.skip());
  $("btn-replay").addEventListener("click", () => startGame());
  $("btn-replay-errors").addEventListener("click", () => {
    if (lastSummary && lastSummary.errors.length) {
      startGame(lastSummary.errors.slice(), true);
    }
  });
  $("btn-menu").addEventListener("click", () => {
    show("screen-menu");
    refreshMenu();
  });
  $("zoom-in").addEventListener("click", () => worldMap.zoomBy(1.7));
  $("zoom-out").addEventListener("click", () => worldMap.zoomBy(1 / 1.7));
  $("zoom-reset").addEventListener("click", () => worldMap.resetZoom());

  /* ── Langue ──────────────────────────────────────────────────── */
  function applyI18n() {
    document.documentElement.lang = getLang();
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll("#lang-switch button").forEach((b) =>
      b.classList.toggle("active", b.dataset.lang === getLang())
    );
  }

  document.querySelectorAll("#lang-switch button").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (btn.dataset.lang === getLang()) return;
      setLang(btn.dataset.lang);
      applyI18n();
      refreshMenuTexts();
      refreshMenu();
      if (!$("screen-end").classList.contains("hidden")) fillEndScreen();
    })
  );

  /* ── PWA : installable + hors-ligne (inactif en file://) ────── */
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* http simple ou navigateur ancien : le jeu marche sans */
    });
  }

  applyI18n();
  buildMenu();
})();
