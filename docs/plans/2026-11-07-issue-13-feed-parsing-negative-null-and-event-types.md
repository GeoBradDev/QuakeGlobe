# Plan: Feed parsing ignores negative magnitude/depth, null magnitude, and non-earthquake event types (issue #13)

Risk tier: Medium. Starting at Low, raised once because the change alters existing
behavior (default filter ranges, entity names, popup text) rather than adding a feature.
Every changed rule is a pure function a unit test fully exercises (parsing, the filter
predicate, entity props), and the component wiring is already covered by the jsdom
component tests, so the stateful-UI raise does not apply. No force-High area is touched;
the popup HTML escaping is a security-relevant detail, called out under Risks.

Domain skills:
- superpowers:test-driven-development: invoke for parsing, predicate, formatting and
  component tests.
- vercel-react-best-practices: invoke for the React side (defaults as module constants,
  no new per-render work in `CeiumGlobe.tsx`).
- chrome-devtools-mcp:chrome-devtools (or claude-in-chrome): invoke for the live drive.
- context7 docs: invoke only if the Cesium InfoBox description sanitizing behavior needs
  confirming.
- frontend-design, a11y: not applicable because no layout or control is added; the
  popup gains text lines and a link only.
- expo, django, fastapi, payments, email: not applicable because there is no mobile,
  backend, money or messaging code.

## Acceptance criteria

1. With default filters (on load and after Reset Filters), every valid event within the
   default bounds (magnitude -5 to 10, depth -10 to 800 km), which today's feed is
   entirely inside, is visible: an event is valid when it has an id, a finite time, and
   finite longitude, latitude and depth. This includes negative magnitudes, negative depths, null
   magnitudes and every non-earthquake event type (no type is excluded). On the live
   feed, the default-filter entity count equals the parsed valid-event count.
2. The default filter ranges are defined once (`DEFAULT_MAG_RANGE`,
   `DEFAULT_DEPTH_RANGE` in `src/lib/earthquakes.ts`) and used for both the initial state
   in `CeiumGlobe.tsx` and Reset in `FilterPanel.tsx`.
3. A null (or missing, or non-finite) magnitude never renders as "Mnull", "MNaN" or
   "Mundefined" and never throws: the entity name shows `M?`, the popup shows
   `Magnitude: unknown`, and the cylinder uses a finite fallback radius and a neutral
   color (gray).
4. Null-magnitude events are shown while the magnitude filter is at or wider than its
   default range, and hidden as soon as the user narrows the magnitude range (an unknown
   magnitude cannot be judged against a user-chosen bound). The depth filter applies to
   them normally.
5. Non-earthquake events are distinguishable: the entity name includes the type for any
   type other than `earthquake` (for example `M1.8 Quarry blast - 5 km SE of X`), and the
   popup shows a `Type:` line for every event. Earthquake names keep the current
   `M<mag> - <place>` format.
6. The popup formats magnitude and depth to 1 decimal place, shows the place name, the
   time, and a link to the USGS event page. The link is rendered only when the feed URL
   parses as `https:` with host exactly `earthquake.usgs.gov`; every feed string placed
   in the popup HTML (place, type, URL) is HTML-escaped.
7. Unit tests cover parsing of negative magnitude, negative depth, null magnitude,
   non-earthquake types, and features dropped as invalid (missing geometry, non-finite
   coordinate or time).
8. #6 behavior is unchanged: filters apply, the clock autoplays from the earliest quake,
   end-of-playback pauses and restarts as before, and entity props stay referentially
   stable across filter changes. All existing tests stay green.

