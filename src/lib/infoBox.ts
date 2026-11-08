const ESCAPE_TOKEN = "allow-popups-to-escape-sandbox"

type InfoBoxLike = {
    frame: HTMLIFrameElement
    isDestroyed(): boolean
}

type InfoBoxHost = {
    isDestroyed(): boolean
    infoBox?: InfoBoxLike
}

// Cesium's InfoBox renders descriptions in an iframe sandboxed with
// "allow-same-origin allow-popups allow-forms". A tab opened from a link in it inherits
// that sandbox, so the USGS event page would load with its scripts blocked. Adding
// allow-popups-to-escape-sandbox lets the new tab run normally; allow-scripts is still
// not granted to the description itself.
//
// A sandbox change applies only on the frame's next navigation, so the frame is reloaded.
// Its load handler then injects the description CSS and content element into the new
// document and subscribes to the description again; the previous subscription, which
// writes into the old document, is disposed first. _descriptionSubscription is a private
// InfoBox field, so it is accessed defensively.
export function allowInfoBoxPopupsToEscapeSandbox(viewer: InfoBoxHost): void {
    if (viewer.isDestroyed()) return
    const infoBox = viewer.infoBox
    if (!infoBox || infoBox.isDestroyed()) return

    const frame = infoBox.frame
    const tokens = (frame.getAttribute("sandbox") ?? "").split(/\s+/).filter(Boolean)
    if (tokens.includes(ESCAPE_TOKEN)) return
    frame.setAttribute("sandbox", [...tokens, ESCAPE_TOKEN].join(" "))

    const subscription = (infoBox as { _descriptionSubscription?: { dispose?: () => void } })
      ._descriptionSubscription
    subscription?.dispose?.()
    frame.setAttribute("src", "about:blank")
}
