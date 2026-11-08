import {afterAll, afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {forwardRef, useImperativeHandle, type ReactNode} from 'react'
import {Clock} from 'cesium'

type ViewerProps = { children?: ReactNode, allowDataSourcesToSuspendAnimation?: boolean }
type EntityProps = { name?: string, position?: unknown, cylinder?: unknown, availability?: unknown }

const seen = vi.hoisted(() => ({
    viewerProps: [] as ViewerProps[],
    entityProps: new Map<string, EntityProps[]>(),
}))

vi.mock('resium', () => ({
    Viewer: forwardRef<{ cesiumElement: unknown }, ViewerProps>(
      function FakeViewerComponent(props, ref) {
          seen.viewerProps.push(props)
          useImperativeHandle(ref, () => ({
              cesiumElement: {
                  clock: new Clock(),
                  timeline: {zoomTo: () => {}},
                  isDestroyed: () => false,
              },
          }), [])
          return <div data-testid="cesium-viewer">{props.children}</div>
      },
    ),
    Entity: (props: EntityProps) => {
        const name = props.name ?? ''
        const list = seen.entityProps.get(name) ?? []
        list.push(props)
        seen.entityProps.set(name, list)
        return <div data-testid="quake-entity">{name}</div>
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
        seen.entityProps.clear()
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

    it('passes the same prop objects to an entity that survives a filter change', async () => {
        render(<CesiumGlobe/>)
        await waitFor(() => expect(screen.getAllByTestId('quake-entity')).toHaveLength(2))
        const before = last(seen.entityProps.get('M6.4 - Chile'))

        fireEvent.change(screen.getByLabelText('Min Magnitude'), {target: {value: '5'}})

        expect(screen.getAllByTestId('quake-entity')).toHaveLength(1)
        const after = last(seen.entityProps.get('M6.4 - Chile'))
        expect(after).not.toBe(before)
        expect(after.position).toBe(before.position)
        expect(after.cylinder).toBe(before.cylinder)
        expect(after.availability).toBe(before.availability)
    })
})
