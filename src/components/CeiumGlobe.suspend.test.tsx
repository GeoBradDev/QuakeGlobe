import {afterAll, afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {render, waitFor} from '@testing-library/react'
import {forwardRef, useImperativeHandle, type ReactNode} from 'react'
import {Clock} from 'cesium'

type FakeViewer = {
    clock: Clock
    timeline: { zoomTo: () => void }
    isDestroyed: () => boolean
    allowDataSourcesToSuspendAnimation: boolean
}

const holder = vi.hoisted(() => ({viewer: undefined as unknown as FakeViewer}))

// Resium passes allowDataSourcesToSuspendAnimation only to the Cesium Viewer constructor,
// which ignores it, so the fake viewer starts with Cesium's default of true regardless of
// the prop. Only an assignment on the viewer instance turns it off.
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

describe('CesiumGlobe animation suspension', () => {
    beforeEach(() => {
        holder.viewer = {
            clock: new Clock(),
            timeline: {zoomTo: () => {}},
            isDestroyed: () => false,
            allowDataSourcesToSuspendAnimation: true,
        }
        vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    afterAll(() => {
        warnSpy.mockRestore()
    })

    it('turns off data source animation suspension on the viewer instance', async () => {
        render(<CesiumGlobe/>)

        await waitFor(() => expect(holder.viewer.allowDataSourcesToSuspendAnimation).toBe(false))
    })
})
