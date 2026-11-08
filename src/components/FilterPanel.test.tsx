import {describe, expect, it, vi} from 'vitest'
import {fireEvent, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FilterPanel from './FilterPanel'
import {DEFAULT_DEPTH_RANGE, DEFAULT_MAG_RANGE} from '../lib/earthquakes'

function renderPanel() {
    const onMagChange = vi.fn()
    const onDepthChange = vi.fn()
    render(
      <FilterPanel
        magRange={[2, 8]}
        onMagChange={onMagChange}
        depthRange={[0, 500]}
        onDepthChange={onDepthChange}
      />,
    )
    return {onMagChange, onDepthChange}
}

describe('FilterPanel', () => {
    it('shows the current ranges in the inputs', () => {
        renderPanel()

        expect(screen.getByLabelText('Min Magnitude')).toHaveValue(2)
        expect(screen.getByLabelText('Max Magnitude')).toHaveValue(8)
        expect(screen.getByLabelText('Max Depth (km)')).toHaveValue(500)
    })

    it('reports a new minimum magnitude with the current maximum', () => {
        const {onMagChange} = renderPanel()

        fireEvent.change(screen.getByLabelText('Min Magnitude'), {target: {value: '3.5'}})

        expect(onMagChange).toHaveBeenLastCalledWith([3.5, 8])
    })

    it('reports a new maximum magnitude with the current minimum', () => {
        const {onMagChange} = renderPanel()

        fireEvent.change(screen.getByLabelText('Max Magnitude'), {target: {value: '6.2'}})

        expect(onMagChange).toHaveBeenLastCalledWith([2, 6.2])
    })

    it('reports a new maximum depth with the current minimum depth', () => {
        const {onDepthChange} = renderPanel()

        fireEvent.change(screen.getByLabelText('Max Depth (km)'), {target: {value: '300'}})

        expect(onDepthChange).toHaveBeenLastCalledWith([0, 300])
    })

    it('resets both ranges to their defaults', async () => {
        const user = userEvent.setup()
        const {onMagChange, onDepthChange} = renderPanel()

        await user.click(screen.getByRole('button', {name: 'Reset Filters'}))

        expect(onMagChange).toHaveBeenCalledWith(DEFAULT_MAG_RANGE)
        expect(onDepthChange).toHaveBeenCalledWith(DEFAULT_DEPTH_RANGE)
    })

    it('lets the inputs reach the default bounds', () => {
        renderPanel()

        expect(screen.getByLabelText('Min Magnitude')).toHaveAttribute('min', String(DEFAULT_MAG_RANGE[0]))
        expect(screen.getByLabelText('Max Magnitude')).toHaveAttribute('max', String(DEFAULT_MAG_RANGE[1]))
        expect(screen.getByLabelText('Max Depth (km)')).toHaveAttribute('max', String(DEFAULT_DEPTH_RANGE[1]))
    })

    it('hides the inputs when collapsed and shows them again when expanded', async () => {
        const user = userEvent.setup()
        renderPanel()

        await user.click(screen.getByTitle('Collapse panel'))

        expect(screen.queryByLabelText('Min Magnitude')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Reset Filters'})).not.toBeInTheDocument()

        await user.click(screen.getByTitle('Expand panel'))

        expect(screen.getByLabelText('Min Magnitude')).toBeInTheDocument()
    })
})
