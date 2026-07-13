"use strict";

/**
 * SportSphere — backend (Node.js native http, no framework).
 *
 * Features:
 *   - DYNAMIC multi-sport matches: real fixtures/results from TheSportsDB
 *     (see sportsdata.js), with graceful fallback to bundled sample data.
 *   - Highlights feed.
 *   - Rich player profiles: career + personal/professional lifestyle +
 *     social media, enriched with live data (photo, bio, handles) when online.
 *   - GAMES: play mini-games to earn points; points convert to wallet money.
 *   - WALLET (demo money): balance, points, add money, pay merchants across
 *     categories (food, groceries, goods, bills, recharge), peer transfers,
 *     watch-to-earn cashback, and points redemption.
 *
 * NOTE: All money here is DEMO/PLAY money. Real money movement needs
 * banking/PPI licences, KYC and PCI compliance and is out of scope.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const store = require("./store");
const sportsdata = require("./sportsdata");
const lineups = require("./lineups");
const performance = require("./performance");

const PORT = Number(process.env.PORT) || 8795;
const ADMIN_SECRET = process.env.ADMIN_SECRET || "change-me";
const PUBLIC_DIR = path.join(__dirname, "..", "public");

/* ============================================================
   Static seed data (fallback + always-on content)
   ============================================================ */

const SPORTS = [
  { id: "cricket", name: "Cricket", icon: "🏏" },
  { id: "football", name: "Football", icon: "⚽" },
  { id: "basketball", name: "Basketball", icon: "🏀" },
  { id: "tennis", name: "Tennis", icon: "🎾" },
  { id: "kabaddi", name: "Kabaddi", icon: "🤼" },
  { id: "hockey", name: "Hockey", icon: "🏑" },
  { id: "badminton", name: "Badminton", icon: "🏸" },
  { id: "esports", name: "Esports", icon: "🎮" },
  { id: "f1", name: "Motorsport", icon: "🏎️" },
  { id: "baseball", name: "Baseball", icon: "⚾" },
];

// Sample matches double as the fallback when the live API is unreachable.
// A broad, global board across many countries, leagues and sports.
const SAMPLE_MATCHES = [
  // ---- Football (worldwide) ----
  { id: "m1", sport: "football", league: "Premier League", home: "Man City", away: "Liverpool", status: "LIVE", scoreHome: "2", scoreAway: "1", clock: "67'", region: "England", city: "Manchester", lat: 53.483, lon: -2.2, viewers: 1542100 },
  { id: "m2", sport: "football", league: "Bundesliga", home: "Bayern Munich", away: "Dortmund", status: "LIVE", scoreHome: "3", scoreAway: "2", clock: "72'", region: "Germany", city: "Munich", lat: 48.135, lon: 11.582, viewers: 987400 },
  { id: "m3", sport: "football", league: "Serie A", home: "Inter Milan", away: "Juventus", status: "LIVE", scoreHome: "1", scoreAway: "1", clock: "58'", region: "Italy", city: "Milan", lat: 45.464, lon: 9.19, viewers: 764200 },
  { id: "m4", sport: "football", league: "Ligue 1", home: "PSG", away: "Marseille", status: "LIVE", scoreHome: "2", scoreAway: "0", clock: "61'", region: "France", city: "Paris", lat: 48.856, lon: 2.352, viewers: 812900 },
  { id: "m5", sport: "football", league: "La Liga", home: "Real Madrid", away: "Barcelona", status: "UPCOMING", scoreHome: "—", scoreAway: "—", clock: "Starts 20:45", region: "Spain", city: "Madrid", lat: 40.453, lon: -3.688, viewers: 0 },
  { id: "m6", sport: "football", league: "Saudi Pro League", home: "Al Nassr", away: "Al Hilal", status: "LIVE", scoreHome: "1", scoreAway: "2", clock: "77'", region: "Saudi Arabia", city: "Riyadh", lat: 24.713, lon: 46.675, viewers: 655300 },
  { id: "m7", sport: "football", league: "Brasileirão", home: "Flamengo", away: "Palmeiras", status: "LIVE", scoreHome: "0", scoreAway: "0", clock: "34'", region: "Brazil", city: "Rio de Janeiro", lat: -22.906, lon: -43.172, viewers: 543800 },
  { id: "m8", sport: "football", league: "MLS", home: "Inter Miami", away: "LA Galaxy", status: "UPCOMING", scoreHome: "—", scoreAway: "—", clock: "Starts 02:30", region: "USA", city: "Miami", lat: 25.761, lon: -80.191, viewers: 0 },
  { id: "m9", sport: "football", league: "Eredivisie", home: "Ajax", away: "PSV", status: "FINISHED", scoreHome: "2", scoreAway: "3", clock: "Full time", region: "Netherlands", city: "Amsterdam", lat: 52.367, lon: 4.904, viewers: 288100 },
  { id: "m10", sport: "football", league: "Scottish Premiership", home: "Celtic", away: "Rangers", status: "LIVE", scoreHome: "1", scoreAway: "0", clock: "52'", region: "Scotland", city: "Glasgow", lat: 55.864, lon: -4.251, viewers: 402700 },
  { id: "m11", sport: "football", league: "UEFA Champions League", home: "Arsenal", away: "Bayern Munich", status: "UPCOMING", scoreHome: "—", scoreAway: "—", clock: "Starts 00:00", region: "England", city: "London", lat: 51.555, lon: -0.108, viewers: 0 },
  // ---- Cricket ----
  { id: "m12", sport: "cricket", league: "IPL", home: "Hyderabad Sunrisers", away: "Chennai Kings", status: "LIVE", scoreHome: "142/3", scoreAway: "—", clock: "14.2 ov", region: "India", city: "Hyderabad", lat: 17.406, lon: 78.55, viewers: 823450 },
  { id: "m13", sport: "cricket", league: "ODI Series", home: "India", away: "Australia", status: "LIVE", scoreHome: "210/4", scoreAway: "—", clock: "32.1 ov", region: "India", city: "Mumbai", lat: 19.076, lon: 72.877, viewers: 1120000 },
  { id: "m14", sport: "cricket", league: "Test Match", home: "England", away: "Pakistan", status: "LIVE", scoreHome: "320/6", scoreAway: "—", clock: "Day 2 · 88 ov", region: "England", city: "London", lat: 51.507, lon: -0.127, viewers: 214500 },
  { id: "m15", sport: "cricket", league: "Big Bash League", home: "Sydney Sixers", away: "Melbourne Stars", status: "UPCOMING", scoreHome: "—", scoreAway: "—", clock: "Starts 13:45", region: "Australia", city: "Sydney", lat: -33.868, lon: 151.209, viewers: 0 },
  { id: "m16", sport: "cricket", league: "The Hundred", home: "London Spirit", away: "Oval Invincibles", status: "UPCOMING", scoreHome: "—", scoreAway: "—", clock: "Starts 22:00", region: "England", city: "London", lat: 51.529, lon: -0.173, viewers: 0 },
  // ---- Basketball ----
  { id: "m17", sport: "basketball", league: "NBA", home: "Lakers", away: "Celtics", status: "LIVE", scoreHome: "88", scoreAway: "91", clock: "Q3 4:12", region: "USA", city: "Los Angeles", lat: 34.043, lon: -118.267, viewers: 981200 },
  { id: "m18", sport: "basketball", league: "NBA", home: "Warriors", away: "Nuggets", status: "LIVE", scoreHome: "76", scoreAway: "74", clock: "Q3 1:05", region: "USA", city: "San Francisco", lat: 37.774, lon: -122.419, viewers: 712300 },
  { id: "m19", sport: "basketball", league: "EuroLeague", home: "Real Madrid", away: "Olympiacos", status: "UPCOMING", scoreHome: "—", scoreAway: "—", clock: "Starts 21:00", region: "Spain", city: "Madrid", lat: 40.424, lon: -3.681, viewers: 0 },
  // ---- Tennis ----
  { id: "m20", sport: "tennis", league: "ATP Finals", home: "N. Djokovic", away: "C. Alcaraz", status: "UPCOMING", scoreHome: "—", scoreAway: "—", clock: "Starts 19:30", region: "Italy", city: "Turin", lat: 45.07, lon: 7.686, viewers: 0 },
  { id: "m21", sport: "tennis", league: "WTA Tour", home: "I. Swiatek", away: "A. Sabalenka", status: "LIVE", scoreHome: "6-4, 3", scoreAway: "2", clock: "Set 2", region: "USA", city: "New York", lat: 40.749, lon: -73.845, viewers: 328400 },
  // ---- Kabaddi ----
  { id: "m22", sport: "kabaddi", league: "Pro Kabaddi", home: "Telugu Titans", away: "Bengal Warriors", status: "LIVE", scoreHome: "28", scoreAway: "24", clock: "H2 8:40", region: "India", city: "Hyderabad", lat: 17.42, lon: 78.45, viewers: 412000 },
  { id: "m23", sport: "kabaddi", league: "Pro Kabaddi", home: "Patna Pirates", away: "U Mumba", status: "UPCOMING", scoreHome: "—", scoreAway: "—", clock: "Starts 20:00", region: "India", city: "Patna", lat: 25.594, lon: 85.137, viewers: 0 },
  // ---- Hockey ----
  { id: "m24", sport: "hockey", league: "FIH Pro League", home: "India", away: "Australia", status: "LIVE", scoreHome: "3", scoreAway: "2", clock: "Q4 6:20", region: "India", city: "Bhubaneswar", lat: 20.296, lon: 85.824, viewers: 334000 },
  { id: "m25", sport: "hockey", league: "NHL", home: "NY Rangers", away: "Boston Bruins", status: "LIVE", scoreHome: "2", scoreAway: "2", clock: "P2 5:48", region: "USA", city: "New York", lat: 40.75, lon: -73.993, viewers: 288700 },
  // ---- Badminton ----
  { id: "m26", sport: "badminton", league: "BWF World Tour", home: "P.V. Sindhu", away: "Tai Tzu-ying", status: "FINISHED", scoreHome: "21-19, 21-17", scoreAway: "—", clock: "Full time", region: "India", city: "Hyderabad", lat: 17.41, lon: 78.47, viewers: 221000 },
  { id: "m27", sport: "badminton", league: "BWF World Tour", home: "V. Axelsen", away: "K. Momota", status: "LIVE", scoreHome: "21-18, 12", scoreAway: "9", clock: "Game 2", region: "Japan", city: "Tokyo", lat: 35.676, lon: 139.65, viewers: 176500 },
  // ---- Esports ----
  { id: "m28", sport: "esports", league: "Valorant Champions", home: "Team Vitality", away: "Sentinels", status: "LIVE", scoreHome: "12", scoreAway: "10", clock: "Map 2", region: "Germany", city: "Berlin", lat: 52.52, lon: 13.405, viewers: 2105000 },
  { id: "m29", sport: "esports", league: "LoL Worlds", home: "T1", away: "G2 Esports", status: "LIVE", scoreHome: "1", scoreAway: "1", clock: "Game 3", region: "South Korea", city: "Seoul", lat: 37.566, lon: 126.978, viewers: 3480000 },
  { id: "m30", sport: "esports", league: "Dota 2 · The International", home: "Team Spirit", away: "Gaimin Gladiators", status: "UPCOMING", scoreHome: "—", scoreAway: "—", clock: "Starts 18:00", region: "Global", city: "Copenhagen", lat: 55.676, lon: 12.568, viewers: 0 },
  // ---- Motorsport ----
  { id: "m31", sport: "f1", league: "Formula 1", home: "British GP", away: "Silverstone", status: "UPCOMING", scoreHome: "—", scoreAway: "—", clock: "Race Sun 15:00", region: "England", city: "Silverstone", lat: 52.071, lon: -1.016, viewers: 0 },
  { id: "m32", sport: "f1", league: "Formula 1", home: "Monaco GP", away: "Monte Carlo", status: "UPCOMING", scoreHome: "—", scoreAway: "—", clock: "Race Sun 15:00", region: "Monaco", city: "Monte Carlo", lat: 43.738, lon: 7.424, viewers: 0 },
  // ---- Baseball ----
  { id: "m33", sport: "baseball", league: "MLB", home: "Yankees", away: "Red Sox", status: "FINISHED", scoreHome: "5", scoreAway: "3", clock: "Final", region: "USA", city: "New York", lat: 40.829, lon: -73.926, viewers: 612000 },
  { id: "m34", sport: "baseball", league: "MLB", home: "Dodgers", away: "Giants", status: "LIVE", scoreHome: "4", scoreAway: "2", clock: "Inn 6", region: "USA", city: "Los Angeles", lat: 34.073, lon: -118.24, viewers: 458000 },
];

