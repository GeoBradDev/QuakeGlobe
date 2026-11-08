import {describe, expect, it} from 'vitest'
import {Clock, ClockRange, Iso8601, JulianDate} from 'cesium'
import {
    CLOCK_MULTIPLIER,
    DEFAULT_DEPTH_RANGE,
    DEFAULT_MAG_RANGE,
    START_ANIMATING,
    configureClock,
    escapeHtml,
    formatEventType,
    formatMagnitude,
    getTimeRange,
    hasOccurred,
    isQuakeVisible,
    matchesFilters,
    parseUsgsFeed,
    quakeAvailability,
    quakeDescription,
    quakeName,
    usgsEventUrl,
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
        type: 'earthquake',
        url: null,
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
        const interval = availability.get(0)!
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
                type: 'earthquake',
                url: null,
            },
            {
                id: 'us7000xyz',
                magnitude: 5.8,
                coordinates: [178.1, -17.9, 560.2],
                place: 'Fiji region',
                time: 1744290000000,
                type: 'earthquake',
                url: null,
            },
        ])
    })

    it('returns an empty list for a feed with no features', () => {
        const feed = {type: 'FeatureCollection', features: []}

        expect(parseUsgsFeed(feed)).toEqual([])
    })
})

type RawProps = Record<string, unknown>

function rawFeature(props: RawProps = {}, geometry: unknown = {type: 'Point', coordinates: [10, 20, 5]}, id: unknown = 'ev1') {
    return {
        type: 'Feature',
        id,
        properties: {mag: 2.5, place: 'Somewhere', time: QUAKE_TIME, type: 'earthquake', ...props},
        geometry,
    }
}

function parseOne(feature: unknown): Earthquake[] {
    return parseUsgsFeed({features: [feature]})
}

describe('parseUsgsFeed edge cases', () => {
    it('keeps a negative magnitude as is', () => {
        expect(parseOne(rawFeature({mag: -1.54}))[0].magnitude).toBe(-1.54)
    })

    it('keeps a negative depth as is', () => {
        expect(parseOne(rawFeature({}, {type: 'Point', coordinates: [10, 20, -3.41]}))[0].coordinates)
          .toEqual([10, 20, -3.41])
    })

    it('maps a null magnitude to null', () => {
        expect(parseOne(rawFeature({mag: null}))[0].magnitude).toBeNull()
    })

    it('maps a missing magnitude to null', () => {
        const f = rawFeature()
        delete (f.properties as RawProps).mag
        expect(parseOne(f)[0].magnitude).toBeNull()
    })

    it('maps a non-finite magnitude to null', () => {
        expect(parseOne(rawFeature({mag: 'big'}))[0].magnitude).toBeNull()
    })

    it('keeps a non-earthquake event type', () => {
        expect(parseOne(rawFeature({type: 'quarry blast'}))[0].type).toBe('quarry blast')
    })

    it('defaults a missing event type to earthquake', () => {
        const f = rawFeature()
        delete (f.properties as RawProps).type
        expect(parseOne(f)[0].type).toBe('earthquake')
    })

    it('defaults a missing place to an empty string', () => {
        const f = rawFeature()
        delete (f.properties as RawProps).place
        expect(parseOne(f)[0].place).toBe('')
    })

    it('keeps a USGS event page URL', () => {
        const url = 'https://earthquake.usgs.gov/earthquakes/eventpage/ev1'
        expect(parseOne(rawFeature({url}))[0].url).toBe(url)
    })

    it('drops a non-USGS or http URL', () => {
        expect(parseOne(rawFeature({url: 'https://example.com/ev1'}))[0].url).toBeNull()
        expect(parseOne(rawFeature({url: 'http://earthquake.usgs.gov/earthquakes/eventpage/ev1'}))[0].url).toBeNull()
    })

    it('drops a feature with no geometry', () => {
        expect(parseOne(rawFeature({}, null))).toEqual([])
    })

    it('drops a feature with a non-finite coordinate', () => {
        expect(parseOne(rawFeature({}, {type: 'Point', coordinates: [10, null, 5]}))).toEqual([])
        expect(parseOne(rawFeature({}, {type: 'Point', coordinates: [10, 20, Number.NaN]}))).toEqual([])
        expect(parseOne(rawFeature({}, {type: 'Point', coordinates: [10, 20]}))).toEqual([])
    })

    it('drops a feature with a non-finite time', () => {
        expect(parseOne(rawFeature({time: null}))).toEqual([])
        expect(parseOne(rawFeature({time: 'yesterday'}))).toEqual([])
    })

    it('drops a feature with no id', () => {
        expect(parseOne(rawFeature({}, undefined, null))).toEqual([])
    })

    it('keeps the valid features around an invalid one', () => {
        const parsed = parseUsgsFeed({
            features: [rawFeature({}, undefined, 'a'), rawFeature({}, null, 'b'), rawFeature({}, undefined, 'c')],
        })
        expect(parsed.map((q) => q.id)).toEqual(['a', 'c'])
    })
})

describe('default filter ranges', () => {
    it('are magnitude -5 to 10 and depth -10 to 800 km', () => {
        expect(DEFAULT_MAG_RANGE).toEqual([-5, 10])
        expect(DEFAULT_DEPTH_RANGE).toEqual([-10, 800])
    })

    it('match a negative magnitude and a negative depth', () => {
        expect(matchesFilters(makeQuake({magnitude: -1.54}), DEFAULT_MAG_RANGE, DEFAULT_DEPTH_RANGE)).toBe(true)
        expect(matchesFilters(makeQuake({coordinates: [0, 0, -3.41]}), DEFAULT_MAG_RANGE, DEFAULT_DEPTH_RANGE)).toBe(true)
    })

    it('match a deep event beyond 700 km', () => {
        expect(matchesFilters(makeQuake({coordinates: [0, 0, 750]}), DEFAULT_MAG_RANGE, DEFAULT_DEPTH_RANGE)).toBe(true)
    })
})

