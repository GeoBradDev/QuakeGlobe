import {afterAll, afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {render, waitFor} from '@testing-library/react'
import {forwardRef, useImperativeHandle, type ReactNode} from 'react'
import {InfoBox} from 'cesium'
import {makeFakeViewer, type FakeViewer} from '../test/fakeViewer'

type TestViewer = FakeViewer & { infoBox: InfoBox }

const holder = vi.hoisted(() => ({viewer: undefined as unknown as TestViewer}))

vi.mock('resium', () => ({
    Viewer: forwardRef<{ cesiumElement: TestViewer }, { children?: ReactNode }>(
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

describe('CesiumGlobe InfoBox sandbox', () => {
    beforeEach(() => {
        holder.viewer = {
            ...makeFakeViewer(),
            infoBox: new InfoBox(document.body.appendChild(document.createElement('div'))),
        }
        vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    afterAll(() => {
        warnSpy.mockRestore()
    })

    it('lets links opened from the InfoBox escape its sandbox', async () => {
        render(<CesiumGlobe/>)

        await waitFor(() =>
          expect(holder.viewer.infoBox.frame.getAttribute('sandbox')).toContain('allow-popups-to-escape-sandbox'),
        )
        expect(holder.viewer.infoBox.frame.getAttribute('sandbox')).not.toContain('allow-scripts')
    })
})
