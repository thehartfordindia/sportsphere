"use strict";

/**
 * Dynamic player performance / recent form generator.
 * Produces deterministic (stable per player) recent-match data, a form trend,
 * a momentum read and a season summary — tuned to each sport & role.
 */

const crypto = require("crypto");

function seedFrom(str) {
  const h = crypto.createHash("sha256").update(String(str)).digest();
  return h.readUInt32LE(0);
}
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}
function ri(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

// Opponent pools by sport, so the fixtures feel authentic.
const OPPONENTS = {
  cricket: ["Australia", "England", "Pakistan", "South Africa", "New Zealand", "Sri Lanka", "West Indies", "Bangladesh"],
  football: ["Real Madrid", "Barcelona", "Bayern", "PSG", "Liverpool", "Arsenal", "Inter", "Juventus", "Chelsea"],
  basketball: ["Celtics", "Warriors", "Nuggets", "Bucks", "Suns", "Heat", "Mavericks", "76ers"],
  tennis: ["N. Djokovic", "C. Alcaraz", "J. Sinner", "D. Medvedev", "A. Zverev", "S. Tsitsipas"],
  badminton: ["V. Axelsen", "K. Momota", "Anthony Ginting", "Lee Zii Jia", "Kodai Naraoka"],
  kabaddi: ["Patna Pirates", "U Mumba", "Bengal Warriors", "Puneri Paltan", "Dabang Delhi"],
  hockey: ["Australia", "Netherlands", "Belgium", "Germany", "Argentina", "England"],
  esports: ["T1", "G2 Esports", "Fnatic", "Sentinels", "Team Liquid", "NAVI", "FaZe"],
  f1: ["Monaco GP", "Silverstone", "Monza", "Suzuka", "Spa", "Interlagos", "Las Vegas GP"],
  baseball: ["Yankees", "Dodgers", "Red Sox", "Cubs", "Giants", "Astros", "Mets"],
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function roleHas(role, ...keys) {
  const r = String(role || "").toLowerCase();
  return keys.some((k) => r.includes(k));
}

// Build one game's sport-specific stat line + a 0-10 performance rating.
function gameStat(rng, sport, role, base) {
  // base ~ player rating scaled 0..1 to bias outcomes for stronger players.
  const boost = base; // 0..1
  switch (sport) {
    case "cricket": {
      if (roleHas(role, "bowl", "spinner", "pacer")) {
        const wk = ri(rng, 0, 5) + (rng() < boost ? 1 : 0);
        const runs = ri(rng, 18, 52);
        return { line: `${Math.min(wk, 6)}/${runs}`, unit: "wickets", rating: 4 + Math.min(6, wk * 1.5 + rng() * 2) };
      }
      const balls = ri(rng, 20, 70);
      const runs = Math.round((ri(rng, 8, 95) + boost * 30) * (rng() < 0.15 ? 0.3 : 1));
      return { line: `${runs} (${balls})`, unit: "runs", rating: 3 + Math.min(7, runs / 14 + rng()) };
    }
    case "football": {
      if (roleHas(role, "keeper")) {
        const saves = ri(rng, 1, 7);
        const clean = rng() < 0.4;
        return { line: `${saves} saves${clean ? " · CS" : ""}`, unit: "saves", rating: 5 + Math.min(5, saves * 0.7 + (clean ? 1.5 : 0)) };
      }
      const attack = roleHas(role, "strik", "forward", "wing");
      const goals = attack ? (rng() < 0.55 + boost * 0.2 ? ri(rng, 1, 3) : 0) : (rng() < 0.2 ? 1 : 0);
      const assists = rng() < 0.4 ? ri(rng, 1, 2) : 0;
      const parts = [];
      if (goals) parts.push(`⚽${goals}`);
      if (assists) parts.push(`🅰️${assists}`);
      if (!parts.length) parts.push("—");
      return { line: parts.join(" "), unit: "G+A", rating: 5.5 + Math.min(4.5, goals * 1.6 + assists * 0.9 + rng()) };
    }
    case "basketball": {
      const pts = ri(rng, 12, 34) + Math.round(boost * 8);
      const reb = ri(rng, 3, 12);
      const ast = ri(rng, 2, 12);
      return { line: `${pts} pts · ${reb} reb · ${ast} ast`, unit: "pts", rating: 4 + Math.min(6, pts / 6) };
    }
    case "tennis":
    case "badminton": {
      const win = rng() < 0.55 + boost * 0.25;
      const a = win ? 2 : ri(rng, 0, 1);
      const b = win ? ri(rng, 0, 1) : 2;
      return { line: `${a}–${b} sets`, unit: "sets", rating: win ? 6.5 + rng() * 3 : 4 + rng() * 2, win };
    }
    case "kabaddi": {
      const raid = ri(rng, 4, 14);
      const tackle = ri(rng, 1, 6);
      return { line: `${raid} raid · ${tackle} tackle`, unit: "raid pts", rating: 4 + Math.min(6, raid / 2) };
    }
    case "hockey": {
      const goals = rng() < 0.5 ? ri(rng, 1, 3) : 0;
      const assists = rng() < 0.4 ? ri(rng, 1, 2) : 0;
      const parts = [];
      if (goals) parts.push(`🏑${goals}`);
      if (assists) parts.push(`🅰️${assists}`);
      if (!parts.length) parts.push("—");
      return { line: parts.join(" "), unit: "G+A", rating: 5 + Math.min(5, goals * 1.6 + assists) };
    }
    case "esports": {
      const k = ri(rng, 8, 28) + Math.round(boost * 6);
      const d = ri(rng, 5, 18);
      const a = ri(rng, 3, 16);
      return { line: `${k}/${d}/${a} KDA`, unit: "KDA", rating: 4 + Math.min(6, (k + a) / (d + 4) * 2) };
    }
    case "f1": {
      const posBias = rng() < 0.5 + boost * 0.3;
      const pos = posBias ? ri(rng, 1, 4) : ri(rng, 5, 14);
      const suffix = pos === 1 ? "st" : pos === 2 ? "nd" : pos === 3 ? "rd" : "th";
      return { line: `P${pos}`, unit: "finish", rating: Math.max(2, 11 - pos), place: pos, placeLabel: `${pos}${suffix}` };
    }
    case "baseball": {
      const hits = ri(rng, 0, 4);
      const hr = rng() < 0.25 + boost * 0.15 ? ri(rng, 1, 2) : 0;
      const rbi = ri(rng, 0, 4);
      return { line: `${hits}-for-${ri(rng, 4, 5)}${hr ? ` · ${hr} HR` : ""} · ${rbi} RBI`, unit: "hits", rating: 4 + Math.min(6, hits * 1.3 + hr * 1.5) };
    }
    default: {
      return { line: "—", unit: "", rating: 5 + rng() * 3 };
    }
  }
}

function outcome(rng, boost, forced) {
  if (forced === "win") return "W";
  if (forced === "loss") return "L";
  const r = rng();
  if (r < 0.5 + boost * 0.25) return "W";
  if (r < 0.72 + boost * 0.2) return "L";
  return "D";
}

function buildPerformance(player) {
  const rng = mulberry32(seedFrom(`${player.id}|${player.name}|${player.sport}`));
  const sport = player.sport;
  const role = player.role;
  const boost = Math.max(0, Math.min(1, ((player.rating || 80) - 78) / 22));
  const opponents = OPPONENTS[sport] || ["Rivals"];
  const individual = sport === "tennis" || sport === "badminton";
  const isF1 = sport === "f1";

  const games = [];
  const trend = [];
  let wins = 0, losses = 0, draws = 0;
  const now = new Date();

  for (let i = 0; i < 7; i++) {
    const g = gameStat(rng, sport, role, boost);
    let res;
    if (individual) res = g.win ? "W" : "L";
    else if (isF1) res = g.place <= 3 ? "W" : g.place <= 8 ? "D" : "L";
    else res = outcome(rng, boost);
    if (res === "W") wins++; else if (res === "L") losses++; else draws++;

    const d = new Date(now.getTime() - (i * 6 + ri(rng, 0, 4)) * 86400000);
    const rating = Math.round(Math.max(1, Math.min(10, g.rating)) * 10) / 10;
    trend.unshift(rating);
    games.push({
      opponent: (isF1 ? "" : "vs ") + pick(rng, opponents.filter((o) => o !== player.team)),
      date: `${d.getDate()} ${MONTHS[d.getMonth()]}`,
      result: res,
      line: g.line,
      unit: g.unit,
      rating,
      placeLabel: g.placeLabel || null,
    });
  }
  // newest first for display
  games.reverse();

  const recentAvg = trend.reduce((a, b) => a + b, 0) / trend.length;
  let momentum, momentumIcon;
  if (recentAvg >= 7.5) { momentum = "In red-hot form"; momentumIcon = "🔥"; }
  else if (recentAvg >= 6) { momentum = "Playing well"; momentumIcon = "📈"; }
  else if (recentAvg >= 4.5) { momentum = "Steady"; momentumIcon = "➖"; }
  else { momentum = "Finding form"; momentumIcon = "🌱"; }

  const heat = games.map((g) => g.result);

  // Season summary — a few sport-specific headline numbers.
  const season = buildSeason(rng, sport, role, boost, player);

  return {
    momentum,
    momentumIcon,
    recentAvg: Math.round(recentAvg * 10) / 10,
    record: { wins, losses, draws },
    heat,
    trend,
    games,
    season,
  };
}

function buildSeason(rng, sport, role, boost, player) {
  const apps = ri(rng, 14, 34);
  const avgRating = Math.round((6 + boost * 2 + rng()) * 10) / 10;
  const common = [{ label: "Appearances", value: apps }, { label: "Avg. match rating", value: avgRating.toFixed(1) }];
  switch (sport) {
    case "cricket":
      return roleHas(role, "bowl", "spinner", "pacer")
        ? [...common, { label: "Wickets", value: ri(rng, 18, 42) }, { label: "Economy", value: (rng() * 2 + 6.2).toFixed(2) }]
        : [...common, { label: "Runs", value: ri(rng, 480, 1250) }, { label: "Average", value: (rng() * 25 + 34).toFixed(1) }, { label: "50s / 100s", value: `${ri(rng, 3, 9)} / ${ri(rng, 1, 5)}` }];
    case "football":
    case "hockey":
      return roleHas(role, "keeper")
        ? [...common, { label: "Clean sheets", value: ri(rng, 6, 16) }, { label: "Save %", value: `${ri(rng, 68, 82)}%` }]
        : [...common, { label: "Goals", value: ri(rng, 8, 34) }, { label: "Assists", value: ri(rng, 4, 18) }];
    case "basketball":
      return [...common, { label: "PPG", value: (rng() * 10 + 18).toFixed(1) }, { label: "APG", value: (rng() * 5 + 4).toFixed(1) }, { label: "RPG", value: (rng() * 5 + 5).toFixed(1) }];
    case "tennis":
    case "badminton":
      return [...common, { label: "Titles", value: ri(rng, 1, 6) }, { label: "Win rate", value: `${ri(rng, 62, 84)}%` }];
    case "kabaddi":
      return [...common, { label: "Raid points", value: ri(rng, 120, 260) }, { label: "Super raids", value: ri(rng, 4, 14) }];
    case "esports":
      return [...common, { label: "KDA ratio", value: (rng() * 1.6 + 2.4).toFixed(2) }, { label: "Win rate", value: `${ri(rng, 55, 74)}%` }, { label: "MVPs", value: ri(rng, 4, 16) }];
    case "f1":
      return [{ label: "Races", value: ri(rng, 12, 22) }, { label: "Podiums", value: ri(rng, 3, 14) }, { label: "Wins", value: ri(rng, 0, 8) }, { label: "Points", value: ri(rng, 90, 380) }];
    case "baseball":
      return [...common, { label: "AVG", value: `.${ri(rng, 255, 330)}` }, { label: "Home runs", value: ri(rng, 12, 44) }, { label: "RBI", value: ri(rng, 40, 110) }];
    default:
      return common;
  }
}

module.exports = { buildPerformance };
