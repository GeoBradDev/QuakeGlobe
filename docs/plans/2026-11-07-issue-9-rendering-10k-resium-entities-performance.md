# Plan: Rendering ~10k Resium Entities causes 600 ms filter latency, 19 fps idle, and 1.27 GB heap (issue #9)

Risk tier: High. Stateful rendering a unit test cannot fully exercise (GPU, frame rate,
Cesium batching), it changes existing behavior (how quakes reach the scene and how filters
hide them), it is async (viewer lifecycle effects, Cesium geometry workers), and it touches
several files including most CesiumGlobe test files.

Domain skills:
- vercel-react-best-practices: invoke (moving per-item work out of React rendering, effect
  dependencies, avoiding re-renders).
- superpowers:test-driven-development: invoke (every behavior below starts as a failing test).
- context7 (Cesium / Resium docs): invoke when an API detail is uncertain (EntityCollection
  suspendEvents, CylinderGraphics slices, Viewer.selectedEntity).
- frontend-design: not applicable because no visual design changes; symbology is kept.
- chrome-devtools-mcp: not applicable because the shared MCP browser profile is held by
  another session; the live drive and measurements use a dedicated Chrome driven over CDP
  (scripts in the run's scratch directory, not committed).
- django, django-ninja-api, python-fastapi, expo, react-native: not applicable because the
  repo is a React + Cesium web app.

## Acceptance criteria

From the issue, made checkable. "Mid-range laptop" cannot be reproduced here, so each
criterion is checked on this machine (Intel Arrow Lake laptop, Intel iGPU via ANGLE/Mesa,
real hardware WebGL, Chrome headful, production build via `vite preview`) at 1x, 2x and 4x
CPU throttling (Chrome DevTools `Emulation.setCPUThrottlingRate`). On this machine, main at
2x reproduces the issue's numbers most closely, so 2x is the primary target and 4x the
margin check. GPU is not throttled.

1. Filter interaction to next paint under 200 ms with the full `all_month` feed: time from
   setting the Min Magnitude input (React `input` event) to the end of the next Cesium
   frame (`scene.postRender`), median and p90 over 8 changes, under 200 ms at 2x and 4x.
   The time until the change is fully applied (all scene primitives ready) is also reported
   and must be under 200 ms at 2x.
2. Idle globe holds at least 50 fps: `requestAnimationFrame` rate over 5 s with the clock
   paused and Cesium rendering every frame, at least 50 at 1x, 2x and 4x. Also reported
   while playing.
3. JS heap under 400 MB after load: `performance.memory.usedJSHeapSize` (Chrome with
   `--enable-precise-memory-info`) right after the scene is built, before any forced GC,
   and again after `gc()`.
4. Playing the time animation does not cause React to re-render the quake list per frame:
   0 React commits (counted through a `__REACT_DEVTOOLS_GLOBAL_HOOK__` stub) over 5 s of
   playback, and a unit test that ticks the clock and sees no React render.
5. Nothing regresses: magnitude and depth filters, Reset, autoplay from the earliest quake
   at 10000x, CLAMPED end-of-playback (`attachEndOfPlayback`), timeline scrubbing showing
   only quakes that have occurred, InfoBox popup on click with the #13 description and USGS
   link escaping the sandbox, null-magnitude gray `M?`, non-earthquake type names.
6. Symbology unchanged: cone shape (top radius 0), length `max(50000, depth * 2000)`,
   bottom radius `exp((mag ?? 0) - 3) * 1000`, colors (gray null, lime < 4, yellow 4-4.9,
   orange 5-5.9, red >= 6), computed in one place so #14 can change it there.
7. Feed stays `all_month`.

## Measured baseline and prototypes

Same session, same machine, live `all_month` feed (9,987 to 9,988 quakes), production
builds. Prototypes were throwaway builds in the scratch directory.

| Metric | main | A: Resium `show` prop + slices | B: imperative entities + slices |
| --- | --- | --- | --- |
| Triangles drawn | 5,074,580 | 507,684 | 507,652 |
| Idle fps 1x / 2x / 4x | 6.6* / 5.4* / 10.3 | 141 / 104 / 61 | 111 / 121 / 61 |
| Playing fps 1x / 2x / 4x | 24.6 / 22.0 / 22.1 | 142 / 99 / 59 | 102 / 96 / 52 |
| Filter to next frame, median / p90, 1x | 359 / 4213 ms | 71 / 81 ms | 42 / 140 ms |
| Same, 2x | 892 / 4940 ms | 172 / 198 ms | 80 / 88 ms |
| Same, 4x | 1494 / 4333 ms | 254 / 293 ms | 125 / 136 ms |
| Filter fully applied, median, 2x | 3188 ms | 180 ms | 87 ms |
| Heap after load, before GC | 905 to 907 MB | 315 to 319 MB | 274 to 276 MB |
| Heap after GC | 244 to 247 MB | 241 to 247 MB | 194 to 207 MB |
| CPU ms per `viewer.render()`, playing, 1x median / p90 | 1.6 / 2.6 | 1.7 / 2.4 | 3.4 / 6.3 |
| React commits in 5 s of playback | 0 | 0 | 0 |

\* main's idle window included multi-second stalls (max frame gap 3.7 s).

What the numbers show:
- Frame rate is GPU-bound, not CPU-bound. Cesium already batches the 10k entity cylinders
  into one primitive (1 draw), but `CylinderGraphics` defaults to 128 slices, so the scene
  holds about 508 triangles per quake, 5.07 M in total. Frames take about 40 ms while
  `viewer.render()` CPU is under 2 ms.
- Filter latency comes from removing and re-adding entities: the static geometry batch is
  rebuilt in workers on every change (seconds) and React reconciles 10k `<Entity>`
  elements. Toggling `entity.show` does not rebuild: Cesium updates the batch's per-instance
  show attribute (prototype: about 30 ms from change to applied, unthrottled).
- The transient heap after load (905 MB) is geometry for 5 M triangles.

## Approach

B: build one stable Cesium `Entity` per quake imperatively once per feed, toggle
`entity.show` on filter changes, and tessellate each cone with a slice count that scales
with its radius (8 to 128) instead of the fixed 128.

Alternatives considered:
- A (keep Resium `<Entity>` with a `show` prop): smallest diff, meets the criteria at 1x and
  2x, but fails criterion 1 at 4x (254 / 293 ms) because React still re-renders 10k Resium
  components on every filter keystroke.
- One `Primitive` with instanced cone geometry and per-instance show/color attributes:
  Cesium already produces exactly that batch from the entities (1 primitive, 1 draw), so it
  buys nothing for frame rate and would require re-implementing picking, InfoBox selection
  and time visibility.
- Point or billboard collection: changes the symbology, which #14 owns.
- `requestRenderMode: true`: not needed (idle is 61 to 141 fps), and it would need explicit
  `scene.requestRender()` calls after filter changes, selection and data loads to avoid a
  stale frame while paused. Not done.
- A smaller feed: not needed. Not done.

Decision (approved by the orchestrator at plan approval): the radius-scaled slice count is
tessellation, not symbology. Shape, size formula and colors are unchanged. Large cones
(radius >= 64 km, about M7.2+) keep 128 slices. Evidence: side-by-side screenshots of the
largest cone in the feed (M7.7, Panama, radius 110 km, 128 slices on both) and an M4.8 cone
(Fiji, radius 6 km, 128 slices on main vs 40 on prototype B), camera at the cone, on main
and prototype B, were visually indistinguishable. The live drive repeats this comparison
on the final branch.

Approval conditions: every behavioral assertion in the 8 migrated component test files is
carried over (the PR body lists each file and confirms it; any removed or weakened
assertion stops the run for the orchestrator first); final measurements rerun main vs the
final branch side by side in one session with the same method and CPU throttles.

## Files that change

- `src/lib/quakeSymbol.ts` (new): the one place the cone symbol is defined:
  `quakeColor(magnitude)` (moved from `getColorForMagnitude`), `coneSlices(bottomRadius)`,
  and `quakeCylinder(q)` returning `{length, topRadius: 0, bottomRadius, slices, material,
  outline: false}`. Formulas unchanged except the added `slices`:
  `coneSlices(r) = min(128, max(8, 4 * ceil(4 * sqrt(r / 1000))))` (r in meters; 1 km -> 16,
  4 km -> 32, 16 km -> 64, 64 km and up -> 128).
- `src/lib/quakeSymbol.test.ts` (new): color mapping including null gray; length and radius
  formulas; top radius 0; slices bounds (8 minimum, 128 maximum), monotonic in radius, and
  128 for the largest cones; total triangles for a month-like magnitude distribution under a
  budget (guards against a return to fixed 128 slices).
- `src/lib/quakeEntities.ts` (new): no React.
  - `createQuakeEntities(quakes): QuakeEntity[]` where `QuakeEntity = {quake, entity}`;
    each `Entity` gets `name: quakeName(q)`, `availability: quakeAvailability(q)`,
    `position: Cartesian3.fromDegrees(lon, lat)`, `cylinder: quakeCylinder(q)`,
    `description: quakeDescription(q)`. Do NOT set `id` (Cesium generates one), so a feed
    with a duplicate USGS id cannot make `EntityCollection.add` throw.
  - `addQuakeEntities(collection, list)` and `removeQuakeEntities(collection, list)`, both
    inside `suspendEvents()` / `resumeEvents()`.
  - `applyQuakeFilters(collection, list, magRange, depthRange)`: sets `entity.show =
    matchesFilters(quake, magRange, depthRange)` for each, inside one
    suspendEvents/resumeEvents pair on the collection the entities belong to (pass the
    collection in). Only assign when the value changes.
- `src/lib/quakeEntities.test.ts` (new): props per entity (name, availability start equals
  quake time, position, cylinder from `quakeCylinder`, description from `quakeDescription`);
  add/remove; filter toggles `show` without removing entities and keeps the same Entity and
  graphics instances; null magnitude hidden when Min Magnitude narrows, shown on reset;
  duplicate USGS ids do not throw.
- `src/components/CeiumGlobe.tsx`:
  - Remove the Resium `Entity` import, `getColorForMagnitude`, `quakeEntityProps`,
    `entityPropsById`, `filteredQuakes` and the `{filteredQuakes.map(...)}` children. The
    `<Viewer>` renders no children.
  - `quakeEntities = useMemo(() => createQuakeEntities(quakes), [quakes])` (building
    entities is pure, so it happens during render; this replaced the planned "create in an
    effect and store in state", which needed an extra render and a ref to the latest filter
    ranges to apply them in the same run).
  - Effect on `[viewer, quakeEntities]`: when the viewer exists and is not destroyed and the
    list is non-empty, `addQuakeEntities(viewer.entities, list)`; cleanup removes them from
    that viewer if it is not destroyed (covers a recreated viewer and unmount; StrictMode
    double-run must leave exactly one set).
  - Effect on `[viewer, quakeEntities, magRange, depthRange]`, declared after it so it runs
    in the same commit: `applyQuakeFilters(viewer.entities, list, magRange, depthRange)`; then if
    `viewer.selectedEntity` is one of ours and now hidden, set `viewer.selectedEntity =
    undefined` (main cleared the selection because Cesium clears it when the selected
    entity is removed; keep that behavior). Leave trackedEntity alone (main did not clear
    it either).
  - Keep every other effect (clock, end of playback, suspend flag, InfoBox sandbox) as is.
  - Apply filters in the same commit as the add (the filter effect follows the add effect),
    so a filter set before the feed loads is honored on the first frame.
- Existing tests that mock Resium `Entity` (`CeiumGlobe.test.tsx`, `CeiumGlobe.props.test.tsx`,
  `CeiumGlobe.infoBox.test.tsx`, `CeiumGlobe.endOfPlayback.test.tsx`,
  `CeiumGlobe.lateViewer.test.tsx`, `CeiumGlobe.suspend.test.tsx`,
  `CeiumGlobe.suspendCleanup.test.tsx`, `src/App.test.tsx`): give the fake viewer a real
  `EntityCollection` (`entities: new EntityCollection()`) and a `selectedEntity` field, and
  assert on `viewer.entities.values` (names of entities with `show === true`, availability
  start) instead of rendered `quake-entity` divs. Every behavior those tests check today
  keeps a test: filters, Reset, null-magnitude, non-earthquake names, availability, clock
  untouched by filter changes, suspend flag, InfoBox sandbox, end of playback, late viewer.
  The props test's "same prop objects" case becomes "a filter change keeps the same Entity,
  position, cylinder and availability instances".
- New component tests (in `CeiumGlobe.test.tsx` or a new `CeiumGlobe.entities.test.tsx`):
  - entities are added once per feed; a filter change neither adds nor removes any
    (spy on `collectionChanged` or compare `values` identity);
  - unmount removes the entities; a recreated viewer gets the set and the old one loses it;
  - a selected entity hidden by a filter is deselected; a selected entity that stays
    visible stays selected;
  - wrapping `<CesiumGlobe/>` in React `<Profiler>`, 100 `clock.tick()` calls with the
    clock animating produce zero `onRender` calls (criterion 4).
- `README.md`: only if its text becomes wrong (Phase 8).

## Order of work

1. `quakeSymbol.ts` with tests (TDD), moving the color function; `CeiumGlobe.tsx` imports it.
   Gate.
2. `quakeEntities.ts` with tests (TDD).
3. Rewrite the CesiumGlobe test fakes to a real `EntityCollection` and the assertions to
   entity state; add the new component tests; watch them fail against the current
   component.
4. Switch `CeiumGlobe.tsx` to the imperative entity set. All tests green.
5. Full gate in the repo order.
6. Live drive and measurement against main in one session (see Proof).

## Risks

- Riskiest step: moving entities out of React. Lifecycle mistakes show up as duplicate
  entity sets (StrictMode double effects, viewer recreation) or entities left on a destroyed
  viewer. Covered by the lifecycle tests and the live drive (entity count equals quake
  count after load in dev mode with StrictMode).
- Selection: Cesium clears `selectedEntity` only on removal; hiding needs the explicit
  clear above.
- Batch show updates: Cesium's static batch reads `entity.isShowing` and availability every
  frame (`updateShows`), so `show` and time availability compose correctly; verify in the
  live drive by filtering while paused mid-timeline.
- Slices change is visible only as finer or coarser faceting; flagged for the reviewer above.
- `allowDataSourcesToSuspendAnimation = false` stays: the initial build is still async.
- Not done: `requestRenderMode`, Primitive or point collections, feed change.

## Proof

| Criterion | Test | Live drive / measurement |
| --- | --- | --- |
| 1 filter latency | entity show toggled without add/remove (`quakeEntities.test.ts`, component test) | median and p90 filter to next frame and to applied, main vs branch, 1x/2x/4x |
| 2 fps | triangle budget test in `quakeSymbol.test.ts` | rAF fps idle and playing, main vs branch, 1x/2x/4x; triangles drawn |
| 3 heap | none (not unit-testable) | heap after load before GC and after GC, main vs branch |
| 4 no React per frame | Profiler test with 100 clock ticks | React commit count over 5 s of playback |
| 5 behaviors kept | existing tests ported, plus selection and lifecycle tests | autoplay from earliest quake at 10000x; scrub back hides later quakes; filter while paused; Reset; end of playback pause and restart; click a cone, InfoBox shows #13 description with USGS link and sandbox token; null-magnitude cone gray; dev mode (StrictMode) entity count equals quake count |
| 6 symbology | `quakeSymbol.test.ts` formulas | side-by-side screenshots of largest and a mid cone, main vs branch |
| 7 feed | unchanged URL | network request is `all_month.geojson` |
