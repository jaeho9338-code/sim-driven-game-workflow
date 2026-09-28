# Sim-Driven Game Engine Workflow

A write-up and worked example of the development workflow I use for building
a single-file, browser-based simulation game (an inline-`<script>` HTML app
with no framework/build tooling beyond a one-step template merge) in a way
that stays testable and verifiable as it grows past ten thousand lines of
game logic.

This repo does **not** contain the actual game — it's a portfolio piece
showing the pipeline and conventions in isolation, with illustrative example
code standing in for real game systems.

## The core problem this solves

A single big inline `<script>` block is simple to ship (no bundler, no
framework, works by just opening the HTML file) but normally impossible to
unit-test, because everything lives inside one closure tied to the DOM and
`window`.

The fix used throughout: split every file's script into two regions with one
`if` guard.

```js
// ---- pure simulation logic lives above this line ----
function simulateAtBat(batter, pitcher, rng) { /* ... */ }
function rollInjury(player, rng) { /* ... */ }

if (globalThis.__SIM__) {
  // Only reachable when a headless test harness sets this flag before eval.
  // Exposes every pure function a test needs, and nothing else.
  globalThis.__sim = { simulateAtBat, rollInjury /* , ... */ };
}

if (!globalThis.__SIM__) {
  // ---- everything below here touches document/window/localStorage ----
  function renderScoreboard() { /* ... */ }
  document.getElementById('startBtn').addEventListener('click', () => { /* ... */ });
}
```

Rules that make this hold up over time:

- **A function that needs to be unit-tested has to live above the guard.**
  If it needs something from below the guard (e.g. a random-seed helper tied
  to `Date.now()`), that dependency becomes an explicit parameter instead —
  never reached into.
- **The `__sim` export object is the only contract the test file is allowed
  to depend on.** Nothing in the test file parses or pattern-matches the
  source; it evals the built HTML and calls exported functions like a normal
  library.
- Every new feature's design question is answered up front: *"which parts of
  this are pure enough to go above the guard?"* — that's usually most of the
  actual logic; only DOM writes and event wiring belong below it.

## The build step

`build/build_from_template.js` is the entire build pipeline: read a template
HTML file, substitute one placeholder with a JSON data blob, write the
output. No bundler, no transpiler — deliberately, since the game itself
targets "open the HTML file, it works," and the only thing that needs
templating is baking a static data snapshot into the page.

## The test harness

`testing/example_checks.js` is a trimmed, illustrative version of the real
harness pattern (the real project's version has ~4,000 lines and 77 check
functions covering the actual game's systems). The shape that matters:

1. Mock just enough of `document`/`window` that the script can `eval` without
   throwing (`document.getElementById(...)` etc. return no-op stubs).
2. Set `global.__SIM__ = true` **before** the eval, so the guarded export
   block runs and `global.__sim` gets populated.
3. `eval` the *built* HTML's script contents (not the template — this catches
   build-step bugs too, like a `sim.js` I once ran against a stale build and
   got a confusing "function is not defined" from a since-added export).
4. Use a small seeded PRNG (`mulberry32`) for every check, never
   `Math.random()` — every run is byte-for-byte reproducible, which matters
   when a check fails and you need to paste the exact seed into a scratch
   script to reproduce it.
5. Each check function prints the real numbers it measured, not just
   pass/fail — `assert(rate > 0.25 && rate < 0.35, 'roughly 30% of at-bats
   are hits, got 0.31')`, not `assert(rate > 0.25 && rate < 0.35)`. A
   red assertion should already contain the evidence needed to start
   debugging.
6. All checks are summed into one `totalFailures` and the process exits
   non-zero on any failure, so it plugs into a plain `npm test`/CI step with
   no test framework dependency.

## The empirical stress-test harness

Beyond the unit-style checks above, the highest-value bug-finding technique
in this workflow turned out to be a *long-horizon simulation scan*: drive
the game through many simulated seasons/cycles in a Node script (bypassing
the UI entirely, calling the same exported functions the real page calls),
and after every cycle assert broad sanity properties — no `NaN`, no
duplicate IDs, no player whose age/state contradicts the rules that should
govern it, league-wide win counts equal loss counts, array sizes stay
bounded, and so on.

This found real, previously-invisible bugs that code review alone didn't
catch — for example, a rule that was only checked against players sitting
in one particular array, so a player parked in an *adjacent* array (a
free-agent pool, a call-up queue) for even one cycle would silently skip
the rule forever. Nothing in a single-cycle unit test exercises that path;
a 20-to-60-cycle stress run surfaces it within seconds.

See `docs/changelog-convention.md` for how findings like this get written
up once fixed.

## Documentation conventions

- `docs/changelog-convention.md` — the format every fix/feature entry
  follows: what was requested/observed, the diagnosis (with real measured
  numbers, never "probably"), the fix, and how it was verified (again with
  numbers). Keeping this disciplined is what makes a fix count as *done*
  rather than *attempted*.
- `docs/progress-handoff-template.md` — a living status doc kept at the top
  of the project so a fresh session (or a different tool) can resume work
  without re-deriving context: current test-pass count, a pointer into the
  changelog, and a short "how to verify a change" checklist.

## Stack

Vanilla JS, no framework, no build tool beyond the one-file template merge,
Node for the test harness, SQLite for the source data pipeline (not shown
here). The point of the whole setup is that verifiability doesn't require
adopting a framework or a test runner — a plain `if` guard, a plain `eval`,
and the discipline to keep pure logic pure gets you most of the way there.
