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
    magnitude: number | null
    coordinates: [number, number, number]
    place: string
    time: number
    type: string
    url: string | null
}

export interface USGSFeature {
    id: string
    properties: {
        mag: number | null
        place: string | null
        time: number
        type?: string
        url?: string
    }
    geometry: {
        coordinates: [number, number, number]
    } | null
}

function isFiniteNumber(v: unknown): v is number {
    return typeof v === "number" && Number.isFinite(v)
}

// The USGS event page URL, or null unless it is https on earthquake.usgs.gov, so a
// malformed feed cannot put a javascript: or foreign link in the popup.
export function usgsEventUrl(raw: unknown): string | null {
    if (typeof raw !== "string") return null
    try {
        const url = new URL(raw)
        return url.protocol === "https:" && url.hostname === "earthquake.usgs.gov" ? raw : null
    } catch {
        return null
    }
}

// A feature becomes an Earthquake when it has a string id, a finite time and finite
// longitude, latitude and depth. Any other feature is dropped. A missing or
// non-finite magnitude becomes null.
export function parseUsgsFeed(data: { features: unknown }): Earthquake[] {
    const features = Array.isArray(data.features) ? data.features : []
    const quakes: Earthquake[] = []
    for (const f of features as Partial<USGSFeature>[]) {
        const props = f?.properties
        const coords = f?.geometry?.coordinates
        if (typeof f?.id !== "string" || !props || !isFiniteNumber(props.time)) continue
        if (!Array.isArray(coords) || coords.length < 3 || !coords.slice(0, 3).every(isFiniteNumber)) continue
        quakes.push({
            id: f.id,
            magnitude: isFiniteNumber(props.mag) ? props.mag : null,
            coordinates: [coords[0], coords[1], coords[2]],
            place: typeof props.place === "string" ? props.place : "",
            time: props.time,
            type: typeof props.type === "string" && props.type !== "" ? props.type : "earthquake",
            url: usgsEventUrl(props.url),
        })
    }
    return quakes
}

// Default (and Reset) filter ranges, wide enough that every valid event is shown.
// The all_month feed on 2026-11-07 (9,990 features) spanned magnitude -1.54 to 7.7
// and depth -3.41 to 644.42 km. -5 leaves margin below the smallest reported
// magnitudes, -10 km is above the highest terrain, and 800 km is below the deepest
// recorded earthquakes (about 750 km).
export const DEFAULT_MAG_RANGE: [number, number] = [-5, 10]
export const DEFAULT_DEPTH_RANGE: [number, number] = [-10, 800]

export function escapeHtml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
}

// One decimal place, with a value that rounds to negative zero (such as -0.04) shown as
// 0.0 rather than -0.0.
export function formatOneDecimal(n: number): string {
    const s = n.toFixed(1)
    return s === "-0.0" ? "0.0" : s
}

export function formatMagnitude(m: number | null): string {
    return m === null ? "?" : formatOneDecimal(m)
}

export function formatEventType(t: string): string {
    return t.charAt(0).toUpperCase() + t.slice(1)
}

export function quakeName(q: Earthquake): string {
    const mag = `M${formatMagnitude(q.magnitude)}`
    return q.type === "earthquake"
      ? `${mag} - ${q.place}`
      : `${mag} ${formatEventType(q.type)} - ${q.place}`
}

// Popup HTML for the Cesium InfoBox. Every feed string is escaped.
export function quakeDescription(q: Earthquake): string {
    const magnitude = q.magnitude === null ? "unknown" : formatOneDecimal(q.magnitude)
    const lines = [
        `<b>Magnitude:</b> ${magnitude}<br/>`,
        `<b>Depth:</b> ${formatOneDecimal(q.coordinates[2])} km<br/>`,
        `<b>Type:</b> ${escapeHtml(formatEventType(q.type))}<br/>`,
        `<b>Place:</b> ${escapeHtml(q.place)}<br/>`,
        `<b>Time:</b> ${escapeHtml(new Date(q.time).toLocaleString())}`,
    ]
    if (q.url !== null) {
        lines.push(
          `<br/><a href="${escapeHtml(q.url)}" target="_blank" rel="noopener noreferrer">USGS event page</a>`,
        )
    }
    return lines.join("")
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
    const depthOk = q.coordinates[2] >= depthRange[0] && q.coordinates[2] <= depthRange[1]
    if (q.magnitude === null) {
        // An unknown magnitude cannot be judged against a user-chosen bound, so it is
        // shown only while the magnitude range is at or wider than the default.
        return depthOk && magRange[0] <= DEFAULT_MAG_RANGE[0] && magRange[1] >= DEFAULT_MAG_RANGE[1]
    }
    return depthOk && q.magnitude >= magRange[0] && q.magnitude <= magRange[1]
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

// End of playback: the first time the clock reaches its stop time it pauses there,
// with every quake visible. Pressing Play forward while at (or past) the stop time
// restarts from the start time; playing in reverse from there moves backward from the
// stop time. Returns a function that detaches both listeners.
//
// Clock.tick raises onStop while it still holds the clamped time in a local and
// assigns it to currentTime afterwards, so a currentTime set inside onStop would be
// overwritten. onStop only flags the stop; the onTick listener acts on it.
export function attachEndOfPlayback(clock: Clock): () => void {
    let wasAtStop = JulianDate.greaterThanOrEquals(clock.currentTime, clock.stopTime)
    let stopped = false

    const removeStop = clock.onStop.addEventListener(() => {
        stopped = true
    })
    const removeTick = clock.onTick.addEventListener(() => {
        // Only forward play restarts or pauses. Playing in reverse from beyond the stop
        // time also clamps and raises onStop; let that clamp stand and keep animating.
        if (stopped) {
            stopped = false
            if (clock.multiplier > 0) {
                if (wasAtStop) {
                    clock.currentTime = JulianDate.clone(clock.startTime)
                    clock.shouldAnimate = true
                } else {
                    clock.shouldAnimate = false
                }
            }
        }
        wasAtStop = JulianDate.greaterThanOrEquals(clock.currentTime, clock.stopTime)
    })

    return () => {
        removeStop()
        removeTick()
    }
}
