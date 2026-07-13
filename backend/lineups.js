"use strict";

/**
 * Dynamic lineup / squad generator.
 * Given a match (id, sport, league, teams, region) it deterministically
 * builds full, believable squads for BOTH sides — starting XI/roster + bench,
 * with jersey numbers, positions and a captain. Seeded by matchId+team so the
 * same match always returns the same lineup across reloads.
 *
 * No external calls — works fully offline (important behind corporate SSL).
 */

const crypto = require("crypto");

/* ---------- deterministic PRNG (mulberry32 seeded via SHA-256) ---------- */
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

/* ---------- name pools by region ---------- */
const NAMES = {
  England: { first: ["Harry", "Jack", "Callum", "Ollie", "Reece", "Mason", "Declan", "Phil", "Bukayo", "Marcus", "Trent", "Cole", "Jude", "Kyle"], last: ["Kane", "Grealish", "Stones", "Walker", "Foden", "Rice", "Bellingham", "Saka", "Rashford", "Maddison", "Henderson", "Trippier", "Shaw", "Gallagher"] },
  Spain: { first: ["Sergio", "Álvaro", "Pablo", "Marco", "Rodri", "Pedri", "Gavi", "Ferran", "Dani", "Mikel", "Nico", "Fabián", "Iker", "Unai"], last: ["García", "Fernández", "Morata", "Torres", "Olmo", "Merino", "Rodríguez", "Ruiz", "Carvajal", "Laporte", "Williams", "Oyarzabal", "Martín", "Navas"] },
  Germany: { first: ["Leon", "Joshua", "Kai", "Jamal", "Serge", "Ilkay", "Thomas", "Niklas", "Florian", "Robin", "Marc", "Leroy", "Pascal", "Julian"], last: ["Goretzka", "Kimmich", "Havertz", "Musiala", "Gnabry", "Gündogan", "Müller", "Süle", "Wirtz", "Gosens", "Ter Stegen", "Sané", "Groß", "Brandt"] },
  Italy: { first: ["Marco", "Lorenzo", "Federico", "Nicolò", "Gianluca", "Sandro", "Alessandro", "Davide", "Manuel", "Bryan", "Giacomo", "Matteo", "Riccardo", "Andrea"], last: ["Verratti", "Insigne", "Chiesa", "Barella", "Scamacca", "Tonali", "Bastoni", "Frattesi", "Locatelli", "Cristante", "Raspadori", "Politano", "Calafiori", "Belotti"] },
  France: { first: ["Antoine", "Kylian", "Olivier", "Aurélien", "Eduardo", "Ousmane", "Randal", "Theo", "Jules", "Ibrahima", "Adrien", "Marcus", "Bradley", "Warren"], last: ["Griezmann", "Mbappé", "Giroud", "Tchouaméni", "Camavinga", "Dembélé", "Kolo Muani", "Hernández", "Koundé", "Konaté", "Rabiot", "Thuram", "Barcola", "Zaïre-Emery"] },
  Brazil: { first: ["Gabriel", "Vinícius", "Rodrygo", "Raphael", "Bruno", "Lucas", "Éder", "Casemiro", "Marquinhos", "Danilo", "Antony", "Richarlison", "Endrick", "Pedro"], last: ["Silva", "Júnior", "Goes", "Dias", "Guimarães", "Paquetá", "Militão", "Henrique", "Costa", "Souza", "Martinelli", "Andrade", "Barbosa", "Oliveira"] },
  Argentina: { first: ["Lionel", "Ángel", "Julián", "Lautaro", "Rodrigo", "Enzo", "Alexis", "Nicolás", "Cristian", "Emiliano", "Nahuel", "Giovani", "Leandro", "Exequiel"], last: ["Messi", "Di María", "Álvarez", "Martínez", "De Paul", "Fernández", "Mac Allister", "Otamendi", "Romero", "Molina", "Acuña", "Lo Celso", "Paredes", "Palacios"] },
  Netherlands: { first: ["Virgil", "Frenkie", "Memphis", "Cody", "Nathan", "Denzel", "Steven", "Xavi", "Tijjani", "Jurriën", "Marten", "Wout", "Micky", "Donyell"], last: ["van Dijk", "de Jong", "Depay", "Gakpo", "Aké", "Dumfries", "Bergwijn", "Simons", "Reijnders", "Timber", "de Roon", "Weghorst", "van de Ven", "Malen"] },
  Portugal: { first: ["Cristiano", "Bruno", "Bernardo", "João", "Rafael", "Diogo", "Rúben", "Gonçalo", "Vitinha", "Nuno", "Pedro", "António", "Francisco", "Otávio"], last: ["Ronaldo", "Fernandes", "Silva", "Félix", "Leão", "Jota", "Dias", "Ramos", "Ferreira", "Mendes", "Neto", "Silva", "Conceição", "Monteiro"] },
  India: { first: ["Virat", "Rohit", "Jasprit", "Shubman", "Rishabh", "Hardik", "Ravindra", "Suryakumar", "Mohammed", "KL", "Yashasvi", "Kuldeep", "Axar", "Shreyas"], last: ["Kohli", "Sharma", "Bumrah", "Gill", "Pant", "Pandya", "Jadeja", "Yadav", "Siraj", "Rahul", "Jaiswal", "Yadav", "Patel", "Iyer"] },
  Australia: { first: ["Pat", "Steve", "David", "Mitchell", "Glenn", "Marnus", "Travis", "Josh", "Cameron", "Adam", "Alex", "Nathan", "Sean", "Ben"], last: ["Cummins", "Smith", "Warner", "Starc", "Maxwell", "Labuschagne", "Head", "Hazlewood", "Green", "Zampa", "Carey", "Lyon", "Abbott", "McDermott"] },
  USA: { first: ["Christian", "Tyler", "Weston", "Gio", "Brenden", "Tim", "Sergiño", "Yunus", "Folarin", "Ricardo", "Antonee", "Malik", "Josh", "DeAndre"], last: ["Pulisic", "Adams", "McKennie", "Reyna", "Aaronson", "Weah", "Dest", "Musah", "Balogun", "Pepi", "Robinson", "Tillman", "Sargent", "Yedlin"] },
  Japan: { first: ["Takumi", "Wataru", "Kaoru", "Ritsu", "Daichi", "Junya", "Takefusa", "Hidemasa", "Ao", "Ko", "Yuki", "Reo", "Daizen", "Takehiro"], last: ["Minamino", "Endo", "Mitoma", "Doan", "Kamada", "Ito", "Kubo", "Morita", "Tanaka", "Itakura", "Soma", "Hatate", "Maeda", "Tomiyasu"] },
  "South Korea": { first: ["Heung-min", "Kang-in", "Woo-young", "Min-jae", "Hee-chan", "In-beom", "Jae-sung", "Young-gwon", "Chang-hoon", "Ui-jo", "Gue-sung", "Seung-ho", "Moon-hwan", "Tae-hwan"], last: ["Son", "Lee", "Jung", "Kim", "Hwang", "Hwang", "Lee", "Kim", "Kwon", "Hwang", "Cho", "Paik", "Kim", "Kim"] },
  "Saudi Arabia": { first: ["Salem", "Firas", "Salman", "Mohammed", "Abdullah", "Saud", "Ali", "Nawaf", "Fahad", "Sultan", "Hattan", "Riyad", "Yasser", "Abdulelah"], last: ["Al-Dawsari", "Al-Buraikan", "Al-Faraj", "Kanno", "Al-Malki", "Abdulhamid", "Al-Bulaihi", "Al-Aboud", "Al-Muwallad", "Al-Ghannam", "Bahebri", "Sharahili", "Al-Shahrani", "Al-Amri"] },
  Scotland: { first: ["Andy", "John", "Scott", "Callum", "Ryan", "Billy", "Kieran", "Stuart", "Grant", "Che", "Lyndon", "Ryan", "Anthony", "Aaron"], last: ["Robertson", "McGinn", "McTominay", "McGregor", "Christie", "Gilmour", "Tierney", "Armstrong", "Hanley", "Adams", "Dykes", "Fraser", "Ralston", "Hickey"] },
  Greece: { first: ["Giannis", "Kostas", "Sotiris", "Dimitrios", "Nikos", "Panagiotis", "Thanasis", "Georgios", "Vasilis", "Andreas", "Christos", "Petros", "Stefanos", "Michalis"], last: ["Papadopoulos", "Antetokounmpo", "Sloukas", "Papanikolaou", "Kalaitzakis", "Larentzakis", "Dorsey", "Toliopoulos", "Mitoglou", "Katsivelis", "Agravanis", "Kalinic", "Bochoridis", "Samodurov"] },
  Canada: { first: ["Connor", "Sidney", "Nathan", "Cale", "Brayden", "Mitch", "Aaron", "Mark", "Bo", "Sam", "Dylan", "Morgan", "Sean", "Devon"], last: ["McDavid", "Crosby", "MacKinnon", "Makar", "Point", "Marner", "Ekblad", "Stone", "Horvat", "Reinhart", "Larkin", "Rielly", "Couturier", "Toews"] },
  _default: { first: ["Alex", "Marco", "Luka", "Diego", "Marc", "Leo", "Ivan", "Nico", "Omar", "Sami", "Andrei", "Petar", "Milan", "Dani", "Emir", "Jonas"], last: ["Novak", "Silva", "Costa", "Petrov", "Ibrahim", "Kovač", "Hansen", "Moreno", "Popović", "Marković", "Andersen", "Vidal", "Okafor", "Traoré", "Nakamura", "Reyes"] },
};

