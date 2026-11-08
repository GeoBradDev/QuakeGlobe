import {afterAll, afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {render, screen, waitFor} from '@testing-library/react'
import {forwardRef, useImperativeHandle, type ReactNode} from 'react'
import {Clock, JulianDate} from 'cesium'

type FakeViewer = {
    clock: Clock
    timeline: { zoomTo: () => void }
    isDestroyed: () => boolean
    allowDataSourcesToSuspendAnimation: boolean
}

const holder = vi.hoisted(() => ({viewer: undefined as unknown as FakeViewer}))

vi.mock('resium', () => ({
    Viewer: forwardRef<{ cesiumElement: FakeViewer }, { children?: ReactNode }>(
      function FakeViewerComponent({children}, ref) {
          useImperativeHandle(ref, () => ({cesiumElement: holder.viewer}), [])
          return <div data-testid="cesium-viewer">{children}</div>
      },
    ),
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

import CesiumGlobe from './CeiumGlobe'

const T_FIRST = Date.UTC(2025, 3, 1)

const FEED = {
    type: 'FeatureCollection',
    features: [
        {
            type: 'Feature',
            id: 'first',
            properties: {mag: 3.2, place: 'Alaska', time: T_FIRST},
            geometry: {type: 'Point', coordinates: [-149.9, 60.7, 35]},
        },
        {
            type: 'Feature',
            id: 'last',
            properties: {mag: 6.4, place: 'Chile', time: Date.UTC(2025, 3, 20)},
            geometry: {type: 'Point', coordinates: [-72, -33, 20]},
        },
    ],
}

describe('CesiumGlobe end of playback listeners', () => {
    beforeEach(() => {
        holder.viewer = {
            clock: new Clock(),
            timeline: {zoomTo: () => {}},
            isDestroyed: () => false,
            allowDataSourcesToSuspendAnimation: true,
        }
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(FEED)))))
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    afterAll(() => {
        warnSpy.mockRestore()
    })

    it('attaches the end of playback listeners with the clock and removes them on unmount', async () => {
        const {clock} = holder.viewer
        const {unmount} = render(<CesiumGlobe/>)
        await waitFor(() => expect(screen.getAllByTestId('quake-entity')).toHaveLength(2))
        await waitFor(() =>
          expect(JulianDate.equals(clock.startTime, JulianDate.fromDate(new Date(T_FIRST)))).toBe(true))

        expect(clock.onTick.numberOfListeners).toBe(1)
        expect(clock.onStop.numberOfListeners).toBe(1)

        unmount()

        expect(clock.onTick.numberOfListeners).toBe(0)
        expect(clock.onStop.numberOfListeners).toBe(0)
    })
})
