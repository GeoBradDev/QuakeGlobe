import { useState } from "react"

export default function InfoPanel() {
  const [visible, setVisible] = useState(true)

  if (!visible) return null

  return (
    <div style={{
      position: "absolute",
      top: 50,
      right: 16,
      background: "rgba(0,0,0,0.85)",
      color: "#fff",
      padding: "16px 20px",
      borderRadius: "12px",
      maxWidth: "360px",
      fontSize: "14px",
      zIndex: 999,
      boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
      lineHeight: "1.5"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ fontSize: "15px" }}>Welcome to QuakeGlobe</strong>
        <button onClick={() => setVisible(false)} aria-label="Close info panel" style={{
          background: "none",
          border: "none",
          color: "#ccc",
          fontSize: "18px",
          cursor: "pointer",
          marginLeft: "12px"
        }}>×</button>
      </div>

      <p style={{ marginTop: 12 }}>
        QuakeGlobe is a 3D visualization of recent global seismic activity, built with CesiumJS and powered by real-time data from the U.S. Geological Survey (USGS).
      </p>

      <p>
        Data is sourced from the <a href="https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php" target="_blank" rel="noopener noreferrer" style={{ color: "#9cf" }}>
          USGS Earthquake GeoJSON Feed
        </a>, specifically the
        <a href="https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson" target="_blank" rel="noopener noreferrer" style={{ color: "#9cf" }}>
          &nbsp;all_month.geojson
        </a> endpoint.
      </p>

      <p>
        Use the filter panel to refine by magnitude or depth, or press play in the timeline below to animate earthquakes in the order they occurred.
      </p>
    </div>
  )
}
