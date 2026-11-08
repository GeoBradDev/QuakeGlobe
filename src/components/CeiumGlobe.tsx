import {Viewer as CesiumViewer} from "cesium"
import {Viewer, Entity, CesiumComponentRef} from "resium"
import {
    Cartesian3,
    createWorldTerrainAsync,
    TerrainProvider,
    Ion,
    JulianDate,
} from "cesium"
import {useCallback, useEffect, useMemo, useState} from "react"
import FilterPanel from "./FilterPanel.tsx"
import MagnitudeLegend from "./MagnitudeLegend.tsx"
import InfoPanel from "./InfoPanel.tsx"
import DepthLegend from "./DepthLegend.tsx";
import {
    attachEndOfPlayback,
    configureClock,
    DEFAULT_DEPTH_RANGE,
    DEFAULT_MAG_RANGE,
    getTimeRange,
    matchesFilters,
    parseUsgsFeed,
    quakeAvailability,
    quakeDescription,
    quakeName,
    type Earthquake,
} from "../lib/earthquakes.ts"
import {allowInfoBoxPopupsToEscapeSandbox} from "../lib/infoBox.ts"
import {quakeCylinder} from "../lib/quakeSymbol.ts"

Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN

if (!Ion.defaultAccessToken) {
    console.warn("Cesium Ion token is missing. Add VITE_CESIUM_ION_TOKEN to your .env file.")
}

function quakeEntityProps(q: Earthquake) {
    return {
        name: quakeName(q),
        availability: quakeAvailability(q),
        position: Cartesian3.fromDegrees(q.coordinates[0], q.coordinates[1]),
        cylinder: quakeCylinder(q),
        description: quakeDescription(q),
    }
}

const USGS_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson"

export default function CesiumGlobe() {
    const [quakes, setQuakes] = useState<Earthquake[]>([])
    const [terrainProvider, setTerrainProvider] = useState<TerrainProvider>()
    const [magRange, setMagRange] = useState<[number, number]>(DEFAULT_MAG_RANGE)
    const [depthRange, setDepthRange] = useState<[number, number]>(DEFAULT_DEPTH_RANGE)

    // Resium exposes the Cesium viewer only after its async create, and updates the
    // handle if the viewer is recreated, so track it in state through a callback ref.
    const [viewer, setViewer] = useState<CesiumViewer>()
    const viewerRef = useCallback((handle: CesiumComponentRef<CesiumViewer> | null) => {
        setViewer(handle?.cesiumElement ?? undefined)
    }, [])

    useEffect(() => {
        createWorldTerrainAsync().then(setTerrainProvider)
    }, [])

    useEffect(() => {
        fetch(USGS_URL)
          .then((res) => res.json())
          .then((data) => {
              setQuakes(parseUsgsFeed(data))
          })
    }, [])

    // A filter change makes Cesium rebuild its geometry batches asynchronously. Keep the
    // clock running meanwhile. Resium passes the allowDataSourcesToSuspendAnimation prop
    // only to the Viewer constructor, which ignores it, so set it on the instance too.
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return
        viewer.allowDataSourcesToSuspendAnimation = false
        return () => {
            if (!viewer.isDestroyed()) viewer.allowDataSourcesToSuspendAnimation = true
        }
    }, [viewer])

    // Let the "USGS event page" link in the popup open a tab that runs its scripts.
    useEffect(() => {
        if (viewer) allowInfoBoxPopupsToEscapeSandbox(viewer)
    }, [viewer])

    // Drive the viewer's own clock: time visibility is applied by Cesium through
    // each entity's availability, so no clock tick ever reaches React state.
    useEffect(() => {
        if (!viewer || viewer.isDestroyed()) return

        const range = getTimeRange(quakes)
        if (!range) return
        if (!JulianDate.lessThan(range.start, range.stop)) {
            console.warn("Invalid time range: start and stop are equal")
            return
        }

        configureClock(viewer.clock, range)
        viewer.timeline?.zoomTo(range.start, range.stop)
        return attachEndOfPlayback(viewer.clock)
    }, [quakes, viewer])

    // Build each quake's entity props once per feed. A surviving entity then keeps
    // the same object references when a filter changes, so Resium does not
    // reassign them and Cesium does not rebuild its geometry batches.
    const entityPropsById = useMemo(
      () => new Map(quakes.map((q) => [q.id, quakeEntityProps(q)])),
      [quakes],
    )

    const filteredQuakes = useMemo(
      () => quakes.filter((q) => matchesFilters(q, magRange, depthRange)),
      [quakes, magRange, depthRange],
    )

    return (
      <>
          <FilterPanel
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
            allowDataSourcesToSuspendAnimation={false}
            timeline
            animation
          >
              {filteredQuakes.map((q) => (
                <Entity key={q.id} {...entityPropsById.get(q.id)}/>
              ))}
          </Viewer>
      </>
    )
}
