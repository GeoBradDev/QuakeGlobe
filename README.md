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

```bash
# Clone and install dependencies
git clone https://github.com/GeoBradDev/quakeglobe.git
cd quakeglobe
npm install

# Add your Cesium Ion token
echo "VITE_CESIUM_ION_TOKEN=your_token_here" > .env

# Start development server
npm run dev