const HIGHLIGHTS = [
  { id: "h1", matchId: "m8", title: "Sindhu's championship point smash", sport: "badminton", duration: "0:48", views: 1204000, trending: true },
  { id: "h2", matchId: "m12", title: "Walk-off double in the 9th", sport: "baseball", duration: "1:12", views: 880000 },
  { id: "h3", matchId: "m2", title: "Stunning long-range winner", sport: "football", duration: "0:35", views: 2450000, trending: true },
  { id: "h4", matchId: "m1", title: "Six sixes in an over", sport: "cricket", duration: "1:30", views: 3100000, trending: true },
  { id: "h5", matchId: "m9", title: "1v4 clutch to win the map", sport: "esports", duration: "0:52", views: 1650000 },
  { id: "h6", matchId: "m11", title: "Last-minute penalty corner goal", sport: "hockey", duration: "0:41", views: 540000 },
  { id: "h7", matchId: "m3", title: "Buzzer-beater three to seal it", sport: "basketball", duration: "0:29", views: 1980000, trending: true },
  { id: "h8", matchId: "m7", title: "El Clasico free-kick masterclass", sport: "football", duration: "0:44", views: 2760000 },
  { id: "h9", matchId: "m5", title: "40-shot rally of the season", sport: "tennis", duration: "1:05", views: 720000 },
  { id: "h10", matchId: "m4", title: "Super raid: 5 points in one dash", sport: "kabaddi", duration: "0:38", views: 610000 },
];

