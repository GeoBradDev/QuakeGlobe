import {useState} from "react"

const MagnitudeLegend = () => {
    const [open, setOpen] = useState(true)

    const styles = {
        wrapper: {
            position: "absolute" as const,
            bottom: "50px",
            right: "20px",
            backgroundColor: "rgba(28, 28, 30, 0.95)",
            border: "1px solid #444",
            borderRadius: "12px",
            padding: "12px",
            color: "#f2f2f2",
            width: open ? "200px" : "60px",
            transition: "width 0.3s ease",
            zIndex: 1000,
            overflow: "hidden",
            fontFamily: "system-ui, sans-serif",
        },
        header: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: open ? "10px" : 0,
        },
        row: {
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "6px",
            fontSize: "13px",
        },
        colorBox: (color: string) => ({
            width: "16px",
            height: "16px",
            borderRadius: "50%",
            backgroundColor: color,
            border: "1px solid #ccc",
        }),
    }

    return (
      <div style={styles.wrapper}>
          <div style={styles.header}>
              <span>{open ? "🧭 Magnitude Legend" : "🧭"}</span>
              <button
                onClick={() => setOpen(!open)}
                style={{
                    background: "none",
                    border: "none",
                    color: "#aaa",
                    fontSize: "16px",
                    cursor: "pointer",
                }}
              >
                  {open ? "−" : "+"}
              </button>
          </div>

          {open && (
            <>
                <div style={styles.row}>
                    <div style={styles.colorBox("lime")}></div>
                    <span>M &lt; 4.0</span>
                </div>
                <div style={styles.row}>
                    <div style={styles.colorBox("yellow")}></div>
                    <span>M 4.0–4.9</span>
                </div>
                <div style={styles.row}>
                    <div style={styles.colorBox("orange")}></div>
                    <span>M 5.0–5.9</span>
                </div>
                <div style={styles.row}>
                    <div style={styles.colorBox("red")}></div>
                    <span>M ≥ 6.0</span>
                </div>
            </>
          )}
      </div>
    )
}

export default MagnitudeLegend
