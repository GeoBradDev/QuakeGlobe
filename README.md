# 🌍 QuakeGlobe

**QuakeGlobe** is a real-time 3D earthquake visualization tool built with [CesiumJS](https://cesium.com/cesiumjs/), [React](https://react.dev/), and the [USGS Earthquake API](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php). It lets users explore seismic activity across the globe, filter events by magnitude and depth, and animate earthquakes over time using Cesium’s timeline and clock.

## 🔗 Live Demo

👉 [quakeglobe.onrender.com](https://quakeglobe.onrender.com)

---

## ✨ Features

- **🌐 Interactive 3D Globe** — powered by CesiumJS + Resium
- **📊 Real-Time Data** — from USGS GeoJSON `all_month` feed
- **🎛️ Filter Panel** — dynamically refine earthquakes by magnitude and depth
- **⏱️ Time Animation** — Cesium’s clock and timeline animate quakes as they occurred
- **📌 Metadata Popups** — see magnitude, depth, location, and timestamp
- **💡 Info Panel** — helpful overview for first-time users
- **🖤 Dark Mode UI** — visually clean, modern, and mobile-friendly

---

## 🛠️ Tech Stack

- **CesiumJS + Resium**: 3D geospatial rendering
- **React + TypeScript**: Component-driven frontend
- **USGS API**: Live earthquake data
- **Render.com**: Hosting + deployment

---

## 📦 Setup & Development

### Requirements

- Node.js 24.15.0 or newer on the 24 line (`.nvmrc` pins 24.18.0 and `package.json`
  `engines` requires `>=24.15.0 <25`, the floor jsdom needs for the test suite; run
  `nvm use` to switch)
- npm (ships with Node)

```bash
# Clone and install dependencies
git clone https://github.com/GeoBradDev/quakeglobe.git
cd quakeglobe
npm ci

# Add your Cesium Ion token
echo "VITE_CESIUM_ION_TOKEN=your_token_here" > .env

# Start development server
npm run dev
```

On Windows, `echo ... > .env` in Windows PowerShell 5.1 writes UTF-16, which Vite
cannot read. Create `.env` with an editor, or run:

```powershell
Set-Content .env "VITE_CESIUM_ION_TOKEN=your_token_here" -Encoding utf8
```

Cesium's static files (`Workers`, `ThirdParty`, `Assets`, `Widgets`) are served
from `node_modules/cesium` at `/cesium` by `vite-plugin-static-copy` in dev and
copied to `dist/cesium` on build. Nothing is copied into `public/` any more. If an
older clone still has a `public/cesium` folder from the removed `postinstall`
script, delete it so the files are not copied into `dist/` twice:

```bash
# macOS / Linux
rm -rf public/cesium
```

```powershell
# Windows PowerShell
Remove-Item -Recurse -Force public/cesium
```

---

## Testing and Linting

```bash
npm test          # Vitest suite (jsdom), runs once
npx vitest        # Vitest in watch mode
npm run lint      # ESLint
npx tsc -b        # TypeScript type check
npm run build     # Type check and production build into dist/
npm run preview   # Serve dist/ locally
```

CI (`.github/workflows/ci.yml`) runs on every push and pull request:

- `build`: `npm ci`, `npm run lint`, `npx tsc -b`, `npm test`, `npm run build`
- `audit`: `npm ci`, `npm audit --omit=dev --audit-level=high` (expected to fail until
  issue #10 upgrades cesium)
- `setup`: `npm ci`, `npm test`, `npm run build` and a check that `dist/cesium` holds
  `Workers`, `ThirdParty`, `Assets` and `Widgets`, on Ubuntu, macOS and Windows. GitHub
  shows these checks as `setup (ubuntu-latest)`, `setup (macos-latest)` and
  `setup (windows-latest)`.

---

## Deployment

The site deploys to Render as a static site from `render.yaml`:

- Build command: `npm ci && npm run build`
- Publish directory: `dist`
- `NODE_VERSION` is set to `24.18.0` to match `.nvmrc`
- Set `VITE_CESIUM_ION_TOKEN` in the Render dashboard; it is read at build time.
