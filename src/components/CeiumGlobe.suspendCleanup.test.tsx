import {afterAll, afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {render, waitFor} from '@testing-library/react'
import {forwardRef, useImperativeHandle, type ReactNode} from 'react'
import {makeFakeViewer, type FakeViewer} from '../test/fakeViewer'

const holder = vi.hoisted(() => ({viewer: undefined as unknown as FakeViewer, destroyed: false}))

vi.mock('resium', () => ({
    Viewer: forwardRef<{ cesiumElement: FakeViewer }, { children?: ReactNode }>(
      function FakeViewerComponent({children}, ref) {
          useImperativeHandle(ref, () => ({cesiumElement: holder.viewer}), [])
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

describe('CesiumGlobe animation suspension cleanup', () => {
    beforeEach(() => {
        holder.destroyed = false
        holder.viewer = makeFakeViewer({isDestroyed: () => holder.destroyed})
        vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    afterAll(() => {
        warnSpy.mockRestore()
    })

    it('restores data source animation suspension on unmount', async () => {
        const {unmount} = render(<CesiumGlobe/>)
        await waitFor(() => expect(holder.viewer.allowDataSourcesToSuspendAnimation).toBe(false))

        unmount()

        expect(holder.viewer.allowDataSourcesToSuspendAnimation).toBe(true)
    })

    it('leaves a destroyed viewer untouched on unmount', async () => {
        const {unmount} = render(<CesiumGlobe/>)
        await waitFor(() => expect(holder.viewer.allowDataSourcesToSuspendAnimation).toBe(false))
        holder.destroyed = true

        unmount()

        expect(holder.viewer.allowDataSourcesToSuspendAnimation).toBe(false)
    })
})
