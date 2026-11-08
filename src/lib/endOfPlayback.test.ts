import {describe, expect, it} from 'vitest'
import {Clock, ClockRange, ClockStep, JulianDate} from 'cesium'
import {attachEndOfPlayback} from './earthquakes'

const START = JulianDate.fromDate(new Date(Date.UTC(2025, 3, 1)))
const STOP = JulianDate.addSeconds(START, 100, new JulianDate())

// Advances 30 simulated seconds per tick, independent of wall-clock time.
function makeClock(): Clock {
    return new Clock({
        startTime: START,
        stopTime: STOP,
        currentTime: JulianDate.clone(START),
        clockRange: ClockRange.CLAMPED,
        clockStep: ClockStep.TICK_DEPENDENT,
        multiplier: 30,
        shouldAnimate: true,
    })
}

function offset(clock: Clock): number {
    return JulianDate.secondsDifference(clock.currentTime, START)
}

function playToStop(clock: Clock) {
    for (let i = 0; i < 4; i++) clock.tick()
}

describe('attachEndOfPlayback', () => {
    it('pauses at the stop time on first arrival', () => {
        const clock = makeClock()
        attachEndOfPlayback(clock)

        playToStop(clock)

        expect(JulianDate.equals(clock.currentTime, STOP)).toBe(true)
        expect(clock.shouldAnimate).toBe(false)
    })

    it('restarts from the start time when Play is pressed at the stop time', () => {
        const clock = makeClock()
        attachEndOfPlayback(clock)
        playToStop(clock)

        clock.shouldAnimate = true
        clock.tick()

        expect(JulianDate.equals(clock.currentTime, START)).toBe(true)
        expect(clock.shouldAnimate).toBe(true)
        clock.tick()
        expect(offset(clock)).toBe(30)
        expect(clock.shouldAnimate).toBe(true)
    })

    it('restarts when the user scrubs to the stop time and then presses Play', () => {
        const clock = makeClock()
        attachEndOfPlayback(clock)
        clock.tick()
        clock.shouldAnimate = false

        clock.currentTime = JulianDate.clone(STOP)
        clock.tick()
        clock.shouldAnimate = true
        clock.tick()

        expect(JulianDate.equals(clock.currentTime, START)).toBe(true)
        expect(clock.shouldAnimate).toBe(true)
    })

    it('leaves playback from the middle of the range unchanged', () => {
        const clock = makeClock()
        attachEndOfPlayback(clock)
        clock.currentTime = JulianDate.addSeconds(START, 10, new JulianDate())

        clock.tick()
        clock.tick()

        expect(offset(clock)).toBe(70)
        expect(clock.shouldAnimate).toBe(true)
    })

    it('returns a remover that detaches both listeners', () => {
        const clock = makeClock()
        const tickListeners = clock.onTick.numberOfListeners
        const stopListeners = clock.onStop.numberOfListeners

        const remove = attachEndOfPlayback(clock)
        expect(clock.onTick.numberOfListeners).toBe(tickListeners + 1)
        expect(clock.onStop.numberOfListeners).toBe(stopListeners + 1)

        remove()
        expect(clock.onTick.numberOfListeners).toBe(tickListeners)
        expect(clock.onStop.numberOfListeners).toBe(stopListeners)

        playToStop(clock)
        clock.shouldAnimate = true
        clock.tick()
        expect(JulianDate.equals(clock.currentTime, STOP)).toBe(true)
    })
})
