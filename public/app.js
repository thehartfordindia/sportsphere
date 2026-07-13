"use strict";

/* SportSphere frontend — dynamic sports, rich players, play-to-earn games & wallet. */

const $ = (id) => document.getElementById(id);
const state = {
  view: "live",
  sports: [],
  matches: [],
  regions: [],
  source: "sample",
  filters: { sport: "all", status: "all", region: "all" },
  hlSport: "all",
  plSport: "all",
  geo: null,
  userId: localStorage.getItem("ss_user") || "guest",
  name: localStorage.getItem("ss_name") || "Guest",
  authed: localStorage.getItem("ss_authed") === "1",
  favSport: localStorage.getItem("ss_fav") || "all",
  wallet: null,
  games: [],
  pointsPerRupee: 100,
  watch: null,
  matchTimer: null,
  game: null, // active game session
  follows: new Set(JSON.parse(localStorage.getItem("ss_follows") || "[]")),
  plFollowing: false, // "Following only" filter in Players
};
const VIEWS = ["live", "highlights", "players", "games", "wallet"];
/* ---------- helpers ---------- */
const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
function initials(name) {
  return String(name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}
function fmtViews(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}
function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}
let toastTimer = null;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2800);
}
async function api(path, opts) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}
function sportById(id) {
  return state.sports.find((s) => s.id === id);
}

/* ---------- follow players ---------- */
function isFollowing(id) {
  return state.follows.has(id);
}
function saveFollows() {
  localStorage.setItem("ss_follows", JSON.stringify([...state.follows]));
}
function toggleFollow(id, name) {
  if (state.follows.has(id)) {
    state.follows.delete(id);
    toast(`Unfollowed ${name || "player"}`);
  } else {
    state.follows.add(id);
    toast(`Following ${name || "player"} ❤️`);
  }
  saveFollows();
  // Refresh any visible follow controls + the Following filter chip.
  syncFollowUI(id);
  updateFollowChip();
  if (state.plFollowing) loadPlayers();
}
function syncFollowUI(id) {
  document.querySelectorAll(`[data-follow="${id}"]`).forEach((btn) => {
    const on = isFollowing(id);
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    if (btn.classList.contains("pm-follow")) {
      btn.textContent = on ? "❤️ Following" : "🤍 Follow";
    } else {
      btn.textContent = on ? "❤️" : "🤍";
    }
    btn.title = on ? "Unfollow" : "Follow";
  });
}
function updateFollowChip() {
  const chip = $("plFollowChip");
  if (chip) {
    const n = state.follows.size;
    chip.querySelector(".pf-count").textContent = n;
    chip.classList.toggle("has", n > 0);
  }
}

/* ---------- view switching ---------- */
function showView(name) {
  if (!VIEWS.includes(name)) return;
  state.view = name;
  document.querySelectorAll("[data-view-panel]").forEach((p) =>
    p.classList.toggle("active", p.getAttribute("data-view-panel") === name)
  );
  document.querySelectorAll(".view-tab").forEach((t) =>
    t.classList.toggle("active", t.getAttribute("data-view") === name)
  );
  if (name === "wallet") refreshWallet();
  if (name === "games") loadGames();
  if (name === "wallet") loadStats();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------- sports + chips ---------- */
async function loadSports() {
  const { sports } = await api("/api/sports");
  state.sports = sports;
  $("sportCount").textContent = sports.length;
  renderChips("sportChips", "sport", () => loadMatches());
  renderChips("hlSportChips", "hlSport", () => loadHighlights());
  renderChips("plSportChips", "plSport", () => loadPlayers());
}
function renderChips(containerId, key, onChange) {
  const el = $(containerId);
  const current = key === "sport" ? state.filters.sport : state[key];
  const all = [{ id: "all", name: "All", icon: "🌐" }, ...state.sports];
  el.innerHTML = all
    .map((s) => `<button class="chip ${s.id === current ? "active" : ""}" data-chip="${s.id}">${s.icon} ${escapeHtml(s.name)}</button>`)
    .join("");
  el.querySelectorAll("[data-chip]").forEach((b) => {
    b.addEventListener("click", () => {
      const val = b.getAttribute("data-chip");
      if (key === "sport") state.filters.sport = val;
      else state[key] = val;
      el.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === b));
      onChange();
    });
  });
}

/* ---------- matches ---------- */
async function loadMatches(silent) {
  const p = new URLSearchParams();
  p.set("sport", state.filters.sport);
  p.set("status", state.filters.status);
  p.set("region", state.filters.region);
  if (state.geo) {
    p.set("lat", state.geo.lat);
    p.set("lon", state.geo.lon);
  }
  const { matches, regions, source } = await api(`/api/matches?${p.toString()}`);
  state.matches = matches;
  state.regions = regions;
  state.source = source;
  renderDataBadge();
  renderRegions();
  renderMatches();
  renderTicker();
  const live = matches.filter((m) => m.status === "LIVE").length;
  $("liveCount").textContent = live;
  $("matchCount").textContent = matches.length;
  if (!silent && source === "live") { /* keep quiet on refresh */ }
}
function renderDataBadge() {
  const b = $("dataBadge");
  if (state.source === "live") {
    b.className = "hero-eyebrow live";
    b.textContent = "● Live data · TheSportsDB";
  } else {
    b.className = "hero-eyebrow sample";
    b.textContent = "● Sample data (live feed offline here)";
  }
}
function renderRegions() {
  const sel = $("regionSelect");
  const prev = state.filters.region;
  sel.innerHTML =
    `<option value="all">🌍 All regions</option>` +
    state.regions.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("");
  sel.value = prev;
}
function teamBadge(url, name) {
  if (url) return `<img class="team-badge" src="${escapeHtml(url)}" alt="" loading="lazy" onerror="this.style.display='none'"/>`;
  return `<span class="team-badge ph">${escapeHtml(initials(name))}</span>`;
}
function renderMatches() {
  const grid = $("matchGrid");
  if (!state.matches.length) {
    grid.innerHTML = `<p class="section-sub">No matches for this filter right now.</p>`;
    return;
  }
  grid.innerHTML = state.matches
    .map((m) => {
      const dist = m.distanceKm != null ? `📍 ${m.distanceKm} km` : "";
      const viewers = m.viewers ? `👁️ ${fmtViews(m.viewers)}` : "";
      const canWatch = m.status === "LIVE";
      const sIcon = (sportById(m.sport) || {}).icon || "🎽";
      return `
      <div class="match-card" data-match="${m.id}">
        <div class="match-head">
          <span class="league">${sIcon} ${escapeHtml(m.league)}</span>
          <span class="badge ${m.status}">${m.status}</span>
        </div>
        <div class="teams">
          <div class="team-row">
            <span class="team-name">${teamBadge(m.homeBadge, m.home)}<span>${escapeHtml(m.home)}</span></span>
            <span class="score">${escapeHtml(m.scoreHome)}</span>
          </div>
          <div class="team-row">
            <span class="team-name">${teamBadge(m.awayBadge, m.away)}<span>${escapeHtml(m.away)}</span></span>
            <span class="score">${escapeHtml(m.scoreAway)}</span>
          </div>
        </div>
        <div class="match-foot">
          <span class="match-meta"><span>⏱️ ${escapeHtml(m.clock)}</span>${viewers ? `<span>${viewers}</span>` : ""}${dist ? `<span>${dist}</span>` : ""}</span>
          <span class="match-actions">
            <button class="squad-btn" data-squad="${m.id}">👥 Squads</button>
            ${canWatch ? `<button class="watch-btn" data-watch="${m.id}">▶ Watch &amp; earn</button>` : `<span class="match-meta"><span>${escapeHtml(m.city || "")}</span></span>`}
          </span>
        </div>
      </div>`;
    })
    .join("");
  grid.querySelectorAll("[data-watch]").forEach((b) =>
    b.addEventListener("click", (e) => { e.stopPropagation(); openWatch(b.getAttribute("data-watch")); })
  );
  grid.querySelectorAll("[data-squad]").forEach((b) =>
    b.addEventListener("click", (e) => { e.stopPropagation(); openMatch(b.getAttribute("data-squad")); })
  );
  grid.querySelectorAll("[data-match]").forEach((c) =>
    c.addEventListener("click", () => openMatch(c.getAttribute("data-match")))
  );
}
function renderTicker() {
  const live = state.matches.filter((m) => m.status === "LIVE");
  const track = $("tickerTrack");
  if (!live.length) {
    $("ticker").hidden = true;
    return;
  }
  const items = live
    .map((m) => `<span class="ticker-item"><span class="tk-live">● LIVE</span> ${escapeHtml(m.league)}: <b>${escapeHtml(m.home)}</b> ${escapeHtml(m.scoreHome)}–${escapeHtml(m.scoreAway)} <b>${escapeHtml(m.away)}</b></span>`)
    .join("");
  track.innerHTML = items + items; // duplicate for seamless loop
  $("ticker").hidden = false;
}

