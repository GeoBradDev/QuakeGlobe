# Plan: Magnitude/depth filters and time animation never apply (issue #6)

Risk tier: High. Starting at Low, raised once because the clock, timeline and Cesium
entity visibility are stateful WebGL UI a jsdom unit test cannot fully exercise, and once
more because the change alters existing behavior (the filter and the animation) rather
than adding a feature. No force-High area is touched.

Domain skills:
- superpowers:test-driven-development: invoke for the predicate, clock and component tests.
- vercel-react-best-practices: invoke for the React side (no per-tick state, memoized
  derived data, effect cleanup).
- context7 docs: invoke if a Cesium or Resium API (Clock, Entity `availability`,
  `TimeIntervalCollection`, Resium ref timing) needs confirming.
- chrome-devtools-mcp:chrome-devtools (or claude-in-chrome): invoke for the live drive.
- frontend-design, a11y: not applicable because no visual or markup change.
- expo, django, fastapi, payments, email: not applicable because there is no mobile,
  backend, money or messaging code.

## Acceptance criteria

1. Setting Min Magnitude to 6 shows only M >= 6 events; Max Magnitude and Max Depth
   filter the same way (inclusive bounds), with no dependency on clock state.
2. On load (once the feed has arrived), the viewer's own clock is configured: start time
   is the earliest quake in the feed, stop time the latest, current time equals the start
   time, multiplier 10000, and the timeline is zoomed to that range. The animation widget
   therefore shows the earliest quake's date. Whether the clock starts animating is the
   named constant `START_ANIMATING` (`true`, decided by the user, see Decision); either way,
   play advances time and reveals quakes in chronological order, pause stops it, and the
   clock stops at the stop time instead of running past it. On first reaching the stop
   time the clock pauses there with the full filtered set visible; pressing Play Forward
   while at the stop time (including after scrubbing there) restarts from the start time
   and keeps animating; Play Reverse there plays backward from the stop time; playing
   from any other time is unchanged (see Decision: end of playback).
