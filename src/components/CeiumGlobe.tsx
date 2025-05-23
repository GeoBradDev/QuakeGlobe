import {Viewer as CesiumViewer} from "cesium"
import {Viewer, Entity, CesiumComponentRef} from "resium"
import {
    Cartesian3,
    Color,
    createWorldTerrainAsync,
    TerrainProvider,
    Ion,
    Clock,
    JulianDate,
    ClockRange,
    ClockViewModel,
} from "cesium"
import {useEffect, useMemo, useRef, useState} from "react"
import FilterPanel from "./FilterPanel.tsx"
import MagnitudeLegend from "./MagnitudeLegend.tsx"
import InfoPanel from "./InfoPanel.tsx"
import DepthLegend from "./DepthLegend.tsx";

Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN

if (!Ion.defaultAccessToken) {
    console.warn("Cesium Ion token is missing. Add VITE_CESIUM_ION_TOKEN to your .env file.")
}

function getColorForMagnitude(mag: number): Color {
    if (mag >= 6) return Color.RED
    if (mag >= 5) return Color.ORANGE
    if (mag >= 4) return Color.YELLOW
    return Color.LIME
}

type Earthquake = {
    id: string
    magnitude: number
    coordinates: [number, number, number]
    place: string
    time: number
}

interface USGSFeature {
    id: string
    properties: {
        mag: number
        place: string
        time: number
    }
    geometry: {
        coordinates: [number, number, number]
    }
}

const USGS_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson"

export default function CesiumGlobe() {
    const [quakes, setQuakes] = useState<Earthquake[]>([])
    const [terrainProvider, setTerrainProvider] = useState<TerrainProvider>()
    const [magRange, setMagRange] = useState<[number, number]>([0, 10])
    const [depthRange, setDepthRange] = useState<[number, number]>([0, 700])
    const [currentTime, setCurrentTime] = useState<JulianDate>()

    const viewerRef = useRef<CesiumComponentRef<CesiumViewer>>(null)
    const clockRef = useRef<Clock | undefined>(undefined)
    const clockViewModel = useMemo(() => {
        if (!clockRef.current) return undefined
        return new ClockViewModel(clockRef.current)
    }, [])


    useEffect(() => {
        createWorldTerrainAsync().then(setTerrainProvider)
    }, [])

    useEffect(() => {
        fetch(USGS_URL)
          .then((res) => res.json())
          .then((data) => {
              const features = (data.features as USGSFeature[]).map((f) => ({
                  id: f.id,
                  magnitude: f.properties.mag,
                  coordinates: f.geometry.coordinates,
                  place: f.properties.place,
                  time: f.properties.time,
              }))
              setQuakes(features)
          })
    }, [])

    useEffect(() => {
        if (quakes.length === 0 || clockRef.current) return

        const sorted = [...quakes].sort((a, b) => a.time - b.time)
        const start = JulianDate.fromDate(new Date(sorted[0].time), new JulianDate())
        const stop = JulianDate.fromDate(new Date(sorted[sorted.length - 1].time), new JulianDate())


        if (JulianDate.lessThan(start, stop)) {
            const clock = new Clock({
                startTime: start,
                currentTime: JulianDate.clone(start),
                stopTime: stop,
                clockRange: ClockRange.LOOP_STOP,
                multiplier: 10000,
                shouldAnimate: true,
            })

            clock.onTick.addEventListener((c) => {
                setCurrentTime(JulianDate.clone(c.currentTime))

                if (JulianDate.greaterThanOrEquals(c.currentTime, c.stopTime)) {
                    c.shouldAnimate = false
                }
            })


            clockRef.current = clock
        } else {
            console.warn("Invalid time range: start and stop are equal")
        }
    }, [quakes])

    useEffect(() => {
        const viewer = viewerRef.current?.cesiumElement
        const clock = clockRef.current

        if (viewer && clock) {
            viewer.timeline?.zoomTo(clock.startTime, clock.stopTime)
        }
    }, [quakes])

    return (
      <>
          <FilterPanel
            minMag={0}
            maxMag={10}
            magRange={magRange}
            onMagChange={setMagRange}
            depthRange={depthRange}
            onDepthChange={setDepthRange}
          />

          <MagnitudeLegend/>
          <DepthLegend/>
          <InfoPanel/>
          <Viewer
            ref={viewerRef}
            full
            terrainProvider={terrainProvider}
            clockViewModel={clockViewModel}
            timeline
            animation
          >
              {quakes
                .filter((q) => {
                    if (!currentTime) return true

                    const quakeTime = JulianDate.fromDate(new Date(q.time))
                    return (
                      q.magnitude >= magRange[0] &&
                      q.magnitude <= magRange[1] &&
                      q.coordinates[2] >= depthRange[0] &&
                      q.coordinates[2] <= depthRange[1] &&
                      JulianDate.lessThanOrEquals(quakeTime, currentTime)
                    )
                })
                .map((q) => (
                  <Entity
                    key={q.id}
                    name={`M${q.magnitude} - ${q.place}`}
                    position={Cartesian3.fromDegrees(q.coordinates[0], q.coordinates[1])}
                    cylinder={{
                        length: Math.max(50000, q.coordinates[2] * 2000),
                        topRadius: 0,
                        bottomRadius: Math.exp(q.magnitude - 3) * 1000,
                        material: getColorForMagnitude(q.magnitude),
                        outline: false,
                    }}
                    description={`<b>Magnitude:</b> ${q.magnitude}<br/><b>Depth:</b> ${q.coordinates[2]} km<br/><b>Time:</b> ${new Date(q.time).toLocaleString()}`}
                  />
                ))}
          </Viewer>
      </>
    )
}
