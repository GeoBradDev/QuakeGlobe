import {describe, expect, it} from 'vitest'
import {AnimationViewModel, Clock, ClockRange, ClockStep, ClockViewModel, JulianDate} from 'cesium'
import {attachEndOfPlayback} from './earthquakes'

const START = JulianDate.fromDate(new Date(Date.UTC(2025, 3, 1)))
const STOP = JulianDate.addSeconds(START, 100, new JulianDate())

// Mirrors the app: the Animation widget's view models subscribe to the clock first
// (the Viewer creates them), then attachEndOfPlayback adds its listeners.
function setup() {
    const clock = new Clock({
        startTime: START,
        stopTime: STOP,
        currentTime: JulianDate.clone(START),
        clockRange: ClockRange.CLAMPED,
        clockStep: ClockStep.TICK_DEPENDENT,
        multiplier: 30,
        shouldAnimate: true,
    })
    const animation = new AnimationViewModel(new ClockViewModel(clock))
    attachEndOfPlayback(clock)
    return {clock, animation}
}

// Cesium types Command as an interface without a call signature; at runtime it is a
// function, which is what the widget's buttons invoke.
function press(button: { command: unknown }) {
    (button.command as () => void)()
}

function secondsFromStop(clock: Clock): number {
    return JulianDate.secondsDifference(clock.currentTime, STOP)
}

describe('attachEndOfPlayback with the Animation widget', () => {
    it('restarts from the start time when Play Forward is pressed at the stop time', () => {
        const {clock, animation} = setup()
        for (let i = 0; i < 4; i++) clock.tick()
        expect(JulianDate.equals(clock.currentTime, STOP)).toBe(true)
        expect(clock.shouldAnimate).toBe(false)

        press(animation.playForwardViewModel)
        clock.tick()

        expect(JulianDate.equals(clock.currentTime, START)).toBe(true)
        clock.tick()
        expect(JulianDate.secondsDifference(clock.currentTime, START)).toBe(30)
        expect(clock.shouldAnimate).toBe(true)
    })

    it('plays backward from the stop time after scrubbing past it and pressing Play Reverse', () => {
        const {clock, animation} = setup()
        clock.tick()
        press(animation.pauseViewModel)
        expect(clock.shouldAnimate).toBe(false)

        clock.currentTime = JulianDate.addSeconds(STOP, 100, new JulianDate())
        clock.tick()
        press(animation.playReverseViewModel)
        clock.tick()

        expect(JulianDate.equals(clock.currentTime, STOP)).toBe(true)
        expect(clock.shouldAnimate).toBe(true)
        clock.tick()
        expect(secondsFromStop(clock)).toBe(-30)
        expect(clock.shouldAnimate).toBe(true)
        clock.tick()
        expect(secondsFromStop(clock)).toBe(-60)
    })
})
