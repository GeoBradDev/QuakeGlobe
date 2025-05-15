import {useState} from "react"
import {useIsMobile} from "../../utils/useIsMobile.ts"

const DepthLegend = () => {
    const isMobile = useIsMobile()
    const [open, setOpen] = useState(!isMobile)

    const styles = {
        wrapper: {
            position: "absolute" as const,
            top: "75px",
            right: "20px",
            backgroundColor: "rgba(28, 28, 30, 0.95)",
            border: "1px solid #444",
            borderRadius: "12px",
            padding: "12px",
            color: "#f2f2f2",
            width: open ? "120px" : "60px",
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
        bars: {
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-around",
            height: "60px",
            marginBottom: "6px",
        },
        bar: (height: string) => ({
            width: "12px",
            height,
            backgroundColor: "#ffffff",
        }),
        labels: {
            display: "flex",
            justifyContent: "space-between",
            fontSize: "12px",
        },
    }

    return (
      <div style={styles.wrapper}>
          <div style={styles.header}>
              <span>{open ? "🕳 Depth (km)" : "🕳"}</span>
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
                <div style={styles.bars}>
                    <div style={styles.bar("15%")}></div>
                    <div style={styles.bar("30%")}></div>
                    <div style={styles.bar("50%")}></div>
                    <div style={styles.bar("80%")}></div>
                </div>

                <div style={styles.labels}>
                    <span>0</span>
                    <span>50</span>
                    <span>150</span>
                    <span>300+</span>
                </div>
            </>
          )}
      </div>
    )
}

export default DepthLegend
