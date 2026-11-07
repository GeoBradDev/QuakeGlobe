# Plan: No tests or CI, and production build is not reproducible (issue #15)

Risk tier: Medium. Build, deploy and CI config change across many files, plus a
behavior-preserving refactor of the globe component to expose pure functions; the
Cesium asset copy change is not fully provable by unit tests (needs a live check that
`/cesium/Workers`, `/cesium/Assets` and `/cesium/Widgets` are served in dev and in the
built `dist/`).

Domain skills:
- superpowers:test-driven-development: invoke.
- vercel-react-best-practices: not applicable because no React rendering or performance
  behavior changes; the refactor only moves code into pure functions.
- frontend-design, a11y, expo, django, fastapi: not applicable because no UI, mobile or
  backend work.
- context7 docs: invoke for Vitest 3, vite-plugin-static-copy and Cesium's Vite setup.

## Acceptance criteria

1. `npm test` runs a Vitest suite that covers the filter predicate (magnitude bounds,
   depth bounds, time cutoff, inclusive boundaries) and feed parsing (USGS GeoJSON
   feature to `Earthquake` mapping). It also covers FilterPanel input wiring and a smoke
   render of `App` with Resium and the Cesium network calls mocked.
2. A GitHub Actions workflow runs on every push and pull_request and executes, each as a
   separate step: `npm ci`, `npm run lint`, `npx tsc -b`, `npm test`, `npm run build`,
   `npm audit --omit=dev --audit-level=high`. Any failing step fails its job. (Making the
   job a required check on `main` is a repo setting the owner applies; see Risks.)
3. `render.yaml` builds with `npm ci && npm run build`. Node is pinned to 24.18.0 in
   `.nvmrc`, `render.yaml` (`NODE_VERSION`) and the workflow (via
   `node-version-file: .nvmrc`), and `package.json` `engines.node` (`>=24.15.0 <25`)
   admits it and rejects versions below the toolchain floor.
4. Fresh clone setup works on Linux, macOS and Windows: no shell-only `postinstall`;
   Cesium static assets (`Workers`, `ThirdParty`, `Assets`, `Widgets`) are copied by
   `vite-plugin-static-copy` to `/cesium` in both `vite` dev and `vite build`. CI proves
   it with a job matrix that runs `npm ci`, `npm test` and `npm run build` on
   `ubuntu-latest`, `macos-latest` and `windows-latest`.
5. README documents the test, lint, type check, build and deploy commands and the Node
   version.
6. A repo-root `CLAUDE.md` records the gate commands and the scoped `## Git exception`
   for `/work-issue` (`issue-<N>-*` branches only, PRs to main, never commit or push to
   main).

## Files that change

- `CLAUDE.md` (new): gate commands; `## Git exception`. Committed first so later commits
  on this branch are covered by it.