// Rich player profiles — personal + professional + social.
const PLAYERS = [
  {
    id: "p1", name: "Virat Kohli", sport: "cricket", country: "India", role: "Batsman", age: 37, team: "Royal Challengers", rating: 96,
    tagline: "Run machine · fitness icon", born: "Nov 5, 1988 · Delhi, India",
    career: { matches: 520, runs: 26000, avg: 53.4, centuries: 80, titles: 9 },
    lifestyle: { fitness: "Elite endurance training, plant-forward no-sugar diet", diet: "Vegetarian, high-protein", interests: ["Fitness", "Football", "Investing"], foundation: "Virat Kohli Foundation — youth sport", family: "Married to actor Anushka Sharma; two children" },
    social: { twitter: "https://twitter.com/imVkohli", instagram: "https://instagram.com/virat.kohli", followersM: 271, engagement: "2.4%" },
    bio: "One of the greatest run-scorers in cricket history, known for his aggressive style, world-class fitness and business ventures across fashion, fitness and esports.",
  },
  {
    id: "p2", name: "Erling Haaland", sport: "football", country: "Norway", role: "Striker", age: 25, team: "Man City", rating: 94,
    tagline: "Goal machine", born: "Jul 21, 2000 · Leeds, England",
    career: { matches: 310, goals: 280, assists: 60, titles: 7 },
    lifestyle: { fitness: "Sleep-optimised recovery, cold plunges, blue-light control", diet: "Grass-fed meat, liver, heart", interests: ["Gaming", "Golf", "Meditation"], foundation: "Grassroots football in Norway", family: "Son of ex-footballer Alf-Inge Haaland" },
    social: { twitter: "https://twitter.com/ErlingHaaland", instagram: "https://instagram.com/erling.haaland", followersM: 43, engagement: "6.1%" },
    bio: "A record-breaking striker famed for his pace, power and clinical finishing, rewriting scoring records in his early twenties.",
  },
  {
    id: "p3", name: "LeBron James", sport: "basketball", country: "USA", role: "Forward", age: 41, team: "LA Lakers", rating: 93,
    tagline: "King James", born: "Dec 30, 1984 · Akron, USA",
    career: { matches: 1490, points: 40000, assists: 11000, titles: 4 },
    lifestyle: { fitness: "Reportedly ~$1M/yr on body maintenance, cryo & yoga", diet: "Lean, low-sugar, seasonal", interests: ["Business", "Media", "Wine"], foundation: "LeBron James Family Foundation — I PROMISE School", family: "Married to Savannah James; three children" },
    social: { twitter: "https://twitter.com/KingJames", instagram: "https://instagram.com/kingjames", followersM: 159, engagement: "1.9%" },
    bio: "A four-time NBA champion and the league's all-time leading scorer, equally influential as an athlete, entrepreneur and philanthropist.",
  },
  {
    id: "p4", name: "P.V. Sindhu", sport: "badminton", country: "India", role: "Singles", age: 30, team: "India", rating: 90,
    tagline: "Olympic medallist", born: "Jul 5, 1995 · Hyderabad, India",
    career: { matches: 420, titles: 14, olympicMedals: 2, worldChamp: 1 },
    lifestyle: { fitness: "6am court sessions + strength & agility work", diet: "South-Indian balanced, coach-planned", interests: ["Cooking", "Travel", "Mentoring"], foundation: "Girls in sport initiatives", family: "From a family of volleyball players" },
    social: { twitter: "https://twitter.com/Pvsindhu1", instagram: "https://instagram.com/pvsindhu1", followersM: 6.1, engagement: "3.3%" },
    bio: "India's badminton superstar and two-time Olympic medallist, celebrated for her powerful smashes and relentless court coverage.",
  },
  {
    id: "p5", name: "Carlos Alcaraz", sport: "tennis", country: "Spain", role: "Singles", age: 22, team: "Spain", rating: 92,
    tagline: "Next-gen No.1", born: "May 5, 2003 · Murcia, Spain",
    career: { matches: 320, titles: 16, slams: 4 },
    lifestyle: { fitness: "Clay-court endurance blocks, explosive footwork drills", diet: "Mediterranean, coach-managed", interests: ["Golf", "Music", "Football"], foundation: "Tennis academy scholarships", family: "Trained by ex-No.1 Juan Carlos Ferrero" },
    social: { twitter: "https://twitter.com/carlosalcaraz", instagram: "https://instagram.com/carlitosalcarazz", followersM: 8.4, engagement: "5.2%" },
    bio: "A dynamic all-court player and multiple Grand Slam champion, widely seen as the face of tennis's new generation.",
  },
  {
    id: "p6", name: "Pawan Sehrawat", sport: "kabaddi", country: "India", role: "Raider", age: 29, team: "Telugu Titans", rating: 89,
    tagline: "Hi-Flyer", born: "Jan 1, 1997 · Delhi, India",
    career: { matches: 180, raidPoints: 1400, titles: 3 },
    lifestyle: { fitness: "Wrestling base + sprint & plyometric training", diet: "High-protein North-Indian", interests: ["Farming", "Fitness"], foundation: "Rural sports camps", family: "Grew up wrestling in Delhi akhadas" },
    social: { twitter: "https://twitter.com/pawansehrawat07", instagram: "https://instagram.com/pawansehrawat_07", followersM: 1.2, engagement: "4.8%" },
    bio: "Kabaddi's record-breaking raider, famed for single-handedly winning matches with explosive multi-point raids.",
  },
  {
    id: "p7", name: "Shubman Gill", sport: "cricket", country: "India", role: "Batsman", age: 26, team: "Gujarat Titans", rating: 88,
    tagline: "Prince of Indian cricket", born: "Sep 8, 1999 · Fazilka, India",
    career: { matches: 220, runs: 9800, avg: 47.9, centuries: 22, titles: 2 },
    lifestyle: { fitness: "Mobility-first training, disciplined recovery", diet: "Punjabi balanced, nutritionist-led", interests: ["Cars", "Photography"], foundation: "Cricket coaching for rural kids", family: "Coached by his father from childhood" },
    social: { twitter: "https://twitter.com/ShubmanGill", instagram: "https://instagram.com/shubmangill", followersM: 14, engagement: "5.6%" },
    bio: "An elegant top-order batsman and captain, known for effortless timing and a fast-rising leadership career.",
  },
  {
    id: "p8", name: "Kylian Mbappe", sport: "football", country: "France", role: "Forward", age: 27, team: "Real Madrid", rating: 95,
    tagline: "Speed & silverware", born: "Dec 20, 1998 · Paris, France",
    career: { matches: 400, goals: 320, assists: 130, titles: 12 },
    lifestyle: { fitness: "Sprint mechanics, recovery science, mental coaching", diet: "Lean performance nutrition", interests: ["Gaming", "Philanthropy", "Fashion"], foundation: "Inspired By KM — funds kids' sport", family: "Brother Ethan also a footballer" },
    social: { twitter: "https://twitter.com/KMbappe", instagram: "https://instagram.com/k.mbappe", followersM: 120, engagement: "3.1%" },
    bio: "A World Cup-winning forward whose blistering pace and finishing make him one of the most marketable athletes on earth.",
  },
  {
    id: "p9", name: "Lionel Messi", sport: "football", country: "Argentina", role: "Forward", age: 38, team: "Inter Miami", rating: 96,
    tagline: "The GOAT", born: "Jun 24, 1987 · Rosario, Argentina",
    career: { matches: 1080, goals: 850, assists: 380, titles: 44 },
    lifestyle: { fitness: "Low-impact recovery, tailored mobility work", diet: "Anti-inflammatory, minimal sugar", interests: ["Family", "Mate tea", "Football"], foundation: "Leo Messi Foundation — children's health & education", family: "Married to Antonela Roccuzzo; three sons" },
    social: { twitter: "https://twitter.com/WeAreMessi", instagram: "https://instagram.com/leomessi", followersM: 505, engagement: "4.0%" },
    bio: "A World Cup winner and record eight-time Ballon d'Or recipient, widely regarded as the greatest footballer of all time.",
  },
  {
    id: "p10", name: "Cristiano Ronaldo", sport: "football", country: "Portugal", role: "Forward", age: 41, team: "Al Nassr", rating: 93,
    tagline: "Mr. Champions League", born: "Feb 5, 1985 · Funchal, Portugal",
    career: { matches: 1270, goals: 900, assists: 260, titles: 34 },
    lifestyle: { fitness: "Five daily workouts, ice baths, ~7 short sleeps", diet: "Six small high-protein meals, no alcohol", interests: ["Fitness", "Business", "Family"], foundation: "Donates to children's hospitals & disaster relief", family: "Partner Georgina Rodríguez; five children" },
    social: { twitter: "https://twitter.com/Cristiano", instagram: "https://instagram.com/cristiano", followersM: 640, engagement: "2.8%" },
    bio: "The most-followed person on the planet and a five-time Champions League winner, famed for his athleticism and longevity.",
  },
  {
    id: "p11", name: "Rohit Sharma", sport: "cricket", country: "India", role: "Batsman", age: 38, team: "Mumbai Indians", rating: 91,
    tagline: "Hitman", born: "Apr 30, 1987 · Nagpur, India",
    career: { matches: 490, runs: 19000, avg: 45.2, centuries: 48, titles: 6 },
    lifestyle: { fitness: "Rotational power & vision training", diet: "Balanced Indian, nutritionist-planned", interests: ["Wildlife conservation", "Cars"], foundation: "Rohit4Rhinos — wildlife protection", family: "Married to Ritika Sajdeh; one daughter" },
    social: { twitter: "https://twitter.com/ImRo45", instagram: "https://instagram.com/rohitsharma45", followersM: 30, engagement: "3.6%" },
    bio: "A prolific opening batsman and World Cup-winning captain, holder of the record for the highest individual ODI score.",
  },
  {
    id: "p12", name: "Jasprit Bumrah", sport: "cricket", country: "India", role: "Bowler", age: 32, team: "Mumbai Indians", rating: 92,
    tagline: "Yorker king", born: "Dec 6, 1993 · Ahmedabad, India",
    career: { matches: 260, wickets: 480, avg: 20.1, titles: 4 },
    lifestyle: { fitness: "Workload management, shoulder & core stability", diet: "Lean high-protein, physio-managed", interests: ["Music", "Gaming"], foundation: "Grassroots fast-bowling clinics", family: "Married to sports presenter Sanjana Ganesan" },
    social: { twitter: "https://twitter.com/Jaspritbumrah93", instagram: "https://instagram.com/jaspritb1", followersM: 12, engagement: "4.9%" },
    bio: "One of the world's most feared fast bowlers, renowned for his unorthodox action and deadly yorkers in the death overs.",
  },
  {
    id: "p13", name: "Stephen Curry", sport: "basketball", country: "USA", role: "Guard", age: 37, team: "Golden State Warriors", rating: 94,
    tagline: "Greatest shooter ever", born: "Mar 14, 1988 · Akron, USA",
    career: { matches: 1030, points: 24000, threes: 3800, titles: 4 },
    lifestyle: { fitness: "Neuro-vision drills, ankle stability, mobility", diet: "Low-inflammation, mostly plant-forward", interests: ["Golf", "Faith", "Youth education"], foundation: "Eat. Learn. Play. — child hunger & literacy", family: "Married to Ayesha Curry; four children" },
    social: { twitter: "https://twitter.com/StephenCurry30", instagram: "https://instagram.com/stephencurry30", followersM: 56, engagement: "3.4%" },
    bio: "A four-time NBA champion who revolutionised the game with his long-range shooting and is the league's all-time three-point leader.",
  },
  {
    id: "p14", name: "Giannis Antetokounmpo", sport: "basketball", country: "Greece", role: "Forward", age: 31, team: "Milwaukee Bucks", rating: 95,
    tagline: "Greek Freak", born: "Dec 6, 1994 · Athens, Greece",
    career: { matches: 900, points: 20000, rebounds: 9000, titles: 1 },
    lifestyle: { fitness: "Explosive plyometrics, length & agility work", diet: "High-calorie clean bulk", interests: ["Family", "Chess", "Reading"], foundation: "Charity for underprivileged youth in Greece", family: "Partner Mariah Riddlesprigger; three children" },
    social: { twitter: "https://twitter.com/Giannis_An34", instagram: "https://instagram.com/giannis_an34", followersM: 18, engagement: "4.2%" },
    bio: "An NBA champion and two-time MVP whose blend of size, speed and skill makes him one of basketball's most dominant forces.",
  },
  {
    id: "p15", name: "Novak Djokovic", sport: "tennis", country: "Serbia", role: "Singles", age: 38, team: "Serbia", rating: 95,
    tagline: "Record slam king", born: "May 22, 1987 · Belgrade, Serbia",
    career: { matches: 1350, titles: 99, slams: 24 },
    lifestyle: { fitness: "Flexibility, breathing & mindfulness routines", diet: "Strict gluten-free plant-based", interests: ["Meditation", "Wine", "Languages"], foundation: "Novak Djokovic Foundation — early childhood education", family: "Married to Jelena Djokovic; two children" },
    social: { twitter: "https://twitter.com/DjokerNole", instagram: "https://instagram.com/djokernole", followersM: 15, engagement: "3.0%" },
    bio: "The all-time record holder for men's Grand Slam singles titles, celebrated for his elasticity, return game and mental toughness.",
  },
  {
    id: "p16", name: "Iga Swiatek", sport: "tennis", country: "Poland", role: "Singles", age: 24, team: "Poland", rating: 93,
    tagline: "Clay-court queen", born: "May 31, 2001 · Warsaw, Poland",
    career: { matches: 420, titles: 24, slams: 5 },
    lifestyle: { fitness: "Endurance blocks with a sports psychologist", diet: "Performance nutrition, pasta pre-match", interests: ["Music", "Puzzles", "Reading"], foundation: "Mental-health awareness in sport", family: "Daughter of Olympic rower Tomasz Swiatek" },
    social: { twitter: "https://twitter.com/iga_swiatek", instagram: "https://instagram.com/iga.swiatek", followersM: 4.5, engagement: "5.5%" },
    bio: "A multiple Grand Slam champion and long-reigning world No.1, dominant on clay and admired for her focus and topspin.",
  },
  {
    id: "p17", name: "Viktor Axelsen", sport: "badminton", country: "Denmark", role: "Singles", age: 32, team: "Denmark", rating: 91,
    tagline: "Olympic champion", born: "Jan 4, 1994 · Odense, Denmark",
    career: { matches: 480, titles: 30, olympicGold: 1, worldChamp: 2 },
    lifestyle: { fitness: "High-altitude endurance camps in Dubai", diet: "Lean Nordic performance nutrition", interests: ["Languages", "Chess", "Mandarin"], foundation: "Youth badminton development", family: "Married to Natalia Koch Rohde; two daughters" },
    social: { twitter: "https://twitter.com/viktoraxelsen", instagram: "https://instagram.com/viktoraxelsen", followersM: 1.6, engagement: "4.5%" },
    bio: "An Olympic gold medallist and two-time world champion, known for his towering smashes and near-flawless court control.",
  },
  {
    id: "p18", name: "Naveen Kumar", sport: "kabaddi", country: "India", role: "Raider", age: 25, team: "Dabang Delhi", rating: 88,
    tagline: "Naveen Express", born: "Jul 3, 2000 · Haryana, India",
    career: { matches: 130, raidPoints: 1200, superRaids: 60, titles: 1 },
    lifestyle: { fitness: "Speed, agility & explosive raiding drills", diet: "High-protein North-Indian", interests: ["Wrestling", "Music"], foundation: "Village kabaddi academies", family: "From a wrestling family in Haryana" },
    social: { twitter: "https://twitter.com/naveenkumar", instagram: "https://instagram.com/naveen_express", followersM: 0.9, engagement: "5.1%" },
    bio: "A record-setting young raider famed for his 'Super Raid' consistency and lightning-quick escapes across the baulk line.",
  },
  {
    id: "p19", name: "Harmanpreet Singh", sport: "hockey", country: "India", role: "Drag-flicker", age: 30, team: "India", rating: 90,
    tagline: "Penalty-corner ace", born: "Jan 6, 1996 · Amritsar, India",
    career: { matches: 240, goals: 200, olympicMedals: 2, titles: 5 },
    lifestyle: { fitness: "Drag-flick power & wrist-strength specific work", diet: "Punjabi high-protein, coach-planned", interests: ["Farming", "Fitness"], foundation: "Grassroots hockey in Punjab", family: "Grew up helping on the family farm" },
    social: { twitter: "https://twitter.com/harmanpreet", instagram: "https://instagram.com/harmanpreet_singh03", followersM: 1.1, engagement: "4.4%" },
    bio: "India's captain and one of the world's best drag-flickers, a two-time Olympic bronze medallist and FIH Player of the Year.",
  },
  {
    id: "p20", name: "Connor McDavid", sport: "hockey", country: "Canada", role: "Centre", age: 29, team: "Edmonton Oilers", rating: 96,
    tagline: "Fastest man on ice", born: "Jan 13, 1997 · Richmond Hill, Canada",
    career: { matches: 720, goals: 360, assists: 720, titles: 0 },
    lifestyle: { fitness: "Edge-work, sprint skating & explosive power", diet: "High-calorie clean performance diet", interests: ["Golf", "Lacrosse"], foundation: "Youth hockey access programs", family: "Engaged to Lauren Kyle" },
    social: { twitter: "https://twitter.com/cmcdavid97", instagram: "https://instagram.com/connormcdavid", followersM: 2.8, engagement: "4.6%" },
    bio: "The NHL's dominant superstar and multiple MVP, renowned for breathtaking speed, vision and playmaking at centre.",
  },
  {
    id: "p21", name: "Faker (Lee Sang-hyeok)", sport: "esports", country: "South Korea", role: "Mid Laner", age: 29, team: "T1", rating: 95,
    tagline: "The Unkillable Demon King", born: "May 7, 1996 · Seoul, South Korea",
    career: { matches: 900, worldTitles: 5, mvpAwards: 2, titles: 12 },
    lifestyle: { fitness: "Wrist care, posture work, disciplined sleep", diet: "Balanced Korean, team-managed", interests: ["Reading", "Investing", "Chess"], foundation: "Mentors young esports talent", family: "Private; devoted to his craft" },
    social: { twitter: "https://twitter.com/faker", instagram: "https://instagram.com/faker", followersM: 3.2, engagement: "6.4%" },
    bio: "The most decorated League of Legends player in history and a five-time world champion, an icon of competitive esports.",
  },
  {
    id: "p22", name: "s1mple (Oleksandr Kostyliev)", sport: "esports", country: "Ukraine", role: "AWPer", age: 28, team: "NAVI", rating: 93,
    tagline: "Best CS player of a generation", born: "Oct 2, 1997 · Kyiv, Ukraine",
    career: { matches: 1200, majorTitles: 1, mvpAwards: 10, titles: 20 },
    lifestyle: { fitness: "Reaction training, wrist & eye care", diet: "Coach-planned performance meals", interests: ["Streaming", "Football"], foundation: "Supports Ukrainian youth esports", family: "Private" },
    social: { twitter: "https://twitter.com/s1mpleO", instagram: "https://instagram.com/s1mpleo", followersM: 2.1, engagement: "5.9%" },
    bio: "A Counter-Strike Major champion and record multiple-time MVP, widely considered one of the greatest CS players ever.",
  },
  {
    id: "p23", name: "Max Verstappen", sport: "f1", country: "Netherlands", role: "Driver", age: 28, team: "Red Bull Racing", rating: 96,
    tagline: "Four-time world champion", born: "Sep 30, 1997 · Hasselt, Belgium",
    career: { races: 220, wins: 65, poles: 45, titles: 4 },
    lifestyle: { fitness: "Neck & core G-force conditioning, sim racing", diet: "Precise performance nutrition", interests: ["Sim racing", "Karting", "Golf"], foundation: "Supports karting for young drivers", family: "Son of ex-F1 driver Jos Verstappen" },
    social: { twitter: "https://twitter.com/Max33Verstappen", instagram: "https://instagram.com/maxverstappen1", followersM: 13, engagement: "4.7%" },
    bio: "A four-time Formula 1 World Champion known for his aggressive racecraft, raw speed and record-breaking win streaks.",
  },
  {
    id: "p24", name: "Lewis Hamilton", sport: "f1", country: "United Kingdom", role: "Driver", age: 40, team: "Ferrari", rating: 93,
    tagline: "Seven-time world champion", born: "Jan 7, 1985 · Stevenage, England",
    career: { races: 360, wins: 105, poles: 104, titles: 7 },
    lifestyle: { fitness: "Plant-based endurance & core work", diet: "Vegan performance nutrition", interests: ["Fashion", "Music", "Activism"], foundation: "Mission 44 — diversity in motorsport & STEM", family: "Private; close with his family" },
    social: { twitter: "https://twitter.com/LewisHamilton", instagram: "https://instagram.com/lewishamilton", followersM: 38, engagement: "3.3%" },
    bio: "A record seven-time Formula 1 World Champion and the sport's most successful driver by wins and poles, and a leading advocate for diversity.",
  },
  {
    id: "p25", name: "Shohei Ohtani", sport: "baseball", country: "Japan", role: "Two-way", age: 31, team: "LA Dodgers", rating: 96,
    tagline: "Two-way phenomenon", born: "Jul 5, 1994 · Oshu, Japan",
    career: { games: 850, homeRuns: 230, pitcherWins: 40, titles: 1 },
    lifestyle: { fitness: "Dual pitcher-hitter strength & recovery program", diet: "Meticulous Japanese performance nutrition", interests: ["Sleep science", "Dogs"], foundation: "Donates gloves to Japanese schoolchildren", family: "Married; famously private" },
    social: { twitter: "https://twitter.com/shoheiohtani", instagram: "https://instagram.com/shoheiohtani", followersM: 9, engagement: "5.8%" },
    bio: "A once-in-a-century two-way baseball superstar and MVP who excels as both an elite pitcher and a power hitter.",
  },
  {
    id: "p26", name: "Aaron Judge", sport: "baseball", country: "USA", role: "Outfielder", age: 33, team: "New York Yankees", rating: 92,
    tagline: "The Judge", born: "Apr 26, 1992 · Linden, USA",
    career: { games: 900, homeRuns: 320, rbi: 700, titles: 0 },
    lifestyle: { fitness: "Power-hitting mechanics & mobility work", diet: "High-protein clean bulk", interests: ["Golf", "Community work"], foundation: "ALL RISE Foundation — youth mentorship", family: "Married to Samantha Bracksieck" },
    social: { twitter: "https://twitter.com/TheJudge44", instagram: "https://instagram.com/thejudge44", followersM: 3.1, engagement: "4.1%" },
    bio: "The Yankees' captain and single-season American League home-run record holder, one of baseball's most feared sluggers.",
  },
];

