import {afterAll, afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {forwardRef, useImperativeHandle, type ReactNode} from 'react'
import {entityByName, makeFakeViewer, shownEntities, shownEntityNames, type FakeViewer} from '../test/fakeViewer'

type ViewerProps = { children?: ReactNode, allowDataSourcesToSuspendAnimation?: boolean }

const seen = vi.hoisted(() => ({
    viewerProps: [] as ViewerProps[],
    viewer: undefined as unknown as FakeViewer,
}))

vi.mock('resium', () => ({
    Viewer: forwardRef<{ cesiumElement: unknown }, ViewerProps>(
      function FakeViewerComponent(props, ref) {
          seen.viewerProps.push(props)
          useImperativeHandle(ref, () => ({cesiumElement: seen.viewer}), [])
          return <div data-testid="cesium-viewer">{props.children}</div>
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

function last<T>(list: T[] | undefined): T {
    return list![list!.length - 1]
}

const FEED = {
    type: 'FeatureCollection',
    features: [
        {
            type: 'Feature',
            id: 'small',
            properties: {mag: 3.2, place: 'Alaska', time: Date.UTC(2025, 3, 1)},
            geometry: {type: 'Point', coordinates: [-149.9, 60.7, 35]},
        },
        {
            type: 'Feature',
            id: 'big',
            properties: {mag: 6.4, place: 'Chile', time: Date.UTC(2025, 3, 20)},
            geometry: {type: 'Point', coordinates: [-72, -33, 20]},
        },
    ],
}

describe('CesiumGlobe entity and viewer props', () => {
    beforeEach(() => {
        seen.viewerProps.length = 0
        seen.viewer = makeFakeViewer()
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(FEED)))))
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    afterAll(() => {
        warnSpy.mockRestore()
    })

    it('keeps the clock running while data sources rebuild', () => {
        render(<CesiumGlobe/>)

        expect(last(seen.viewerProps).allowDataSourcesToSuspendAnimation).toBe(false)
    })

    it('keeps the same Entity, position, cylinder and availability instances for an entity that survives a filter change', async () => {
        render(<CesiumGlobe/>)
        await waitFor(() => expect(shownEntities(seen.viewer)).toHaveLength(2))
        const entity = entityByName(seen.viewer, 'M6.4 - Chile')
        const before = {position: entity.position, cylinder: entity.cylinder, availability: entity.availability}
        const changed = vi.fn()
        seen.viewer.entities.collectionChanged.addEventListener(changed)

        fireEvent.change(screen.getByLabelText('Min Magnitude'), {target: {value: '5'}})

        expect(shownEntities(seen.viewer)).toHaveLength(1)
        expect(shownEntityNames(seen.viewer)).toEqual(['M6.4 - Chile'])
        // The filter change did reach the entity set (it is not a no-op).
        expect(changed).toHaveBeenCalled()
        const after = entityByName(seen.viewer, 'M6.4 - Chile')
        expect(after).toBe(entity)
        expect(after.position).toBe(before.position)
        expect(after.cylinder).toBe(before.cylinder)
        expect(after.availability).toBe(before.availability)
    })
})