3. Dragging the timeline scrubber updates which quakes are visible (a quake is visible
   only when its event time is at or before the clock's current time).
4. Filtering works the same whether or not the clock is animating: changing a filter
   while playing neither resets nor pauses the clock, and the time visibility keeps
   applying to the filtered set.
5. Unit tests cover the filter predicate: magnitude, depth and time, including the
   boundaries.
6. No clock tick is pushed into React state; time visibility is handled by Cesium
   through per-entity `availability`. No detached `Clock` or `ClockViewModel` remains,
   and any listener or configuration the component adds is removed on cleanup.

## Files that change

- `src/lib/earthquakes.ts`: split the predicate.
  - `matchesFilters(q, magRange, depthRange): boolean`: magnitude and depth only, inclusive.
  - `hasOccurred(q, currentTime: JulianDate): boolean`: quake time <= current time.
  - `isQuakeVisible(q, magRange, depthRange, currentTime: JulianDate)`: now requires a
    `JulianDate` (no `undefined` short-circuit) and returns
    `matchesFilters && hasOccurred`. Kept as the single combined predicate the tests and
    any later renderer (#9) can use.
  - `getTimeRange(quakes): {start: JulianDate, stop: JulianDate} | undefined`: earliest
    and latest quake times; `undefined` for an empty list. A single quake (or all quakes at
    one instant) returns a zero-length range; the caller then skips clock configuration
    and warns, as today.
  - `quakeAvailability(q): TimeIntervalCollection`: one interval from the quake time
    (inclusive) to `Iso8601.MAXIMUM_VALUE`, so `availability.contains(t) ===
    hasOccurred(q, t)`.
  - `configureClock(clock: Clock, range): void`: sets `startTime`, `stopTime`,
    `currentTime` (clone of start), `clockRange = ClockRange.CLAMPED`,
    `multiplier = 10000`, `shouldAnimate = START_ANIMATING`. `START_ANIMATING` (and the
    multiplier, as `CLOCK_MULTIPLIER`) are exported named constants in
    `earthquakes.ts`; tests assert `shouldAnimate === START_ANIMATING`, so flipping the
    constant needs at most a one-line test change.
- `src/components/CeiumGlobe.tsx`:
  - Remove `currentTime` state, `clockRef`, the detached `Clock`, the `ClockViewModel`
    `useMemo`, the `onTick` listener, and the `clockViewModel` prop on `<Viewer>`.
  - One effect keyed on `quakes`: when `viewerRef.current?.cesiumElement` exists and
    `getTimeRange` returns a non-zero range, call `configureClock(viewer.clock, range)`
    and `viewer.timeline?.zoomTo(range.start, range.stop)`. No listener is added, so the
    cleanup has nothing to remove; if implementation ends up adding one, it is removed in
    the effect cleanup. Guard with `viewer.isDestroyed()` where the viewer is touched.
  - Memoize `quakeAvailability` per quake id over `quakes` (a `Map`), so Resium sees a
    stable `availability` prop and does not reassign it on each render.
  - The entity list is `quakes.filter((q) => matchesFilters(q, magRange, depthRange))`,
    memoized on `[quakes, magRange, depthRange]`; each `<Entity>` gets
    `availability={availabilityById.get(q.id)}`.
  - Added after review (defect A): memoize all per-quake entity props (`name`,
    `availability`, `position`, `cylinder`, `description`) in one `Map` keyed by id over
    `quakes`, so an entity that survives a filter change keeps the same prop references
    and Resium does not reassign them. Set `allowDataSourcesToSuspendAnimation={false}`
    on `<Viewer>` (a mutable Resium Viewer prop, not read-only) so the geometry batch
    rebuild after a filter change cannot set `clock.canAnimate = false` and stall
    playback. Test: `src/components/CeiumGlobe.props.test.tsx`. The live drive then
    showed the prop alone has no effect: Resium 1.28 passes it only to the Cesium
    `Viewer` constructor, which ignores that option, and Resium only reassigns it when
    the prop later changes. So an effect keyed on the viewer also sets
    `viewer.allowDataSourcesToSuspendAnimation = false` on the instance. Test:
    `src/components/CeiumGlobe.suspend.test.tsx`.
  - Added after review (defect B): hold the Cesium viewer in state through a stable
    `useCallback` ref instead of reading `viewerRef.current` once, and key the clock
    effect on `[quakes, viewer]`. Resium exposes `cesiumElement` only after its async
    create (`useImperativeHandle` with deps `[mounted]`), so a feed that resolves before
    the viewer mounts, or a recreated viewer, still gets its clock configured. Test:
    `src/components/CeiumGlobe.lateViewer.test.tsx`.
  - Added after review (defect F): the effect that turns off
    `allowDataSourcesToSuspendAnimation` restores `true` in its cleanup when the viewer
    is not destroyed, as criterion 6 requires. Test:
    `src/components/CeiumGlobe.suspendCleanup.test.tsx`.
  - Added for end of playback (defect E): the clock effect calls
    `attachEndOfPlayback(viewer.clock)` after configuring the clock and returns its
    remover as the effect cleanup, so both listeners go on unmount or viewer change.
    Test: `src/components/CeiumGlobe.endOfPlayback.test.tsx`.
- `src/lib/earthquakes.ts` (added for defect E): `attachEndOfPlayback(clock): () => void`.
  `ClockRange.CLAMPED` stays. Departure from the suggested design: `Clock.tick` in
  `@cesium/core` raises `onStop` while the clamped time is still a local and assigns it
  to `currentTime` afterwards, so setting `currentTime` inside `onStop` is overwritten.
  The `onStop` listener therefore only flags the stop, and the `onTick` listener (which
  runs after the assignment) acts on it: if the clock was already at or past the stop
  time before this tick, set `currentTime` to a clone of `startTime` and keep animating;
  otherwise set `shouldAnimate = false`. Both apply only when `clock.multiplier > 0`
  (defect H): Play Reverse from beyond the stop time also clamps and raises `onStop`, and
  must keep animating backward from the stop time. The `onTick` listener then records
  `wasAtStop = currentTime >= stopTime` (at or past, so a scrub beyond the end also
  restarts). It returns a remover for both listeners. Tests:
  `src/lib/endOfPlayback.test.ts` (real `Clock` with `ClockStep.TICK_DEPENDENT`) and
  `src/lib/endOfPlaybackWidget.test.ts` (real `AnimationViewModel` over a
  `ClockViewModel`; covers Play Forward at the stop time and the defect H reverse case).
- `src/lib/earthquakes.test.ts`: update and extend (see Proof).
- `src/App.test.tsx` (or a new `src/components/CeiumGlobe.test.tsx` if cleaner): the
  Resium mock becomes a `forwardRef` `Viewer` exposing `{cesiumElement}` with a real
  Cesium `Clock`, a `timeline.zoomTo` spy and `isDestroyed() => false`; the `Entity` mock
  renders its name and exposes its `availability` (for example via a data attribute with
  the interval start ISO string).
- `README.md`: only if a statement becomes false (the Features list already describes the
  intended behavior; expected no change).

## Order of work

1. Red: add the predicate tests (`matchesFilters`, `hasOccurred`, `isQuakeVisible`
   without `undefined`, `getTimeRange`, `quakeAvailability`, `configureClock`). Commit as
   the frozen red test.
2. Green: implement the `earthquakes.ts` functions. Commit.
3. Red: component tests: with a feed of three quakes at different magnitudes, depths and
   times, (a) after load the viewer clock's start/current time is the earliest quake, stop
   is the latest, `shouldAnimate` equals `START_ANIMATING`, multiplier 10000, and `timeline.zoomTo` was
   called with that range; (b) setting Min Magnitude to 6 leaves only M >= 6 entities;
   Max Depth removes deeper ones; (c) each entity's availability starts at its quake
   time; (d) changing a filter after `clock.shouldAnimate = true` leaves the clock's
   `currentTime` and `shouldAnimate` untouched. Commit frozen.
4. Green: rewrite `CeiumGlobe.tsx`. Commit.
5. Full gate, then live drive.

## Risks

- Resium ref timing: the viewer must exist when the `quakes` effect runs. The feed fetch
  resolves long after mount, and Resium creates the viewer in its own mount effect, so it
  should exist; if not, depend on a "viewer ready" signal rather than polling.
- Resium recreating the Viewer: changing a read-only Viewer prop would rebuild the viewer
  and lose the clock config. Removing `clockViewModel` removes the only read-only prop
  that varied. `terrainProvider` is not a read-only prop, but it is not a mutable one
  either: in Resium 1.28 it is in the Viewer's `otherProps`, and the Viewer has no update
  hook for it, so changes after mount are ignored rather than applied. The viewer is
  therefore never recreated and the clock config survives, but terrain resolved after
  mount probably never reaches the viewer. That is pre-existing and out of scope here.
- Cesium honoring `availability` for static cylinder geometry: confirmed in
  `StaticGeometryColorBatch` (`hasConstantFill` is false when availability is defined, so
  show is recomputed each frame from `isFilled(time)`). This moves ~10k entities into the
  per-frame attribute path; measure frame rate against main in the live drive. The
  rendering rewrite itself is #9's scope.
- Behavior change on load: before, every quake was drawn; now quakes appear over time
  from the earliest one. That is the documented intent of the feature but starts as a
  nearly empty globe. Noted in the PR body.
- Suspension off at load: with `allowDataSourcesToSuspendAnimation` false, the 10000x
  autoplay keeps running while Cesium builds the first batch of about 10k entities, so
  the earliest quakes may pop in slightly late instead of the clock waiting for them.
- Out of scope: NaN or inverted filter inputs (#12), entity rendering cost (#9), depth
  symbology (#14).

## Decision: autoplay on load

Autoplay versus paused on load was a product decision taken to the user, who decided
(2026-11-07) to autoplay from the earliest quake at 10000x, matching the original
author's `shouldAnimate: true` config. Implemented as `START_ANIMATING = true`; tests
assert against the constant, so a later flip needs at most a one-line test change.

## Decision: end of playback

Made by the orchestrator. The original code's `onTick` listener did
`if (JulianDate.greaterThanOrEquals(c.currentTime, c.stopTime)) c.shouldAnimate = false`,
which shows the author meant playback to pause at the end. With `ClockRange.CLAMPED`
alone, the Animation widget's `_canAnimate` then keeps `shouldAnimate` false and Play
Forward at the stop time does nothing until the user scrubs back. So: pause at the stop
time on first arrival with every filtered quake visible, and restart from the start time
when Play Forward is pressed at the stop time. Play Reverse at or past the stop time plays
backward from the stop time instead (defect H).

## Proof

- Criterion 1: `earthquakes.test.ts` `matchesFilters` and `isQuakeVisible` cases for each
  bound; component test (b). Live drive: Min Magnitude 6 hides green, yellow and orange
  quakes; Max Depth 50 hides deep quakes.
- Criterion 2: `getTimeRange` and `configureClock` unit tests; component test (a). End of
  playback: first arrival pauses at the stop time with the full filtered set visible;
  Play forward at (or past) the stop time restarts from the start time; Play Reverse from
  past the stop time moves backward from the stop time; mid-range play is unchanged.
  Tests: `src/lib/endOfPlayback.test.ts`, `src/components/CeiumGlobe.endOfPlayback.test.tsx`
  and `src/lib/endOfPlaybackWidget.test.ts` (real `AnimationViewModel` over a
  `ClockViewModel`). Live drive: widget starts at the earliest quake's date at 10000x;
  play/pause work; play advances the date and quakes appear over time; the clock pauses
  at the stop time with every filtered quake visible; a real Play Forward click there
  restarts from the earliest quake; a real Play Reverse click after scrubbing past the
  end moves backward from the stop time.
- Criterion 3: `hasOccurred` and `quakeAvailability` unit tests; component test (c).
  Live drive: drag the scrubber back and forward and see the visible set change.
- Criterion 4: component test (d). Live drive: change Min Magnitude while playing; the
  clock keeps running and the filtered set keeps revealing over time.
- Criterion 5: the `earthquakes.test.ts` cases above.
- Criterion 6: code review of `CeiumGlobe.tsx` (no `useState` for time, no `Clock`
  construction). The component adds `onTick` and `onStop` listeners only through
  `attachEndOfPlayback`, and the clock effect's cleanup removes them (covered by
  `src/components/CeiumGlobe.endOfPlayback.test.tsx`); the suspension setting is restored
  on cleanup (`src/components/CeiumGlobe.suspendCleanup.test.tsx`). Live drive measures
  per-frame render cost versus main, idle and while playing.

### Frozen test rewrite (approved by the user)

`src/lib/earthquakes.test.ts`, case `quakeAvailability > starts at the quake time
inclusive and never ends`, frozen red in 9932d06, failed `npx tsc -b` with TS18048
(`interval` is possibly undefined) because Cesium types `TimeIntervalCollection.get` as
`TimeInterval | undefined`. The user approved one change only: narrow
`availability.get(0)` to `availability.get(0)!`; no assertion changed. Proof it still
catches the defect: in a scratch worktree at the merge base 2ef9155 with only the
rewritten test applied, `npx vitest run src/lib/earthquakes.test.ts -t "starts at the
quake time inclusive"` fails with `TypeError: quakeAvailability is not a function`
(1 failed, 27 skipped). The rewritten test is frozen again.
