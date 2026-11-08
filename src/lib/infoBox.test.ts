import {afterEach, describe, expect, it} from 'vitest'
import {InfoBox} from 'cesium'
import {allowInfoBoxPopupsToEscapeSandbox} from './infoBox'

const ESCAPE = 'allow-popups-to-escape-sandbox'

const containers: HTMLElement[] = []

// A real Cesium InfoBox, after its frame's first load has injected the description CSS
// and content element.
async function loadedInfoBox(): Promise<InfoBox> {
    const container = document.createElement('div')
    document.body.appendChild(container)
    containers.push(container)
    const infoBox = new InfoBox(container)
    await waitForLoad(infoBox.frame)
    return infoBox
}

function waitForLoad(frame: HTMLIFrameElement): Promise<void> {
    return new Promise((resolve) => {
        if (frame.contentDocument?.querySelector('.cesium-infoBox-description')) {
            resolve()
            return
        }
        frame.addEventListener('load', () => resolve(), {once: true})
    })
}

function tick(ms = 50): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function host(infoBox: InfoBox | undefined, destroyed = false) {
    return {isDestroyed: () => destroyed, infoBox}
}

function tokens(frame: HTMLIFrameElement): string[] {
    return (frame.getAttribute('sandbox') ?? '').split(/\s+/).filter(Boolean)
}

afterEach(() => {
    for (const c of containers.splice(0)) c.remove()
})

describe('allowInfoBoxPopupsToEscapeSandbox', () => {
    it('adds allow-popups-to-escape-sandbox and keeps the existing tokens, without allow-scripts', async () => {
        const infoBox = await loadedInfoBox()
        const before = tokens(infoBox.frame)

        allowInfoBoxPopupsToEscapeSandbox(host(infoBox))

        const after = tokens(infoBox.frame)
        expect(after).toEqual(expect.arrayContaining([...before, ESCAPE]))
        expect(after).toContain('allow-popups')
        expect(after).not.toContain('allow-scripts')
    })

    it('reloads the frame so the new sandbox applies, and the description still renders once with its CSS', async () => {
        const infoBox = await loadedInfoBox()
        infoBox.viewModel.description = '<b>first</b>'
        const firstDocument = infoBox.frame.contentDocument

        allowInfoBoxPopupsToEscapeSandbox(host(infoBox))
        await tick()

        const doc = infoBox.frame.contentDocument!
        expect(doc).not.toBe(firstDocument)
        expect(doc.head.querySelectorAll('link[rel=stylesheet]')).toHaveLength(1)
        expect(doc.querySelectorAll('.cesium-infoBox-description')).toHaveLength(1)
        expect(doc.querySelector('.cesium-infoBox-description')!.innerHTML).toBe('<b>first</b>')

        infoBox.viewModel.description = '<i>second</i>'
        expect(doc.querySelector('.cesium-infoBox-description')!.innerHTML).toBe('<i>second</i>')
    })

    it('does nothing more when the token is already present', async () => {
        const infoBox = await loadedInfoBox()
        allowInfoBoxPopupsToEscapeSandbox(host(infoBox))
        await tick()
        const doc = infoBox.frame.contentDocument

        allowInfoBoxPopupsToEscapeSandbox(host(infoBox))
        await tick()

        expect(infoBox.frame.contentDocument).toBe(doc)
        expect(tokens(infoBox.frame).filter((t) => t === ESCAPE)).toHaveLength(1)
    })

    it('leaves a destroyed viewer alone', async () => {
        const infoBox = await loadedInfoBox()

        allowInfoBoxPopupsToEscapeSandbox(host(infoBox, true))

        expect(tokens(infoBox.frame)).not.toContain(ESCAPE)
    })

    it('does not throw without an InfoBox or with a destroyed one', async () => {
        expect(() => allowInfoBoxPopupsToEscapeSandbox(host(undefined))).not.toThrow()

        const infoBox = await loadedInfoBox()
        infoBox.destroy()
        expect(() => allowInfoBoxPopupsToEscapeSandbox(host(infoBox))).not.toThrow()
    })
})