/* ---------- match lineups / squads ---------- */
async function openMatch(id) {
  $("matchModalBody").innerHTML = `<button class="modal-close" data-mclose>✕</button><div style="padding:2.5rem;text-align:center">Loading squads…</div>`;
  $("matchModal").hidden = false;
  $("matchModalBody").querySelector("[data-mclose]").addEventListener("click", () => ($("matchModal").hidden = true));
  let d;
  try {
    d = await api(`/api/matches/${encodeURIComponent(id)}/lineup`);
  } catch (e) {
    $("matchModalBody").innerHTML = `<button class="modal-close" data-mclose>✕</button><p style="padding:2rem">Couldn't load squads for this match.</p>`;
    $("matchModalBody").querySelector("[data-mclose]").addEventListener("click", () => ($("matchModal").hidden = true));
    return;
  }
  const m = d.match || {};
  const sIcon = (sportById(m.sport) || {}).icon || "🎽";
  const head = `
    <div class="match-modal-head">
      <span class="mm-league">${sIcon} ${escapeHtml(m.league || "")}</span>
      <span class="badge ${m.status}">${escapeHtml(m.status || "")}</span>
    </div>
    <h3 class="mm-title">${escapeHtml(m.home || "")} <span class="mm-vs">vs</span> ${escapeHtml(m.away || "")}</h3>`;

  let body = "";
  if (d.format === "team") {
    body = `<div class="lineup-wrap">${teamColumn(d.home)}${teamColumn(d.away)}</div>`;
  } else if (d.format === "individual") {
    body = `<div class="lineup-wrap">${athleteColumn(m.home, d.home)}${athleteColumn(m.away, d.away)}</div>`;
  } else if (d.format === "grid") {
    body = `
      <p class="section-sub" style="margin:.2rem 0 .6rem">🏁 Starting grid · ${escapeHtml(d.circuit || "")}</p>
      <div class="grid-list">
        ${d.grid.map((g) => `
          <div class="grid-row">
            <span class="grid-pos">P${g.pos}</span>
            <span class="grid-driver">${escapeHtml(g.name)}</span>
            <span class="grid-team">${escapeHtml(g.team)}</span>
          </div>`).join("")}
      </div>`;
  } else {
    body = `<p class="section-sub" style="padding:1rem">Lineup not available for this match.</p>`;
  }

  $("matchModalBody").innerHTML = `<button class="modal-close" data-mclose>✕</button>${head}${body}`;
  $("matchModalBody").querySelector("[data-mclose]").addEventListener("click", () => ($("matchModal").hidden = true));
}
function playerRow(p) {
  return `
    <li class="lu-row">
      <span class="lu-num">${p.number != null ? p.number : ""}</span>
      <span class="lu-name">${escapeHtml(p.name)}${p.captain ? ` <span class="lu-cap">C</span>` : ""}</span>
      <span class="lu-pos">${escapeHtml(p.pos)}</span>
    </li>`;
}
function teamColumn(side) {
  return `
    <div class="lineup-col">
      <div class="lu-team">${escapeHtml(side.team)}</div>
      <div class="lu-formation">${escapeHtml(side.formation || "")}</div>
      <ul class="lu-list">${side.starting.map(playerRow).join("")}</ul>
      ${side.bench && side.bench.length ? `<div class="lu-bench-label">Bench</div><ul class="lu-list bench">${side.bench.map(playerRow).join("")}</ul>` : ""}
    </div>`;
}
function athleteColumn(name, side) {
  return `
    <div class="lineup-col">
      <div class="lu-team">${escapeHtml(name)}</div>
      <div class="lu-athlete-ico">${initials(name)}</div>
      <div class="lu-bench-label">Support team</div>
      <ul class="lu-list">
        ${side.support.map((s) => `<li class="lu-row"><span class="lu-name">${escapeHtml(s.role)}</span></li>`).join("")}
      </ul>
    </div>`;
}

/* ---------- highlights ---------- */
async function loadHighlights() {
  const { highlights } = await api(`/api/highlights?sport=${state.hlSport}`);
  const grid = $("highlightGrid");
  grid.innerHTML = highlights
    .map((h) => {
      const sport = sportById(h.sport);
      return `
      <div class="highlight-card" data-hl="${h.id}">
        <div class="highlight-thumb">
          ${sport ? sport.icon : "🎬"}
          <span class="play-ico">▶</span>
          ${h.trending ? `<span class="trend-tag">🔥 Trending</span>` : ""}
          <span class="highlight-dur">${escapeHtml(h.duration)}</span>
        </div>
        <div class="highlight-body">
          <h4>${escapeHtml(h.title)}</h4>
          <div class="hl-meta">${fmtViews(h.views)} views · ${sport ? escapeHtml(sport.name) : ""}</div>
        </div>
      </div>`;
    })
    .join("");
  grid.querySelectorAll("[data-hl]").forEach((c) =>
    c.addEventListener("click", () => toast("▶ Playing highlight (demo)"))
  );
}

/* ---------- players ---------- */
async function loadPlayers() {
  const { players } = await api(`/api/players?sport=${state.plSport}`);
  const grid = $("playerGrid");
  let list = players;
  if (state.plFollowing) list = list.filter((p) => isFollowing(p.id));
  if (!list.length) {
    if (state.plFollowing) {
      grid.innerHTML = `<div class="empty-state">❤️ You're not following anyone yet.<br><span class="empty-sub">Tap the heart on a player to add them here.</span></div>`;
    } else {
      const sport = sportById(state.plSport);
      grid.innerHTML = `<div class="empty-state">${sport ? sport.icon : "⭐"} No star players listed for ${sport ? escapeHtml(sport.name) : "this sport"} yet.</div>`;
    }
    return;
  }
  grid.innerHTML = list
    .map((p) => {
      const sport = sportById(p.sport);
      const on = isFollowing(p.id);
      return `
      <div class="player-card" data-player="${p.id}">
        <button class="follow-btn ${on ? "on" : ""}" data-follow="${p.id}" aria-pressed="${on ? "true" : "false"}" title="${on ? "Unfollow" : "Follow"}">${on ? "❤️" : "🤍"}</button>
        <div class="player-avatar">${initials(p.name)}</div>
        <div class="player-info">
          <h4>${escapeHtml(p.name)}</h4>
          <div class="p-sub">${sport ? sport.icon : ""} ${escapeHtml(p.role)} · ${escapeHtml(p.country)}</div>
          <div class="p-tagline">${escapeHtml(p.tagline || "")}</div>
        </div>
        <span class="rating-pill">${p.rating}</span>
      </div>`;
    })
    .join("");
  grid.querySelectorAll(".player-card").forEach((c) =>
    c.addEventListener("click", (e) => {
      if (e.target.closest("[data-follow]")) return;
      openPlayer(c.getAttribute("data-player"));
    })
  );
  grid.querySelectorAll("[data-follow]").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const card = b.closest(".player-card");
      const name = card ? card.querySelector("h4").textContent : "";
      toggleFollow(b.getAttribute("data-follow"), name);
    })
  );
}
async function openPlayer(id) {
  $("playerModalBody").innerHTML = `<div style="padding:2rem;text-align:center">Loading profile…</div>`;
  $("playerModal").hidden = false;
  let p;
  try {
    p = await api(`/api/players/${encodeURIComponent(id)}`);
  } catch (e) {
    $("playerModalBody").innerHTML = `<button class="modal-close" data-pclose>✕</button><p style="padding:2rem">Couldn't load player.</p>`;
    $("playerModalBody").querySelector("[data-pclose]").addEventListener("click", () => ($("playerModal").hidden = true));
    return;
  }
  const sport = sportById(p.sport);
  const career = p.career || {};
  const life = p.lifestyle || {};
  const social = p.social || {};
  const avatarStyle = p.photo ? `style="background-image:url('${escapeHtml(p.photo)}')"` : "";
  const bannerStyle = p.banner ? `style="background-image:url('${escapeHtml(p.banner)}')"` : "";
  const sourceTag = p.dataSource === "live"
    ? `<span class="pm-source live">● live data</span>`
    : `<span class="pm-source sample">sample</span>`;

  const careerStats = Object.entries(career)
    .map(([k, v]) => `<div class="pm-stat"><b>${escapeHtml(String(v))}</b><span>${escapeHtml(k.replace(/([A-Z])/g, " $1"))}</span></div>`)
    .join("");

  const infoRows = [
    ["Born", p.born],
    ["Country", p.country],
    ["Team", p.team],
    ["Height", p.height],
    ["Weight", p.weight],
    ["Family", life.family],
  ].filter(([, v]) => v);

  const socialCards = [
    social.instagram ? { ico: "📸", name: "Instagram", handle: handleFrom(social.instagram), url: social.instagram } : null,
    social.twitter ? { ico: "𝕏", name: "X / Twitter", handle: handleFrom(social.twitter), url: social.twitter } : null,
    social.facebook ? { ico: "📘", name: "Facebook", handle: handleFrom(social.facebook), url: social.facebook } : null,
    social.website ? { ico: "🌐", name: "Website", handle: "official", url: social.website } : null,
    social.youtube ? { ico: "▶️", name: "YouTube", handle: handleFrom(social.youtube), url: social.youtube } : null,
  ].filter(Boolean);

  $("playerModalBody").innerHTML = `
    <button class="modal-close" data-pclose>✕</button>
    <div class="pm-banner" ${bannerStyle}></div>
    <div class="pm-head">
      <div class="pm-avatar" ${avatarStyle}>${p.photo ? "" : initials(p.name)}</div>
      <div class="pm-head-info">
        <h3>${escapeHtml(p.name)} ${sourceTag}</h3>
        <div class="pm-tagline">${sport ? sport.icon : ""} ${escapeHtml(p.tagline || p.role)}</div>
      </div>
      <button class="follow-btn pm-follow ${isFollowing(p.id) ? "on" : ""}" data-follow="${p.id}" aria-pressed="${isFollowing(p.id) ? "true" : "false"}" title="${isFollowing(p.id) ? "Unfollow" : "Follow"}">${isFollowing(p.id) ? "❤️ Following" : "🤍 Follow"}</button>
    </div>
    <div class="pm-tabs">
      <button class="pm-tab active" data-pane="overview">Overview</button>
      <button class="pm-tab" data-pane="form">Form</button>
      <button class="pm-tab" data-pane="career">Career</button>
      <button class="pm-tab" data-pane="personal">Personal</button>
      <button class="pm-tab" data-pane="social">Social</button>
    </div>
    <div class="pm-pane active" data-pane="overview">
      <p class="pm-bio">${escapeHtml(p.bio || "")}</p>
      ${infoRows.map(([k, v]) => `<div class="pm-info-row"><span class="k">${escapeHtml(k)}</span><span class="v">${escapeHtml(v)}</span></div>`).join("")}
    </div>
    <div class="pm-pane" data-pane="form">
      <div class="pm-form-body" id="pmFormBody"><div class="pm-form-loading">Loading recent form…</div></div>
    </div>
    <div class="pm-pane" data-pane="career">
      <div class="pm-stats">${careerStats || "<p class='section-sub'>No stats.</p>"}</div>
    </div>
    <div class="pm-pane" data-pane="personal">
      <div class="pm-info-row"><span class="k">💪 Fitness</span><span class="v">${escapeHtml(life.fitness || "—")}</span></div>
      <div class="pm-info-row"><span class="k">🥗 Diet</span><span class="v">${escapeHtml(life.diet || "—")}</span></div>
      <div class="pm-info-row"><span class="k">❤️ Foundation</span><span class="v">${escapeHtml(life.foundation || "—")}</span></div>
      <div class="pm-info-row"><span class="k">👪 Family</span><span class="v">${escapeHtml(life.family || "—")}</span></div>
      <p class="section-sub" style="margin-top:.8rem">Interests</p>
      <div class="tag-row">${(life.interests || []).map((i) => `<span class="tag">${escapeHtml(i)}</span>`).join("") || "—"}</div>
    </div>
    <div class="pm-pane" data-pane="social">
      ${social.followersM ? `<div class="social-followers"><span>Total following</span><b>${social.followersM}M</b></div>` : ""}
      ${social.engagement ? `<div class="social-followers"><span>Avg. engagement</span><b>${escapeHtml(social.engagement)}</b></div>` : ""}
      <div class="social-grid">
        ${socialCards.map((s) => `
          <a class="social-card" href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">
            <span class="social-ico">${s.ico}</span>
            <span class="social-meta"><span class="s-name">${escapeHtml(s.name)}</span><span class="s-handle">${escapeHtml(s.handle)}</span></span>
          </a>`).join("") || "<p class='section-sub'>No public socials listed.</p>"}
      </div>
    </div>`;

  $("playerModalBody").querySelector("[data-pclose]").addEventListener("click", () => ($("playerModal").hidden = true));
  const pmFollow = $("playerModalBody").querySelector("[data-follow]");
  if (pmFollow) {
    pmFollow.addEventListener("click", () => toggleFollow(p.id, p.name));
  }
  $("playerModalBody").querySelectorAll(".pm-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const pane = tab.getAttribute("data-pane");
      $("playerModalBody").querySelectorAll(".pm-tab").forEach((t) => t.classList.toggle("active", t === tab));
      $("playerModalBody").querySelectorAll(".pm-pane").forEach((pn) => pn.classList.toggle("active", pn.getAttribute("data-pane") === pane));
      if (pane === "form") loadPlayerForm(id);
    });
  });
}

