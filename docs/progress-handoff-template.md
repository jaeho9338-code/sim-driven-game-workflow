# Progress / handoff

A living status doc kept at the top of the real project (not this portfolio
copy) so a fresh session — a different day, a different tool, a different
person — can resume work without re-deriving context from scratch. Updated
every time a change lands, not written retroactively.

## What it contains

```markdown
# Progress / Handoff

Status snapshot. Read this first.

Everything below was true as of the last build in this environment
(`testing/example_checks.js`: **N/N checks passing**). See
`docs/changelog.md`'s vA.B through vX.Y entries for everything fixed/added
-- too much to summarize individually here.

## Feature list
[what's actually built, kept current -- not a roadmap, a snapshot]

## Known remaining backlog
[open items, each with a one-line reason it's still open -- "not started"
vs. "investigated, judged out of scope, here's why" are different enough
to matter]

## How to verify a change (the pattern to keep using)
1. Edit the template.
2. `npm run build`.
3. `npm test` -- if anything touched is pure logic, there should be a check
   for it; if new behavior was added, add a new check function following
   the existing pattern (print real numbers, assert with a message, return
   a failure count), wire it into the total.
4. For UI-only code, verify via a real or headless browser instead --
   serve the app locally and drive the exposed functions directly.
5. Add an entry to the changelog (see docs/changelog-convention.md).
```

## Why a handoff doc instead of just the changelog

The changelog is a *log* — complete, but not something you'd want to read
front-to-back to get oriented. The handoff doc is a *pointer*: current
state in one paragraph, a pointer into the changelog range that got you
there, and the exact verification checklist to keep using. Reading it
should take under a minute and leave you able to make the next change
without asking "wait, is this already handled?"

The rule that keeps it honest: it gets updated in the *same* change that
touches the code, never as a separate cleanup pass later — otherwise it
drifts out of sync with reality within a few sessions, which is worse than
not having one at all (a stale status doc actively misleads the next
session instead of just being unhelpful).
