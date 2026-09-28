# Changelog convention

Every fix or feature gets one entry in the project's running design-notes
file, in this exact shape. The discipline is what turns "I think I fixed
it" into "verified, with numbers."

```
## vX.Y: short description of what changed

**Requested / Reported**: the exact thing that was asked for or observed,
quoted directly if it came from a bug report or a user message. If it's a
self-directed finding (from code review or a stress-test run), say so
explicitly rather than implying someone asked for it.

**Diagnosis**: what was actually wrong, traced to its root cause -- not the
symptom. Always with real measured numbers where the claim is quantitative
("279 players enlisted in one offseason," not "a lot of players"). If the
diagnosis required instrumentation or a reproduction script, say what was
run and what it showed.

**Fix**: what changed, and (briefly) why this specific fix addresses the
root cause rather than papering over the symptom.

**Verified**: how it was actually checked -- which test file, which new
regression check, what a stress-test run showed before vs. after, and
(for anything UI-facing) how it was checked in a real or headless browser.
Always with real numbers: "76/76 checks passing," "0 anomalies across 60
simulated seasons (was 1,314 before the fix)."
```

## Why this shape specifically

- **Root cause, not symptom** ("Diagnosis" is its own section, before "Fix")
  forces the actual investigation to happen before a line of code changes.
  A fix section that reads like a guess is a sign the diagnosis step was
  skipped.
- **Numbers, not adjectives.** "Mostly fixed," "should be rare now," and
  "seems better" don't survive being asked to cite a number. Every
  quantitative claim in this format has to be something that was actually
  measured, which means it has to be re-measurable later if the same bug
  class resurfaces.
- **The entry is the memory.** A large single-file project accumulates a lot
  of institutional knowledge about *why* something works a particular way.
  Grepping the changelog for a system's name should surface every past
  decision and every bug that's already been found and closed there --
  cheaper than re-discovering the same edge case twice.

## A worked (illustrative) example

```
## v3.12: reserve-pool players never age past a milestone rule

**Reported**: stress-test run flagged a player who was 4 years past a
milestone threshold but still unflagged.

**Diagnosis**: the milestone check only ever scanned the main roster array.
A player sitting in the reserve pool for more than one season was invisible
to it -- confirmed via a 50-season harness run: 12 of 19 tracked reserve
players crossed the threshold while parked in the pool and were never
flagged, even after later returning to a main roster.

**Fix**: `rollMilestoneAcrossPools` now scans both the main roster and the
reserve pool every cycle, using the same rule for both.

**Verified**: added a regression check asserting the rule fires for a
player planted in either pool. Re-ran the 50-season stress harness:
anomalies went from 12/19 tracked cases to 0/19.
```