/* Lazy-load & render a player's recent form / performance. */
const _formCache = {};
async function loadPlayerForm(id) {
  const body = $("pmFormBody");
  if (!body) return;
  if (_formCache[id]) { body.innerHTML = renderForm(_formCache[id]); return; }
  try {
    const perf = await api(`/api/players/${encodeURIComponent(id)}/performance`);
    _formCache[id] = perf;
    body.innerHTML = renderForm(perf);
  } catch (e) {
    body.innerHTML = `<p class="section-sub">Couldn't load form.</p>`;
  }
}
function sparkline(trend) {
  const max = 10, min = 0, w = 100, h = 34, n = trend.length;
  if (n < 2) return "";
  const pts = trend.map((v, i) => {
    const x = (i / (n - 1)) * w;
    const y = h - ((v - min) / (max - min)) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = `0,${h} ` + pts.join(" ") + ` ${w},${h}`;
  return `
    <svg class="pm-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <polygon points="${area}" fill="url(#sparkfill)"></polygon>
      <polyline points="${pts.join(" ")}" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></polyline>
      <defs><linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--primary)" stop-opacity="0.28"></stop>
        <stop offset="1" stop-color="var(--primary)" stop-opacity="0"></stop>
      </linearGradient></defs>
    </svg>`;
}
function ratingClass(r) {
  if (r >= 7.5) return "hot";
  if (r >= 6) return "good";
  if (r >= 4.5) return "ok";
  return "low";
}
function renderForm(perf) {
  const rec = perf.record || { wins: 0, losses: 0, draws: 0 };
  const heat = (perf.heat || []).map((r) => `<span class="pm-heat ${r === "W" ? "w" : r === "L" ? "l" : "d"}">${r}</span>`).join("");
  const games = (perf.games || []).map((g) => `
    <div class="pm-game">
      <span class="pm-game-res ${g.result === "W" ? "w" : g.result === "L" ? "l" : "d"}">${g.result}</span>
      <div class="pm-game-main">
        <div class="pm-game-opp">${escapeHtml(g.placeLabel ? g.placeLabel + " · " : "")}${escapeHtml(g.opponent)}</div>
        <div class="pm-game-line">${escapeHtml(g.line)}</div>
      </div>
      <span class="pm-game-date">${escapeHtml(g.date)}</span>
      <span class="pm-rating ${ratingClass(g.rating)}">${g.rating.toFixed(1)}</span>
    </div>`).join("");
  const season = (perf.season || []).map((s) => `<div class="pm-stat"><b>${escapeHtml(String(s.value))}</b><span>${escapeHtml(s.label)}</span></div>`).join("");
  return `
    <div class="pm-momentum">
      <div class="pm-momentum-left">
        <span class="pm-momentum-ico">${perf.momentumIcon || "📊"}</span>
        <div>
          <div class="pm-momentum-label">${escapeHtml(perf.momentum || "Form")}</div>
          <div class="pm-momentum-sub">Avg rating ${Number(perf.recentAvg || 0).toFixed(1)} · last 7</div>
        </div>
      </div>
      <div class="pm-record">
        <span class="pm-rec w">${rec.wins}W</span>
        <span class="pm-rec d">${rec.draws}D</span>
        <span class="pm-rec l">${rec.losses}L</span>
      </div>
    </div>
    <div class="pm-spark-wrap">${sparkline(perf.trend || [])}<div class="pm-heat-row">${heat}</div></div>
    <h4 class="pm-form-h">Recent matches</h4>
    <div class="pm-games">${games || "<p class='section-sub'>No recent matches.</p>"}</div>
    <h4 class="pm-form-h">This season</h4>
    <div class="pm-stats">${season || "<p class='section-sub'>No season data.</p>"}</div>`;
}
function handleFrom(url) {
  try {
    const parts = String(url).replace(/\/+$/, "").split("/");
    const last = parts[parts.length - 1];
    return last ? "@" + last : "link";
  } catch (_e) {
    return "link";
  }
}

/* ---------- watch-to-earn ---------- */
function openWatch(matchId) {
  const m = state.matches.find((x) => x.id === matchId);
  if (!m) return;
  state.watch = { matchId, seconds: 0, earned: 0, timer: null };
  renderWatch(m, 0, 0);
  $("watchModal").hidden = false;
  state.watch.timer = setInterval(() => tickWatch(m), 1000);
}
function renderWatch(m, seconds, earned) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  $("watchModalBody").innerHTML = `
    <button class="modal-close" data-wclose>✕</button>
    <div class="watch-screen">
      <span class="watch-live-dot">🔴 LIVE</span>
      <div>${escapeHtml(m.league)}</div>
      <div class="watch-score">${escapeHtml(m.home)} ${escapeHtml(m.scoreHome)} — ${escapeHtml(m.scoreAway)} ${escapeHtml(m.away)}</div>
      <div>${escapeHtml(m.clock)}</div>
    </div>
    <div class="watch-earn-live"><span>⏱️ Watching <b>${mm}:${ss}</b></span><span>Earned <b>${inr(earned)}</b></span></div>
    <p class="section-sub" style="margin:0">₹2 demo cashback per full minute (up to ₹50/day).</p>`;
  $("watchModalBody").querySelector("[data-wclose]").addEventListener("click", closeWatch);
}
async function tickWatch(m) {
  if (!state.watch) return;
  state.watch.seconds += 1;
  const s = state.watch.seconds;
  if (s % 60 === 0) {
    try {
      const r = await api("/api/wallet/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: state.userId, minutes: 1 }),
      });
      state.wallet = r.wallet;
      state.watch.earned += r.reward;
      updateWalletUI();
      if (r.reward > 0) toast(`+${inr(r.reward)} watch cashback!`);
      if (r.cappedToday) toast("Daily watch-to-earn cap reached (₹50).");
    } catch (_e) { /* ignore */ }
  }
  renderWatch(m, s, state.watch.earned);
}
function closeWatch() {
  if (state.watch && state.watch.timer) clearInterval(state.watch.timer);
  state.watch = null;
  $("watchModal").hidden = true;
}