// Playable mini-games. Points earned convert to wallet money.
const GAMES = [
  { id: "reaction", name: "Reaction Rush", icon: "⚡", tagline: "Tap the instant it turns green", color: "#22c55e", maxPoints: 300, how: "Wait for green, then tap fast. Faster = more points." },
  { id: "quiz", name: "Sports IQ", icon: "🧠", tagline: "5 random sports trivia questions", color: "#6366f1", maxPoints: 500, how: "Answer correctly for 100 points each." },
  { id: "target", name: "Target Blitz", icon: "🎯", tagline: "Hit as many targets in 20s", color: "#f97316", maxPoints: 400, how: "Tap moving targets — 20 points per hit." },
  { id: "streak", name: "Score Streak", icon: "🃏", tagline: "Remember the winning sequence", color: "#ec4899", maxPoints: 350, how: "Repeat the flashing pattern to score." },
  { id: "penalty", name: "Penalty Shootout", icon: "⚽", tagline: "Beat the keeper from the spot", color: "#0ea5e9", maxPoints: 400, how: "Pick a corner and out-guess the keeper. 80 points per goal." },
  { id: "memory", name: "Memory Match", icon: "🧩", tagline: "Flip and match the sport pairs", color: "#14b8a6", maxPoints: 400, how: "Match all pairs in as few moves as possible." },
  { id: "higherlower", name: "Stat Attack", icon: "📈", tagline: "Higher or lower? Guess the stat", color: "#f59e0b", maxPoints: 450, how: "Guess if the next sports stat is higher or lower. 75 points each." },
];

