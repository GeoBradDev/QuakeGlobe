import {afterEach, describe, expect, it} from 'vitest'
import {InfoBox} from 'cesium'
import {allowInfoBoxPopupsToEscapeSandbox} from './infoBox'

const ESCAPE = 'allow-popups-to-escape-sandbox'

const containers: HTMLElement[] = []

function newInfoBox(): InfoBox {
    const container = document.createElement('div')
    document.body.appendChild(container)
    containers.push(container)
    return new InfoBox(container)
}

function host(infoBox: InfoBox, destroyed = false) {
    return {isDestroyed: () => destroyed, infoBox}
}

function settle(ms = 100): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

afterEach(() => {
    for (const c of containers.splice(0)) c.remove()
})

describe('allowInfoBoxPopupsToEscapeSandbox before the frame first loads', () => {
    it('ends with one stylesheet, one content element and one live description', async () => {
        const infoBox = newInfoBox()
        let loads = 0
        infoBox.frame.addEventListener('load', () => loads++)

        allowInfoBoxPopupsToEscapeSandbox(host(infoBox))
        allowInfoBoxPopupsToEscapeSandbox(host(infoBox))
        await settle()

        expect(infoBox.frame.getAttribute('sandbox')!.split(/\s+/)).toContain(ESCAPE)
        // The first load, then exactly one reload for the new sandbox.
        expect(loads).toBe(2)

        const doc = infoBox.frame.contentDocument!
        expect(doc.head.querySelectorAll('link[rel=stylesheet]')).toHaveLength(1)
        const content = doc.querySelectorAll('.cesium-infoBox-description')
        expect(content).toHaveLength(1)

        infoBox.viewModel.description = '<b>once</b>'
        expect(content[0].innerHTML).toBe('<b>once</b>')
        expect(doc.body.innerHTML.match(/once/g)).toHaveLength(1)
    })

    it('does nothing when the viewer is destroyed before the first load', async () => {
        const infoBox = newInfoBox()
        let destroyed = false
        const viewer = {isDestroyed: () => destroyed, infoBox}
        let loads = 0
        infoBox.frame.addEventListener('load', () => loads++)

        allowInfoBoxPopupsToEscapeSandbox(viewer)
        destroyed = true
        await settle()

        expect(infoBox.frame.getAttribute('sandbox')!.split(/\s+/)).not.toContain(ESCAPE)
        expect(loads).toBe(1)
    })
})