/* ================= GAMES ================= */
async function loadGames() {
  if (!state.games.length) {
    const { games, pointsPerRupee } = await api("/api/games");
    state.games = games;
    state.pointsPerRupee = pointsPerRupee;
    renderGameGrid();
  }
  await refreshWallet();
  loadLeaderboard();
  loadCheckin();
  loadAchievements();
  loadTrivia();
}
async function loadLeaderboard() {
  const list = $("lbList");
  if (!list) return;
  list.innerHTML = `<div class="pm-form-loading">Loading rankings…</div>`;
  try {
    const uid = state.userId ? `?userId=${encodeURIComponent(state.userId)}` : "";
    const d = await api(`/api/leaderboard${uid}`);
    const medal = (r) => (r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : `#${r}`);
    list.innerHTML = (d.top || [])
      .map(
        (r) => `
      <div class="lb-row ${r.you ? "you" : ""} ${r.rank <= 3 ? "podium" : ""}">
        <span class="lb-rank">${medal(r.rank)}</span>
        <span class="lb-avatar">${initials(r.name)}</span>
        <div class="lb-info">
          <div class="lb-name">${escapeHtml(r.name)}${r.you ? ' <span class="lb-tag">You</span>' : ""}</div>
          <div class="lb-games">${r.games} games played</div>
        </div>
        <div class="lb-points"><b>${r.points.toLocaleString()}</b><span>pts · ₹${r.rupees}</span></div>
      </div>`
      )
      .join("");
    const you = $("lbYou");
    if (d.me && d.me.rank > 15) {
      you.hidden = false;
      you.innerHTML = `
        <div class="lb-row you">
          <span class="lb-rank">#${d.me.rank}</span>
          <span class="lb-avatar">${initials(d.me.name)}</span>
          <div class="lb-info"><div class="lb-name">${escapeHtml(d.me.name)} <span class="lb-tag">You</span></div><div class="lb-games">${d.me.games} games played</div></div>
          <div class="lb-points"><b>${d.me.points.toLocaleString()}</b><span>pts · ₹${d.me.rupees}</span></div>
        </div>`;
    } else {
      you.hidden = true;
    }
  } catch (e) {
    list.innerHTML = `<p class="section-sub" style="text-align:center;padding:1rem">Couldn't load leaderboard.</p>`;
  }
}
async function loadCheckin() {
  const card = $("checkinCard");
  if (!card) return;
  try {
    const uid = state.userId ? `?userId=${encodeURIComponent(state.userId)}` : "";
    const d = await api(`/api/checkin${uid}`);
    renderCheckin(d);
  } catch (e) {
    card.hidden = true;
  }
}
function renderCheckin(d) {
  const card = $("checkinCard");
  if (!card) return;
  card.hidden = false;
  const rewards = d.rewards || [];
  $("checkinDays").innerHTML = rewards
    .map((pts, i) => {
      const done = i < d.todayIndex || (d.claimedToday && i === d.todayIndex);
      const isToday = i === d.todayIndex;
      const cls = done ? "done" : isToday && d.canClaim ? "today" : "locked";
      const mark = done ? "✓" : `+${pts}`;
      return `<div class="ci-day ${cls} ${i === 6 ? "jackpot" : ""}">
        <span class="ci-day-n">Day ${i + 1}</span>
        <span class="ci-day-pts">${mark}</span>
      </div>`;
    })
    .join("");
  const flame = $("checkinFlame");
  if (flame) flame.innerHTML = `🔥 <b>${d.streak || 0}</b>`;
  const btn = $("checkinBtn");
  const sub = $("checkinSub");
  if (d.claimedToday) {
    btn.disabled = true;
    btn.textContent = "✓ Checked in today — come back tomorrow";
    if (sub) sub.textContent = `You're on a ${d.streak}-day streak. Keep it alive for the day-7 jackpot!`;
  } else {
    btn.disabled = false;
    btn.textContent = `Claim +${d.todayReward} points`;
    if (sub) sub.textContent = "Check in every day for bonus points — the streak grows all week!";
  }
}
async function claimCheckin() {
  const btn = $("checkinBtn");
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  try {
    const d = await api("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: state.userId || "guest" }),
    });
    if (d.wallet) {
      state.wallet = d.wallet;
      updatePointsUI();
      updateWalletUI();
    }
    renderCheckin(d);
    if (d.already) {
      toast("You already checked in today.");
    } else {
      toast(`🎁 +${d.reward} points! 🔥 ${d.streak}-day streak`);
      loadLeaderboard();
      loadAchievements();
    }
  } catch (e) {
    btn.disabled = false;
    toast("Couldn't check in. Try again.");
  }
}
async function loadAchievements() {
  const wrap = $("achievements");
  if (!wrap) return;
  try {
    const uid = state.userId ? `?userId=${encodeURIComponent(state.userId)}` : "";
    const d = await api(`/api/achievements${uid}`);
    renderAchievements(d);
  } catch (e) {
    wrap.hidden = true;
  }
}
function renderAchievements(d) {
  const wrap = $("achievements");
  if (!wrap) return;
  wrap.hidden = false;
  const prev = state._achUnlocked || new Set();
  const now = new Set();
  const cnt = $("achCount");
  if (cnt) cnt.textContent = `${d.unlockedCount}/${d.total}`;
  $("achGrid").innerHTML = (d.achievements || [])
    .map((a) => {
      if (a.unlocked) now.add(a.id);
      const bar = a.unlocked
        ? ""
        : `<div class="ach-bar"><span style="width:${a.pct}%"></span></div>
           <div class="ach-prog">${Math.min(a.value, a.target)} / ${a.target}</div>`;
      return `<div class="ach-badge ${a.unlocked ? "on" : "off"}" title="${escapeHtml(a.desc)}">
        <div class="ach-ico">${a.icon}</div>
        <div class="ach-name">${escapeHtml(a.name)}</div>
        <div class="ach-desc">${escapeHtml(a.desc)}</div>
        ${bar}
      </div>`;
    })
    .join("");
  // Celebrate any newly-unlocked badge (only after the first load).
  if (state._achUnlocked) {
    for (const a of d.achievements) {
      if (a.unlocked && !prev.has(a.id)) toast(`${a.icon} Achievement unlocked: ${a.name}!`);
    }
  }
  state._achUnlocked = now;
}
async function loadTrivia() {
  const card = $("triviaCard");
  if (!card) return;
  try {
    const uid = state.userId ? `?userId=${encodeURIComponent(state.userId)}` : "";
    const d = await api(`/api/trivia${uid}`);
    renderTrivia(d);
  } catch (e) {
    card.hidden = true;
  }
}
function renderTrivia(d) {
  const card = $("triviaCard");
  if (!card) return;
  card.hidden = false;
  const streak = $("triviaStreak");
  if (streak) streak.innerHTML = `🔥 <b>${d.streak || 0}</b>`;
  $("triviaQ").textContent = d.question.q;
  const opts = $("triviaOpts");
  const result = $("triviaResult");
  const answered = d.answeredToday;
  opts.innerHTML = d.question.options
    .map((o, i) => {
      let cls = "trivia-opt";
      if (answered) {
        cls += " done";
        if (i === d.correctIndex) cls += " correct";
      }
      return `<button class="${cls}" data-choice="${i}" ${answered ? "disabled" : ""}>${escapeHtml(o)}</button>`;
    })
    .join("");
  if (!answered) {
    opts.querySelectorAll("[data-choice]").forEach((b) =>
      b.addEventListener("click", () => answerTrivia(Number(b.getAttribute("data-choice"))))
    );
  }
  const sub = $("triviaSub");
  if (answered) {
    result.hidden = false;
    result.className = "trivia-result " + (d.lastCorrect ? "win" : "lose");
    result.textContent = d.lastCorrect
      ? `✅ Correct! You're on a ${d.streak}-day streak. Best: ${d.best}.`
      : `❌ Not quite — the right answer is highlighted. Come back tomorrow!`;
    if (sub) sub.textContent = `Best streak: ${d.best} days. New question every day.`;
  } else {
    result.hidden = true;
    if (sub) sub.textContent = `Answer correctly for +${d.nextReward} points and grow your streak!`;
  }
}
async function answerTrivia(choice) {
  const opts = $("triviaOpts");
  opts.querySelectorAll("[data-choice]").forEach((b) => (b.disabled = true));
  try {
    const d = await api("/api/trivia/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: state.userId || "guest", choice }),
    });
    if (d.wallet) {
      state.wallet = d.wallet;
      updatePointsUI();
      updateWalletUI();
    }
    renderTrivia(d);
    if (d.already) {
      toast("You already answered today's question.");
    } else if (d.correct) {
      toast(`🧠 Correct! +${d.reward} points · 🔥 ${d.streak}-day streak`);
      loadLeaderboard();
      loadAchievements();
    } else {
      toast("❌ Wrong answer — streak reset. Try again tomorrow!");
    }
  } catch (e) {
    opts.querySelectorAll("[data-choice]").forEach((b) => (b.disabled = false));
    toast("Couldn't submit answer. Try again.");
  }
}
function renderGameGrid() {
  const grid = $("gameGrid");
  grid.innerHTML = state.games
    .map((g) => `
      <div class="game-card" data-game="${g.id}" style="--gc:${g.color}">
        <span class="game-max">up to ${g.maxPoints} pts</span>
        <div class="game-ico">${g.icon}</div>
        <h4>${escapeHtml(g.name)}</h4>
        <div class="game-tagline">${escapeHtml(g.tagline)}</div>
        <span class="game-play">Play now ▶</span>
      </div>`)
    .join("");
  grid.querySelectorAll("[data-game]").forEach((c) =>
    c.addEventListener("click", () => openGame(c.getAttribute("data-game")))
  );
}
function updatePointsUI() {
  const w = state.wallet;
  if (!w) return;
  const rupee = Math.floor((w.points || 0) / state.pointsPerRupee);
  $("pointsBalance").textContent = w.points || 0;
  if ($("gamesPointsBig")) {
    $("gamesPointsBig").textContent = w.points || 0;
    $("pointsRupee").textContent = inr(rupee);
    $("streakLabel").textContent = `🔥 ${w.streakDays || 1}-day streak`;
  }
}
function openGame(gameId) {
  const g = state.games.find((x) => x.id === gameId);
  if (!g) return;
  state.game = { id: gameId, def: g };
  $("gameModal").hidden = false;
  renderGameIntro(g);
}
function gameShell(g, inner) {
  return `
    <button class="modal-close" data-gclose>✕</button>
    <div class="game-modal-head">
      <span class="game-modal-ico">${g.icon}</span>
      <div><h3>${escapeHtml(g.name)}</h3><div class="section-sub">${escapeHtml(g.how)}</div></div>
    </div>
    ${inner}`;
}
function bindGameClose() {
  const btn = $("gameModalBody").querySelector("[data-gclose]");
  if (btn) btn.addEventListener("click", closeGame);
}
function closeGame() {
  if (state.game && state.game.cleanup) state.game.cleanup();
  state.game = null;
  $("gameModal").hidden = true;
}
function renderGameIntro(g) {
  $("gameModalBody").innerHTML = gameShell(g, `
    <div class="game-stage">
      <div style="font-size:3rem">${g.icon}</div>
      <p class="section-sub" style="max-width:34ch">${escapeHtml(g.how)}</p>
      <button class="btn btn-primary" id="gameStartBtn">Start game</button>
    </div>`);
  bindGameClose();
  $("gameStartBtn").addEventListener("click", () => startGame(g.id));
}
function startGame(id) {
  if (id === "reaction") return startReaction();
  if (id === "quiz") return startQuiz();
  if (id === "target") return startTarget();
  if (id === "streak") return startStreak();
  if (id === "penalty") return startPenalty();
  if (id === "memory") return startMemory();
  if (id === "higherlower") return startHigherLower();
}
async function finishGame(gameId, score, summaryHtml) {
  let result = { pointsEarned: 0, rupeeValue: 0, streakDays: 1 };
  try {
    result = await api("/api/games/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: state.userId, gameId, score }),
    });
    state.wallet = result.wallet;
    updateWalletUI();
    loadLeaderboard();
    loadAchievements();
  } catch (_e) { /* ignore */ }
  const g = state.games.find((x) => x.id === gameId) || { icon: "🎮", name: "Game" };
  $("gameModalBody").innerHTML = gameShell(g, `
    <div class="game-stage">
      <div class="game-result">
        ${summaryHtml || ""}
        <div class="gr-points">+${result.pointsEarned} pts</div>
        <p class="section-sub">≈ ${inr(result.rupeeValue || 0)} · 🔥 ${result.streakDays}-day streak${result.cappedToday ? " · daily cap reached" : ""}</p>
        <div style="display:flex;gap:.6rem;justify-content:center;margin-top:1rem">
          <button class="btn btn-ghost" id="gameAgainBtn">Play again</button>
          <button class="btn btn-primary" id="gameDoneBtn">Done</button>
        </div>
      </div>
    </div>`);
  bindGameClose();
  $("gameAgainBtn").addEventListener("click", () => renderGameIntro(g));
  $("gameDoneBtn").addEventListener("click", closeGame);
  if (result.pointsEarned > 0) toast(`+${result.pointsEarned} points earned!`);
}

