import {describe, expect, it} from 'vitest'
import {Clock, ClockRange, Iso8601, JulianDate} from 'cesium'
import {
    CLOCK_MULTIPLIER,
    START_ANIMATING,
    configureClock,
    getTimeRange,
    hasOccurred,
    isQuakeVisible,
    matchesFilters,
    parseUsgsFeed,
    quakeAvailability,
    type Earthquake,
} from './earthquakes'

const QUAKE_TIME = Date.UTC(2025, 3, 10, 12, 0, 0)

function makeQuake(overrides: Partial<Earthquake> = {}): Earthquake {
    return {
        id: 'us7000abcd',
        magnitude: 4.5,
        coordinates: [-122.4, 37.8, 10],
        place: '10 km N of Somewhere',
        time: QUAKE_TIME,
        ...overrides,
    }
}

function julian(ms: number): JulianDate {
    return JulianDate.fromDate(new Date(ms))
}

const AFTER = julian(QUAKE_TIME + 60_000)

describe('isQuakeVisible', () => {
    it('shows a quake inside the magnitude and depth ranges that occurred before the current time', () => {
        expect(isQuakeVisible(makeQuake(), [0, 10], [0, 700], AFTER)).toBe(true)
    })

    it('hides a quake below the minimum magnitude', () => {
        expect(isQuakeVisible(makeQuake({magnitude: 2.9}), [3, 10], [0, 700], AFTER)).toBe(false)
    })

    it('hides a quake above the maximum magnitude', () => {
        expect(isQuakeVisible(makeQuake({magnitude: 6.1}), [0, 6], [0, 700], AFTER)).toBe(false)
    })

    it('includes quakes exactly on both magnitude bounds', () => {
        expect(isQuakeVisible(makeQuake({magnitude: 3}), [3, 6], [0, 700], AFTER)).toBe(true)
        expect(isQuakeVisible(makeQuake({magnitude: 6}), [3, 6], [0, 700], AFTER)).toBe(true)
    })

    it('hides a quake shallower than the minimum depth', () => {
        expect(isQuakeVisible(makeQuake({coordinates: [0, 0, 5]}), [0, 10], [10, 700], AFTER)).toBe(false)
    })

    it('hides a quake deeper than the maximum depth', () => {
        expect(isQuakeVisible(makeQuake({coordinates: [0, 0, 300]}), [0, 10], [0, 200], AFTER)).toBe(false)
    })

    it('includes quakes exactly on both depth bounds', () => {
        expect(isQuakeVisible(makeQuake({coordinates: [0, 0, 10]}), [0, 10], [10, 200], AFTER)).toBe(true)
        expect(isQuakeVisible(makeQuake({coordinates: [0, 0, 200]}), [0, 10], [10, 200], AFTER)).toBe(true)
    })

    it('hides a quake that occurs after the current time', () => {
        expect(isQuakeVisible(makeQuake(), [0, 10], [0, 700], julian(QUAKE_TIME - 60_000))).toBe(false)
    })

    it('shows a quake that occurs exactly at the current time', () => {
        expect(isQuakeVisible(makeQuake(), [0, 10], [0, 700], julian(QUAKE_TIME))).toBe(true)
    })
})

describe('matchesFilters', () => {
    it('accepts a quake inside the magnitude and depth ranges', () => {
        expect(matchesFilters(makeQuake(), [0, 10], [0, 700])).toBe(true)
    })

    it('rejects a quake below the minimum magnitude', () => {
        expect(matchesFilters(makeQuake({magnitude: 5.9}), [6, 10], [0, 700])).toBe(false)
    })

    it('rejects a quake above the maximum magnitude', () => {
        expect(matchesFilters(makeQuake({magnitude: 6.1}), [0, 6], [0, 700])).toBe(false)
    })

    it('includes quakes exactly on both magnitude bounds', () => {
        expect(matchesFilters(makeQuake({magnitude: 3}), [3, 6], [0, 700])).toBe(true)
        expect(matchesFilters(makeQuake({magnitude: 6}), [3, 6], [0, 700])).toBe(true)
    })

    it('rejects a quake shallower than the minimum depth', () => {
        expect(matchesFilters(makeQuake({coordinates: [0, 0, 5]}), [0, 10], [10, 700])).toBe(false)
    })

    it('rejects a quake deeper than the maximum depth', () => {
        expect(matchesFilters(makeQuake({coordinates: [0, 0, 51]}), [0, 10], [0, 50])).toBe(false)
    })

    it('includes quakes exactly on both depth bounds', () => {
        expect(matchesFilters(makeQuake({coordinates: [0, 0, 10]}), [0, 10], [10, 200])).toBe(true)
        expect(matchesFilters(makeQuake({coordinates: [0, 0, 200]}), [0, 10], [10, 200])).toBe(true)
    })
})

