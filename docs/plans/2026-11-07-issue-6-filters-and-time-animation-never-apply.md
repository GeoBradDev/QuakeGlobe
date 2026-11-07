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
   named constant `START_ANIMATING` (default `true`, see Open decision); either way,
   play advances time and reveals quakes in chronological order, pause stops it, and the
   clock stops at the stop time instead of running past it.
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
  and lose the clock config. `terrainProvider` is a mutable Viewer prop in Resium 1.28,
  and removing `clockViewModel` removes the only read-only prop that varied. Verify in the
  live drive that the clock config survives terrain loading (terrain 401s locally, so this
  is a note for the reviewer, not provable here without a token).
- Cesium honoring `availability` for static cylinder geometry: confirmed in
  `StaticGeometryColorBatch` (`hasConstantFill` is false when availability is defined, so
  show is recomputed each frame from `isFilled(time)`). This moves ~10k entities into the
  per-frame attribute path; measure frame rate against main in the live drive. The
  rendering rewrite itself is #9's scope.
- Behavior change on load: before, every quake was drawn; now quakes appear over time
  from the earliest one. That is the documented intent of the feature but starts as a
  nearly empty globe. Noted in the PR body.
- Out of scope: NaN or inverted filter inputs (#12), entity rendering cost (#9), depth
  symbology (#14).

## Open decision

Autoplay versus paused on load is a product decision taken to the user (approved plan,
2026-11-07). Implemented as `START_ANIMATING = true`, matching the original author's
`shouldAnimate: true` config: the clock autoplays from the earliest quake at 10000x. If
the user picks paused, flip the constant and the one test expectation that names it.

## Proof

- Criterion 1: `earthquakes.test.ts` `matchesFilters` and `isQuakeVisible` cases for each
  bound; component test (b). Live drive: Min Magnitude 6 hides green, yellow and orange
  quakes; Max Depth 50 hides deep quakes.
- Criterion 2: `getTimeRange` and `configureClock` unit tests; component test (a). Live
  drive: widget starts at the earliest quake's date at 10000x; play/pause work; play advances the date
  and quakes appear over time; the clock stops at the stop time.
- Criterion 3: `hasOccurred` and `quakeAvailability` unit tests; component test (c).
  Live drive: drag the scrubber back and forward and see the visible set change.
- Criterion 4: component test (d). Live drive: change Min Magnitude while playing; the
  clock keeps running and the filtered set keeps revealing over time.
- Criterion 5: the `earthquakes.test.ts` cases above.
- Criterion 6: code review of `CeiumGlobe.tsx` (no `useState` for time, no `Clock`
  construction, no `onTick`); live drive measures frame rate versus main, idle and while
  playing.