/* --- Game 1: Reaction Rush --- */
function startReaction() {
  const g = state.game.def;
  $("gameModalBody").innerHTML = gameShell(g, `<div class="game-stage" style="padding:0"><div class="reaction-pad reaction-wait" id="reactPad">Wait for green…</div></div>`);
  bindGameClose();
  const pad = $("reactPad");
  let ready = false, startTs = 0, timer = null;
  const wait = 1200 + Math.random() * 2600;
  timer = setTimeout(() => {
    ready = true;
    startTs = performance.now();
    pad.className = "reaction-pad reaction-go";
    pad.textContent = "TAP NOW!";
  }, wait);
  state.game.cleanup = () => clearTimeout(timer);
  pad.addEventListener("click", () => {
    if (!ready) {
      clearTimeout(timer);
      pad.className = "reaction-pad reaction-early";
      pad.textContent = "Too early! 0 pts";
      setTimeout(() => finishGame("reaction", 0, `<p>⏱️ Jumped the gun.</p>`), 900);
      return;
    }
    const ms = Math.round(performance.now() - startTs);
    // faster = more points; 300 max at ~120ms, 0 at ~700ms
    const score = Math.max(0, Math.min(300, Math.round(300 - (ms - 120) * 0.6)));
    finishGame("reaction", score, `<p>⚡ ${ms} ms reaction</p>`);
  });
}

/* --- Game 2: Sports IQ quiz --- */
async function startQuiz() {
  const g = state.game.def;
  let questions = [];
  let qids = [];
  try {
    const r = await api("/api/games/quiz");
    questions = r.questions;
    qids = r.qids || [];
  } catch (_e) {
    return finishGame("quiz", 0, `<p>Couldn't load questions.</p>`);
  }
  const answers = [];
  let idx = 0;
  function renderQ() {
    const q = questions[idx];
    $("gameModalBody").innerHTML = gameShell(g, `
      <div class="game-stage" style="align-items:stretch">
        <div class="quiz-progress">Question ${idx + 1} of ${questions.length}</div>
        <div class="quiz-q">${escapeHtml(q.q)}</div>
        <div class="quiz-opts">${q.options.map((o, i) => `<button class="quiz-opt" data-opt="${i}">${escapeHtml(o)}</button>`).join("")}</div>
      </div>`);
    bindGameClose();
    $("gameModalBody").querySelectorAll("[data-opt]").forEach((b) =>
      b.addEventListener("click", () => {
        answers[idx] = Number(b.getAttribute("data-opt"));
        idx += 1;
        if (idx < questions.length) renderQ();
        else submitQuiz();
      })
    );
  }
  async function submitQuiz() {
    let scoreData = { correct: 0, total: questions.length, score: 0 };
    try {
      scoreData = await api("/api/games/quiz/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, qids }),
      });
    } catch (_e) { /* ignore */ }
    finishGame("quiz", scoreData.score, `<p>🧠 ${scoreData.correct}/${scoreData.total} correct</p>`);
  }
  renderQ();
}

/* --- Game 3: Target Blitz --- */
function startTarget() {
  const g = state.game.def;
  $("gameModalBody").innerHTML = gameShell(g, `
    <div class="game-stage" style="padding:0">
      <div class="target-area" id="targetArea">
        <div class="target-hud"><span id="tgtScore">Hits: 0</span><span id="tgtTime">20s</span></div>
      </div>
    </div>`);
  bindGameClose();
  const area = $("targetArea");
  let hits = 0, time = 20, dot = null, moveTimer = null, countdown = null;
  function place() {
    if (dot) dot.remove();
    dot = document.createElement("div");
    dot.className = "target-dot";
    const w = area.clientWidth - 48, h = area.clientHeight - 60;
    dot.style.left = Math.max(4, Math.random() * w) + "px";
    dot.style.top = Math.max(44, 44 + Math.random() * (h - 44)) + "px";
    dot.addEventListener("click", (e) => {
      e.stopPropagation();
      hits += 1;
      $("tgtScore").textContent = "Hits: " + hits;
      place();
    });
    area.appendChild(dot);
  }
  place();
  moveTimer = setInterval(place, 1100);
  countdown = setInterval(() => {
    time -= 1;
    $("tgtTime").textContent = time + "s";
    if (time <= 0) {
      clearInterval(moveTimer);
      clearInterval(countdown);
      finishGame("target", hits * 20, `<p>🎯 ${hits} targets hit</p>`);
    }
  }, 1000);
  state.game.cleanup = () => { clearInterval(moveTimer); clearInterval(countdown); };
}

/* --- Game 4: Score Streak (memory sequence) --- */
function startStreak() {
  const g = state.game.def;
  const seq = [];
  let input = [];
  let showing = true;
  function newRound() {
    seq.push(Math.floor(Math.random() * 4));
    input = [];
    renderBoard();
    flashSequence();
  }
  function renderBoard() {
    $("gameModalBody").innerHTML = gameShell(g, `
      <div class="game-stage">
        <div class="quiz-progress" id="seqInfo">Watch the sequence… (round ${seq.length})</div>
        <div class="seq-grid">
          ${[0, 1, 2, 3].map((i) => `<button class="seq-cell" data-cell="${i}"></button>`).join("")}
        </div>
      </div>`);
    bindGameClose();
    $("gameModalBody").querySelectorAll("[data-cell]").forEach((c) =>
      c.addEventListener("click", () => onCell(Number(c.getAttribute("data-cell"))))
    );
  }
  function flashSequence() {
    showing = true;
    const cells = $("gameModalBody").querySelectorAll("[data-cell]");
    let i = 0;
    const t = setInterval(() => {
      cells.forEach((c) => (c.className = "seq-cell"));
      if (i > 0) {
        // brief gap handled by class reset
      }
      if (i < seq.length) {
        const cell = cells[seq[i]];
        cell.className = `seq-cell on c${seq[i]}`;
        i += 1;
      } else {
        clearInterval(t);
        setTimeout(() => {
          cells.forEach((c) => (c.className = "seq-cell"));
          showing = false;
          $("seqInfo").textContent = `Your turn — repeat ${seq.length} step(s)`;
        }, 400);
      }
    }, 650);
    state.game.cleanup = () => clearInterval(t);
  }
  function onCell(i) {
    if (showing) return;
    input.push(i);
    const cells = $("gameModalBody").querySelectorAll("[data-cell]");
    cells[i].className = `seq-cell on c${i}`;
    setTimeout(() => (cells[i].className = "seq-cell"), 200);
    const pos = input.length - 1;
    if (input[pos] !== seq[pos]) {
      const score = Math.max(0, (seq.length - 1) * 60);
      return finishGame("streak", Math.min(350, score), `<p>🃏 Reached round ${seq.length}</p>`);
    }
    if (input.length === seq.length) {
      if (seq.length >= 6) {
        return finishGame("streak", 350, `<p>🏆 Perfect! 6 rounds</p>`);
      }
      $("seqInfo").textContent = "Correct! Next round…";
      setTimeout(newRound, 700);
    }
  }
  newRound();
}

/* --- Game 5: Penalty Shootout --- */
function startPenalty() {
  const g = state.game.def;
  const corners = [
    { id: "L", label: "◀ Left" },
    { id: "C", label: "▲ Center" },
    { id: "R", label: "Right ▶" },
  ];
  let shot = 0, goals = 0;
  const total = 5;
  function renderShot(msg) {
    $("gameModalBody").innerHTML = gameShell(g, `
      <div class="game-stage">
        <div class="pk-scoreline">Shot ${Math.min(shot + 1, total)} / ${total} · ⚽ Goals: <b>${goals}</b></div>
        <div class="pk-goal">
          <div class="pk-keeper" id="pkKeeper">🧤</div>
          <div class="pk-net"></div>
        </div>
        <div class="pk-msg" id="pkMsg">${msg || "Pick your corner and beat the keeper!"}</div>
        <div class="pk-corners">
          ${corners.map((c) => `<button class="btn btn-primary pk-corner" data-c="${c.id}">${c.label}</button>`).join("")}
        </div>
      </div>`);
    bindGameClose();
    $("gameModalBody").querySelectorAll("[data-c]").forEach((b) =>
      b.addEventListener("click", () => takeShot(b.getAttribute("data-c")))
    );
  }
  function takeShot(pick) {
    const keeper = corners[Math.floor(Math.random() * corners.length)].id;
    const keeperEl = $("pkKeeper");
    keeperEl.style.transform = keeper === "L" ? "translateX(-90px)" : keeper === "R" ? "translateX(90px)" : "translateY(-10px)";
    const scored = pick !== keeper;
    if (scored) goals += 1;
    shot += 1;
    const msg = scored ? "⚽ GOAL! Back of the net." : "🧤 Saved! Keeper guessed right.";
    $("pkMsg").textContent = msg;
    $("gameModalBody").querySelectorAll("[data-c]").forEach((b) => (b.disabled = true));
    setTimeout(() => {
      if (shot >= total) finishGame("penalty", goals * 80, `<p>⚽ ${goals}/${total} scored</p>`);
      else renderShot(msg);
    }, 1100);
  }
  renderShot();
}

/* --- Game 6: Memory Match --- */
function startMemory() {
  const g = state.game.def;
  const icons = ["⚽", "🏏", "🏀", "🎾", "🏸", "🏑"];
  let deck = icons.concat(icons).sort(() => Math.random() - 0.5);
  let flipped = [], matched = [], moves = 0, lock = false;
  function render() {
    $("gameModalBody").innerHTML = gameShell(g, `
      <div class="game-stage">
        <div class="quiz-progress">Moves: <b id="memMoves">${moves}</b> · Matched: <b id="memMatched">${matched.length / 2}</b>/6</div>
        <div class="mem-grid">
          ${deck.map((ic, i) => {
            const shown = flipped.includes(i) || matched.includes(i);
            return `<button class="mem-card ${shown ? "flipped" : ""} ${matched.includes(i) ? "done" : ""}" data-i="${i}">${shown ? ic : "❓"}</button>`;
          }).join("")}
        </div>
      </div>`);
    bindGameClose();
    $("gameModalBody").querySelectorAll("[data-i]").forEach((b) =>
      b.addEventListener("click", () => flip(Number(b.getAttribute("data-i"))))
    );
  }
  function flip(i) {
    if (lock || flipped.includes(i) || matched.includes(i)) return;
    flipped.push(i);
    render();
    if (flipped.length === 2) {
      moves += 1;
      lock = true;
      const [a, b] = flipped;
      if (deck[a] === deck[b]) {
        matched.push(a, b);
        flipped = [];
        lock = false;
        render();
        if (matched.length === deck.length) {
          const score = Math.max(80, 400 - Math.max(0, moves - 6) * 25);
          setTimeout(() => finishGame("memory", score, `<p>🧩 Solved in ${moves} moves</p>`), 500);
        }
      } else {
        setTimeout(() => { flipped = []; lock = false; render(); }, 800);
      }
    }
  }
  render();
}