// Trivia bank for the quiz game (server is source of truth for scoring).
const QUIZ = [
  { q: "How many players are on a football (soccer) pitch per team?", options: ["9", "10", "11", "12"], answer: 2 },
  { q: "How many points is a basketball free throw worth?", options: ["1", "2", "3", "4"], answer: 0 },
  { q: "In cricket, how many balls are in one over?", options: ["4", "5", "6", "7"], answer: 2 },
  { q: "Which country has won the most FIFA World Cups?", options: ["Germany", "Brazil", "Italy", "Argentina"], answer: 1 },
  { q: "A tennis match is won by taking how many sets (best of 5)?", options: ["2", "3", "4", "5"], answer: 1 },
  { q: "How many rings are on the Olympic flag?", options: ["4", "5", "6", "7"], answer: 1 },
  { q: "In kabaddi, how many players are on court per team?", options: ["5", "6", "7", "8"], answer: 2 },
  { q: "What is a score of zero called in tennis?", options: ["Nil", "Love", "Duck", "Blank"], answer: 1 },
  { q: "How long is a standard football match (excl. stoppage)?", options: ["60 min", "80 min", "90 min", "100 min"], answer: 2 },
  { q: "Which sport uses a shuttlecock?", options: ["Squash", "Badminton", "Table Tennis", "Cricket"], answer: 1 },
  { q: "How many points is a rugby try worth (union)?", options: ["3", "4", "5", "6"], answer: 2 },
  { q: "In which sport would you perform a 'slam dunk'?", options: ["Volleyball", "Basketball", "Handball", "Netball"], answer: 1 },
  { q: "How many Grand Slam tennis tournaments are there each year?", options: ["2", "3", "4", "5"], answer: 2 },
  { q: "Which country hosts the IPL cricket league?", options: ["Australia", "England", "India", "South Africa"], answer: 2 },
  { q: "How many players are in a basketball team on court?", options: ["4", "5", "6", "7"], answer: 1 },
  { q: "A hat-trick in football means scoring how many goals?", options: ["2", "3", "4", "5"], answer: 1 },
  { q: "Which sport is known as 'the beautiful game'?", options: ["Cricket", "Football", "Tennis", "Hockey"], answer: 1 },
  { q: "In Formula 1, what colour flag signals the end of a race?", options: ["Red", "Yellow", "Chequered", "Green"], answer: 2 },
];