describe('hasOccurred', () => {
    it('is false before the quake time', () => {
        expect(hasOccurred(makeQuake(), julian(QUAKE_TIME - 1))).toBe(false)
    })

    it('is true exactly at the quake time', () => {
        expect(hasOccurred(makeQuake(), julian(QUAKE_TIME))).toBe(true)
    })

    it('is true after the quake time', () => {
        expect(hasOccurred(makeQuake(), AFTER)).toBe(true)
    })
})

describe('getTimeRange', () => {
    it('returns undefined for an empty list', () => {
        expect(getTimeRange([])).toBeUndefined()
    })

    it('returns the earliest and latest quake times regardless of order', () => {
        const range = getTimeRange([
            makeQuake({id: 'b', time: QUAKE_TIME + 1000}),
            makeQuake({id: 'a', time: QUAKE_TIME - 5000}),
            makeQuake({id: 'c', time: QUAKE_TIME}),
        ])

        expect(range).toBeDefined()
        expect(JulianDate.equals(range!.start, julian(QUAKE_TIME - 5000))).toBe(true)
        expect(JulianDate.equals(range!.stop, julian(QUAKE_TIME + 1000))).toBe(true)
    })

    it('returns a zero-length range for a single quake', () => {
        const range = getTimeRange([makeQuake()])

        expect(range).toBeDefined()
        expect(JulianDate.equals(range!.start, range!.stop)).toBe(true)
    })
})

describe('quakeAvailability', () => {
    it('starts at the quake time inclusive and never ends', () => {
        const availability = quakeAvailability(makeQuake())

        expect(availability.length).toBe(1)
        const interval = availability.get(0)
        expect(JulianDate.equals(interval.start, julian(QUAKE_TIME))).toBe(true)
        expect(interval.isStartIncluded).toBe(true)
        expect(JulianDate.equals(interval.stop, Iso8601.MAXIMUM_VALUE)).toBe(true)
    })

    it('agrees with hasOccurred before, at and after the quake time', () => {
        const q = makeQuake()
        const availability = quakeAvailability(q)

        for (const t of [julian(QUAKE_TIME - 1000), julian(QUAKE_TIME), AFTER]) {
            expect(availability.contains(t)).toBe(hasOccurred(q, t))
        }
    })
})

describe('configureClock', () => {
    it('sets the range, clamps at the stop time and starts at the start time', () => {
        const clock = new Clock()
        const start = julian(QUAKE_TIME)
        const stop = julian(QUAKE_TIME + 86_400_000)

        configureClock(clock, {start, stop})

        expect(JulianDate.equals(clock.startTime, start)).toBe(true)
        expect(JulianDate.equals(clock.stopTime, stop)).toBe(true)
        expect(JulianDate.equals(clock.currentTime, start)).toBe(true)
        expect(clock.currentTime).not.toBe(start)
        expect(clock.clockRange).toBe(ClockRange.CLAMPED)
        expect(clock.multiplier).toBe(CLOCK_MULTIPLIER)
        expect(clock.shouldAnimate).toBe(START_ANIMATING)
    })

    it('uses a 10000x multiplier', () => {
        expect(CLOCK_MULTIPLIER).toBe(10000)
    })
})

describe('parseUsgsFeed', () => {
    it('maps each USGS GeoJSON feature to an Earthquake', () => {
        const feed = {
            type: 'FeatureCollection',
            features: [
                {
                    type: 'Feature',
                    id: 'ak025abc',
                    properties: {mag: 3.2, place: '50 km S of Anchorage, Alaska', time: 1744286400000, type: 'earthquake'},
                    geometry: {type: 'Point', coordinates: [-149.9, 60.7, 35.4]},
                },
                {
                    type: 'Feature',
                    id: 'us7000xyz',
                    properties: {mag: 5.8, place: 'Fiji region', time: 1744290000000, type: 'earthquake'},
                    geometry: {type: 'Point', coordinates: [178.1, -17.9, 560.2]},
                },
            ],
        }

        expect(parseUsgsFeed(feed)).toEqual([
            {
                id: 'ak025abc',
                magnitude: 3.2,
                coordinates: [-149.9, 60.7, 35.4],
                place: '50 km S of Anchorage, Alaska',
                time: 1744286400000,
            },
            {
                id: 'us7000xyz',
                magnitude: 5.8,
                coordinates: [178.1, -17.9, 560.2],
                place: 'Fiji region',
                time: 1744290000000,
            },
        ])
    })

    it('returns an empty list for a feed with no features', () => {
        const feed = {type: 'FeatureCollection', features: []}

        expect(parseUsgsFeed(feed)).toEqual([])
    })
})
