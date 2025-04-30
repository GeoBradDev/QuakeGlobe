import {Viewer, Entity} from "resium"
import {Cartesian3, Color, createWorldTerrainAsync, TerrainProvider, Ion} from "cesium"
import {useEffect, useState} from "react"
import MagnitudeFilter from "./MagnitudeFilter"

Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN

if (!Ion.defaultAccessToken) {
    console.warn("Cesium Ion token is missing. Add VITE_CESIUM_ION_TOKEN to your .env file.")
}



type Earthquake = {
    id: string
    magnitude: number
    coordinates: [number, number, number] // [lon, lat, depth]
    place: string
    time: number
}

const USGS_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson"

export default function CesiumGlobe() {
    const [quakes, setQuakes] = useState<Earthquake[]>([])
    const [terrainProvider, setTerrainProvider] = useState<TerrainProvider | undefined>()
    const [magRange, setMagRange] = useState<[number, number]>([0, 10])

    useEffect(() => {
        createWorldTerrainAsync().then(setTerrainProvider)
    }, [])

    useEffect(() => {
        fetch(USGS_URL)
          .then((res) => res.json())
          .then((data) => {
              const features = data.features.map((f: any) => ({
                  id: f.id,
                  magnitude: f.properties.mag,
                  coordinates: f.geometry.coordinates,
                  place: f.properties.place,
                  time: f.properties.time,
              }))
              setQuakes(features)
          })
    }, [])

    return (
      <>
          <MagnitudeFilter minMag={0} maxMag={10} onChange={setMagRange}/>
          <Viewer full terrainProvider={terrainProvider}>
              {quakes
                .filter((q) => q.magnitude >= magRange[0] && q.magnitude <= magRange[1])
                .map((q) => (
                  <Entity
                    key={q.id}
                    name={`M${q.magnitude} - ${q.place}`}
                    position={Cartesian3.fromDegrees(q.coordinates[0], q.coordinates[1])}
                    point={{
                        pixelSize: Math.max(5, q.magnitude * 2),
                        color: Color.RED.withAlpha(0.6),
                    }}
                    description={`<b>Magnitude:</b> ${q.magnitude}<br/><b>Depth:</b> ${q.coordinates[2]} km<br/><b>Time:</b> ${new Date(q.time).toLocaleString()}`}
                  />
                ))}
          </Viewer>
      </>
    )
}

