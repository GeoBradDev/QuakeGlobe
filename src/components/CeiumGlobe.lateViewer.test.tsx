import {afterAll, afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act, render, screen, waitFor} from '@testing-library/react'
import {forwardRef, useEffect, useImperativeHandle, useState, type ReactNode} from 'react'
import {Clock, JulianDate} from 'cesium'

type FakeViewer = {
    clock: Clock
    timeline: { zoomTo: ReturnType<typeof vi.fn> }
    isDestroyed: () => boolean
}

const mount = vi.hoisted(() => ({
    viewer: undefined as unknown as FakeViewer,
    finish: () => {},
}))

// Mirrors Resium: the Cesium viewer is created asynchronously after mount and only then
// exposed through the imperative handle, which updates when `mounted` changes.
vi.mock('resium', () => ({
    Viewer: forwardRef<{ cesiumElement: FakeViewer | null }, { children?: ReactNode }>(
      function FakeViewerComponent({children}, ref) {
          const [mounted, setMounted] = useState(false)
          useEffect(() => {
              mount.finish = () => setMounted(true)
          }, [])
          useImperativeHandle(ref, () => ({cesiumElement: mounted ? mount.viewer : null}), [mounted])
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
const T_LAST = Date.UTC(2025, 3, 20)

const FEED = {
    type: 'FeatureCollection',
    features: [
        {
            type: 'Feature',
            id: 'last',
            properties: {mag: 6.4, place: 'Chile', time: T_LAST},
            geometry: {type: 'Point', coordinates: [-72, -33, 20]},
        },
        {
            type: 'Feature',
            id: 'first',
            properties: {mag: 3.2, place: 'Alaska', time: T_FIRST},
            geometry: {type: 'Point', coordinates: [-149.9, 60.7, 35]},
        },
    ],
}

describe('CesiumGlobe with a viewer that mounts after the feed arrives', () => {
    beforeEach(() => {
        mount.viewer = {
            clock: new Clock(),
            timeline: {zoomTo: vi.fn()},
            isDestroyed: () => false,
        }
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(FEED)))))
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    afterAll(() => {
        warnSpy.mockRestore()
    })

    it('configures the clock once the viewer handle becomes available', async () => {
        render(<CesiumGlobe/>)
        await waitFor(() => expect(screen.getAllByTestId('quake-entity')).toHaveLength(2))
        const {clock, timeline} = mount.viewer
        const start = JulianDate.fromDate(new Date(T_FIRST))
        const stop = JulianDate.fromDate(new Date(T_LAST))
        expect(JulianDate.equals(clock.startTime, start)).toBe(false)

        act(() => mount.finish())

        await waitFor(() => expect(JulianDate.equals(clock.startTime, start)).toBe(true))
        expect(JulianDate.equals(clock.currentTime, start)).toBe(true)
        expect(JulianDate.equals(clock.stopTime, stop)).toBe(true)
        expect(timeline.zoomTo).toHaveBeenCalledTimes(1)
    })
})