/* --- Game 7: Stat Attack (higher or lower) --- */
function startHigherLower() {
  const g = state.game.def;
  const bank = [
    { label: "Cristiano Ronaldo · Instagram followers", value: 640, unit: "M" },
    { label: "Lionel Messi · Instagram followers", value: 500, unit: "M" },
    { label: "Virat Kohli · Instagram followers", value: 271, unit: "M" },
    { label: "LeBron James · Instagram followers", value: 159, unit: "M" },
    { label: "Neymar Jr · Instagram followers", value: 225, unit: "M" },
    { label: "Kylian Mbappe · Instagram followers", value: 120, unit: "M" },
    { label: "Roger Federer · career titles", value: 103, unit: "" },
    { label: "Sachin Tendulkar · int'l centuries", value: 100, unit: "" },
    { label: "Michael Phelps · Olympic golds", value: 23, unit: "" },
    { label: "Usain Bolt · Olympic golds", value: 8, unit: "" },
    { label: "Tom Brady · Super Bowl wins", value: 7, unit: "" },
    { label: "Michael Jordan · NBA titles", value: 6, unit: "" },
  ];
  let pool = bank.slice().sort(() => Math.random() - 0.5);
  let cur = pool.pop();
  let streak = 0;
  function render(reveal) {
    const nxt = pool[pool.length - 1];
    $("gameModalBody").innerHTML = gameShell(g, `
      <div class="game-stage">
        <div class="quiz-progress">Correct in a row: <b>${streak}</b> · ${streak * 75} pts</div>
        <div class="hl-current">
          <div class="hl-label">${escapeHtml(cur.label)}</div>
          <div class="hl-value">${cur.value}${cur.unit}</div>
        </div>
        <div class="hl-vs">vs</div>
        <div class="hl-next">
          <div class="hl-label">${nxt ? escapeHtml(nxt.label) : "—"}</div>
          <div class="hl-value">${reveal && nxt ? nxt.value + nxt.unit : "❓"}</div>
        </div>
        <div class="hl-controls">
          <button class="btn btn-primary" data-guess="higher">⬆ Higher</button>
          <button class="btn btn-ghost" data-guess="lower">⬇ Lower</button>
        </div>
      </div>`);
    bindGameClose();
    $("gameModalBody").querySelectorAll("[data-guess]").forEach((b) =>
      b.addEventListener("click", () => guess(b.getAttribute("data-guess")))
    );
  }
  function guess(dir) {
    const nxt = pool.pop();
    if (!nxt) return finishGame("higherlower", streak * 75, `<p>📈 ${streak} in a row</p>`);
    const correct = dir === "higher" ? nxt.value >= cur.value : nxt.value <= cur.value;
    render(true);
    if (correct) {
      streak += 1;
      cur = nxt;
      if (!pool.length || streak >= 6) {
        return setTimeout(() => finishGame("higherlower", Math.min(450, streak * 75), `<p>📈 ${streak} in a row</p>`), 700);
      }
      setTimeout(() => render(false), 700);
    } else {
      setTimeout(() => finishGame("higherlower", streak * 75, `<p>📈 ${streak} in a row · next was ${nxt.value}${nxt.unit}</p>`), 900);
    }
  }
  render(false);
}

/* ---------- wallet ---------- */
async function refreshWallet() {
  try {
    state.wallet = await api(`/api/wallet?userId=${encodeURIComponent(state.userId)}`);
    updateWalletUI();
  } catch (_e) { /* ignore */ }
}
async function loadStats() {
  const card = $("statsCard");
  if (!card) return;
  try {
    const d = await api(`/api/stats?userId=${encodeURIComponent(state.userId)}`);
    renderStats(d);
  } catch (e) {
    card.hidden = true;
  }
}
function renderStats(d) {
  const card = $("statsCard");
  if (!card) return;
  card.hidden = false;
  const rankEl = $("statsRank");
  if (rankEl) rankEl.textContent = `Rank #${d.rank} of ${d.totalPlayers}`;
  const tiles = [
    { icon: "🏅", label: "Points", value: d.points.toLocaleString(), sub: `≈ ₹${d.rupees}` },
    { icon: "🎮", label: "Games played", value: d.gamesPlayed, sub: "keep playing!" },
    { icon: "🎁", label: "Check-in streak", value: `${d.checkinStreak}d`, sub: "daily reward" },
    { icon: "🧠", label: "Trivia streak", value: `${d.triviaStreak}d`, sub: `best ${d.triviaBest}d` },
    { icon: "🏆", label: "Badges", value: `${d.badgesUnlocked}/${d.badgesTotal}`, sub: "unlocked" },
    { icon: "💰", label: "Wallet", value: `₹${d.balance.toLocaleString()}`, sub: "balance" },
  ];
  $("statsGrid").innerHTML = tiles
    .map(
      (t) => `<div class="stat-tile">
        <div class="stat-ico">${t.icon}</div>
        <div class="stat-val">${t.value}</div>
        <div class="stat-label">${t.label}</div>
        <div class="stat-sub">${escapeHtml(String(t.sub))}</div>
      </div>`
    )
    .join("");
}
function updateWalletUI() {
  const w = state.wallet;
  if (!w) return;
  $("walletBalance").textContent = inr(w.balance);
  updatePointsUI();
  if ($("walletBigBalance")) {
    $("walletBigBalance").textContent = inr(w.balance);
    $("cashbackEarned").textContent = inr(w.cashbackEarned);
    $("walletPoints").textContent = w.points || 0;
    $("walletUserId").textContent = state.userId;
    const earnedToday = (w.watchMinutesToday || 0) * 2;
    const pct = Math.min(100, (earnedToday / 50) * 100);
    $("watchBarFill").style.width = pct + "%";
    $("watchProgressText").textContent = `${inr(earnedToday)} / ₹50 today`;
    renderTxns(w.transactions || []);
  }
}
function txnIcon(type) {
  return ({ BONUS: "🎁", ADD: "➕", PAY: "💳", CASHBACK: "💰", TRANSFER: "🔁", RECEIVE: "📥", WATCH_REWARD: "🎬", GAME_POINTS: "🎮", REDEEM: "🏅" }[type] || "•");
}
function renderTxns(txns) {
  const el = $("txnList");
  if (!txns.length) {
    el.innerHTML = `<p class="section-sub">No activity yet.</p>`;
    return;
  }
  el.innerHTML = txns
    .map((t) => {
      const pos = t.amount >= 0;
      const amt = t.type === "GAME_POINTS" ? "" : `<div class="txn-amt ${pos ? "pos" : "neg"}">${pos ? "+" : ""}${inr(t.amount)}</div>`;
      return `
      <div class="txn">
        <div class="txn-left">
          <div class="txn-ico">${txnIcon(t.type)}</div>
          <div><div class="txn-note">${escapeHtml(t.note)}</div><div class="txn-at">${timeAgo(t.at)}</div></div>
        </div>
        ${amt}
      </div>`;
    })
    .join("");
}
function walletMsg(text, ok) {
  const el = $("walletMsg");
  el.textContent = text;
  el.className = "wallet-msg " + (ok ? "ok" : "err");
}

/* ---------- spend categories + pay modal ---------- */
async function loadSpendCats() {
  try {
    const { categories } = await api("/api/wallet/categories");
    state.spendCats = categories;
    const el = $("spendCats");
    el.innerHTML = categories
      .map((c) => `
        <div class="spend-cat" data-cat="${c.id}">
          <div class="spend-cat-ico">${c.icon}</div>
          <div class="spend-cat-name">${escapeHtml(c.name)}</div>
          <div class="spend-cat-sub">${c.merchants.length} places</div>
        </div>`)
      .join("");
    el.querySelectorAll("[data-cat]").forEach((c) =>
      c.addEventListener("click", () => openPay(c.getAttribute("data-cat")))
    );
  } catch (_e) { /* ignore */ }
}
function openPay(catId) {
  const cat = (state.spendCats || []).find((c) => c.id === catId);
  if (!cat) return;
  let selected = cat.merchants[0];
  const payMethods = ["Wallet Balance", "UPI", "Credit Card", "Debit Card", "Net Banking"];
  const upiApps = [
    { id: "gpay", name: "Google Pay", icon: "🟢" },
    { id: "phonepe", name: "PhonePe", icon: "🟣" },
    { id: "paytm", name: "Paytm", icon: "🔵" },
    { id: "bhim", name: "BHIM UPI", icon: "🟠" },
    { id: "amazonpay", name: "Amazon Pay", icon: "🟡" },
  ];
  let selectedUpi = upiApps[0].name;
  $("payModalBody").innerHTML = `
    <button class="modal-close" data-payclose>✕</button>
    <div class="game-modal-head"><span class="game-modal-ico">${cat.icon}</span><div><h3>${escapeHtml(cat.name)}</h3><div class="section-sub">Pay a merchant · 2% cashback</div></div></div>
    <p class="section-sub" style="margin-bottom:.4rem">Choose merchant</p>
    <div class="pay-merchants" id="payMerchants">
      ${cat.merchants.map((m, i) => `<button class="pay-merchant ${i === 0 ? "active" : ""}" data-m="${escapeHtml(m)}">${escapeHtml(m)}</button>`).join("")}
    </div>
    <form id="payForm">
      <label class="pay-field-label">Pay with</label>
      <select id="payMethod" class="pay-select">
        ${payMethods.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("")}
      </select>
      <div class="pay-upi" id="payUpiRow">
        <label class="pay-field-label">Choose UPI app</label>
        <div class="pay-upi-apps" id="payUpiApps">
          ${upiApps.map((a, i) => `<button type="button" class="pay-upi-app ${i === 0 ? "active" : ""}" data-upi="${escapeHtml(a.name)}"><span>${a.icon}</span>${escapeHtml(a.name)}</button>`).join("")}
        </div>
      </div>
      <input id="payAmount" type="number" min="1" placeholder="Amount (₹)" class="pay-amount-input" />
      <div class="pay-quick" id="payQuick">
        ${[100, 250, 500, 1000].map((v) => `<button type="button" class="pay-chip" data-amt="${v}">₹${v}</button>`).join("")}
      </div>
      <button class="btn btn-primary btn-block" type="submit">Pay now</button>
    </form>
    <div id="payMsg" class="wallet-msg"></div>`;
  $("payModal").hidden = false;
  $("payModalBody").querySelector("[data-payclose]").addEventListener("click", () => ($("payModal").hidden = true));
  $("payMerchants").querySelectorAll("[data-m]").forEach((b) =>
    b.addEventListener("click", () => {
      selected = b.getAttribute("data-m");
      $("payMerchants").querySelectorAll(".pay-merchant").forEach((x) => x.classList.toggle("active", x === b));
    })
  );
  const upiRow = $("payUpiRow");
  const syncUpiRow = () => { upiRow.style.display = $("payMethod").value === "UPI" ? "block" : "none"; };
  syncUpiRow();
  $("payMethod").addEventListener("change", syncUpiRow);
  $("payUpiApps").querySelectorAll("[data-upi]").forEach((b) =>
    b.addEventListener("click", () => {
      selectedUpi = b.getAttribute("data-upi");
      $("payUpiApps").querySelectorAll(".pay-upi-app").forEach((x) => x.classList.toggle("active", x === b));
    })
  );
  $("payQuick").querySelectorAll("[data-amt]").forEach((b) =>
    b.addEventListener("click", () => { $("payAmount").value = b.getAttribute("data-amt"); })
  );
  $("payForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const amount = Number($("payAmount").value);
    const rawMethod = $("payMethod").value;
    const method = rawMethod === "UPI" ? `UPI · ${selectedUpi}` : rawMethod;
    const msg = $("payMsg");
    if (!amount || amount <= 0) { msg.textContent = "Enter a valid amount."; msg.className = "wallet-msg err"; return; }
    try {
      const r = await api("/api/wallet/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: state.userId, amount, to: selected, category: catId, method }),
      });
      state.wallet = r.wallet;
      updateWalletUI();
      msg.textContent = `Paid ${inr(amount)} to ${selected} via ${method}${r.cashback ? ` · +${inr(r.cashback)} cashback` : ""}.`;
      msg.className = "wallet-msg ok";
      toast(`Paid ${inr(amount)} to ${selected}`);
      setTimeout(() => ($("payModal").hidden = true), 1300);
    } catch (err) {
      msg.textContent = err.message;
      msg.className = "wallet-msg err";
    }
  });
}

