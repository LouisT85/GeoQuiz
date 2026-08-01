/* Classement en ligne (Supabase).

   Tant que SUPABASE_URL / SUPABASE_KEY sont vides, tout est inerte : le jeu
   fonctionne exactement comme avant et aucune interface de classement ne
   s'affiche. Voir docs/classement.md pour la mise en service. */
(function () {
  "use strict";

  /* ── À remplir une fois le projet Supabase créé ──────────────── */
  const SUPABASE_URL = "";  // ex. "https://abcdefgh.supabase.co"
  const SUPABASE_KEY = "";  // clé « anon / publishable » — publique par nature

  /* Barème du jeu. À incrémenter si le calcul des points change : les scores
     d'avant restent en base mais ne sont plus mélangés aux nouveaux. */
  const SCORING_VERSION = 1;

  const PSEUDO_KEY = "geoquiz-pseudo-v1";
  const PLAYER_KEY = "geoquiz-player-v1";
  const MAX_PSEUDO = 12;
  const TIMEOUT_MS = 6000;
  const FETCH_ROWS = 60; // marge pour ne garder que le meilleur score par joueur

  const enabled = () => Boolean(SUPABASE_URL && SUPABASE_KEY);

  function read(key) {
    try { return localStorage.getItem(key) || ""; } catch { return ""; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, value); } catch { /* navigation privée */ }
  }

  /** Identifiant local et anonyme : sert à ne garder qu'une ligne par joueur. */
  function playerId() {
    let id = read(PLAYER_KEY);
    if (!id) {
      id = (self.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      write(PLAYER_KEY, id);
    }
    return id;
  }

  function pseudo() { return read(PSEUDO_KEY); }
  function setPseudo(name) { write(PSEUDO_KEY, cleanPseudo(name)); }

  /** Un pseudo tient sur une ligne : pas de sauts, pas de longueur folle. */
  function cleanPseudo(name) {
    return String(name || "").replace(/\s+/g, " ").trim().slice(0, MAX_PSEUDO);
  }

  /** Un classement par mode + région + nombre de questions (comme les records). */
  function boardFilter(modeId, continent, count) {
    return {
      mode: `eq.${modeId}`,
      continent: `eq.${continent}`,
      nb_questions: `eq.${count}`,
      scoring_ver: `eq.${SCORING_VERSION}`,
    };
  }

  async function api(path, opts = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...opts,
        signal: ctrl.signal,
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          ...(opts.headers || {}),
        },
      });
      if (!res.ok) throw new Error(`Supabase ${res.status}`);
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Publie un score. Renvoie false si l'envoi a échoué (hors ligne, etc.). */
  async function submit(entry) {
    if (!enabled()) return false;
    const name = cleanPseudo(entry.pseudo);
    if (!name) return false;
    setPseudo(name);
    try {
      await api("scores", {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({
          player_id: playerId(),
          pseudo: name,
          mode: entry.modeId,
          continent: entry.continent,
          nb_questions: String(entry.count),
          score: Math.round(entry.score),
          time_ms: Math.round(entry.timeMs),
          scoring_ver: SCORING_VERSION,
        }),
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Meilleur score de chaque joueur pour ce classement, du meilleur au moins
   * bon. Renvoie [] si le classement est indisponible (hors ligne, non
   * configuré) : l'appelant ne distingue pas les deux cas, il affiche juste
   * ce qu'il a.
   */
  async function top(modeId, continent, count) {
    if (!enabled()) return [];
    const params = new URLSearchParams({
      select: "pseudo,player_id,score,time_ms,created_at",
      ...boardFilter(modeId, continent, count),
      // À égalité de points, le plus rapide devant.
      order: "score.desc,time_ms.asc",
      limit: String(FETCH_ROWS),
    });
    try {
      const rows = await (await api(`scores?${params}`)).json();
      const seen = new Set();
      const best = [];
      for (const row of rows) {
        if (seen.has(row.player_id)) continue; // déjà classé : c'était son meilleur
        seen.add(row.player_id);
        best.push(row);
      }
      return best;
    } catch {
      return [];
    }
  }

  window.Leaderboard = {
    enabled, top, submit, pseudo, setPseudo, cleanPseudo, playerId,
    MAX_PSEUDO, FETCH_ROWS, SCORING_VERSION,
  };
})();
