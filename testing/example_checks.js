// Headless verification for app/index.html's simulation logic.
// Mocks just enough of document/window that the built HTML's inline script
// can be eval'd without throwing, flips on __SIM__ BEFORE the eval so the
// guarded export block runs, then drives globalThis.__sim directly -- no
// browser, no test framework, just Node + assert-and-print.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- browser mocks ----------
function el() {
  return {
    textContent: '', innerHTML: '',
    addEventListener() {}, appendChild() {}, setAttribute() {},
    querySelector() { return el(); }, querySelectorAll() { return []; },
  };
}
global.document = { getElementById() { return el(); }, querySelector() { return el(); }, createElement() { return el(); } };
global.window = global;
global.__SIM__ = true;
global.__SIM_SNAPSHOT__ = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'data', 'snapshot.json'), 'utf8'));

const html = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
(0, eval)(html.match(/<script>([\s\S]*)<\/script>/)[1]);
const S = global.__sim;
if (!S) {
  console.error('hook failed: globalThis.__sim was not set -- did you run the build first? (npm run build)');
  process.exit(1);
}

// ---------- deterministic seeded RNG so every run is byte-for-byte reproducible ----------
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mk(id, rating, birthYear, extra) {
  return Object.assign({ id, rating, birthYear }, extra || {});
}

// ============================================================
// Check 1: matchup outcome sanity (10,000 trials).
// The single most important property of any log5-based sim: a stronger
// team should win MORE than half the time against a weaker one, but not
// deterministically -- real variance has to survive.
// ============================================================
function matchOutcomeCheck() {
  console.log('\n=== matchOutcomeCheck ===');
  let failures = 0;
  function assert(cond, msg) { console.log(`${cond ? 'ok' : 'FAIL'}: ${msg}`); if (!cond) failures++; }

  const strong = { id: 'strong', players: [mk('s1', 9, 1999), mk('s2', 9, 2000)] };
  const weak = { id: 'weak', players: [mk('w1', 3, 1999), mk('w2', 3, 2000)] };
  const rng = mulberry32(42);
  const trials = 10000;
  let strongWins = 0;
  for (let i = 0; i < trials; i++) {
    if (S.simulateMatch(strong, weak, rng).winner === 'strong') strongWins++;
  }
  const rate = strongWins / trials;
  console.log(`strong team win rate over ${trials} trials: ${(rate * 100).toFixed(1)}%`);
  assert(rate > 0.75, `a 9-rated team beats a 3-rated team clearly more often than not (got ${(rate * 100).toFixed(1)}%)`);
  assert(rate < 1.0, 'even a large mismatch still has real variance -- the weak team wins at least sometimes');

  return failures;
}

// ============================================================
// Check 2: milestone rule boundary (mirrors a real age-threshold rule from
// the source project -- exact-boundary and just-below-boundary cases are
// exactly where these rules tend to be off by one).
// ============================================================
function milestoneRuleCheck() {
  console.log('\n=== milestoneRuleCheck ===');
  let failures = 0;
  function assert(cond, msg) { console.log(`${cond ? 'ok' : 'FAIL'}: ${msg}`); if (!cond) failures++; }

  const year = 2026;
  const players = [
    mk('atThreshold', null, year - S.MILESTONE_AGE),
    mk('belowThreshold', null, year - (S.MILESTONE_AGE - 1)),
    mk('alreadyFlagged', null, year - S.MILESTONE_AGE, { milestoneReached: true }),
  ];
  const reached = S.rollMilestone(players, year);
  assert(reached.includes('atThreshold'), 'a player exactly at MILESTONE_AGE triggers the rule');
  assert(!reached.includes('belowThreshold'), 'a player one year below the threshold does not trigger yet');
  assert(!reached.includes('alreadyFlagged'), 'a player already flagged is never re-processed (idempotent)');

  // The lesson from the real project, encoded as a permanent regression test:
  // the rule has to be applied to EVERY pool a player can sit in, not just
  // the main roster -- verify the reserve-pool variant explicitly.
  const mainRoster = [mk('main1', null, year - S.MILESTONE_AGE)];
  const reservePool = [mk('reserve1', null, year - S.MILESTONE_AGE)];
  const both = S.rollMilestoneAcrossPools(mainRoster, reservePool, year);
  assert(both.includes('main1') && both.includes('reserve1'), 'the milestone rule reaches players in BOTH the main roster and the reserve pool, not just the main one');

  return failures;
}

// ============================================================
// Check 3: long-horizon stress scan (the highest-value technique in this
// workflow). Drives 50 simulated seasons through the same exported
// functions the real page calls, and after every cycle asserts broad
// invariants instead of a single expected outcome. This is what catches
// bugs that only show up after many cycles -- a single-call unit test
// can't reach them.
// ============================================================
function longHorizonStressCheck() {
  console.log('\n=== longHorizonStressCheck (50 simulated seasons) ===');
  let failures = 0;
  function assert(cond, msg) { console.log(`${cond ? 'ok' : 'FAIL'}: ${msg}`); if (!cond) failures++; }

  const state = JSON.parse(JSON.stringify(S.SNAPSHOT));
  const rng = mulberry32(7);
  const allIdsEver = new Set();
  state.teams.forEach((t) => t.players.forEach((p) => allIdsEver.add(p.id)));
  state.reservePool.forEach((p) => allIdsEver.add(p.id));

  let anomalies = 0;
  for (let season = 0; season < 50; season++) {
    const { results, milestones } = S.advanceSeason(state, rng);

    // no NaN / undefined anywhere in the match results
    results.forEach((r) => {
      if (!r.winner || !r.loser) { anomalies++; console.log(`season ${state.year}: malformed match result ${JSON.stringify(r)}`); }
    });

    // every player reachable at the start of the run should STILL be
    // reachable somewhere (main roster or reserve pool) every single season
    // -- nothing should silently vanish. This is exactly the shape of check
    // that caught a real bug in the source project (a player pool that got
    // fully REPLACED instead of merged each cycle, silently deleting anyone
    // not immediately reassigned).
    const stillReachable = new Set();
    state.teams.forEach((t) => t.players.forEach((p) => stillReachable.add(p.id)));
    state.reservePool.forEach((p) => stillReachable.add(p.id));
    allIdsEver.forEach((id) => {
      if (!stillReachable.has(id)) { anomalies++; console.log(`season ${state.year}: player ${id} is no longer reachable anywhere`); }
    });

    // a milestone, once reached, must never un-reach
    state.teams.forEach((t) => t.players.forEach((p) => {
      if (p.milestoneReached && (state.year - p.birthYear) < S.MILESTONE_AGE) {
        anomalies++; console.log(`season ${state.year}: player ${p.id} is flagged milestoneReached but is below the age that should require it`);
      }
    }));
  }

  console.log(`50 seasons simulated, ended at year ${state.year}, anomalies found: ${anomalies}`);
  assert(anomalies === 0, 'zero anomalies across the full 50-season run');

  return failures;
}

const n1 = matchOutcomeCheck();
const n2 = milestoneRuleCheck();
const n3 = longHorizonStressCheck();
const totalFailures = n1 + n2 + n3;
console.log(`\n${totalFailures === 0 ? 'ALL CHECKS PASSED' : `${totalFailures} CHECK(S) FAILED`}`);
process.exit(totalFailures === 0 ? 0 : 1);