Out of scope (issue #12): filter input validation, NaN from cleared inputs, a min-depth
input. This plan only moves the defaults into one constant because #13 must change them.

## Orchestrator decisions (2026-11-07)

Plan approved at Medium tier. The three choices below were decided by the orchestrator:

1. Fixed defaults: magnitude [-5, 10], depth [-10, 800] km. The FilterPanel inputs'
   `min` / `max` attributes must accept those values: Max Depth can reach 800, and no
   exposed input blocks the negative lower bounds (Min Magnitude `min` is -5; Max
   Depth `min` stays the current lower depth bound, -10 by default). No new inputs (#12).
2. Non-earthquake types shown by default, distinguishable via the entity name and a
   popup `Type:` line. No type filter UI.
3. Null-magnitude events kept, visible only while the magnitude filter is at or wider
   than the default. Covered by unit tests; the PR body states that the live feed
   currently has none.

## Decision: default bounds (product choice 1)

Recommendation: fixed bounds, `DEFAULT_MAG_RANGE = [-5, 10]` and
`DEFAULT_DEPTH_RANGE = [-10, 800]`.

- Live feed on 2026-11-07 (9,990 features): magnitude min -1.54, max 7.7; depth min
  -3.41 km, max 644.42 km. Nothing below -2 magnitude or -5 km depth today.
- Fixed bounds keep Reset deterministic, need no state change after the feed loads, and
  do not interact with a user who edits a filter before the feed arrives. Data-derived
  bounds would need a second state update on load and a rule for what Reset means
  before the data is in.
- -5 magnitude leaves margin below the smallest magnitudes USGS networks report (rarely
  below -2); -10 km depth is a physical bound (the highest terrain is under 9 km above
  sea level). 800 km is above the deepest recorded earthquakes (about 750 km); the current
  700 km bound could hide a real deep event.
- Alternative the orchestrator suggested: -2 and -10 km. Works on today's feed but has no
  margin on magnitude.

## Decision: non-earthquake types (product choice 2)

Recommendation: shown by default and distinguishable (type in the entity name and the
popup), no type filter UI. On the live feed that is 244 of 9,990 events (quarry blast
115, explosion 82, ice quake 42, other event 3, landslide 2).

- Meets acceptance criterion 3 of the issue ("distinguishable or filterable") with the
  smallest change, and acceptance criterion 1 needs no documented exclusion.
- Excluding them by default hides real feed data with no way to show it again until a
  type filter exists. A type filter UI is a feature and belongs in its own issue, which
  I can file.

## Decision: null magnitude (minor, follows from AC 4)

Keep null-magnitude events (they are valid events with a location and time), show them
as `M?`, gray, small fixed radius, and include them only while the magnitude filter is
not narrowed. Alternative: drop them at parse time. Today's feed has 0 such events, so
the choice only matters for future data.

## Files that change

- `src/lib/earthquakes.ts`
  - `Earthquake`: `magnitude: number | null`; add `type: string` and `url: string | null`.
  - `USGSFeature`: `mag: number | null`, add `type?: string`, `url?: string`, geometry
    nullable, to match the USGS schema.
  - `parseUsgsFeed`: skip a feature unless it has a string id, a finite `time`, and a
    geometry whose first three coordinates are finite numbers. Map `mag` to a finite
    number or `null`; `place` to a string (empty string when missing); `type` to the
    feed string or `"earthquake"` when missing; `url` through `usgsEventUrl` (below).
  - `DEFAULT_MAG_RANGE: [number, number] = [-5, 10]`,
    `DEFAULT_DEPTH_RANGE: [number, number] = [-10, 800]`, exported, with a comment citing
    the feed figures above.
  - `matchesFilters`: a null magnitude matches only when
    `magRange[0] <= DEFAULT_MAG_RANGE[0] && magRange[1] >= DEFAULT_MAG_RANGE[1]`;
    otherwise the existing inclusive checks. `isQuakeVisible` follows automatically.
  - New pure helpers, exported for tests:
    - `usgsEventUrl(raw: unknown): string | null`: returns the URL string only when
      `new URL(raw)` succeeds with `protocol === "https:"` and
      `hostname === "earthquake.usgs.gov"`; else `null`.
    - `escapeHtml(s: string): string`: escapes `& < > " '`.
    - `formatOneDecimal(n: number): string`: `n.toFixed(1)`, with a rounded negative
      zero (`-0.0`) shown as `0.0`; the one formatter for magnitude and depth.
    - `formatMagnitude(m: number | null): string`: `formatOneDecimal(m)` or `"?"`.
    - `formatEventType(t: string): string`: first letter upper-cased
      (`quarry blast` -> `Quarry blast`).
    - `quakeName(q)`: `M${formatMagnitude} - ${place}` for type `earthquake`, else
      `M${formatMagnitude} ${formatEventType(type)} - ${place}`.
    - `quakeDescription(q)`: the popup HTML: Magnitude (1 decimal or `unknown`), Depth
      (1 decimal, `km`), Type, Place, Time (`toLocaleString`, as today), and when `url`
      is non-null `<a href="<escaped url>" target="_blank" rel="noopener noreferrer">USGS
      event page</a>`. Every feed string is passed through `escapeHtml`.
- `src/components/CeiumGlobe.tsx`
  - `quakeEntityProps` uses `quakeName` and `quakeDescription`; radius
    `Math.exp((q.magnitude ?? 0) - 3) * 1000`; color `Color.GRAY` when magnitude is null,
    else `getColorForMagnitude`.
  - Initial state from `DEFAULT_MAG_RANGE` and `DEFAULT_DEPTH_RANGE` (spread into new
    tuples is not needed; the constants are never mutated, so pass them directly).
  - Stop passing `minMag` / `maxMag` to `FilterPanel`.
- `src/components/FilterPanel.tsx`
  - Remove the `minMag` / `maxMag` props; import the two constants. Reset calls
    `onMagChange(DEFAULT_MAG_RANGE)` and `onDepthChange(DEFAULT_DEPTH_RANGE)`. The Min
    Magnitude input's `min` and Max Magnitude's `max` come from `DEFAULT_MAG_RANGE`; the
    Max Depth input's `max` from `DEFAULT_DEPTH_RANGE[1]`. No other change to the inputs
    (validation is #12).
- Tests: `src/lib/earthquakes.test.ts`, `src/components/FilterPanel.test.tsx`,
  `src/components/CeiumGlobe.test.tsx` (see Proof). Existing tests that build
  `Earthquake` objects or pass `minMag` / `maxMag` are updated for the new fields and
  props, without changing what they assert.
- `README.md`: the Metadata Popups feature line, if its text becomes wrong (Phase 8).
- Review fix: `formatOneDecimal` in `src/lib/earthquakes.ts` is the one shared
  one-decimal formatter for magnitude (name and popup) and depth (popup); it maps a value
  that rounds to negative zero (for example -0.04) to `0.0`, so no `M-0.0` or
  `-0.0 km` is shown. Tested in the new `src/lib/formatting.test.ts`.
- Review fix: new `src/lib/infoBox.ts` `allowInfoBoxPopupsToEscapeSandbox(viewer)`, called
  from a `[viewer]` effect in `CeiumGlobe.tsx`. Cesium's InfoBox iframe is sandboxed with
  `allow-same-origin allow-popups allow-forms`, so the tab opened by the USGS link
  inherited the sandbox and ran no scripts. The helper adds
  `allow-popups-to-escape-sandbox` (keeping the existing tokens, never `allow-scripts`),
  disposes the InfoBox's description subscription and reloads the frame so the new
  sandbox applies; the InfoBox load handler then re-injects its CSS and content element.
  Guards a destroyed viewer and a missing or destroyed InfoBox. If the frame has not
  finished its first load (no `.cesium-infoBox-description` yet), the change waits for
  that load in a `{once: true}` listener (registered once per frame, guards re-checked
  inside), so the InfoBox load handler never runs twice. Tested in the new
  `src/lib/infoBox.test.ts`, `src/lib/infoBox.beforeLoad.test.ts` (real Cesium InfoBox
  in jsdom) and `src/components/CeiumGlobe.infoBox.test.tsx`.

## Order of work

1. Red: parsing tests in `earthquakes.test.ts` (negative magnitude and depth kept as is,
   null and missing magnitude -> `null`, `type` and `url` kept, invalid features
   dropped, missing type -> `earthquake`, non-USGS or `http:` URL -> `null`). Update the
   existing `toEqual` expectation for the new fields. Commit the red tests, then the
   parse change.
2. Red: `matchesFilters` tests (negative magnitude and depth match the defaults; null
   magnitude matches defaults and wider, not a narrowed range; depth still applies to
   null-magnitude events). Then the constants and predicate change.
3. Red: formatting tests (`quakeName` for earthquake, other type and null magnitude;
   `quakeDescription` decimals, `unknown`, Type line, link present only for a valid URL,
   `<script>` and quotes in place escaped; `usgsEventUrl` rejects `javascript:`,
   `http:`, other hosts such as `earthquake.usgs.gov.evil.com`, and non-strings). Then
   the helpers.
4. Red: `FilterPanel.test.tsx` Reset expects `DEFAULT_MAG_RANGE` and
   `DEFAULT_DEPTH_RANGE`; `CeiumGlobe.test.tsx` adds a feed with a negative-magnitude,
   negative-depth, null-magnitude and quarry-blast feature and asserts all are rendered
   with default filters and that the names are `M?` and type-labelled. Then the
   component changes.
5. Full gate, then the live drive.

## Risks

- Popup XSS: `description` is HTML that Cesium renders in the InfoBox iframe. Feed text
  is escaped and the link is restricted to `https://earthquake.usgs.gov`, so a
  compromised or malformed feed cannot inject markup or a `javascript:` link.
- InfoBox sandbox: the popup link opens with `allow-popups-to-escape-sandbox`, so the
  opened USGS page runs unsandboxed. The description iframe itself still has no
  `allow-scripts`, and the link is limited to `https://earthquake.usgs.gov`. The helper
  touches the private `_descriptionSubscription` field defensively; a Cesium upgrade
  that renames it would leave one stale subscription writing to the old document, which
  is harmless because the new one runs after it. Reloading before the first load could
  run the InfoBox load handler twice (two stylesheets, two content elements, the
  description shown twice), so the helper defers to that load instead.
- Entity names are the keys several component tests look up (`M6.4 - Chile`). The
  earthquake format is kept, and `formatOneDecimal` yields the same text for the one-decimal
  magnitudes those tests use.
- The `entityPropsById` memo must still build props once per feed; the new helpers are
  called inside `quakeEntityProps`, so referential stability (the #6 props test) holds.
- Negative magnitudes give a very small cylinder radius (`exp(m - 3) * 1000` is about 11 m
  at M-1.5). They were already drawn that way before #6; changing the size scale is not
  part of this issue.
- Raising the depth default to 800 km and lowering magnitude to -5 changes what Reset
  restores; the FilterPanel Reset test is updated to the constants, not literals.

## Proof

- AC 1, 2: `matchesFilters` tests with the default constants; CeiumGlobe component test
  rendering negative, null and non-earthquake features under defaults; FilterPanel Reset
  test asserting the constants. Live drive: entity count under defaults equals the
  `parseUsgsFeed` count of the live feed fetched in the page.
- AC 3, 4: name, description and predicate tests for null magnitude; component test that
  the `M?` entity renders. Live drive: same with a feed containing a null magnitude is
  not available live (0 today), so this is unit-test proof only; the drive notes it.
- AC 5, 6: `quakeName`, `quakeDescription`, `usgsEventUrl`, `escapeHtml` tests. Live
  drive: open a quarry blast and an earthquake popup and show the name, 1-decimal
  values, Type line and the link to `earthquake.usgs.gov`.
- AC 7: the parse tests in step 1.
- AC 8: existing suite green; live drive shows autoplay from the earliest quake, a
  narrowed filter reducing the count and Reset restoring the full count, and
  end-of-playback pausing at the stop time.
- Review fix, negative zero: `src/lib/formatting.test.ts` (`formatOneDecimal`, name and
  popup never show `-0.0`, -0.5 stays negative). Live drive: a feed event with a depth
  between -0.05 and 0 km shows `Depth: 0.0 km`, and no entity name or popup contains
  `-0.0`.
- Review fix, InfoBox sandbox: `src/lib/infoBox.test.ts` (token added, existing tokens
  kept, no `allow-scripts`, frame reloaded with one stylesheet and one content element,
  idempotent, guards), `src/lib/infoBox.beforeLoad.test.ts` (called before the first
  load: one reload after it, one stylesheet, one content element, description updated
  once; destroyed viewer before load does nothing) and
  `src/components/CeiumGlobe.infoBox.test.tsx` (the component applies it). Live drive:
  the InfoBox has one stylesheet and one content element, and clicking "USGS event page"
  opens a tab whose page runs its scripts (the Angular app boots, no "Blocked script
  execution" console message).
