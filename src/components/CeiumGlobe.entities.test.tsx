import {afterAll, afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {
    forwardRef,
    Profiler,
    StrictMode,
    useEffect,
    useImperativeHandle,
    useState,
    type ReactNode,
} from 'react'
import {ClockStep, EntityCollection, JulianDate} from 'cesium'
import {entityByName, makeFakeViewer, shownEntities, shownEntityNames, type FakeViewer} from '../test/fakeViewer'

const mount = vi.hoisted(() => ({
    viewer: undefined as unknown as FakeViewer,
    replace: (() => {}) as (next: FakeViewer) => void,
}))

// Mirrors Resium: the handle exposes the current Cesium viewer and updates when the
// viewer is recreated.
vi.mock('resium', () => ({
    Viewer: forwardRef<{ cesiumElement: FakeViewer }, { children?: ReactNode }>(
      function FakeViewerComponent({children}, ref) {
          const [viewer, setViewer] = useState(mount.viewer)
          useEffect(() => {
              mount.replace = (next) => {
                  mount.viewer = next
                  setViewer(next)
              }
          }, [])
          useImperativeHandle(ref, () => ({cesiumElement: viewer}), [viewer])
          return <div data-testid="cesium-viewer">{children}</div>
      },
    ),
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

const T_SMALL = Date.UTC(2025, 3, 1)
const T_DEEP = Date.UTC(2025, 3, 10)
const T_BIG = Date.UTC(2025, 3, 20)

function feature(id: string, mag: number, depth: number, time: number, place: string) {
    return {
        type: 'Feature',
        id,
        properties: {mag, place, time},
        geometry: {type: 'Point', coordinates: [0, 0, depth]},
    }
}

const FEED = {
    type: 'FeatureCollection',
    features: [
        feature('deep', 5.8, 560, T_DEEP, 'Fiji region'),
        feature('big', 6.4, 20, T_BIG, 'Off the coast of Chile'),
        feature('small', 3.2, 35, T_SMALL, 'Alaska'),
    ],
}

function stubFeed(feed: unknown = FEED) {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(feed)))))
}

async function waitForEntities(viewer: FakeViewer, count: number) {
    await waitFor(() => expect(viewer.entities.values).toHaveLength(count))
}

