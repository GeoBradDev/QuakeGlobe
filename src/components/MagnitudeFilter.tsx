import { useState } from "react"

interface MagnitudeFilterProps {
  minMag: number
  maxMag: number
  onChange: (range: [number, number]) => void
}

const MagnitudeFilter = ({ minMag, maxMag, onChange }: MagnitudeFilterProps) => {
  const [range, setRange] = useState<[number, number]>([minMag, maxMag])
  const [expanded, setExpanded] = useState(true)

  const updateRange = (newRange: [number, number]) => {
    setRange(newRange)
    onChange(newRange)
  }

  const clearFilters = () => {
    const reset = [minMag, maxMag] as [number, number]
    setRange(reset)
    onChange(reset)
  }

  return (
    <div style={{
      position: "absolute",
      top: "20px",
      left: "20px",
      background: "rgba(28, 28, 30, 0.95)",
      padding: "16px",
      borderRadius: "16px",
      boxShadow: "0 8px 20px rgba(0,0,0,0.4)",
      zIndex: 1000,
      width: expanded ? "200px" : "60px",
      fontFamily: "system-ui, sans-serif",
      border: "1px solid #444",
      color: "#f2f2f2",
      transition: "width 0.3s ease",
      overflow: "hidden"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{
          fontSize: "16px",
          fontWeight: 600,
          color: "#ffffff",
          margin: 0,
          whiteSpace: "nowrap",
        }}>
          {expanded ? "🌍 Quake Filters" : "🌍"}
        </h3>
        <button
          onClick={() => setExpanded(!expanded)}
          title={expanded ? "Collapse panel" : "Expand panel"}
          style={{
            background: "none",
            border: "none",
            color: "#aaa",
            fontSize: "20px",
            cursor: "pointer",
          }}
        >
          {expanded ? "−" : "+"}
        </button>
      </div>

      {expanded && (
        <>
          <p style={{ fontSize: "13px", color: "#cccccc", margin: "12px 0" }}>
            Filter earthquakes by magnitude range.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <label style={{ fontSize: "14px", fontWeight: 500 }}>
              Min Magnitude
              <input
                type="number"
                step="0.1"
                value={range[0]}
                min={minMag}
                max={range[1]}
                onChange={e => updateRange([parseFloat(e.target.value), range[1]])}
                style={{
                  width: "80%",
                  padding: "8px",
                  marginTop: "4px",
                  borderRadius: "6px",
                  border: "1px solid #666",
                  backgroundColor: "#1e1e1f",
                  color: "#fff"
                }}
              />
            </label>

            <label style={{ fontSize: "14px", fontWeight: 500 }}>
              Max Magnitude
              <input
                type="number"
                step="0.1"
                value={range[1]}
                min={range[0]}
                max={maxMag}
                onChange={e => updateRange([range[0], parseFloat(e.target.value)])}
                style={{
                  width: "80%",
                  padding: "8px",
                  marginTop: "4px",
                  borderRadius: "6px",
                  border: "1px solid #666",
                  backgroundColor: "#1e1e1f",
                  color: "#fff"
                }}
              />
            </label>
          </div>

          <button
            onClick={clearFilters}
            style={{
              marginTop: "16px",
              width: "100%",
              padding: "10px",
              backgroundColor: "#444",
              color: "#fff",
              border: "1px solid #666",
              borderRadius: "8px",
              fontSize: "14px",
              cursor: "pointer",
              transition: "background 0.3s"
            }}
            onMouseOver={(e) => {
              (e.target as HTMLButtonElement).style.backgroundColor = "#555"
            }}
            onMouseOut={(e) => {
              (e.target as HTMLButtonElement).style.backgroundColor = "#444"
            }}
          >
            Reset Filters
          </button>
        </>
      )}
    </div>
  )
}

export default MagnitudeFilter
