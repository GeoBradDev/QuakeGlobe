import {JulianDate} from "cesium"

export type Earthquake = {
    id: string
    magnitude: number
    coordinates: [number, number, number]
    place: string
    time: number
}

export interface USGSFeature {
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

export function parseUsgsFeed(data: { features: unknown }): Earthquake[] {
    return (data.features as USGSFeature[]).map((f) => ({
        id: f.id,
        magnitude: f.properties.mag,
        coordinates: f.geometry.coordinates,
        place: f.properties.place,
        time: f.properties.time,
    }))
}

export function isQuakeVisible(
  q: Earthquake,
  magRange: [number, number],
  depthRange: [number, number],
  currentTime: JulianDate | undefined,
): boolean {
    if (!currentTime) return true

    const quakeTime = JulianDate.fromDate(new Date(q.time))
    return (
      q.magnitude >= magRange[0] &&
      q.magnitude <= magRange[1] &&
      q.coordinates[2] >= depthRange[0] &&
      q.coordinates[2] <= depthRange[1] &&
      JulianDate.lessThanOrEquals(quakeTime, currentTime)
    )
}
