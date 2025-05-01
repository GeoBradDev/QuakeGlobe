import {useState} from "react"

interface FilterPanelProps {
    minMag: number
    maxMag: number
    magRange: [number, number]
    onMagChange: (range: [number, number]) => void
    depthRange: [number, number]
    onDepthChange: (range: [number, number]) => void
}

const FilterPanel = ({
                         minMag,
                         maxMag,
                         magRange,
                         onMagChange,
                         depthRange,
                         onDepthChange,
                     }: FilterPanelProps) => {
    const [expanded, setExpanded] = useState(true)

    const updateMagRange = (newRange: [number, number]) => {
        onMagChange(newRange)
    }

    const clearFilters = () => {
        onMagChange([minMag, maxMag])
        onDepthChange([0, 700])
    }

    return (
      <div
        style={{
            position: "absolute",
            top: "20px",
            left: "20px",
            background: "rgba(28, 28, 30, 0.95)",
            padding: "16px",
            borderRadius: "16px",
            boxShadow: "0 8px 20px rgba(0,0,0,0.4)",
            zIndex: 1000,
            width: expanded ? "240px" : "60px",
            fontFamily: "system-ui, sans-serif",
            border: "1px solid #444",
            color: "#f2f2f2",
            transition: "width 0.3s ease",
            overflow: "hidden",
        }}
      >
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
              <h3
                style={{
                    fontSize: "16px",
                    fontWeight: 600,
                    color: "#ffffff",
                    margin: 0,
                    whiteSpace: "nowrap",
                }}
              >
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
                <p style={{fontSize: "13px", color: "#cccccc", margin: "12px 0"}}>
                    Filter earthquakes by magnitude and depth.
                </p>

                <div style={{display: "flex", flexDirection: "column", gap: "12px"}}>
                    <label style={{fontSize: "14px", fontWeight: 500}}>
                        Min Magnitude
                        <input
                          type="number"
                          step="0.1"
                          value={magRange[0]}
                          min={minMag}
                          max={magRange[1]}
                          onChange={(e) =>
                            updateMagRange([parseFloat(e.target.value), magRange[1]])
                          }
                          style={{
                              width: "80%",
                              padding: "8px",
                              marginTop: "4px",
                              borderRadius: "6px",
                              border: "1px solid #666",
                              backgroundColor: "#1e1e1f",
                              color: "#fff",
                          }}
                        />
                    </label>

                    <label style={{fontSize: "14px", fontWeight: 500}}>
                        Max Magnitude
                        <input
                          type="number"
                          step="0.1"
                          value={magRange[1]}
                          min={magRange[0]}
                          max={maxMag}
                          onChange={(e) =>
                            updateMagRange([magRange[0], parseFloat(e.target.value)])
                          }
                          style={{
                              width: "80%",
                              padding: "8px",
                              marginTop: "4px",
                              borderRadius: "6px",
                              border: "1px solid #666",
                              backgroundColor: "#1e1e1f",
                              color: "#fff",
                          }}
                        />
                    </label>

                    <label style={{fontSize: "14px", fontWeight: 500}}>
                        Max Depth (km)
                        <input
                          type="number"
                          step="10"
                          min={depthRange[0]}
                          max={700}
                          value={depthRange[1]}
                          onChange={(e) =>
                            onDepthChange([depthRange[0], parseFloat(e.target.value)])
                          }
                          style={{
                              width: "80%",
                              padding: "8px",
                              marginTop: "6px",
                              borderRadius: "6px",
                              border: "1px solid #666",
                              backgroundColor: "#1e1e1f",
                              color: "#fff",
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
                      transition: "background 0.3s",
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

export default FilterPanel