/* ---------- geolocation + theme ---------- */
function useLocation() {
  if (!navigator.geolocation) return toast("Geolocation not supported.");
  $("geoNote").textContent = "Finding you…";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.geo = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      $("geoNote").textContent = "📍 Sorted by nearest & live.";
      loadMatches();
    },
    () => {
      $("geoNote").textContent = "Location denied — showing all.";
      toast("Couldn't get your location.");
    }
  );
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("ss_theme", next);
  $("themeBtn").textContent = next === "dark" ? "☀️" : "🌙";
}

/* ---------- auth / account ---------- */
let authMode = "login";
function updateAccountUI() {
  const btn = $("accountName");
  const av = $("accountAvatar");
  if (state.authed) {
    btn.textContent = state.name || state.userId;
    av.textContent = initials(state.name || state.userId);
    av.classList.remove("guest");
  } else {
    btn.textContent = "Sign in";
    av.textContent = "?";
    av.classList.add("guest");
  }
  const wu = $("walletUserId");
  if (wu) wu.textContent = state.authed ? "@" + state.userId : "guest";
}
function openAuth(mode) {
  setAuthMode(mode || "login");
  $("authMsg").textContent = "";
  $("authMsg").className = "auth-msg";
  $("authForm").reset();
  $("authOverlay").hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => $("authUser").focus(), 60);
}
function closeAuth() {
  $("authOverlay").hidden = true;
  document.body.style.overflow = "";
}
function setAuthMode(mode) {
  authMode = mode;
  const isReg = mode === "register";
  document.querySelectorAll(".auth-tab").forEach((t) =>
    t.classList.toggle("active", t.getAttribute("data-auth-tab") === mode)
  );
  $("authSlider").style.transform = isReg ? "translateX(100%)" : "translateX(0)";
  $("authNameField").hidden = !isReg;
  $("authSubmit").textContent = isReg ? "Create account" : "Log in";
  $("authSwitchText").textContent = isReg ? "Already have an account?" : "New here?";
  $("authSwitch").textContent = isReg ? "Log in instead" : "Create an account";
  $("authPass").setAttribute("autocomplete", isReg ? "new-password" : "current-password");
  $("authMsg").textContent = "";
  $("authMsg").className = "auth-msg";
}
function authMsg(text, ok) {
  const el = $("authMsg");
  el.textContent = text;
  el.className = "auth-msg " + (ok ? "ok" : "err");
}
async function submitAuth() {
  const username = $("authUser").value.trim();
  const password = $("authPass").value;
  const name = $("authName").value.trim();
  if (!username || !password) return authMsg("Enter a username and password.", false);
  const btn = $("authSubmit");
  btn.disabled = true;
  btn.classList.add("loading");
  try {
    const path = authMode === "register" ? "/api/auth/register" : "/api/auth/login";
    const r = await api(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, name }),
    });
    state.userId = r.userId;
    state.name = r.name || r.userId;
    state.authed = true;
    localStorage.setItem("ss_user", state.userId);
    localStorage.setItem("ss_name", state.name);
    localStorage.setItem("ss_authed", "1");
    if (r.favSport) {
      state.favSport = r.favSport;
      localStorage.setItem("ss_fav", r.favSport);
    }
    updateAccountUI();
    applyFavSport();
    closeAuth();
    await refreshWallet();
    toast(authMode === "register" ? `Welcome, ${state.name}! 🎉` : `Welcome back, ${state.name}!`);
  } catch (err) {
    authMsg(err.message, false);
  } finally {
    btn.disabled = false;
    btn.classList.remove("loading");
  }
}
function logout() {
  state.authed = false;
  state.userId = "guest";
  state.name = "Guest";
  state.favSport = "all";
  localStorage.removeItem("ss_authed");
  localStorage.removeItem("ss_fav");
  localStorage.setItem("ss_user", "guest");
  localStorage.setItem("ss_name", "Guest");
  $("accountMenu").hidden = true;
  updateAccountUI();
  refreshWallet();
  toast("Logged out.");
}
function toggleAccountMenu() {
  if (!state.authed) return openAuth("login");
  const menu = $("accountMenu");
  const open = menu.hidden;
  if (open) {
    $("menuAvatar").textContent = initials(state.name || state.userId);
    $("menuName").textContent = state.name || state.userId;
    $("menuHandle").textContent = "@" + state.userId;
  }
  menu.hidden = !open;
}

/* Pre-select the user's favourite sport in the Live feed. */
function applyFavSport() {
  const fav = state.favSport || "all";
  if (!state.sports.length) return;
  if (fav !== "all" && !state.sports.some((s) => s.id === fav)) return;
  state.filters.sport = fav;
  const chips = $("sportChips");
  if (chips) {
    chips.querySelectorAll(".chip").forEach((c) =>
      c.classList.toggle("active", c.getAttribute("data-chip") === fav)
    );
  }
  loadMatches();
}

/* ---------- profile editor ---------- */
function openProfile() {
  $("accountMenu").hidden = true;
  const sportOpts = [{ id: "all", name: "No preference", icon: "🌐" }, ...state.sports]
    .map((s) => `<option value="${s.id}" ${s.id === (state.favSport || "all") ? "selected" : ""}>${s.icon} ${escapeHtml(s.name)}</option>`)
    .join("");
  $("profileModalBody").innerHTML = `
    <button class="modal-close" id="profileClose">✕</button>
    <div class="profile-head">
      <span class="account-avatar lg">${initials(state.name || state.userId)}</span>
      <div>
        <div class="profile-name">${escapeHtml(state.name || state.userId)}</div>
        <div class="profile-handle">@${escapeHtml(state.userId)}</div>
      </div>
    </div>
    <form id="profileForm" class="profile-form" autocomplete="off">
      <label class="profile-label">Display name</label>
      <input id="profName" type="text" maxlength="40" value="${escapeHtml(state.name || "")}" placeholder="Your name" />
      <label class="profile-label">Favourite sport</label>
      <select id="profFav" class="pay-select">${sportOpts}</select>
      <label class="profile-label">New password <span class="profile-dim">(optional)</span></label>
      <input id="profPass" type="password" maxlength="60" placeholder="Leave blank to keep current" autocomplete="new-password" />
      <div class="wallet-msg" id="profileMsg"></div>
      <button class="btn btn-primary btn-block" type="submit">Save changes</button>
    </form>`;
  $("profileModal").hidden = false;
  $("profileClose").addEventListener("click", () => ($("profileModal").hidden = true));
  $("profileForm").addEventListener("submit", submitProfile);
}
async function submitProfile(e) {
  e.preventDefault();
  const name = $("profName").value.trim();
  const favSport = $("profFav").value;
  const newPassword = $("profPass").value;
  const msg = $("profileMsg");
  try {
    const r = await api("/api/auth/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: state.userId, name, favSport, newPassword }),
    });
    state.name = r.name || state.name;
    state.favSport = r.favSport || "all";
    localStorage.setItem("ss_name", state.name);
    localStorage.setItem("ss_fav", state.favSport);
    updateAccountUI();
    applyFavSport();
    msg.textContent = "Profile updated ✓";
    msg.className = "wallet-msg ok";
    toast("Profile saved");
    setTimeout(() => ($("profileModal").hidden = true), 900);
  } catch (err) {
    msg.textContent = err.message;
    msg.className = "wallet-msg err";
  }
}