// Merchants the wallet can spend at, grouped by category — real-world brands.
const SPEND_CATEGORIES = [
  { id: "shopping", name: "Online Shopping", icon: "🛍️", merchants: ["Amazon", "Flipkart", "Myntra", "Ajio", "Meesho", "Nykaa"] },
  { id: "travel", name: "Travel & Stays", icon: "✈️", merchants: ["Goibibo", "MakeMyTrip", "IRCTC", "Ola", "Uber", "RedBus"] },
  { id: "food", name: "Food Delivery", icon: "🍔", merchants: ["Swiggy", "Zomato", "Domino's", "KFC", "McDonald's", "EatFit"] },
  { id: "groceries", name: "Groceries", icon: "🛒", merchants: ["BigBasket", "Blinkit", "Zepto", "JioMart", "DMart", "Instamart"] },
  { id: "entertainment", name: "Entertainment", icon: "🎬", merchants: ["Netflix", "Spotify", "Disney+ Hotstar", "BookMyShow", "Prime Video", "YouTube Premium"] },
  { id: "bills", name: "Bills & Recharge", icon: "🧾", merchants: ["Jio Recharge", "Airtel", "Electricity Bill", "DTH / Cable", "Broadband", "Gas Booking"] },
];

/* ============================================================
   Helpers
   ============================================================ */
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function genId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}
function cleanText(v, max = 120) {
  return String(v == null ? "" : v).replace(/[<>]/g, "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}
function clampNumber(v, min, max, fallback) {
  const n = Number(v);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/* ---------- auth helpers ---------- */
// Normalise a username into a safe wallet handle / user id.
function normalizeHandle(v) {
  return String(v == null ? "" : v)
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, "")
    .slice(0, 30);
}
// PBKDF2 password hash (salted). Returns "salt:hash" hex string.
function hashPassword(password, salt) {
  const useSalt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(String(password), useSalt, 100000, 32, "sha256").toString("hex");
  return `${useSalt}:${hash}`;
}
function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt] = stored.split(":");
  const candidate = hashPassword(password, salt);
  const a = Buffer.from(candidate);
  const b = Buffer.from(stored);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-admin-secret",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (_e) {
        resolve({});
      }
    });
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};
function serveStatic(res, fileName) {
  const safe = path.normalize(fileName).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safe);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(content);
  });
}

/* ============================================================
   Wallet (demo money) + points economy
   ============================================================ */
const SIGNUP_BONUS = 500;
const WATCH_REWARD_PER_MIN = 2;
const WATCH_DAILY_CAP = 50;
const PAY_CASHBACK_RATE = 0.02;
const POINTS_PER_RUPEE = 100; // 100 points = ₹1
const DAILY_POINTS_CAP = 1500; // max points earnable per day from games
const MIN_REDEEM_POINTS = 100;

function today() {
  return new Date().toISOString().slice(0, 10);
}
function newWallet(userId) {
  return {
    userId,
    balance: SIGNUP_BONUS,
    cashbackEarned: 0,
    points: 0,
    watchMinutesToday: 0,
    watchDate: today(),
    pointsToday: 0,
    pointsDate: today(),
    gamesPlayed: 0,
    streakDays: 1,
    lastPlayDate: null,
    transactions: [
      { id: genId("TXN"), type: "BONUS", amount: SIGNUP_BONUS, note: "Welcome bonus", at: new Date().toISOString() },
    ],
  };
}
// Ensure older stored wallets have all fields (migration-safe).
function normalizeWallet(w) {
  if (w.points == null) w.points = 0;
  if (w.pointsToday == null) w.pointsToday = 0;
  if (w.pointsDate == null) w.pointsDate = today();
  if (w.gamesPlayed == null) w.gamesPlayed = 0;
  if (w.streakDays == null) w.streakDays = 1;
  if (w.lastPlayDate === undefined) w.lastPlayDate = null;
  return w;
}
function pushTxn(wallet, type, amount, note) {
  wallet.transactions.unshift({ id: genId("TXN"), type, amount, note, at: new Date().toISOString() });
  wallet.transactions = wallet.transactions.slice(0, 60);
}
function rolloverDays(wallet) {
  const t = today();
  if (wallet.watchDate !== t) {
    wallet.watchDate = t;
    wallet.watchMinutesToday = 0;
  }
  if (wallet.pointsDate !== t) {
    wallet.pointsDate = t;
    wallet.pointsToday = 0;
  }
}
async function loadOrCreateWallet(userId) {
  let wallet = await store.getWallet(userId);
  if (!wallet) {
    wallet = newWallet(userId);
    await store.saveWallet(userId, wallet);
  }
  normalizeWallet(wallet);
  rolloverDays(wallet);
  return wallet;
}

// Convert a raw game score into points, honouring the game's max.
function scoreToPoints(gameId, score) {
  const g = GAMES.find((x) => x.id === gameId);
  if (!g) return 0;
  return Math.round(clampNumber(score, 0, g.maxPoints, 0));
}

/* ============================================================
   Router
   ============================================================ */