- `package.json`, `package-lock.json`: add `test` (`vitest run`) script; remove
  `postinstall`; add `engines.node`; add devDependencies `vitest@^3.2` (vitest 4 needs
  vite >= 6.4, and bumping vite belongs to issue #10), `jsdom`,
  `@testing-library/react`, `@testing-library/dom` (required peer of
  `@testing-library/react` 16), `@testing-library/jest-dom`,
  `@testing-library/user-event` (only if used), `vite-plugin-static-copy` (v4, which
  preserves source paths, so each target uses `rename: {stripBase: 4}`). Do not change any runtime dependency
  version.
- `.nvmrc` (new): `24.18.0`.
- `render.yaml`: `buildCommand: npm ci && npm run build`; `envVars: - key: NODE_VERSION
  value: "24.18.0"`. `engines.node`: `">=24.15.0 <25"`. Exact pin because jsdom 31
  requires Node `^24.15.0` on the 24 line, so a bare `24` could resolve to a version
  where `npm test` fails (review round 1).
- `vite.config.ts`: add `viteStaticCopy` targets copying
  `node_modules/cesium/Build/Cesium/{Workers,ThirdParty,Assets,Widgets}` to `cesium/`;
  add the Vitest `test` block (environment `jsdom`, setup file) with
  `/// <reference types="vitest/config" />` or `defineConfig` from `vitest/config`. Keep
  the existing `define` and `alias` unchanged.
- `src/lib/earthquakes.ts` (new): `Earthquake` and `USGSFeature` types,
  `parseUsgsFeed(data)` and `isQuakeVisible(quake, magRange, depthRange, currentTime)`
  moved verbatim in behavior from `CeiumGlobe.tsx`.
- `src/components/CeiumGlobe.tsx`: import and use the two functions; no behavior change.
- `src/test/setup.ts` (new): `@testing-library/jest-dom/vitest` import and cleanup.
- `src/lib/earthquakes.test.ts`, `src/components/FilterPanel.test.tsx`,
  `src/App.test.tsx` (new).
- `.github/workflows/ci.yml` (new).
- `README.md`: Requirements (Node 24.18.0, floor 24.15.0), Windows PowerShell forms for
  `.env` and removing `public/cesium`, Testing and linting (with the matrix check names),
  Deployment sections.
- `.gitignore`: keep `public/cesium` (harmless for existing clones), no other change.

## Order of work

1. Commit `CLAUDE.md` alone.
2. Install Vitest, jsdom and Testing Library; add `test` script, `test` config and setup
   file. Commit.
3. TDD: write `src/lib/earthquakes.test.ts` against the not-yet-existing module (red),
   then extract `parseUsgsFeed` and `isQuakeVisible` from `CeiumGlobe.tsx` (green).
   Commit.
4. FilterPanel test (typing into Min/Max Magnitude and Max Depth calls the callbacks with
   the expected tuples; Reset calls both with defaults; collapse hides inputs). App smoke
   test with `vi.mock('resium')` (Viewer and Entity as plain divs) and `cesium` network
   functions (`createWorldTerrainAsync`) stubbed, `fetch` stubbed to a small feed:
   asserts the filter panel, legends and info panel render. Commit.
5. Replace `postinstall` with `vite-plugin-static-copy`. Verify `npm run build` places
   `dist/cesium/Workers`, `dist/cesium/Assets`, `dist/cesium/Widgets`,
   `dist/cesium/ThirdParty`, and that `vite` dev serves `/cesium/Workers/...` with 200
   when `public/cesium` is absent. Commit.
6. Pin Node: `.nvmrc`, `engines`, `render.yaml` (`npm ci`, `NODE_VERSION`). Commit.
7. Workflow `.github/workflows/ci.yml` (see Risks for job layout). Commit.
8. README sections. Commit.

## Risks

- Production audit currently fails on main (protobufjs critical, dompurify high, via
  cesium; tracked by issue #10). The workflow must not hide that. Pending the owner's
  decision, the layout (approved by the owner) is:
  - job `build` (ubuntu): npm ci, lint, tsc -b, test, build. Intended required check.
  - job `audit` (ubuntu): npm ci, `npm audit --omit=dev --audit-level=high`. Red until
    #10 lands; made required after #10.
  - job `setup` matrix (ubuntu, macos, windows): npm ci, test, build, then a node step
    that fails if `dist/cesium/{Workers,ThirdParty,Assets,Widgets}` is missing. Proves
    AC 4.
- "Blocks merge on failure" needs branch protection on `main` (none today). The owner
  applies it; this PR lists the exact check names to require. No step may use
  `continue-on-error` or otherwise soften the audit.
- Removing `postinstall` while an existing clone still has `public/cesium`: vite would
  copy both into `dist/`. README tells existing clones to delete `public/cesium`; CI and
  Render use fresh clones.
- Mocking Cesium in jsdom: importing the real `cesium` package in jsdom may be slow or
  fail on WebGL. The smoke test mocks `resium` fully and stubs only the Cesium calls that
  hit the network; if importing `cesium` itself fails in jsdom, mock the module with the
  members `CeiumGlobe.tsx` uses.
- The filter predicate is extracted with its current behavior, including returning true
  for every quake while `currentTime` is undefined (issue #6) and no NaN handling (issue
  #12). Tests must not assert those behaviors as correct; they cover only the defined
  case where `currentTime` is set, so #6 and #12 can change them freely.
- Lockfile churn may conflict with issue #10's PR; whoever merges second regenerates.

Not doing: upgrading cesium, resium or vite (#10); fixing filters/clock (#6), input
validation (#12), feed type handling (#13); removing the duplicate `CESIUM_BASE_URL`
definitions or the `cesium` alias (cosmetic, risk of runtime regression without a
browser test); configuring branch protection or the Render dashboard.

## Proof

- AC1: `npm test` output listing `earthquakes.test.ts`, `FilterPanel.test.tsx`,
  `App.test.tsx`, all passing; red run of `earthquakes.test.ts` before extraction.
- AC2, AC4: the CI run on the PR shows `build`, `audit` and the `setup` matrix jobs,
  and each step listed.
- AC3: diff of `render.yaml`, `.nvmrc`, `package.json` engines; CI uses `.nvmrc`.
- AC4 local: `rm -rf node_modules public/cesium dist && npm ci && npm run build`, then
  `ls dist/cesium`; live drive: `npx vite --port 5179`, `curl -sI` a file under
  `/cesium/Workers/` and `/cesium/Widgets/widgets.css` returns 200; `vite preview` the
  same. Load the page in a browser and confirm no 404 for `/cesium/*` in the network log.
- AC5, AC6: README and CLAUDE.md diff.