/* esports use gamertags, not real names */
const GAMERTAGS = ["Vortex", "Phantom", "Zephyr", "Blaze", "Nova", "Cipher", "Reaper", "Frost", "Talon", "Echo", "Havoc", "Specter", "Rogue", "Pulse", "Venom", "Shadow", "Titan", "Drift", "Onyx", "Rift", "Volt", "Kairo", "Nexus", "Ember"];

/* F1 driver grid (well-known names) */
const F1_DRIVERS = [
  { name: "Max Verstappen", team: "Red Bull" },
  { name: "Lando Norris", team: "McLaren" },
  { name: "Charles Leclerc", team: "Ferrari" },
  { name: "Lewis Hamilton", team: "Ferrari" },
  { name: "Oscar Piastri", team: "McLaren" },
  { name: "George Russell", team: "Mercedes" },
  { name: "Carlos Sainz", team: "Williams" },
  { name: "Fernando Alonso", team: "Aston Martin" },
  { name: "Sergio Pérez", team: "Red Bull" },
  { name: "Pierre Gasly", team: "Alpine" },
  { name: "Yuki Tsunoda", team: "RB" },
  { name: "Alex Albon", team: "Williams" },
];

/* ---------- position templates ---------- */
const FORMATIONS = {
  football: { label: "4-3-3", starting: ["GK", "RB", "CB", "CB", "LB", "CDM", "CM", "CAM", "RW", "ST", "LW"], bench: ["GK", "DEF", "MID", "MID", "FWD"] },
  cricket: { label: "Playing XI", starting: ["Opener", "Opener", "Top order", "Top order", "Middle order", "Wicket-keeper", "All-rounder", "All-rounder", "Bowler", "Bowler", "Bowler"], bench: ["Batter", "Bowler", "All-rounder"] },
  basketball: { label: "Starting 5", starting: ["PG", "SG", "SF", "PF", "C"], bench: ["G", "G", "F", "F", "C"] },
  kabaddi: { label: "Starting 7", starting: ["Raider", "Raider", "All-rounder", "Left Corner", "Right Corner", "Left Cover", "Right Cover"], bench: ["Raider", "Defender", "All-rounder"] },
  fieldhockey: { label: "Starting XI", starting: ["GK", "Full-back", "Full-back", "Half-back", "Half-back", "Half-back", "Centre-fwd", "Left-wing", "Right-wing", "Inside-fwd", "Inside-fwd"], bench: ["GK", "DEF", "MID", "FWD"] },
  icehockey: { label: "Starting Line", starting: ["Goalie", "Left D", "Right D", "Centre", "Left Wing", "Right Wing"], bench: ["Goalie", "Defence", "Defence", "Forward", "Forward"] },
  baseball: { label: "Batting Order", starting: ["Pitcher", "Catcher", "1st Base", "2nd Base", "3rd Base", "Shortstop", "Left Field", "Centre Field", "Right Field"], bench: ["Reliever", "Infield", "Outfield", "DH"] },
  esports_moba: { label: "Roster", starting: ["Top", "Jungle", "Mid", "Bot (ADC)", "Support"], bench: ["Substitute", "Head Coach"] },
  esports_dota: { label: "Roster", starting: ["Carry", "Mid", "Offlane", "Soft Support", "Hard Support"], bench: ["Substitute", "Head Coach"] },
  esports_fps: { label: "Roster", starting: ["Duelist", "Controller", "Initiator", "Sentinel", "IGL / Flex"], bench: ["Substitute", "Head Coach"] },
};