describe('matchesFilters with a null magnitude', () => {
    const unknown = makeQuake({magnitude: null})

    it('matches the default magnitude range', () => {
        expect(matchesFilters(unknown, DEFAULT_MAG_RANGE, DEFAULT_DEPTH_RANGE)).toBe(true)
    })

    it('matches a range wider than the default', () => {
        expect(matchesFilters(unknown, [-9, 12], DEFAULT_DEPTH_RANGE)).toBe(true)
    })

    it('does not match a narrowed magnitude range', () => {
        expect(matchesFilters(unknown, [0, 10], DEFAULT_DEPTH_RANGE)).toBe(false)
        expect(matchesFilters(unknown, [-5, 9], DEFAULT_DEPTH_RANGE)).toBe(false)
    })

    it('still applies the depth range', () => {
        expect(matchesFilters(makeQuake({magnitude: null, coordinates: [0, 0, 300]}), DEFAULT_MAG_RANGE, [-10, 200])).toBe(false)
    })
})

describe('formatting helpers', () => {
    it('formats a magnitude to one decimal, or ? when unknown', () => {
        expect(formatMagnitude(4.567)).toBe('4.6')
        expect(formatMagnitude(-1.54)).toBe('-1.5')
        expect(formatMagnitude(6)).toBe('6.0')
        expect(formatMagnitude(null)).toBe('?')
    })

    it('upper-cases the first letter of an event type', () => {
        expect(formatEventType('quarry blast')).toBe('Quarry blast')
        expect(formatEventType('earthquake')).toBe('Earthquake')
        expect(formatEventType('')).toBe('')
    })

    it('escapes HTML special characters', () => {
        expect(escapeHtml(`<a href="x" onclick='y'>&</a>`))
          .toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;')
    })
})

describe('quakeName', () => {
    it('keeps the M<mag> - <place> format for an earthquake', () => {
        expect(quakeName(makeQuake({magnitude: 6.4, place: 'Off the coast of Chile'}))).toBe('M6.4 - Off the coast of Chile')
    })

    it('includes the type for a non-earthquake event', () => {
        expect(quakeName(makeQuake({magnitude: 1.8, type: 'quarry blast', place: '5 km SE of X'})))
          .toBe('M1.8 Quarry blast - 5 km SE of X')
    })

    it('shows M? for an unknown magnitude', () => {
        expect(quakeName(makeQuake({magnitude: null, place: 'Alaska'}))).toBe('M? - Alaska')
    })
})

describe('quakeDescription', () => {
    const url = 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000abcd'

    it('formats magnitude and depth to one decimal', () => {
        const html = quakeDescription(makeQuake({magnitude: 4.567, coordinates: [0, 0, 10.04]}))
        expect(html).toContain('<b>Magnitude:</b> 4.6<br/>')
        expect(html).toContain('<b>Depth:</b> 10.0 km<br/>')
    })

    it('shows an unknown magnitude as unknown', () => {
        const html = quakeDescription(makeQuake({magnitude: null}))
        expect(html).toContain('<b>Magnitude:</b> unknown<br/>')
        expect(html).not.toMatch(/null|NaN|undefined/)
    })

    it('shows the type, place and time', () => {
        const html = quakeDescription(makeQuake({type: 'quarry blast', place: '5 km SE of X'}))
        expect(html).toContain('<b>Type:</b> Quarry blast<br/>')
        expect(html).toContain('<b>Place:</b> 5 km SE of X<br/>')
        expect(html).toContain(`<b>Time:</b> ${new Date(QUAKE_TIME).toLocaleString()}`)
    })

    it('shows a Type line for an earthquake too', () => {
        expect(quakeDescription(makeQuake())).toContain('<b>Type:</b> Earthquake<br/>')
    })

    it('links to the USGS event page when the URL is valid', () => {
        expect(quakeDescription(makeQuake({url})))
          .toContain(`<a href="${url}" target="_blank" rel="noopener noreferrer">USGS event page</a>`)
    })

    it('renders no link when the URL is null', () => {
        expect(quakeDescription(makeQuake({url: null}))).not.toContain('<a ')
    })

    it('escapes markup and quotes in feed text', () => {
        const html = quakeDescription(makeQuake({place: `<script>alert("x")</script>`, type: `blast'"<b>`}))
        expect(html).not.toContain('<script>')
        expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;')
        expect(html).toContain('Blast&#39;&quot;&lt;b&gt;')
    })
})

describe('usgsEventUrl', () => {
    it('accepts an https URL on earthquake.usgs.gov', () => {
        const url = 'https://earthquake.usgs.gov/earthquakes/eventpage/ev1'
        expect(usgsEventUrl(url)).toBe(url)
    })

    it('rejects javascript:, http: and other hosts', () => {
        expect(usgsEventUrl('javascript:alert(1)')).toBeNull()
        expect(usgsEventUrl('http://earthquake.usgs.gov/earthquakes/eventpage/ev1')).toBeNull()
        expect(usgsEventUrl('https://earthquake.usgs.gov.evil.com/ev1')).toBeNull()
        expect(usgsEventUrl('https://evil.com/earthquake.usgs.gov')).toBeNull()
    })

    it('rejects non-strings and unparseable strings', () => {
        expect(usgsEventUrl(undefined)).toBeNull()
        expect(usgsEventUrl(null)).toBeNull()
        expect(usgsEventUrl(42)).toBeNull()
        expect(usgsEventUrl('not a url')).toBeNull()
    })
})