describe('CesiumGlobe quake entities', () => {
    beforeEach(() => {
        mount.viewer = makeFakeViewer()
        stubFeed()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    afterAll(() => {
        warnSpy.mockRestore()
    })

    it('adds one entity per quake once per feed, in a single batch', async () => {
        const viewer = mount.viewer
        const changed = vi.fn()
        viewer.entities.collectionChanged.addEventListener(changed)

        render(<CesiumGlobe/>)
        await waitForEntities(viewer, 3)

        expect(changed).toHaveBeenCalledTimes(1)
        expect(changed.mock.calls[0][1]).toHaveLength(3)
        expect(changed.mock.calls[0][2]).toHaveLength(0)
    })

    it('leaves exactly one set of entities under StrictMode', async () => {
        const viewer = mount.viewer

        render(<StrictMode><CesiumGlobe/></StrictMode>)
        await waitForEntities(viewer, 3)
        await act(async () => {})

        expect(viewer.entities.values).toHaveLength(3)
        expect([...shownEntityNames(viewer)].sort()).toEqual([
            'M3.2 - Alaska',
            'M5.8 - Fiji region',
            'M6.4 - Off the coast of Chile',
        ])
    })

    it('neither adds nor removes entities when a filter changes', async () => {
        const viewer = mount.viewer
        render(<CesiumGlobe/>)
        await waitForEntities(viewer, 3)
        const before = [...viewer.entities.values]
        const changed = vi.fn()
        viewer.entities.collectionChanged.addEventListener(changed)

        fireEvent.change(screen.getByLabelText('Min Magnitude'), {target: {value: '6'}})
        fireEvent.change(screen.getByLabelText('Max Depth (km)'), {target: {value: '50'}})
        fireEvent.click(screen.getByRole('button', {name: 'Reset Filters'}))

        expect(viewer.entities.values).toEqual(before)
        for (const [, added, removed] of changed.mock.calls) {
            expect(added).toEqual([])
            expect(removed).toEqual([])
        }
    })

    it('honors a filter set before the feed arrives', async () => {
        let resolveFeed: (r: Response) => void = () => {}
        vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => {
            resolveFeed = resolve
        })))
        const viewer = mount.viewer
        render(<CesiumGlobe/>)

        fireEvent.change(screen.getByLabelText('Min Magnitude'), {target: {value: '6'}})
        await act(async () => resolveFeed(new Response(JSON.stringify(FEED))))
        await waitForEntities(viewer, 3)

        expect(shownEntityNames(viewer)).toEqual(['M6.4 - Off the coast of Chile'])
    })

    it('removes its entities from the viewer on unmount', async () => {
        const viewer = mount.viewer
        const other = viewer.entities.add({name: 'not a quake'})
        const {unmount} = render(<CesiumGlobe/>)
        await waitForEntities(viewer, 4)

        unmount()

        expect(viewer.entities.values).toEqual([other])
    })

    it('leaves a destroyed viewer untouched on unmount', async () => {
        let destroyed = false
        const entities = new EntityCollection()
        const viewer = makeFakeViewer({isDestroyed: () => destroyed})
        Object.defineProperty(viewer, 'entities', {
            get() {
                if (destroyed) throw new Error('viewer is destroyed')
                return entities
            },
        })
        mount.viewer = viewer
        const {unmount} = render(<CesiumGlobe/>)
        await waitFor(() => expect(entities.values).toHaveLength(3))
        destroyed = true

        expect(() => unmount()).not.toThrow()
        expect(entities.values).toHaveLength(3)
    })

    it('moves the entities to a recreated viewer', async () => {
        const first = mount.viewer
        render(<CesiumGlobe/>)
        await waitForEntities(first, 3)
        const second = makeFakeViewer()

        act(() => mount.replace(second))

        await waitForEntities(second, 3)
        expect(first.entities.values).toHaveLength(0)
    })

    it('applies the current filters on a recreated viewer', async () => {
        const first = mount.viewer
        render(<CesiumGlobe/>)
        await waitForEntities(first, 3)
        fireEvent.change(screen.getByLabelText('Min Magnitude'), {target: {value: '6'}})
        const second = makeFakeViewer()

        act(() => mount.replace(second))

        await waitForEntities(second, 3)
        expect(shownEntityNames(second)).toEqual(['M6.4 - Off the coast of Chile'])
    })

    it('deselects a selected quake that a filter hides', async () => {
        const viewer = mount.viewer
        render(<CesiumGlobe/>)
        await waitForEntities(viewer, 3)
        viewer.selectedEntity = entityByName(viewer, 'M3.2 - Alaska')

        fireEvent.change(screen.getByLabelText('Min Magnitude'), {target: {value: '5'}})

        expect(viewer.selectedEntity).toBeUndefined()
    })

    it('keeps a selected quake selected while a filter keeps it visible', async () => {
        const viewer = mount.viewer
        render(<CesiumGlobe/>)
        await waitForEntities(viewer, 3)
        const chile = entityByName(viewer, 'M6.4 - Off the coast of Chile')
        viewer.selectedEntity = chile

        fireEvent.change(screen.getByLabelText('Min Magnitude'), {target: {value: '5'}})

        expect(shownEntities(viewer)).toHaveLength(2)
        expect(viewer.selectedEntity).toBe(chile)
    })

    it('leaves a selected entity that is not a quake alone', async () => {
        const viewer = mount.viewer
        const other = viewer.entities.add({name: 'not a quake', show: false})
        render(<CesiumGlobe/>)
        await waitForEntities(viewer, 4)
        viewer.selectedEntity = other

        fireEvent.change(screen.getByLabelText('Min Magnitude'), {target: {value: '5'}})

        expect(viewer.selectedEntity).toBe(other)
    })

    it('does not render React while the clock animates', async () => {
        const viewer = mount.viewer
        const onRender = vi.fn()
        render(<Profiler id="globe" onRender={onRender}><CesiumGlobe/></Profiler>)
        await waitForEntities(viewer, 3)
        await waitFor(() => expect(viewer.clock.shouldAnimate).toBe(true))
        await act(async () => {})
        // Advance a fixed multiplier of seconds per tick instead of real elapsed time.
        viewer.clock.clockStep = ClockStep.TICK_DEPENDENT
        const start = JulianDate.clone(viewer.clock.currentTime)
        onRender.mockClear()

        act(() => {
            for (let i = 0; i < 100; i++) viewer.clock.tick()
        })

        expect(JulianDate.greaterThan(viewer.clock.currentTime, start)).toBe(true)
        expect(onRender).not.toHaveBeenCalled()
    })
})