function pickFormation(sport, league) {
  const lg = (league || "").toLowerCase();
  if (sport === "hockey") return lg.includes("nhl") ? FORMATIONS.icehockey : FORMATIONS.fieldhockey;
  if (sport === "esports") {
    if (lg.includes("lol") || lg.includes("league of legends")) return FORMATIONS.esports_moba;
    if (lg.includes("dota")) return FORMATIONS.esports_dota;
    return FORMATIONS.esports_fps;
  }
  return FORMATIONS[sport] || null;
}

function makeNamer(rng, pool) {
  const used = new Set();
  return function () {
    for (let attempt = 0; attempt < 40; attempt++) {
      const f = pool.first[Math.floor(rng() * pool.first.length)];
      const l = pool.last[Math.floor(rng() * pool.last.length)];
      const name = `${f} ${l}`;
      if (!used.has(name)) {
        used.add(name);
        return name;
      }
    }
    // fallback with numeric suffix to guarantee uniqueness
    const name = `${pool.first[0]} ${pool.last[Math.floor(rng() * pool.last.length)]} ${used.size}`;
    used.add(name);
    return name;
  };
}

function makeGamertagNamer(rng) {
  const used = new Set();
  return function () {
    for (let attempt = 0; attempt < 40; attempt++) {
      const tag = GAMERTAGS[Math.floor(rng() * GAMERTAGS.length)];
      if (!used.has(tag)) {
        used.add(tag);
        return tag;
      }
    }
    const tag = `${GAMERTAGS[0]}${used.size}`;
    used.add(tag);
    return tag;
  };
}

