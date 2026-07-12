"use strict";

/* SportSphere frontend — talks to the native-http backend. */

const API = "";
const $ = (id) => document.getElementById(id);

const state = {
  view: "live",
  sports: [],
  matches: [],
  regions: [],
  highlights: [],
  players: [],
  wallet: null,
  filters: { sport: "all", status: "all", region: "all" },
  hlSport: "all",
  plSport: "all",
  geo: null,
  userId: localStorage.getItem("ss_user") || "guest",
  watch: null, // { matchId, seconds, timer }
};

const VIEWS = ["live", "highlights", "players", "wallet"];

/* ---------- helpers ---------- */
function inr(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN");
}
function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
function initials(name) {
  return String(name || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
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
  toastTimer = setTimeout(() => (t.hidden = true), 2600);
}

async function api(path, opts) {
  const res = await fetch(`${API}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

/* ---------- view switching ---------- */
function showView(name) {
  if (!VIEWS.includes(name)) return;
  state.view = name;
  document.querySelectorAll("[data-view-panel]").forEach((p) => {
    p.classList.toggle("active", p.getAttribute("data-view-panel") === name);
  });
  document.querySelectorAll(".view-tab").forEach((t) => {
    t.classList.toggle("active", t.getAttribute("data-view") === name);
  });
  if (name === "wallet") refreshWallet();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------- sports + chips ---------- */
async function loadSports() {
  const { sports } = await api("/api/sports");
  state.sports = sports;
  $("sportCount").textContent = sports.length;
  renderSportChips("sportChips", "sport", () => loadMatches());
  renderSportChips("hlSportChips", "hlSport", () => loadHighlights());
  renderSportChips("plSportChips", "plSport", () => loadPlayers());
}
function renderSportChips(containerId, key, onChange) {
  const el = $(containerId);
  const current = key === "sport" ? state.filters.sport : state[key];
  const all = [{ id: "all", name: "All", icon: "🌐" }, ...state.sports];
  el.innerHTML = all
    .map(
      (s) =>
        `<button class="chip ${s.id === current ? "active" : ""}" data-chip="${s.id}">${s.icon} ${escapeHtml(
          s.name
        )}</button>`
    )
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
async function loadMatches() {
  const p = new URLSearchParams();
  p.set("sport", state.filters.sport);
  p.set("status", state.filters.status);
  p.set("region", state.filters.region);
  if (state.geo) {
    p.set("lat", state.geo.lat);
    p.set("lon", state.geo.lon);
  }
  const { matches, regions } = await api(`/api/matches?${p.toString()}`);
  state.matches = matches;
  state.regions = regions;
  renderRegions();
  renderMatches();
  const live = matches.filter((m) => m.status === "LIVE").length;
  $("liveCount").textContent = live;
  $("matchCount").textContent = matches.length;
}
function renderRegions() {
  const sel = $("regionSelect");
  if (sel.options.length && sel.dataset.filled) return;
  sel.innerHTML =
    `<option value="all">🌍 All regions</option>` +
    state.regions.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("");
  sel.dataset.filled = "1";
  sel.value = state.filters.region;
}
function renderMatches() {
  const grid = $("matchGrid");
  if (!state.matches.length) {
    grid.innerHTML = `<p class="section-sub">No matches for this filter.</p>`;
    return;
  }
  grid.innerHTML = state.matches
    .map((m) => {
      const dist = m.distanceKm != null ? `📍 ${m.distanceKm} km` : "";
      const viewers = m.viewers ? `👁️ ${fmtViews(m.viewers)}` : "";
      const canWatch = m.status === "LIVE";
      return `
      <div class="match-card">
        <div class="match-head">
          <span class="league">${escapeHtml(m.league)}</span>
          <span class="badge ${m.status}">${m.status}</span>
        </div>
        <div class="teams">
          <div class="team-row"><span>${escapeHtml(m.home)}</span><span class="score">${escapeHtml(
        m.scoreHome
      )}</span></div>
          <div class="team-row"><span>${escapeHtml(m.away)}</span><span class="score">${escapeHtml(
        m.scoreAway
      )}</span></div>
        </div>
        <div class="match-foot">
          <span class="match-meta"><span>⏱️ ${escapeHtml(m.clock)}</span>${
        viewers ? `<span>${viewers}</span>` : ""
      }${dist ? `<span>${dist}</span>` : ""}</span>
          ${
            canWatch
              ? `<button class="watch-btn" data-watch="${m.id}">▶ Watch &amp; earn</button>`
              : `<span class="match-meta"><span>${escapeHtml(m.city)}</span></span>`
          }
        </div>
      </div>`;
    })
    .join("");
  grid.querySelectorAll("[data-watch]").forEach((b) => {
    b.addEventListener("click", () => openWatch(b.getAttribute("data-watch")));
  });
}

/* ---------- highlights ---------- */
async function loadHighlights() {
  const { highlights } = await api(`/api/highlights?sport=${state.hlSport}`);
  state.highlights = highlights;
  const grid = $("highlightGrid");
  grid.innerHTML = highlights
    .map((h) => {
      const sport = state.sports.find((s) => s.id === h.sport);
      return `
      <div class="highlight-card" data-hl="${h.id}">
        <div class="highlight-thumb">${sport ? sport.icon : "🎬"}<span class="highlight-dur">${escapeHtml(
        h.duration
      )}</span></div>
        <div class="highlight-body">
          <h4>${escapeHtml(h.title)}</h4>
          <div class="hl-meta">${fmtViews(h.views)} views · ${sport ? escapeHtml(sport.name) : ""}</div>
        </div>
      </div>`;
    })
    .join("");
  grid.querySelectorAll("[data-hl]").forEach((c) => {
    c.addEventListener("click", () => toast("▶ Playing highlight (demo)"));
  });
}

/* ---------- players ---------- */
async function loadPlayers() {
  const { players } = await api(`/api/players?sport=${state.plSport}`);
  state.players = players;
  const grid = $("playerGrid");
  grid.innerHTML = players
    .map((p) => {
      const sport = state.sports.find((s) => s.id === p.sport);
      return `
      <div class="player-card" data-player="${p.id}">
        <div class="player-avatar">${initials(p.name)}</div>
        <div class="player-info">
          <h4>${escapeHtml(p.name)}</h4>
          <div class="p-sub">${sport ? sport.icon : ""} ${escapeHtml(p.role)} · ${escapeHtml(
        p.country
      )}</div>
        </div>
        <span class="rating-pill">${p.rating}</span>
      </div>`;
    })
    .join("");
  grid.querySelectorAll("[data-player]").forEach((c) => {
    c.addEventListener("click", () => openPlayer(c.getAttribute("data-player")));
  });
}
async function openPlayer(id) {
  const p = await api(`/api/players/${encodeURIComponent(id)}`);
  const career = p.career || {};
  const life = p.lifestyle || {};
  const careerStats = Object.entries(career)
    .map(
      ([k, v]) =>
        `<div class="pm-stat"><b>${escapeHtml(String(v))}</b><span>${escapeHtml(
          k.replace(/([A-Z])/g, " $1")
        )}</span></div>`
    )
    .join("");
  $("playerModalBody").innerHTML = `
    <button class="modal-close" id="playerClose">✕</button>
    <div class="pm-head">
      <div class="pm-avatar">${initials(p.name)}</div>
      <div>
        <h3>${escapeHtml(p.name)}</h3>
        <div class="p-sub">${escapeHtml(p.role)} · ${escapeHtml(p.team)} · Age ${p.age}</div>
        <span class="rating-pill">Rating ${p.rating}</span>
      </div>
    </div>
    <div class="pm-section">
      <h4>Career</h4>
      <div class="pm-stats">${careerStats}</div>
    </div>
    <div class="pm-section">
      <h4>Lifestyle</h4>
      <p class="p-sub">💪 ${escapeHtml(life.fitness || "—")}</p>
      <div class="tag-row">${(life.interests || [])
        .map((i) => `<span class="tag">${escapeHtml(i)}</span>`)
        .join("")}</div>
      ${life.foundation ? `<p class="p-sub" style="margin-top:.5rem">❤️ ${escapeHtml(life.foundation)}</p>` : ""}
    </div>`;
  $("playerModal").hidden = false;
  $("playerClose").addEventListener("click", () => ($("playerModal").hidden = true));
}

/* ---------- watch-to-earn ---------- */
function openWatch(matchId) {
  const m = state.matches.find((x) => x.id === matchId);
  if (!m) return;
  state.watch = { matchId, seconds: 0, earnedThisSession: 0, timer: null };
  renderWatch(m, 0, 0);
  $("watchModal").hidden = false;
  state.watch.timer = setInterval(() => tickWatch(m), 1000);
}
function renderWatch(m, seconds, earned) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  $("watchModalBody").innerHTML = `
    <button class="modal-close" id="watchClose">✕</button>
    <div class="watch-screen">
      <span class="watch-live-dot">🔴 LIVE</span>
      <div>${escapeHtml(m.league)}</div>
      <div class="watch-score">${escapeHtml(m.home)} ${escapeHtml(m.scoreHome)} — ${escapeHtml(
    m.scoreAway
  )} ${escapeHtml(m.away)}</div>
      <div>${escapeHtml(m.clock)}</div>
    </div>
    <div class="watch-earn-live">
      <span>⏱️ Watching: <b>${mm}:${ss}</b></span>
      <span>Earned: <b>${inr(earned)}</b></span>
    </div>
    <p class="section-sub" style="margin:0">You earn ₹2 demo cashback per full minute (up to ₹50/day).</p>`;
  $("watchClose").addEventListener("click", closeWatch);
}
async function tickWatch(m) {
  if (!state.watch) return;
  state.watch.seconds += 1;
  const s = state.watch.seconds;
  // award one minute of cashback every 60s
  if (s % 60 === 0) {
    try {
      const r = await api("/api/wallet/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: state.userId, minutes: 1 }),
      });
      state.wallet = r.wallet;
      state.watch.earnedThisSession += r.reward;
      updateWalletUI();
      if (r.reward > 0) toast(`+${inr(r.reward)} watch cashback!`);
      if (r.cappedToday) toast("Daily watch-to-earn cap reached (₹50).");
    } catch (_e) {
      /* ignore */
    }
  }
  renderWatch(m, s, state.watch.earnedThisSession);
}
function closeWatch() {
  if (state.watch && state.watch.timer) clearInterval(state.watch.timer);
  state.watch = null;
  $("watchModal").hidden = true;
}

/* ---------- wallet ---------- */
async function refreshWallet() {
  try {
    state.wallet = await api(`/api/wallet?userId=${encodeURIComponent(state.userId)}`);
    updateWalletUI();
  } catch (_e) {
    /* ignore */
  }
}
function updateWalletUI() {
  const w = state.wallet;
  if (!w) return;
  $("walletBalance").textContent = inr(w.balance);
  if ($("walletBigBalance")) {
    $("walletBigBalance").textContent = inr(w.balance);
    $("cashbackEarned").textContent = inr(w.cashbackEarned);
    $("walletUserId").textContent = state.userId;
    const earnedToday = (w.watchMinutesToday || 0) * 2;
    const pct = Math.min(100, (earnedToday / 50) * 100);
    $("watchBarFill").style.width = pct + "%";
    $("watchProgressText").textContent = `${inr(earnedToday)} / ₹50 today`;
    renderTxns(w.transactions || []);
  }
}
function txnIcon(type) {
  return (
    {
      BONUS: "🎁",
      ADD: "➕",
      PAY: "💳",
      CASHBACK: "💰",
      TRANSFER: "🔁",
      RECEIVE: "📥",
      WATCH_REWARD: "🎬",
    }[type] || "•"
  );
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
      return `
      <div class="txn">
        <div class="txn-left">
          <div class="txn-ico">${txnIcon(t.type)}</div>
          <div>
            <div class="txn-note">${escapeHtml(t.note)}</div>
            <div class="txn-at">${timeAgo(t.at)}</div>
          </div>
        </div>
        <div class="txn-amt ${pos ? "pos" : "neg"}">${pos ? "+" : ""}${inr(t.amount)}</div>
      </div>`;
    })
    .join("");
}
function walletMsg(text, ok) {
  const el = $("walletMsg");
  el.textContent = text;
  el.className = "wallet-msg " + (ok ? "ok" : "err");
}

/* ---------- geolocation ---------- */
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
      $("geoNote").textContent = "Location denied — showing all matches.";
      toast("Couldn't get your location.");
    }
  );
}

/* ---------- theme ---------- */
function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("ss_theme", next);
  $("themeBtn").textContent = next === "dark" ? "☀️" : "🌙";
}

/* ---------- events ---------- */
function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((el) => {
    el.addEventListener("click", () => showView(el.getAttribute("data-view")));
  });
  $("nearMeBtn").addEventListener("click", useLocation);
  $("themeBtn").addEventListener("click", toggleTheme);

  document.querySelectorAll("#statusSeg .seg-btn").forEach((b) => {
    b.addEventListener("click", () => {
      state.filters.status = b.getAttribute("data-status");
      document.querySelectorAll("#statusSeg .seg-btn").forEach((x) => x.classList.toggle("active", x === b));
      loadMatches();
    });
  });
  $("regionSelect").addEventListener("change", (e) => {
    state.filters.region = e.target.value;
    loadMatches();
  });

  // wallet forms
  $("addForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const amount = Number($("addAmount").value);
    if (!amount || amount <= 0) return walletMsg("Enter a valid amount.", false);
    try {
      state.wallet = await api("/api/wallet/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: state.userId, amount, method: $("addMethod").value }),
      });
      updateWalletUI();
      walletMsg(`Added ${inr(amount)}.`, true);
      $("addForm").reset();
    } catch (err) {
      walletMsg(err.message, false);
    }
  });
  $("payForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const to = $("payTo").value.trim();
    const amount = Number($("payAmount").value);
    if (!to) return walletMsg("Enter a merchant name.", false);
    if (!amount || amount <= 0) return walletMsg("Enter a valid amount.", false);
    try {
      const r = await api("/api/wallet/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: state.userId, amount, to }),
      });
      state.wallet = r.wallet;
      updateWalletUI();
      walletMsg(`Paid ${inr(amount)} to ${to}${r.cashback ? ` · +${inr(r.cashback)} cashback` : ""}.`, true);
      $("payForm").reset();
    } catch (err) {
      walletMsg(err.message, false);
    }
  });
  $("transferForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const toUser = $("transferTo").value.trim();
    const amount = Number($("transferAmount").value);
    if (!toUser) return walletMsg("Enter a recipient user id.", false);
    if (!amount || amount <= 0) return walletMsg("Enter a valid amount.", false);
    try {
      state.wallet = await api("/api/wallet/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: state.userId, toUser, amount }),
      });
      updateWalletUI();
      walletMsg(`Sent ${inr(amount)} to ${toUser}.`, true);
      $("transferForm").reset();
    } catch (err) {
      walletMsg(err.message, false);
    }
  });

  $("changeUserBtn").addEventListener("click", () => {
    const id = prompt("Enter a user id (this is your demo wallet handle):", state.userId);
    if (id && id.trim()) {
      state.userId = id.trim().slice(0, 60);
      localStorage.setItem("ss_user", state.userId);
      refreshWallet();
      toast("Switched to " + state.userId);
    }
  });

  // close modals on backdrop click
  ["playerModal", "watchModal"].forEach((id) => {
    $(id).addEventListener("click", (e) => {
      if (e.target.id === id) {
        if (id === "watchModal") closeWatch();
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
  try {
    await loadSports();
    await Promise.all([loadMatches(), loadHighlights(), loadPlayers(), refreshWallet()]);
  } catch (err) {
    toast("Failed to load: " + err.message);
  }
}
document.addEventListener("DOMContentLoaded", init);
