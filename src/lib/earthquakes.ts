import {
    Clock,
    ClockRange,
    Iso8601,
    JulianDate,
    TimeInterval,
    TimeIntervalCollection,
} from "cesium"

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

// Whether the clock plays as soon as the feed loads. A product decision: flip to
// false to load paused at the earliest quake.
export const START_ANIMATING = true

// Simulated seconds per real second while the clock animates.
export const CLOCK_MULTIPLIER = 10000

export type TimeRange = {
    start: JulianDate
    stop: JulianDate
}

function quakeJulianTime(q: Earthquake): JulianDate {
    return JulianDate.fromDate(new Date(q.time))
}

export function matchesFilters(
  q: Earthquake,
  magRange: [number, number],
  depthRange: [number, number],
): boolean {
    return (
      q.magnitude >= magRange[0] &&
      q.magnitude <= magRange[1] &&
      q.coordinates[2] >= depthRange[0] &&
      q.coordinates[2] <= depthRange[1]
    )
}

export function hasOccurred(q: Earthquake, currentTime: JulianDate): boolean {
    return JulianDate.lessThanOrEquals(quakeJulianTime(q), currentTime)
}

export function isQuakeVisible(
  q: Earthquake,
  magRange: [number, number],
  depthRange: [number, number],
  currentTime: JulianDate,
): boolean {
    return matchesFilters(q, magRange, depthRange) && hasOccurred(q, currentTime)
}

export function getTimeRange(quakes: Earthquake[]): TimeRange | undefined {
    if (quakes.length === 0) return undefined

    let min = quakes[0].time
    let max = quakes[0].time
    for (const q of quakes) {
        if (q.time < min) min = q.time
        if (q.time > max) max = q.time
    }
    return {
        start: JulianDate.fromDate(new Date(min)),
        stop: JulianDate.fromDate(new Date(max)),
    }
}

// Visible from the quake time (inclusive) onward, so Cesium hides the entity
// whenever the clock is before the quake: availability.contains(t) === hasOccurred(q, t).
export function quakeAvailability(q: Earthquake): TimeIntervalCollection {
    return new TimeIntervalCollection([
        new TimeInterval({
            start: quakeJulianTime(q),
            stop: Iso8601.MAXIMUM_VALUE,
            isStartIncluded: true,
            isStopIncluded: true,
        }),
    ])
}

export function configureClock(clock: Clock, range: TimeRange): void {
    clock.startTime = JulianDate.clone(range.start)
    clock.stopTime = JulianDate.clone(range.stop)
    clock.currentTime = JulianDate.clone(range.start)
    clock.clockRange = ClockRange.CLAMPED
    clock.multiplier = CLOCK_MULTIPLIER
    clock.shouldAnimate = START_ANIMATING
}
