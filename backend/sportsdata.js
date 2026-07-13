"use strict";

/**
 * sportsdata.js — dynamic live sports data provider.
 *
 * Pulls REAL fixtures / results from TheSportsDB (a free, public sports API)
 * and normalises them into SportSphere's match shape. Results are cached in
 * memory with a short TTL so we stay fast and within rate limits.
 *
 * If the network can't be reached (e.g. corporate SSL locally, or the API is
 * down), every function degrades gracefully and the caller falls back to the
 * bundled sample data — so the app always works.
 *
 * Docs: https://www.thesportsdb.com/free_sports_api
 */

const API_KEY = process.env.SPORTSDB_KEY || "3"; // "3" is the shared free test key
const BASE = `https://www.thesportsdb.com/api/v1/json/${API_KEY}`;
const TIMEOUT_MS = Number(process.env.SPORTSDB_TIMEOUT_MS) || 6000;

// Popular leagues to build a dynamic, multi-sport fixture board from.
// idLeague values are stable public IDs on TheSportsDB.
const LEAGUES = [
  { id: "4328", sport: "football", region: "England", label: "Premier League" },
  { id: "4335", sport: "football", region: "Spain", label: "La Liga" },
  { id: "4331", sport: "football", region: "Germany", label: "Bundesliga" },
  { id: "4332", sport: "football", region: "Italy", label: "Serie A" },
  { id: "4334", sport: "football", region: "France", label: "Ligue 1" },
  { id: "4337", sport: "football", region: "Netherlands", label: "Eredivisie" },
  { id: "4344", sport: "football", region: "Portugal", label: "Primeira Liga" },
  { id: "4346", sport: "football", region: "USA", label: "Major League Soccer" },
  { id: "4480", sport: "football", region: "Global", label: "UEFA Champions League" },
  { id: "4387", sport: "basketball", region: "USA", label: "NBA" },
  { id: "4380", sport: "hockey", region: "USA", label: "NHL" },
  { id: "4424", sport: "baseball", region: "USA", label: "MLB" },
  { id: "4443", sport: "cricket", region: "India", label: "Indian Premier League" },
  { id: "4460", sport: "cricket", region: "Australia", label: "Big Bash League" },
];

/* ---------------- tiny in-memory cache ---------------- */
const cache = new Map(); // key -> { at, ttl, data }
function cacheGet(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.data;
  return null;
}
function cacheSet(key, data, ttl) {
  cache.set(key, { at: Date.now(), ttl, data });
}

async function fetchJson(url) {
  if (typeof fetch !== "function") return null; // Node < 18 safety
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "SportSphere/2.0" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (_e) {
    return null; // network blocked / timeout / parse error -> graceful null
  }
}

