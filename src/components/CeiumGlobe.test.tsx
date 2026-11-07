import {afterAll, afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {forwardRef, useImperativeHandle, type ReactNode} from 'react'
import {Clock, JulianDate, type TimeIntervalCollection} from 'cesium'

type FakeViewer = {
    clock: Clock
    timeline: { zoomTo: ReturnType<typeof vi.fn> }
    isDestroyed: () => boolean
}

const viewerHolder = vi.hoisted(() => ({current: undefined as unknown as FakeViewer}))

vi.mock('resium', () => ({
    Viewer: forwardRef<{ cesiumElement: FakeViewer }, { children?: ReactNode }>(
      function FakeViewerComponent({children}, ref) {
          useImperativeHandle(ref, () => ({cesiumElement: viewerHolder.current}), [])
          return <div data-testid="cesium-viewer">{children}</div>
      },
    ),
    Entity: ({name, availability}: { name?: string, availability?: TimeIntervalCollection }) => {
        const start = availability?.get(0)?.start
        return (
          <div
            data-testid="quake-entity"
            data-availability-start={start ? JulianDate.toIso8601(start, 0) : ''}
          >
              {name}
          </div>
        )
    },
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
import {CLOCK_MULTIPLIER, START_ANIMATING} from '../lib/earthquakes'

const T_SMALL = Date.UTC(2025, 3, 1, 0, 0, 0)
const T_DEEP = Date.UTC(2025, 3, 10, 0, 0, 0)
const T_BIG = Date.UTC(2025, 3, 20, 0, 0, 0)

function feature(id: string, mag: number, depth: number, time: number, place: string) {
    return {
        type: 'Feature',
        id,
        properties: {mag, place, time},
        geometry: {type: 'Point', coordinates: [0, 0, depth]},
    }
}

// Listed out of chronological order on purpose.
const FEED = {
    type: 'FeatureCollection',
    features: [
        feature('deep', 5.8, 560, T_DEEP, 'Fiji region'),
        feature('big', 6.4, 20, T_BIG, 'Off the coast of Chile'),
        feature('small', 3.2, 35, T_SMALL, 'Alaska'),
    ],
}

function iso(ms: number): string {
    return JulianDate.toIso8601(JulianDate.fromDate(new Date(ms)), 0)
}

async function renderLoaded() {
    render(<CesiumGlobe/>)
    await waitFor(() => expect(screen.getAllByTestId('quake-entity')).toHaveLength(3))
}

function entityNames(): string[] {
    return screen.queryAllByTestId('quake-entity').map((e) => e.textContent ?? '')
}

describe('CesiumGlobe', () => {
    beforeEach(() => {
        viewerHolder.current = {
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

    it('configures the viewer clock and timeline from the feed time range', async () => {
        await renderLoaded()

        const {clock, timeline} = viewerHolder.current
        const start = JulianDate.fromDate(new Date(T_SMALL))
        const stop = JulianDate.fromDate(new Date(T_BIG))

        await waitFor(() => expect(JulianDate.equals(clock.startTime, start)).toBe(true))
        expect(JulianDate.equals(clock.currentTime, start)).toBe(true)
        expect(JulianDate.equals(clock.stopTime, stop)).toBe(true)
        expect(clock.multiplier).toBe(CLOCK_MULTIPLIER)
        expect(clock.shouldAnimate).toBe(START_ANIMATING)
        expect(timeline.zoomTo).toHaveBeenCalledTimes(1)
        const [zoomStart, zoomStop] = timeline.zoomTo.mock.calls[0]
        expect(JulianDate.equals(zoomStart, start)).toBe(true)
        expect(JulianDate.equals(zoomStop, stop)).toBe(true)
    })

    it('keeps only quakes at or above Min Magnitude', async () => {
        await renderLoaded()

        fireEvent.change(screen.getByLabelText('Min Magnitude'), {target: {value: '6'}})

        expect(entityNames()).toEqual(['M6.4 - Off the coast of Chile'])
    })

    it('removes quakes deeper than Max Depth', async () => {
        await renderLoaded()

        fireEvent.change(screen.getByLabelText('Max Depth (km)'), {target: {value: '50'}})

        expect(entityNames()).toHaveLength(2)
        expect(entityNames()).not.toContain('M5.8 - Fiji region')
    })

    it('gives each entity an availability that starts at its quake time', async () => {
        await renderLoaded()

        const starts = Object.fromEntries(
          screen.getAllByTestId('quake-entity').map((e) => [e.textContent, e.dataset.availabilityStart]),
        )
        expect(starts).toEqual({
            'M3.2 - Alaska': iso(T_SMALL),
            'M5.8 - Fiji region': iso(T_DEEP),
            'M6.4 - Off the coast of Chile': iso(T_BIG),
        })
    })

    it('leaves the clock time and play state alone when a filter changes', async () => {
        await renderLoaded()
        const {clock} = viewerHolder.current
        const start = JulianDate.fromDate(new Date(T_SMALL))
        await waitFor(() => expect(JulianDate.equals(clock.startTime, start)).toBe(true))

        const midway = JulianDate.fromDate(new Date(T_DEEP))
        clock.currentTime = JulianDate.clone(midway)
        clock.shouldAnimate = true

        fireEvent.change(screen.getByLabelText('Min Magnitude'), {target: {value: '5'}})

        expect(entityNames()).toHaveLength(2)
        expect(JulianDate.equals(clock.currentTime, midway)).toBe(true)
        expect(clock.shouldAnimate).toBe(true)
    })
})