const server = http.createServer(async (req, res) => {
  const pathname = (req.url || "/").split("?")[0];
  const query = new URLSearchParams((req.url || "").split("?")[1] || "");

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, x-admin-secret",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    });
    res.end();
    return;
  }

  try {
    if (pathname === "/api/health") {
      return sendJson(res, 200, { ok: true, storage: store.mode(), time: new Date().toISOString() });
    }

    if (pathname === "/api/sports") {
      return sendJson(res, 200, { sports: SPORTS });
    }

    if (pathname === "/api/matches") {
      const sport = query.get("sport");
      const status = query.get("status");
      const region = query.get("region");

      // Try live data; fall back to sample data if unavailable.
      let source = "live";
      let base = await sportsdata.getLiveMatches();
      if (!base || !base.length) {
        base = SAMPLE_MATCHES.map((m) => ({ ...m, source: "sample" }));
        source = "sample";
      }

      let list = base.map((m) => ({ ...m }));
      if (sport && sport !== "all") list = list.filter((m) => m.sport === sport);
      if (status && status !== "all") list = list.filter((m) => m.status === status.toUpperCase());
      if (region && region !== "all") list = list.filter((m) => m.region === region);

      const lat = Number(query.get("lat"));
      const lon = Number(query.get("lon"));
      if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
        list = list
          .map((m) => ({ ...m, distanceKm: m.lat != null ? Math.round(haversineKm(lat, lon, m.lat, m.lon)) : null }))
          .sort((a, b) => {
            if (a.status === "LIVE" && b.status !== "LIVE") return -1;
            if (b.status === "LIVE" && a.status !== "LIVE") return 1;
            return (a.distanceKm == null ? 1e9 : a.distanceKm) - (b.distanceKm == null ? 1e9 : b.distanceKm);
          });
      }
      const regions = [...new Set(base.map((m) => m.region).filter(Boolean))];
      return sendJson(res, 200, { matches: list, regions, source });
    }

    // Full squads / lineup for a single match — generated dynamically.
    if (pathname.startsWith("/api/matches/") && pathname.endsWith("/lineup") && req.method === "GET") {
      const id = decodeURIComponent(pathname.split("/")[3] || "");
      let base = await sportsdata.getLiveMatches();
      if (!base || !base.length) base = SAMPLE_MATCHES;
      const match = base.find((m) => m.id === id) || SAMPLE_MATCHES.find((m) => m.id === id);
      if (!match) return sendJson(res, 404, { error: "Match not found" });
      const lineup = lineups.buildLineup(match);
      if (!lineup) return sendJson(res, 404, { error: "No lineup available for this match" });
      return sendJson(res, 200, {
        match: { id: match.id, sport: match.sport, league: match.league, home: match.home, away: match.away, status: match.status, region: match.region },
        ...lineup,
      });
    }

    if (pathname === "/api/highlights") {
      const sport = query.get("sport");
      let list = HIGHLIGHTS;
      if (sport && sport !== "all") list = list.filter((h) => h.sport === sport);
      return sendJson(res, 200, { highlights: list });
    }

    if (pathname === "/api/players") {
      const sport = query.get("sport");
      let list = PLAYERS.map((p) => ({ id: p.id, name: p.name, sport: p.sport, country: p.country, role: p.role, rating: p.rating, tagline: p.tagline, team: p.team }));
      if (sport && sport !== "all") list = list.filter((p) => p.sport === sport);
      return sendJson(res, 200, { players: list });
    }

    if (pathname.startsWith("/api/players/") && pathname.endsWith("/performance") && req.method === "GET") {
      const id = decodeURIComponent(pathname.split("/")[3] || "");
      const found = PLAYERS.find((p) => p.id === id);
      if (!found) return sendJson(res, 404, { error: "Player not found" });
      return sendJson(res, 200, performance.buildPerformance(found));
    }

    // Head-to-head comparison of two players.
    if (pathname === "/api/compare" && req.method === "GET") {
      const aId = decodeURIComponent(query.get("a") || "");
      const bId = decodeURIComponent(query.get("b") || "");
      const a = PLAYERS.find((p) => p.id === aId);
      const b = PLAYERS.find((p) => p.id === bId);
      if (!a || !b) return sendJson(res, 404, { error: "Both players are required" });
      if (a.id === b.id) return sendJson(res, 400, { error: "Pick two different players" });
      const build = (p) => {
        const perf = performance.buildPerformance(p);
        return {
          id: p.id, name: p.name, sport: p.sport, country: p.country,
          role: p.role, team: p.team, age: p.age, rating: p.rating, tagline: p.tagline,
          momentum: perf.momentum, momentumIcon: perf.momentumIcon,
          recentAvg: perf.recentAvg, record: perf.record, trend: perf.trend, season: perf.season,
        };
      };
      const A = build(a);
      const B = build(b);
      // Simple metric duel: rating, recent form, wins in last 7.
      const metrics = [
        { key: "rating", label: "Overall rating", a: A.rating, b: B.rating },
        { key: "recentAvg", label: "Recent form (avg)", a: A.recentAvg, b: B.recentAvg },
        { key: "wins", label: "Wins (last 7)", a: A.record.wins, b: B.record.wins },
      ].map((m) => ({ ...m, winner: m.a === m.b ? "tie" : m.a > m.b ? "a" : "b" }));
      let aWins = 0, bWins = 0;
      metrics.forEach((m) => { if (m.winner === "a") aWins++; else if (m.winner === "b") bWins++; });
      const verdict = aWins === bWins ? "tie" : aWins > bWins ? "a" : "b";
      const sameSport = a.sport === b.sport;
      return sendJson(res, 200, { a: A, b: B, metrics, verdict, sameSport });
    }

    if (pathname.startsWith("/api/players/") && req.method === "GET") {
      const id = decodeURIComponent(pathname.split("/")[3] || "");
      const found = PLAYERS.find((p) => p.id === id);
      if (!found) return sendJson(res, 404, { error: "Player not found" });
      const out = JSON.parse(JSON.stringify(found));
      try {
        const live = await sportsdata.getPlayerEnrichment(found.name);
        if (live) {
          out.photo = live.photo || null;
          out.banner = live.banner || null;
          if (live.bio) out.bio = live.bio;
          if (live.birthDate) out.born = live.birthDate + (live.birthPlace ? ` · ${live.birthPlace}` : "");
          out.height = live.height || null;
          out.weight = live.weight || null;
          out.dataSource = "live";
          out.social = Object.assign({}, out.social, {
            twitter: live.social.twitter || (out.social && out.social.twitter) || null,
            instagram: live.social.instagram || (out.social && out.social.instagram) || null,
            facebook: live.social.facebook || null,
            website: live.social.website || null,
            youtube: live.social.youtube || null,
          });
        } else {
          out.dataSource = "sample";
        }
      } catch (_e) {
        out.dataSource = "sample";
      }
      return sendJson(res, 200, out);
    }

    // ---- Games ----
    if (pathname === "/api/games") {
      return sendJson(res, 200, { games: GAMES, pointsPerRupee: POINTS_PER_RUPEE, dailyCap: DAILY_POINTS_CAP });
    }
    if (pathname === "/api/games/quiz") {
      // Pick 5 random questions; return their real ids so scoring stays honest.
      const idxs = QUIZ.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, 5);
      const qs = idxs.map((id) => ({ id, q: QUIZ[id].q, options: QUIZ[id].options }));
      return sendJson(res, 200, { questions: qs, qids: idxs });
    }
    if (pathname === "/api/games/quiz/score" && req.method === "POST") {
      const body = await readBody(req);
      const answers = Array.isArray(body.answers) ? body.answers : [];
      const qids = Array.isArray(body.qids) ? body.qids : [];
      let correct = 0;
      const total = Math.min(5, qids.length || 5);
      if (qids.length) {
        qids.slice(0, 5).forEach((qid, k) => {
          const q = QUIZ[Number(qid)];
          if (q && Number(answers[k]) === q.answer) correct += 1;
        });
      } else {
        QUIZ.slice(0, 5).forEach((x, i) => {
          if (Number(answers[i]) === x.answer) correct += 1;
        });
      }
      return sendJson(res, 200, { correct, total, score: correct * 100 });
    }
    if (pathname === "/api/games/score" && req.method === "POST") {
      const body = await readBody(req);
      const userId = cleanText(body.userId || "guest", 60);
      const gameId = cleanText(body.gameId || "", 30);
      const game = GAMES.find((g) => g.id === gameId);
      if (!game) return sendJson(res, 400, { error: "Unknown game." });
      const wallet = await loadOrCreateWallet(userId);

      const t = today();
      if (wallet.lastPlayDate && wallet.lastPlayDate !== t) {
        const diff = (Date.parse(t) - Date.parse(wallet.lastPlayDate)) / 86400000;
        wallet.streakDays = diff === 1 ? wallet.streakDays + 1 : 1;
      } else if (!wallet.lastPlayDate) {
        wallet.streakDays = 1;
      }
      wallet.lastPlayDate = t;

      let earned = scoreToPoints(gameId, body.score);
      const bonusMult = 1 + Math.min(0.5, (wallet.streakDays - 1) * 0.05);
      earned = Math.round(earned * bonusMult);

      const remaining = Math.max(0, DAILY_POINTS_CAP - wallet.pointsToday);
      const applied = Math.min(earned, remaining);
      wallet.points += applied;
      wallet.pointsToday += applied;
      wallet.gamesPlayed += 1;
      if (applied > 0) pushTxn(wallet, "GAME_POINTS", 0, `${game.name}: +${applied} pts (x${bonusMult.toFixed(2)} streak)`);
      await store.saveWallet(userId, wallet);
      return sendJson(res, 200, {
        wallet,
        pointsEarned: applied,
        cappedToday: wallet.pointsToday >= DAILY_POINTS_CAP,
        streakDays: wallet.streakDays,
        rupeeValue: applied / POINTS_PER_RUPEE,
      });
    }

    // ---- Auth ----
    if (pathname === "/api/auth/register" && req.method === "POST") {
      const body = await readBody(req);
      const handle = normalizeHandle(body.username);
      const name = cleanText(body.name || "", 40) || handle;
      const password = String(body.password || "");
      if (handle.length < 3) return sendJson(res, 400, { error: "Username needs at least 3 letters/numbers." });
      if (password.length < 4) return sendJson(res, 400, { error: "Password needs at least 4 characters." });
      const existing = await store.getUser(handle);
      if (existing) return sendJson(res, 409, { error: "That username is already taken." });
      const user = {
        id: handle,
        name,
        pass: hashPassword(password),
        favSport: "all",
        createdAt: new Date().toISOString(),
      };
      await store.saveUser(handle, user);
      // Give the new user a starter wallet.
      await loadOrCreateWallet(handle);
      return sendJson(res, 200, { userId: handle, name, favSport: "all" });
    }
    if (pathname === "/api/auth/login" && req.method === "POST") {
      const body = await readBody(req);
      const handle = normalizeHandle(body.username);
      const password = String(body.password || "");
      const user = await store.getUser(handle);
      if (!user || !verifyPassword(password, user.pass)) {
        return sendJson(res, 401, { error: "Wrong username or password." });
      }
      return sendJson(res, 200, { userId: handle, name: user.name || handle, favSport: user.favSport || "all" });
    }
    if (pathname === "/api/auth/profile" && req.method === "POST") {
      const body = await readBody(req);
      const handle = normalizeHandle(body.userId);
      const user = await store.getUser(handle);
      if (!user) return sendJson(res, 404, { error: "Sign in to edit your profile." });
      if (body.name != null) user.name = cleanText(body.name, 40) || user.name;
      if (body.favSport != null) user.favSport = cleanText(body.favSport, 20);
      if (body.newPassword) {
        const np = String(body.newPassword);
        if (np.length < 4) return sendJson(res, 400, { error: "New password needs at least 4 characters." });
        user.pass = hashPassword(np);
      }
      user.updatedAt = new Date().toISOString();
      await store.saveUser(handle, user);
      return sendJson(res, 200, { userId: handle, name: user.name, favSport: user.favSport || "all" });
    }

    // ---- Wallet ----
    if (pathname === "/api/wallet" && req.method === "GET") {
      const userId = cleanText(query.get("userId") || "guest", 60);
      const wallet = await loadOrCreateWallet(userId);
      await store.saveWallet(userId, wallet);
      return sendJson(res, 200, wallet);
    }
    if (pathname === "/api/wallet/categories") {
      return sendJson(res, 200, { categories: SPEND_CATEGORIES });
    }

    if (pathname === "/api/wallet/add" && req.method === "POST") {
      const body = await readBody(req);
      const userId = cleanText(body.userId || "guest", 60);
      const amount = clampNumber(body.amount, 1, 100000, 0);
      if (amount <= 0) return sendJson(res, 400, { error: "Enter a valid amount." });
      const wallet = await loadOrCreateWallet(userId);
      wallet.balance += amount;
      pushTxn(wallet, "ADD", amount, `Added money via ${cleanText(body.method || "UPI", 20)}`);
      await store.saveWallet(userId, wallet);
      return sendJson(res, 200, wallet);
    }

    if (pathname === "/api/wallet/pay" && req.method === "POST") {
      const body = await readBody(req);
      const userId = cleanText(body.userId || "guest", 60);
      const amount = clampNumber(body.amount, 1, 100000, 0);
      const to = cleanText(body.to || "Merchant", 60);
      const category = cleanText(body.category || "", 20);
      const cat = SPEND_CATEGORIES.find((c) => c.id === category);
      if (amount <= 0) return sendJson(res, 400, { error: "Enter a valid amount." });
      const wallet = await loadOrCreateWallet(userId);
      if (wallet.balance < amount) return sendJson(res, 400, { error: "Insufficient balance." });
      wallet.balance -= amount;
      const label = cat ? `${cat.icon} ${to} (${cat.name})` : `Paid ${to}`;
      pushTxn(wallet, "PAY", -amount, label);
      const cashback = Math.round(amount * PAY_CASHBACK_RATE);
      if (cashback > 0) {
        wallet.balance += cashback;
        wallet.cashbackEarned += cashback;
        pushTxn(wallet, "CASHBACK", cashback, `2% cashback on ${to}`);
      }
      await store.saveWallet(userId, wallet);
      return sendJson(res, 200, { wallet, cashback });
    }

    if (pathname === "/api/wallet/transfer" && req.method === "POST") {
      const body = await readBody(req);
      const userId = cleanText(body.userId || "guest", 60);
      const toUser = cleanText(body.toUser || "", 60);
      const amount = clampNumber(body.amount, 1, 100000, 0);
      if (!toUser) return sendJson(res, 400, { error: "Enter a recipient." });
      if (amount <= 0) return sendJson(res, 400, { error: "Enter a valid amount." });
      const wallet = await loadOrCreateWallet(userId);
      if (wallet.balance < amount) return sendJson(res, 400, { error: "Insufficient balance." });
      wallet.balance -= amount;
      pushTxn(wallet, "TRANSFER", -amount, `Sent to ${toUser}`);
      await store.saveWallet(userId, wallet);
      const recipient = await loadOrCreateWallet(toUser);
      recipient.balance += amount;
      pushTxn(recipient, "RECEIVE", amount, `Received from ${userId}`);
      await store.saveWallet(toUser, recipient);
      return sendJson(res, 200, wallet);
    }

    if (pathname === "/api/wallet/redeem-points" && req.method === "POST") {
      const body = await readBody(req);
      const userId = cleanText(body.userId || "guest", 60);
      const wallet = await loadOrCreateWallet(userId);
      const points = clampNumber(body.points, 0, wallet.points, 0);
      if (points < MIN_REDEEM_POINTS) return sendJson(res, 400, { error: `Redeem at least ${MIN_REDEEM_POINTS} points.` });
      if (points > wallet.points) return sendJson(res, 400, { error: "Not enough points." });
      const rupees = Math.floor(points / POINTS_PER_RUPEE);
      const spend = rupees * POINTS_PER_RUPEE;
      wallet.points -= spend;
      wallet.balance += rupees;
      pushTxn(wallet, "REDEEM", rupees, `Redeemed ${spend} points to wallet`);
      await store.saveWallet(userId, wallet);
      return sendJson(res, 200, { wallet, rupees });
    }

    if (pathname === "/api/wallet/watch" && req.method === "POST") {
      const body = await readBody(req);
      const userId = cleanText(body.userId || "guest", 60);
      const minutes = clampNumber(body.minutes, 0, 60, 0);
      const wallet = await loadOrCreateWallet(userId);
      const remainingCapMinutes = Math.max(0, WATCH_DAILY_CAP / WATCH_REWARD_PER_MIN - wallet.watchMinutesToday);
      const rewardableMinutes = Math.min(minutes, remainingCapMinutes);
      const reward = Math.round(rewardableMinutes * WATCH_REWARD_PER_MIN);
      if (reward > 0) {
        wallet.balance += reward;
        wallet.cashbackEarned += reward;
        wallet.watchMinutesToday += rewardableMinutes;
        pushTxn(wallet, "WATCH_REWARD", reward, `Watch-to-earn: ${rewardableMinutes} min`);
        await store.saveWallet(userId, wallet);
      }
      return sendJson(res, 200, {
        wallet,
        reward,
        cappedToday: wallet.watchMinutesToday * WATCH_REWARD_PER_MIN >= WATCH_DAILY_CAP,
        dailyCap: WATCH_DAILY_CAP,
      });
    }

    // ---- Static ----
    if (pathname === "/" || pathname === "/index.html") return serveStatic(res, "index.html");
    if (pathname === "/styles.css") return serveStatic(res, "styles.css");
    if (pathname === "/app.js") return serveStatic(res, "app.js");
    if (pathname !== "/" && !pathname.startsWith("/api/")) return serveStatic(res, pathname.slice(1));

    return sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    return sendJson(res, 500, { error: "Server error", detail: String(err && err.message) });
  }
});

server.listen(PORT, async () => {
  await store.ensureReady();
  // eslint-disable-next-line no-console
  console.log(`SportSphere running on http://localhost:${PORT} (storage: ${store.mode()})`);
});
