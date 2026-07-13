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
