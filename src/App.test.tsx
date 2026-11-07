import {afterAll, afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {render, screen} from '@testing-library/react'
import type {ReactNode} from 'react'

vi.mock('resium', () => ({
    Viewer: ({children}: { children?: ReactNode }) => <div data-testid="cesium-viewer">{children}</div>,
    Entity: ({name}: { name?: string }) => <div data-testid="quake-entity">{name}</div>,
}))

vi.mock('cesium', async (importOriginal) => {
    const actual = await importOriginal<typeof import('cesium')>()
    return {
        ...actual,
        // Terrain is fetched from Cesium Ion over the network; never resolve it in tests.
        createWorldTerrainAsync: vi.fn(() => new Promise(() => {})),
    }
})

// CeiumGlobe warns at import time when no Cesium Ion token is configured; silence it.
const warnSpy = vi.hoisted(() => vi.spyOn(console, 'warn').mockImplementation(() => {}))

import App from './App'

const FEED = {
    type: 'FeatureCollection',
    features: [
        {
            type: 'Feature',
            id: 'ak025abc',
            properties: {mag: 3.2, place: '50 km S of Anchorage, Alaska', time: 1744286400000},
            geometry: {type: 'Point', coordinates: [-149.9, 60.7, 35.4]},
        },
        {
            type: 'Feature',
            id: 'us7000xyz',
            properties: {mag: 5.8, place: 'Fiji region', time: 1744290000000},
            geometry: {type: 'Point', coordinates: [178.1, -17.9, 560.2]},
        },
    ],
}

describe('App', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(FEED)))))
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    afterAll(() => {
        warnSpy.mockRestore()
    })

    it('renders the filter panel, legends, info panel and globe', async () => {
        render(<App/>)

        expect(screen.getByText(/Quake Filters/)).toBeInTheDocument()
        expect(screen.getByText(/Magnitude Legend/)).toBeInTheDocument()
        expect(screen.getByText('Depth (km)', {exact: false, selector: 'span'})).toBeInTheDocument()
        expect(screen.getByText('Welcome to QuakeGlobe')).toBeInTheDocument()
        expect(screen.getByTestId('cesium-viewer')).toBeInTheDocument()
    })

    it('requests the USGS all_month feed', () => {
        render(<App/>)

        expect(fetch).toHaveBeenCalledWith(
          'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson',
        )
    })
})
