import {describe, expect, it} from 'vitest'
import {JulianDate} from 'cesium'
import {isQuakeVisible, parseUsgsFeed, type Earthquake} from './earthquakes'

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
