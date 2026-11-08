import {describe, expect, it} from 'vitest'
import {Color} from 'cesium'
import {coneSlices, quakeColor, quakeCylinder} from './quakeSymbol'
import type {Earthquake} from './earthquakes'

function makeQuake(overrides: Partial<Earthquake> = {}): Earthquake {
    return {
        id: 'us7000abcd',
        magnitude: 4.5,
        coordinates: [-122.4, 37.8, 10],
        place: '10 km N of Somewhere',
        time: Date.UTC(2025, 3, 10),
        type: 'earthquake',
        url: null,
        ...overrides,
    }
}

// Triangles Cesium's CylinderGeometry produces for a cone (top radius 0) with s slices:
// the 128-slice default gave about 508 per quake on main (5.07 M for 9,988 quakes).
function coneTriangles(slices: number): number {
    return 4 * slices - 4
}

describe('quakeColor', () => {
    it.each([
        [null, Color.GRAY],
        [-1.5, Color.LIME],
        [3.99, Color.LIME],
        [4, Color.YELLOW],
        [4.9, Color.YELLOW],
        [5, Color.ORANGE],
        [5.9, Color.ORANGE],
        [6, Color.RED],
        [7.7, Color.RED],
    ])('maps magnitude %s to its color', (magnitude, color) => {
        expect(quakeColor(magnitude)).toBe(color)
    })
})

describe('coneSlices', () => {
    it('follows 4 * ceil(4 * sqrt(km)) between 8 and 128', () => {
        expect(coneSlices(1000)).toBe(16)
        expect(coneSlices(4000)).toBe(32)
        expect(coneSlices(16000)).toBe(64)
        expect(coneSlices(64000)).toBe(128)
    })

    it('never goes below 8 slices', () => {
        expect(coneSlices(0)).toBe(8)
        expect(coneSlices(1)).toBe(8)
        expect(coneSlices(Math.exp(-5 - 3) * 1000)).toBe(8)
    })

    it('never goes above 128 slices', () => {
        expect(coneSlices(110000)).toBe(128)
        expect(coneSlices(1e9)).toBe(128)
    })

    it('does not decrease as the radius grows', () => {
        let previous = 0
        for (let r = 0; r <= 200000; r += 250) {
            const s = coneSlices(r)
            expect(s).toBeGreaterThanOrEqual(previous)
            previous = s
        }
    })

    it('keeps 128 slices for the largest cones (M7.2 and up)', () => {
        expect(coneSlices(Math.exp(7.2 - 3) * 1000)).toBe(128)
        expect(coneSlices(Math.exp(7.7 - 3) * 1000)).toBe(128)
    })

    it('keeps a month-like feed under one million triangles', () => {
        // Roughly the all_month distribution: mostly small quakes, few large ones.
        const bins: [number, number][] = [[1.5, 6000], [2.5, 3000], [4.5, 800], [5.5, 180], [6.5, 20]]
        let triangles = 0
        let quakes = 0
        for (const [mag, count] of bins) {
            triangles += count * coneTriangles(quakeCylinder(makeQuake({magnitude: mag})).slices)
            quakes += count
        }
        expect(quakes).toBe(10000)
        expect(triangles).toBeLessThan(1_000_000)
        // A return to the fixed 128-slice default would exceed it fivefold.
        expect(quakes * coneTriangles(128)).toBeGreaterThan(5_000_000)
    })
})

describe('quakeCylinder', () => {
    it('is a cone with its tip at the top', () => {
        expect(quakeCylinder(makeQuake()).topRadius).toBe(0)
    })

    it('is at least 50 km long and 2 km longer per km of depth beyond 25 km', () => {
        expect(quakeCylinder(makeQuake({coordinates: [0, 0, 10]})).length).toBe(50000)
        expect(quakeCylinder(makeQuake({coordinates: [0, 0, -3.4]})).length).toBe(50000)
        expect(quakeCylinder(makeQuake({coordinates: [0, 0, 560]})).length).toBe(1120000)
    })

    it('has a bottom radius of exp(magnitude - 3) km, with null as magnitude 0', () => {
        expect(quakeCylinder(makeQuake({magnitude: 3})).bottomRadius).toBe(1000)
        expect(quakeCylinder(makeQuake({magnitude: 6.4})).bottomRadius).toBe(Math.exp(6.4 - 3) * 1000)
        expect(quakeCylinder(makeQuake({magnitude: null})).bottomRadius).toBe(Math.exp(-3) * 1000)
    })

    it('uses the magnitude color, no outline and slices scaled to the radius', () => {
        const cylinder = quakeCylinder(makeQuake({magnitude: 5.8}))
        expect(cylinder.material).toBe(Color.ORANGE)
        expect(cylinder.outline).toBe(false)
        expect(cylinder.slices).toBe(coneSlices(cylinder.bottomRadius))
        expect(quakeCylinder(makeQuake({magnitude: null})).material).toBe(Color.GRAY)
    })
})