/* ---------- head-to-head compare ---------- */
const compareState = { a: "", b: "" };
async function openCompare() {
  // Ensure we have the player list to populate the pickers.
  let players = state.allPlayers;
  if (!players) {
    const r = await api("/api/players?sport=all");
    players = r.players;
    state.allPlayers = players;
  }
  const opts = (sel) =>
    players
      .map((p) => {
        const sport = sportById(p.sport);
        return `<option value="${p.id}" ${p.id === sel ? "selected" : ""}>${sport ? sport.icon : ""} ${escapeHtml(p.name)} · ${escapeHtml(p.country)}</option>`;
      })
      .join("");
  if (!compareState.a) compareState.a = players[0] ? players[0].id : "";
  if (!compareState.b) compareState.b = players[1] ? players[1].id : "";
  $("compareModalBody").innerHTML = `
    <button class="modal-close" id="compareClose">✕</button>
    <div class="cmp-head">
      <h3>⚔️ Head-to-Head</h3>
      <p class="section-sub">Pick two stars and see who's on top right now.</p>
    </div>
    <div class="cmp-pickers">
      <select id="cmpA" class="pay-select">${opts(compareState.a)}</select>
      <span class="cmp-vs">VS</span>
      <select id="cmpB" class="pay-select">${opts(compareState.b)}</select>
    </div>
    <div class="cmp-result" id="cmpResult"><div class="pm-form-loading">Choose players to compare…</div></div>`;
  $("compareModal").hidden = false;
  $("compareClose").addEventListener("click", () => ($("compareModal").hidden = true));
  const run = () => {
    compareState.a = $("cmpA").value;
    compareState.b = $("cmpB").value;
    runCompare();
  };
  $("cmpA").addEventListener("change", run);
  $("cmpB").addEventListener("change", run);
  runCompare();
}
async function runCompare() {
  const box = $("cmpResult");
  if (!box) return;
  if (compareState.a === compareState.b) {
    box.innerHTML = `<p class="section-sub" style="text-align:center;padding:1.4rem">Pick two different players.</p>`;
    return;
  }
  box.innerHTML = `<div class="pm-form-loading">Comparing…</div>`;
  try {
    const d = await api(`/api/compare?a=${encodeURIComponent(compareState.a)}&b=${encodeURIComponent(compareState.b)}`);
    box.innerHTML = renderCompare(d);
  } catch (e) {
    box.innerHTML = `<p class="section-sub" style="text-align:center;padding:1.4rem">${escapeHtml(e.message || "Couldn't compare.")}</p>`;
  }
}
function cmpCard(p, isWinner) {
  const sport = sportById(p.sport);
  return `
    <div class="cmp-card ${isWinner ? "win" : ""}">
      ${isWinner ? '<span class="cmp-crown">👑</span>' : ""}
      <div class="cmp-avatar">${initials(p.name)}</div>
      <div class="cmp-name">${escapeHtml(p.name)}</div>
      <div class="cmp-role">${sport ? sport.icon : ""} ${escapeHtml(p.role)} · ${escapeHtml(p.country)}</div>
      <div class="cmp-momentum">${p.momentumIcon || "📊"} ${escapeHtml(p.momentum || "")}</div>
    </div>`;
}
function renderCompare(d) {
  const aWin = d.verdict === "a";
  const bWin = d.verdict === "b";
  const rows = (d.metrics || [])
    .map((m) => {
      const total = (Number(m.a) + Number(m.b)) || 1;
      const aPct = Math.round((Number(m.a) / total) * 100);
      const bPct = 100 - aPct;
      return `
      <div class="cmp-metric">
        <div class="cmp-metric-top">
          <span class="cmp-val ${m.winner === "a" ? "win" : ""}">${m.a}</span>
          <span class="cmp-label">${escapeHtml(m.label)}</span>
          <span class="cmp-val ${m.winner === "b" ? "win" : ""}">${m.b}</span>
        </div>
        <div class="cmp-bar">
          <div class="cmp-bar-a ${m.winner === "a" ? "win" : ""}" style="width:${aPct}%"></div>
          <div class="cmp-bar-b ${m.winner === "b" ? "win" : ""}" style="width:${bPct}%"></div>
        </div>
      </div>`;
    })
    .join("");
  const verdictText =
    d.verdict === "tie"
      ? "It's a dead heat — too close to call."
      : `${escapeHtml((d.verdict === "a" ? d.a : d.b).name)} edges it right now.`;
  const note = d.sameSport ? "" : `<p class="cmp-note">⚠️ Different sports — compare with a pinch of salt.</p>`;
  return `
    <div class="cmp-cards">
      ${cmpCard(d.a, aWin)}
      ${cmpCard(d.b, bWin)}
    </div>
    <div class="cmp-metrics">${rows}</div>
    <div class="cmp-verdict">${verdictText}</div>
    ${note}`;
}

/* ---------- PWA install + service worker ---------- */
let deferredInstall = null;
function initPwa() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstall = e;
    const btn = $("menuInstall");
    if (btn) btn.hidden = false;
  });
  window.addEventListener("appinstalled", () => {
    deferredInstall = null;
    const btn = $("menuInstall");
    if (btn) btn.hidden = true;
    toast("SportSphere installed! 🎉");
  });
}
async function installApp() {
  $("accountMenu").hidden = true;
  if (!deferredInstall) {
    toast("Use your browser's menu → 'Install app' / 'Add to Home screen'.");
    return;
  }
  deferredInstall.prompt();
  await deferredInstall.userChoice.catch(() => {});
  deferredInstall = null;
  $("menuInstall").hidden = true;
}

/* ---------- events ---------- */
function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((el) => {
    el.addEventListener("click", () => showView(el.getAttribute("data-view")));
    el.addEventListener("keydown", (e) => { if (e.key === "Enter") showView(el.getAttribute("data-view")); });
  });
  $("nearMeBtn").addEventListener("click", useLocation);
  $("refreshBtn").addEventListener("click", () => { loadMatches(); toast("Scores refreshed"); });
  $("themeBtn").addEventListener("click", toggleTheme);

  document.querySelectorAll("#statusSeg .seg-btn").forEach((b) =>
    b.addEventListener("click", () => {
      state.filters.status = b.getAttribute("data-status");
      document.querySelectorAll("#statusSeg .seg-btn").forEach((x) => x.classList.toggle("active", x === b));
      loadMatches();
    })
  );
  $("regionSelect").addEventListener("change", (e) => {
    state.filters.region = e.target.value;
    loadMatches();
  });

  $("addForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const amount = Number($("addAmount").value);
    if (!amount || amount <= 0) return walletMsg("Enter a valid amount.", false);
    try {
      state.wallet = await api("/api/wallet/add", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: state.userId, amount, method: $("addMethod").value }),
      });
      updateWalletUI();
      walletMsg(`Added ${inr(amount)}.`, true);
      $("addForm").reset();
    } catch (err) { walletMsg(err.message, false); }
  });
  $("transferForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const toUser = $("transferTo").value.trim();
    const amount = Number($("transferAmount").value);
    if (!toUser) return walletMsg("Enter a recipient.", false);
    if (!amount || amount <= 0) return walletMsg("Enter a valid amount.", false);
    try {
      state.wallet = await api("/api/wallet/transfer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: state.userId, toUser, amount }),
      });
      updateWalletUI();
      walletMsg(`Sent ${inr(amount)} to ${toUser}.`, true);
      $("transferForm").reset();
    } catch (err) { walletMsg(err.message, false); }
  });
  $("convertBtn").addEventListener("click", async () => {
    const w = state.wallet;
    if (!w || (w.points || 0) < 100) return toast("Earn at least 100 points to convert.");
    try {
      const r = await api("/api/wallet/redeem-points", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: state.userId, points: w.points }),
      });
      state.wallet = r.wallet;
      updateWalletUI();
      toast(`Converted to ${inr(r.rupees)} in your wallet!`);
    } catch (err) { toast(err.message); }
  });
  $("changeUserBtn").addEventListener("click", () => openAuth(state.authed ? "login" : "login"));

  // ---- auth / account ----
  $("accountBtn").addEventListener("click", (e) => { e.stopPropagation(); toggleAccountMenu(); });
  $("menuLogout").addEventListener("click", logout);
  $("menuWallet").addEventListener("click", () => { $("accountMenu").hidden = true; });
  $("menuProfile").addEventListener("click", openProfile);
  $("menuInstall").addEventListener("click", installApp);
  const cmpBtn = $("compareBtn");
  if (cmpBtn) cmpBtn.addEventListener("click", openCompare);
  const lbBtn = $("lbRefresh");
  if (lbBtn) lbBtn.addEventListener("click", loadLeaderboard);
  const ciBtn = $("checkinBtn");
  if (ciBtn) ciBtn.addEventListener("click", claimCheckin);
  const pfChip = $("plFollowChip");
  if (pfChip) pfChip.addEventListener("click", () => {
    state.plFollowing = !state.plFollowing;
    pfChip.classList.toggle("active", state.plFollowing);
    loadPlayers();
  });
  $("authClose").addEventListener("click", closeAuth);
  $("authGuest").addEventListener("click", closeAuth);
  $("authForm").addEventListener("submit", (e) => { e.preventDefault(); submitAuth(); });
  $("authSwitch").addEventListener("click", () => setAuthMode(authMode === "login" ? "register" : "login"));
  document.querySelectorAll(".auth-tab").forEach((t) =>
    t.addEventListener("click", () => setAuthMode(t.getAttribute("data-auth-tab")))
  );
  $("authEye").addEventListener("click", () => {
    const p = $("authPass");
    p.type = p.type === "password" ? "text" : "password";
    $("authEye").classList.toggle("on", p.type === "text");
  });
  $("authOverlay").addEventListener("click", (e) => { if (e.target.id === "authOverlay") closeAuth(); });
  // close account menu on outside click
  document.addEventListener("click", (e) => {
    const menu = $("accountMenu");
    if (!menu.hidden && !menu.contains(e.target) && e.target.id !== "accountBtn" && !$("accountBtn").contains(e.target)) {
      menu.hidden = true;
    }
  });

  ["playerModal", "watchModal", "payModal", "gameModal", "matchModal", "profileModal", "compareModal"].forEach((id) => {
    $(id).addEventListener("click", (e) => {
      if (e.target.id === id) {
        if (id === "watchModal") closeWatch();
        else if (id === "gameModal") closeGame();
        else $(id).hidden = true;
      }
    });
  });
}

/* ---------- init ---------- */
async function init() {
  const savedTheme = localStorage.getItem("ss_theme");
  if (savedTheme) {
    document.documentElement.setAttribute("data-theme", savedTheme);
    $("themeBtn").textContent = savedTheme === "dark" ? "☀️" : "🌙";
  }
  bindEvents();
  updateAccountUI();
  updateFollowChip();
  initPwa();
  try {
    await loadSports();
    await Promise.all([loadMatches(), loadHighlights(), loadPlayers(), refreshWallet(), loadSpendCats()]);
  } catch (err) {
    toast("Failed to load: " + err.message);
  }
  // Personalise the feed to the user's favourite sport, if set.
  if (state.authed && state.favSport && state.favSport !== "all") applyFavSport();
  // First-time visitors see the sign-in screen (can continue as guest).
  if (!state.authed && !localStorage.getItem("ss_seen_auth")) {
    localStorage.setItem("ss_seen_auth", "1");
    openAuth("login");
  }
  // auto-refresh live scores every 45s
  state.matchTimer = setInterval(() => {
    if (state.view === "live") loadMatches(true);
  }, 45000);
}
document.addEventListener("DOMContentLoaded", init);
