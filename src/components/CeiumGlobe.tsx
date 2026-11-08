import {Viewer as CesiumViewer} from "cesium"
import {Viewer, CesiumComponentRef} from "resium"
import {
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
    parseUsgsFeed,
    type Earthquake,
} from "../lib/earthquakes.ts"
import {allowInfoBoxPopupsToEscapeSandbox} from "../lib/infoBox.ts"
import {
    addQuakeEntities,
    applyQuakeFilters,
    createQuakeEntities,
    removeQuakeEntities,
} from "../lib/quakeEntities.ts"

Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN

if (!Ion.defaultAccessToken) {
    console.warn("Cesium Ion token is missing. Add VITE_CESIUM_ION_TOKEN to your .env file.")
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

    // Loading the feed makes Cesium build its geometry batches asynchronously. Keep the
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

    // One Cesium entity per quake, built once per feed and kept out of React rendering:
    // a filter change only toggles entity.show, and Cesium applies time visibility through
    // each entity's availability. Building them is pure, so it happens during render.
    const quakeEntities = useMemo(() => createQuakeEntities(quakes), [quakes])

    // Put the entities on the current viewer, and take them off it again when the viewer
    // is recreated or the component unmounts (a destroyed viewer is left alone).
    useEffect(() => {
        if (!viewer || viewer.isDestroyed() || quakeEntities.length === 0) return
        addQuakeEntities(viewer.entities, quakeEntities)
        return () => {
            if (!viewer.isDestroyed()) removeQuakeEntities(viewer.entities, quakeEntities)
        }
    }, [viewer, quakeEntities])

    // Runs after the effect above in the same commit, so the filters in effect when the
    // feed loads apply before Cesium draws the entities.
    useEffect(() => {
        if (!viewer || viewer.isDestroyed() || quakeEntities.length === 0) return
        applyQuakeFilters(viewer.entities, quakeEntities, magRange, depthRange)

        // Cesium clears the selection when the selected entity is removed, not when it is
        // hidden, so close the InfoBox of a quake the filters just hid.
        const selected = viewer.selectedEntity
        if (selected && !selected.show && quakeEntities.some(({entity}) => entity === selected)) {
            viewer.selectedEntity = undefined
        }
    }, [viewer, quakeEntities, magRange, depthRange])

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
          />
      </>
    )
}
