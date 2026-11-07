import {describe, expect, it} from 'vitest'
import pkg from '../package.json'

type Version = [number, number, number]

// Lowest version a range like "^1.2.3", "~1.2.3" or "1.2.3" accepts.
function minVersion(range: string): Version {
    const match = /^[\^~]?(\d+)\.(\d+)\.(\d+)/.exec(range.trim())
    if (!match) {
        throw new Error(`Unparseable version range: ${range}`)
    }
    return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function atLeast(actual: Version, required: Version): boolean {
    for (let i = 0; i < 3; i++) {
        if (actual[i] !== required[i]) {
            return actual[i] > required[i]
        }
    }
    return true
}

const allRanges: Record<string, string> = {...pkg.devDependencies, ...pkg.dependencies}

describe('dependency policy', () => {
    it('ships no pre-release versions in runtime dependencies', () => {
        const prerelease = Object.entries(pkg.dependencies).filter(([, range]) =>
            /^[\^~]?\d+\.\d+\.\d+-/.test(range.trim()),
        )
        expect(prerelease).toEqual([])
    })

    it.each([
        ['cesium', '1.147.0'],
        ['resium', '1.28.0'],
        ['vite', '6.4.5'],
        ['vitest', '4.1.12'],
    ])('requires %s >= %s', (name, required) => {
        const range = allRanges[name]
        expect(range, `${name} is not declared in package.json`).toBeDefined()
        const actual = minVersion(range)
        expect(
            atLeast(actual, minVersion(required)),
            `${name} range ${range} allows versions below ${required}`,
        ).toBe(true)
    })
})