function uniqueNumbers(rng, count, max) {
  const set = new Set();
  while (set.size < count) {
    set.add(1 + Math.floor(rng() * max));
  }
  return [...set];
}

function buildTeamSquad(matchId, teamName, sport, league, region) {
  const form = pickFormation(sport, league);
  if (!form) return null;
  const rng = mulberry32(seedFrom(`${matchId}|${teamName}|${sport}`));
  const isEsports = sport === "esports";
  const namer = isEsports ? makeGamertagNamer(rng) : makeNamer(rng, NAMES[region] || NAMES._default);
  const numbers = uniqueNumbers(rng, form.starting.length + form.bench.length, 99);
  const captainIdx = Math.floor(rng() * form.starting.length);

  const starting = form.starting.map((pos, i) => ({
    number: numbers[i],
    name: namer(),
    pos,
    captain: i === captainIdx,
  }));
  const bench = form.bench.map((pos, i) => ({
    number: numbers[form.starting.length + i],
    name: namer(),
    pos,
    captain: false,
  }));
  return { team: teamName, formation: form.label, starting, bench };
}

/**
 * Public: build a full lineup payload for a match object.
 * Returns { format, home, away } or { format:"grid", grid } for motorsport,
 * or { format:"individual", ... } for 1v1 sports (tennis/badminton).
 */
function buildLineup(match) {
  if (!match) return null;
  const { id, sport, league, home, away, region } = match;

  // Individual sports — the "team" IS the athlete. Show the athlete + support staff.
  if (sport === "tennis" || sport === "badminton") {
    const support = ["Head Coach", "Fitness Trainer", "Physiotherapist"];
    const side = (athlete) => ({
      athlete,
      support: support.map((role) => ({ role })),
    });
    return { format: "individual", sport, league, home: side(home), away: side(away) };
  }

  // Motorsport — show the starting grid instead of two squads.
  if (sport === "f1") {
    const rng = mulberry32(seedFrom(`${id}|grid`));
    // slight shuffle of the top order for variety per event
    const drivers = F1_DRIVERS.slice();
    for (let i = 2; i < drivers.length; i++) {
      if (rng() < 0.35) {
        const j = i - 1;
        [drivers[i], drivers[j]] = [drivers[j], drivers[i]];
      }
    }
    return {
      format: "grid",
      sport,
      league,
      circuit: `${home}${away ? " · " + away : ""}`,
      grid: drivers.map((d, i) => ({ pos: i + 1, name: d.name, team: d.team })),
    };
  }

  // Team sports.
  const homeSquad = buildTeamSquad(id, home, sport, league, region);
  const awaySquad = buildTeamSquad(id, away, sport, league, region);
  if (!homeSquad || !awaySquad) return null;
  return { format: "team", sport, league, home: homeSquad, away: awaySquad };
}

module.exports = { buildLineup };
