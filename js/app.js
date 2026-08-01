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
    refreshMenuBoard();
  }

  /* ── Écrans ──────────────────────────────────────────────────── */
  function show(screenId) {
    for (const id of ["screen-menu", "screen-game", "screen-end"]) {
      $(id).classList.toggle("hidden", id !== screenId);
    }
    // Pas de changement de langue en pleine partie.
    $("lang-switch").classList.toggle("hidden", screenId === "screen-game");
    refreshUpdateBanner();
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
    setupBoard(summary, isErrorReplay);
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

  /* ── Classement en ligne ─────────────────────────────────────── */

  function ordinal(n) {
    if (getLang() === "fr") return n === 1 ? "1er" : `${n}e`;
    const d10 = n % 10, d100 = n % 100;
    if (d10 === 1 && d100 !== 11) return `${n}st`;
    if (d10 === 2 && d100 !== 12) return `${n}nd`;
    if (d10 === 3 && d100 !== 13) return `${n}rd`;
    return `${n}th`;
  }
  const MEDALS = ["🥇", "🥈", "🥉"];

  /** Une ligne de classement ; `me` met en valeur celle du joueur. */
  function boardRow(row, i, timed, me) {
    const li = document.createElement("li");
    li.className = `board-row${me ? " is-me" : ""}`;
    const score = timed ? t("countriesScore", { n: row.score }) : `${row.score} pts`;
    li.innerHTML =
      `<span class="board-pos">${MEDALS[i] || ordinal(i + 1)}</span>` +
      `<span class="board-name"></span>` +
      `<span class="board-score">${score}</span>`;
    // textContent : un pseudo vient d'un inconnu, jamais interprété comme HTML.
    li.querySelector(".board-name").textContent =
      row.pseudo + (me ? ` (${t("boardYou")})` : "");
    return li;
  }

  function fillBoardList(el, rows, timed, meId, limit) {
    el.innerHTML = "";
    rows.slice(0, limit).forEach((row, i) =>
      el.appendChild(boardRow(row, i, timed, row.player_id === meId))
    );
  }

  // Chaque tap sur une pastille rappelle refreshMenu : on laisse le doigt se
  // poser avant d'interroger le serveur.
  let menuBoardTimer = null;
  function refreshMenuBoard() {
    clearTimeout(menuBoardTimer);
    menuBoardTimer = setTimeout(loadMenuBoard, 250);
  }

  /** Top 5 sur le menu, pour la configuration sélectionnée. */
  async function loadMenuBoard() {
    const wrap = $("menu-board-wrap");
    if (!Leaderboard.enabled()) return wrap.classList.add("hidden");
    const asked = recordKey();
    const rows = await Leaderboard.top(state.modeId, state.continent, boardCount());
    if (asked !== recordKey()) return; // la config a changé pendant la requête
    wrap.classList.toggle("hidden", rows.length === 0);
    fillBoardList($("menu-board"), rows, !!MODES[state.modeId].timed,
                  Leaderboard.playerId(), 5);
  }

  // Le contre-la-montre n'a pas de nombre de questions : même clé que les records.
  function boardCount() {
    return MODES[state.modeId].timed ? "60s" : state.countChoice;
  }

  /**
   * Fin de partie : on publie le score sous le pseudo connu (une seule
   * question posée, la première fois), puis on affiche le classement.
   */
  async function setupBoard(summary, isErrorReplay) {
    const board = $("board");
    const form = $("pseudo-form");
    const status = $("board-status");
    $("board-list").innerHTML = "";
    status.textContent = "";
    form.classList.add("hidden");

    // Rejouer ses erreurs n'est pas une vraie partie : hors classement.
    if (!Leaderboard.enabled() || isErrorReplay || summary.score <= 0) {
      return board.classList.add("hidden");
    }
    board.classList.remove("hidden");

    const known = Leaderboard.pseudo();
    if (known) return publishAndShow(known, summary);

    form.classList.remove("hidden");
    $("pseudo-input").value = "";
    form.onsubmit = (e) => {
      e.preventDefault();
      const name = Leaderboard.cleanPseudo($("pseudo-input").value);
      if (!name) return;
      form.classList.add("hidden");
      publishAndShow(name, summary);
    };
  }

  async function publishAndShow(name, summary) {
    const status = $("board-status");
    status.textContent = t("boardSending");
    const ok = await Leaderboard.submit({
      pseudo: name,
      modeId: state.modeId,
      continent: state.continent,
      count: boardCount(),
      score: summary.score,
      timeMs: summary.timeMs,
    });
    if (!ok) {
      status.textContent = t("boardFailed");
      return;
    }
    const rows = await Leaderboard.top(state.modeId, state.continent, boardCount());
    const meId = Leaderboard.playerId();
    const rank = rows.findIndex((r) => r.player_id === meId) + 1;

    if (!rows.length) {
      status.textContent = t("boardEmpty");
    } else if (rank > 0) {
      status.textContent = t("boardRank", {
        medal: MEDALS[rank - 1] || "🏆",
        rank: ordinal(rank),
        total: rows.length,
        pseudo: name,
      });
    } else {
      status.textContent = t("boardUnranked", { pseudo: name, n: Leaderboard.FETCH_ROWS });
    }
    // Le joueur peut changer d'avis sur son nom.
    const change = document.createElement("button");
    change.className = "board-change";
    change.textContent = t("boardChange");
    change.onclick = () => {
      Leaderboard.setPseudo("");
      setupBoard(summary, false);
    };
    status.appendChild(document.createTextNode(" "));
    status.appendChild(change);

    fillBoardList($("board-list"), rows, !!summary.timed, meId, 5);
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
  // ⌂ ramène au cadrage de la région jouée, pas au monde entier.
  $("zoom-reset").addEventListener("click", () => worldMap.goHome());

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

  /* ── Installation de l'app ───────────────────────────────────── */

  // iPad récent : se présente comme un Mac, mais avec un écran tactile.
  const isIOS =
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const isInstalled = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    navigator.standalone === true;

  // Chrome et Edge préviennent quand l'app est installable : on met leur
  // invitation de côté pour la déclencher depuis notre bouton, au moment
  // choisi par le joueur. Safari n'expose rien d'équivalent.
  let installPrompt = null;

  function refreshInstallButton() {
    // Ne rien proposer qui ne mènerait nulle part : déjà installé, ou
    // navigateur sans installation possible (Firefox).
    const possible = !isInstalled() && (installPrompt !== null || isIOS);
    $("install-row").classList.toggle("hidden", !possible);
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // pas de bandeau natif : c'est notre bouton qui décide
    installPrompt = e;
    refreshInstallButton();
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    $("install-ios").classList.add("hidden");
    refreshInstallButton();
  });

  $("btn-install").addEventListener("click", async () => {
    if (!installPrompt) {
      // iPhone : Apple ne permet aucune installation automatique, on montre
      // les deux gestes à faire.
      $("install-ios").classList.toggle("hidden");
      return;
    }
    installPrompt.prompt();
    await installPrompt.userChoice;
    // Une invitation ne sert qu'une fois ; le navigateur en renverra une au
    // prochain chargement si le joueur a refusé.
    installPrompt = null;
    refreshInstallButton();
  });

  /* ── PWA : installable, hors-ligne et mise à jour sans friction ──
     Le service worker précache tout : sans ce bandeau, une nouvelle version
     n'arrivait qu'au bout de plusieurs relancements — d'où les vidages de
     cache à la main. Ici on la détecte, on prévient, et un tap l'installe. */
  let waitingWorker = null;

  function refreshUpdateBanner() {
    // Jamais pendant une partie : un tap malheureux ferait perdre la manche.
    const inGame = !$("screen-game").classList.contains("hidden");
    $("update-banner").classList.toggle("hidden", !waitingWorker || inGame);
  }

  $("btn-update").addEventListener("click", () => {
    if (!waitingWorker) return;
    $("btn-update").disabled = true;
    // Le SW prend la main → « controllerchange » → rechargement automatique.
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  });
  $("btn-update-later").addEventListener("click", () => {
    waitingWorker = null;
    refreshUpdateBanner();
  });

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker
      // updateViaCache "none" : sw.js et ses imports sont toujours revalidés,
      // sinon le cache HTTP de GitHub Pages peut masquer une nouvelle version.
      .register("sw.js", { updateViaCache: "none" })
      .then((reg) => {
        const announce = (worker) => {
          if (!worker) return;
          waitingWorker = worker;
          refreshUpdateBanner();
        };
        // Version déjà téléchargée lors d'une visite précédente.
        if (reg.waiting) announce(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            // « installed » avec un contrôleur = mise à jour, pas 1re install.
            if (sw.state === "installed" && navigator.serviceWorker.controller) announce(sw);
          });
        });
        // L'appli installée peut rester ouverte des jours : on revérifie au
        // retour au premier plan, sinon la mise à jour n'est jamais vue.
        document.addEventListener("visibilitychange", () => {
          if (!document.hidden) reg.update().catch(() => { /* hors ligne */ });
        });
      })
      .catch(() => {
        /* http simple ou navigateur ancien : le jeu marche sans */
      });

    // À la toute première visite, clients.claim() déclenche aussi
    // « controllerchange » : sans ce garde-fou la page se rechargerait pour
    // rien. On ne recharge que si un service worker contrôlait déjà la page.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloading) return;
      reloading = true;
      location.reload();
    });
  }

  applyI18n();
  buildMenu();
  refreshInstallButton();
})();
