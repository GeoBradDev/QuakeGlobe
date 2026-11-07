# QuakeGlobe

React + TypeScript + CesiumJS (Resium) app built with Vite, deployed to Render as a static site.

## Gates

Run from the repo root, in this order. CI runs the same commands.

```bash
npm ci
npm run lint
npx tsc -b
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

## Git exception

Agents running the `/work-issue` workflow may `git commit` and `git push` only on the
`issue-<N>-*` branch that run created, and may open a pull request from it to `main`.
Never commit or push to `main`. Never merge or enable auto-merge; a human merges.
