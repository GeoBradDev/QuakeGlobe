import {describe, expect, it} from 'vitest'
import {formatMagnitude, formatOneDecimal, quakeDescription, quakeName, type Earthquake} from './earthquakes'

function makeQuake(overrides: Partial<Earthquake> = {}): Earthquake {
    return {
        id: 'ev1',
        magnitude: 1.2,
        coordinates: [0, 0, 5],
        place: 'Somewhere',
        time: Date.UTC(2025, 3, 10),
        type: 'earthquake',
        url: null,
        ...overrides,
    }
}

describe('formatOneDecimal', () => {
    it('maps a value that rounds to negative zero to 0.0', () => {
        expect(formatOneDecimal(-0.04)).toBe('0.0')
        expect(formatOneDecimal(-0)).toBe('0.0')
    })

    it('keeps values that round below zero negative', () => {
        expect(formatOneDecimal(-0.05)).toBe('-0.1')
        expect(formatOneDecimal(-0.5)).toBe('-0.5')
        expect(formatOneDecimal(-1.54)).toBe('-1.5')
    })

    it('formats other values to one decimal', () => {
        expect(formatOneDecimal(0)).toBe('0.0')
        expect(formatOneDecimal(4.567)).toBe('4.6')
    })
})

describe('negative zero in names and popups', () => {
    it('never shows M-0.0 in the name', () => {
        expect(formatMagnitude(-0.04)).toBe('0.0')
        expect(quakeName(makeQuake({magnitude: -0.04, place: 'Nevada'}))).toBe('M0.0 - Nevada')
    })

    it('never shows -0.0 for magnitude or depth in the popup', () => {
        const html = quakeDescription(makeQuake({magnitude: -0.04, coordinates: [0, 0, -0.03]}))
        expect(html).toContain('<b>Magnitude:</b> 0.0<br/>')
        expect(html).toContain('<b>Depth:</b> 0.0 km<br/>')
        expect(html).not.toContain('-0.0')
    })

    it('still shows a small negative depth as negative', () => {
        expect(quakeDescription(makeQuake({coordinates: [0, 0, -0.5]}))).toContain('<b>Depth:</b> -0.5 km<br/>')
    })
})
