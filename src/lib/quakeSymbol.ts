import {Color} from "cesium"
import type {Earthquake} from "./earthquakes.ts"

// The one place the quake cone symbol is defined: its color, size and tessellation.

export function quakeColor(magnitude: number | null): Color {
    if (magnitude === null) return Color.GRAY
    if (magnitude >= 6) return Color.RED
    if (magnitude >= 5) return Color.ORANGE
    if (magnitude >= 4) return Color.YELLOW
    return Color.LIME
}

const MIN_SLICES = 8
const MAX_SLICES = 128

// Cesium tessellates a cylinder with 128 slices by default, about 508 triangles per cone,
// which for a month of quakes is millions of triangles and makes the globe GPU-bound.
// Small cones are a few pixels wide, so scale the slice count with the radius in meters:
// 1 km -> 16, 4 km -> 32, 16 km -> 64, 64 km (about M7.2) and up -> 128.
export function coneSlices(bottomRadius: number): number {
    const slices = 4 * Math.ceil(4 * Math.sqrt(Math.max(0, bottomRadius) / 1000))
    return Math.min(MAX_SLICES, Math.max(MIN_SLICES, slices))
}

export type QuakeCylinder = {
    length: number
    topRadius: number
    bottomRadius: number
    slices: number
    material: Color
    outline: boolean
}

export function quakeCylinder(q: Earthquake): QuakeCylinder {
    const bottomRadius = Math.exp((q.magnitude ?? 0) - 3) * 1000
    return {
        length: Math.max(50000, q.coordinates[2] * 2000),
        topRadius: 0,
        bottomRadius,
        slices: coneSlices(bottomRadius),
        material: quakeColor(q.magnitude),
        outline: false,
    }
}