/* ---------------- normalisation helpers ---------------- */
function toNum(v) {
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

// Decide LIVE / UPCOMING / FINISHED from timestamp + score.
function deriveStatus(ev) {
  const ts = ev.strTimestamp ? Date.parse(ev.strTimestamp + "Z") : NaN;
  const start = Number.isNaN(ts) ? Date.parse(`${ev.dateEvent}T${ev.strTime || "00:00:00"}Z`) : ts;
  const now = Date.now();
  const status = String(ev.strStatus || "").toLowerCase();

  if (["ft", "aet", "match finished", "finished"].some((s) => status.includes(s))) return "FINISHED";
  if (Number.isNaN(start)) {
    // no clock info: infer from score presence
    return ev.intHomeScore != null && ev.intHomeScore !== "" ? "FINISHED" : "UPCOMING";
  }
  const WINDOW = 2.75 * 60 * 60 * 1000; // ~ typical match length
  if (now < start) return "UPCOMING";
  if (now <= start + WINDOW) return "LIVE";
  return "FINISHED";
}

function clockLabel(ev, status) {
  if (status === "FINISHED") return "Full time";
  if (status === "LIVE") return "Live now";
  // upcoming: show local-ish start
  if (ev.strTime) return `Starts ${String(ev.strTime).slice(0, 5)}`;
  if (ev.dateEvent) return `On ${ev.dateEvent}`;
  return "Scheduled";
}

function normaliseEvent(ev, meta) {
  const status = deriveStatus(ev);
  const hs = ev.intHomeScore;
  const as = ev.intAwayScore;
  return {
    id: "sd-" + ev.idEvent,
    sport: meta.sport,
    league: ev.strLeague || meta.label,
    home: ev.strHomeTeam || "Home",
    away: ev.strAwayTeam || "Away",
    status,
    scoreHome: hs == null || hs === "" ? "—" : String(hs),
    scoreAway: as == null || as === "" ? "—" : String(as),
    clock: clockLabel(ev, status),
    region: meta.region,
    city: ev.strVenue || meta.region,
    homeBadge: ev.strHomeTeamBadge || null,
    awayBadge: ev.strAwayTeamBadge || null,
    thumb: ev.strThumb || null,
    date: ev.dateEvent || null,
    time: ev.strTime || null,
    viewers: null, // not provided by the free API
    lat: meta.lat,
    lon: meta.lon,
    source: "live",
  };
}

// Rough venue coordinates per region for the "near me" ranking fallback.
const REGION_GEO = {
  England: { lat: 52.35, lon: -1.17 },
  Spain: { lat: 40.42, lon: -3.7 },
  Germany: { lat: 51.16, lon: 10.45 },
  Italy: { lat: 41.87, lon: 12.56 },
  France: { lat: 46.6, lon: 2.35 },
  Netherlands: { lat: 52.13, lon: 5.29 },
  Portugal: { lat: 39.4, lon: -8.22 },
  Australia: { lat: -25.27, lon: 133.78 },
  USA: { lat: 39.5, lon: -98.35 },
  India: { lat: 20.59, lon: 78.96 },
  Global: { lat: 20.0, lon: 0.0 },
};

/* ---------------- public API ---------------- */

/**
 * Fetch a dynamic, multi-league fixture board (recent + upcoming events).
 * Returns [] if nothing could be fetched (caller should fall back to sample).
 */
async function getLiveMatches() {
  const cached = cacheGet("matches");
  if (cached) return cached;

  const results = await Promise.allSettled(
    LEAGUES.flatMap((lg) => {
      const geo = REGION_GEO[lg.region] || REGION_GEO.Global;
      const meta = { ...lg, ...geo };
      return [
        fetchJson(`${BASE}/eventsnextleague.php?id=${lg.id}`).then((j) => ({ j, meta, key: "events" })),
        fetchJson(`${BASE}/eventspastleague.php?id=${lg.id}`).then((j) => ({ j, meta, key: "events" })),
      ];
    })
  );

  const matches = [];
  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value.j) continue;
    const events = r.value.j.events;
    if (!Array.isArray(events)) continue;
    for (const ev of events.slice(0, 5)) {
      try {
        matches.push(normaliseEvent(ev, r.value.meta));
      } catch (_e) {
        /* skip malformed */
      }
    }
  }

  if (!matches.length) return []; // signal fallback

  // De-dupe by id, sort: LIVE first, then UPCOMING (soonest), then FINISHED.
  const seen = new Set();
  const deduped = matches.filter((m) => (seen.has(m.id) ? false : seen.add(m.id)));
  const rank = { LIVE: 0, UPCOMING: 1, FINISHED: 2 };
  deduped.sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return String(a.date || "").localeCompare(String(b.date || ""));
  });

  cacheSet("matches", deduped, 60 * 1000); // 60s TTL keeps live scores fresh
  return deduped;
}

/**
 * Enrich a player with real bio / photo / social links from TheSportsDB.
 * Returns a partial object to merge onto the seed player, or null.
 */
async function getPlayerEnrichment(name) {
  if (!name) return null;
  const key = "player:" + name.toLowerCase();
  const cached = cacheGet(key);
  if (cached) return cached;

  const j = await fetchJson(`${BASE}/searchplayers.php?p=${encodeURIComponent(name)}`);
  const p = j && Array.isArray(j.player) ? j.player[0] : null;
  if (!p) {
    cacheSet(key, null, 30 * 60 * 1000);
    return null;
  }
  const enrichment = {
    photo: p.strCutout || p.strThumb || null,
    banner: p.strFanart1 || p.strThumb || null,
    bio: p.strDescriptionEN || null,
    nationality: p.strNationality || null,
    birthDate: p.dateBorn || null,
    birthPlace: p.strBirthLocation || null,
    height: p.strHeight || null,
    weight: p.strWeight || null,
    teamReal: p.strTeam || null,
    positionReal: p.strPosition || null,
    social: {
      twitter: cleanUrl(p.strTwitter),
      instagram: cleanUrl(p.strInstagram),
      facebook: cleanUrl(p.strFacebook),
      website: cleanUrl(p.strWebsite),
      youtube: cleanUrl(p.strYoutube),
    },
    source: "live",
  };
  cacheSet(key, enrichment, 24 * 60 * 60 * 1000); // players change slowly: 24h
  return enrichment;
}

function cleanUrl(u) {
  if (!u) return null;
  const s = String(u).trim();
  if (!s) return null;
  return s.startsWith("http") ? s : "https://" + s;
}

module.exports = { getLiveMatches, getPlayerEnrichment, LEAGUES };
