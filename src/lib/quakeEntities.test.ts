import {describe, expect, it, vi} from 'vitest'
import {Cartesian3, Color, EntityCollection, JulianDate, type Entity, type Property} from 'cesium'
import {
    addQuakeEntities,
    applyQuakeFilters,
    createQuakeEntities,
    removeQuakeEntities,
} from './quakeEntities'
import {
    DEFAULT_DEPTH_RANGE,
    DEFAULT_MAG_RANGE,
    quakeDescription,
    type Earthquake,
} from './earthquakes'
import {quakeCylinder} from './quakeSymbol'

const T_SMALL = Date.UTC(2025, 3, 1)
const T_BIG = Date.UTC(2025, 3, 20)

function makeQuake(overrides: Partial<Earthquake> = {}): Earthquake {
    return {
        id: 'us7000abcd',
        magnitude: 4.5,
        coordinates: [-122.4, 37.8, 10],
        place: 'Somewhere',
        time: T_SMALL,
        type: 'earthquake',
        url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000abcd',
        ...overrides,
    }
}

const SMALL = makeQuake({id: 'small', magnitude: 3.2, place: 'Alaska', coordinates: [-149.9, 60.7, 35]})
const BIG = makeQuake({id: 'big', magnitude: 6.4, place: 'Chile', coordinates: [-72, -33, 20], time: T_BIG})
const UNKNOWN = makeQuake({id: 'null-mag', magnitude: null, place: 'Utah', coordinates: [0, 0, 8]})

const now = JulianDate.now()

function shownNames(collection: EntityCollection): string[] {
    return collection.values.filter((e) => e.show).map((e) => e.name ?? '').sort()
}

describe('createQuakeEntities', () => {
    it('builds one entity per quake from the quake symbol, name, time and description', () => {
        const [{quake, entity}] = createQuakeEntities([BIG])
        const expectedCylinder = quakeCylinder(BIG)

        expect(quake).toBe(BIG)
        expect(entity.name).toBe('M6.4 - Chile')
        expect(JulianDate.equals(entity.availability!.start, JulianDate.fromDate(new Date(T_BIG)))).toBe(true)
        expect(entity.position!.getValue(now)).toEqual(Cartesian3.fromDegrees(-72, -33))
        const cylinder = entity.cylinder!
        expect(cylinder.length!.getValue(now)).toBe(expectedCylinder.length)
        expect(cylinder.topRadius!.getValue(now)).toBe(0)
        expect(cylinder.bottomRadius!.getValue(now)).toBe(expectedCylinder.bottomRadius)
        expect(cylinder.slices!.getValue(now)).toBe(expectedCylinder.slices)
        expect(cylinder.material!.getValue(now).color).toEqual(Color.RED)
        expect(cylinder.outline!.getValue(now)).toBe(false)
        expect((entity.description as Property).getValue(now)).toBe(quakeDescription(BIG))
        expect(entity.show).toBe(true)
    })

    it('keeps the availability start of each quake', () => {
        const list = createQuakeEntities([SMALL, BIG])
        expect(list.map((q) => JulianDate.toIso8601(q.entity.availability!.start, 0))).toEqual([
            JulianDate.toIso8601(JulianDate.fromDate(new Date(T_SMALL)), 0),
            JulianDate.toIso8601(JulianDate.fromDate(new Date(T_BIG)), 0),
        ])
    })

    it('makes an entity hidden before its quake time and shown from it', () => {
        const [{entity}] = createQuakeEntities([BIG])
        expect(entity.isAvailable(JulianDate.fromDate(new Date(T_BIG - 1000)))).toBe(false)
        expect(entity.isAvailable(JulianDate.fromDate(new Date(T_BIG)))).toBe(true)
    })

    it('gray cone and M? name for an unknown magnitude', () => {
        const [{entity}] = createQuakeEntities([UNKNOWN])
        expect(entity.name).toBe('M? - Utah')
        expect(entity.cylinder!.material!.getValue(now).color).toEqual(Color.GRAY)
    })
})

describe('addQuakeEntities and removeQuakeEntities', () => {
    it('adds every entity to the collection and removes them again', () => {
        const collection = new EntityCollection()
        const list = createQuakeEntities([SMALL, BIG])

        addQuakeEntities(collection, list)
        expect(collection.values).toHaveLength(2)
        expect(list.every(({entity}) => collection.contains(entity))).toBe(true)

        removeQuakeEntities(collection, list)
        expect(collection.values).toHaveLength(0)
    })

    it('raises one collectionChanged event per add and per remove', () => {
        const collection = new EntityCollection()
        const list = createQuakeEntities([SMALL, BIG, UNKNOWN])
        const changed = vi.fn()
        collection.collectionChanged.addEventListener(changed)

        addQuakeEntities(collection, list)
        expect(changed).toHaveBeenCalledTimes(1)
        expect(changed.mock.calls[0][1]).toHaveLength(3)

        removeQuakeEntities(collection, list)
        expect(changed).toHaveBeenCalledTimes(2)
        expect(changed.mock.calls[1][2]).toHaveLength(3)
    })

    it('does not throw for a feed with a duplicate USGS id', () => {
        const collection = new EntityCollection()
        const list = createQuakeEntities([SMALL, {...SMALL, place: 'Alaska again'}])

        expect(() => addQuakeEntities(collection, list)).not.toThrow()
        expect(collection.values).toHaveLength(2)
    })

    it('leaves other entities in the collection alone', () => {
        const collection = new EntityCollection()
        const other = collection.add({name: 'other'})
        const list = createQuakeEntities([SMALL])

        addQuakeEntities(collection, list)
        removeQuakeEntities(collection, list)

        expect(collection.values).toEqual([other])
    })
})

describe('applyQuakeFilters', () => {
    function loaded(quakes: Earthquake[]) {
        const collection = new EntityCollection()
        const list = createQuakeEntities(quakes)
        addQuakeEntities(collection, list)
        return {collection, list}
    }

    it('hides quakes outside the magnitude range without removing them', () => {
        const {collection, list} = loaded([SMALL, BIG])
        const changed = vi.fn()
        collection.collectionChanged.addEventListener(changed)

        applyQuakeFilters(collection, list, [5, 10], DEFAULT_DEPTH_RANGE)

        expect(shownNames(collection)).toEqual(['M6.4 - Chile'])
        expect(collection.values).toHaveLength(2)
        // The show change is reported as one batched "changed" event, never as add or remove.
        expect(changed).toHaveBeenCalledTimes(1)
        const [, added, removed, changedEntities] = changed.mock.calls[0]
        expect(added).toEqual([])
        expect(removed).toEqual([])
        expect(changedEntities.map((e: Entity) => e.name)).toEqual(['M3.2 - Alaska'])
    })

    it('hides quakes deeper than the depth range', () => {
        const {collection, list} = loaded([SMALL, BIG])

        applyQuakeFilters(collection, list, DEFAULT_MAG_RANGE, [-10, 30])

        expect(shownNames(collection)).toEqual(['M6.4 - Chile'])
    })

    it('shows everything again for the default ranges', () => {
        const {collection, list} = loaded([SMALL, BIG])
        applyQuakeFilters(collection, list, [5, 10], [-10, 30])

        applyQuakeFilters(collection, list, DEFAULT_MAG_RANGE, DEFAULT_DEPTH_RANGE)

        expect(shownNames(collection)).toEqual(['M3.2 - Alaska', 'M6.4 - Chile'])
    })

    it('keeps the same entity and graphics instances across filter changes', () => {
        const {collection, list} = loaded([SMALL, BIG])
        const before = list.map(({entity}) => ({
            entity,
            position: entity.position,
            cylinder: entity.cylinder,
            availability: entity.availability,
        }))

        applyQuakeFilters(collection, list, [5, 10], DEFAULT_DEPTH_RANGE)
        applyQuakeFilters(collection, list, DEFAULT_MAG_RANGE, DEFAULT_DEPTH_RANGE)

        const after = collection.values
        expect(after).toHaveLength(2)
        before.forEach((b) => {
            expect(after).toContain(b.entity)
            expect(b.entity.position).toBe(b.position)
            expect(b.entity.cylinder).toBe(b.cylinder)
            expect(b.entity.availability).toBe(b.availability)
        })
    })

    it('hides an unknown magnitude once Min Magnitude narrows and shows it on reset', () => {
        const {collection, list} = loaded([SMALL, UNKNOWN])

        applyQuakeFilters(collection, list, [0, 10], DEFAULT_DEPTH_RANGE)
        expect(shownNames(collection)).toEqual(['M3.2 - Alaska'])

        applyQuakeFilters(collection, list, DEFAULT_MAG_RANGE, DEFAULT_DEPTH_RANGE)
        expect(shownNames(collection)).toEqual(['M3.2 - Alaska', 'M? - Utah'])
    })

    it('only assigns show when the value changes', () => {
        const {collection, list} = loaded([SMALL, BIG])
        const changes: [Entity, string][] = []
        list.forEach(({entity}) =>
          entity.definitionChanged.addEventListener((e: Entity, name: string) => changes.push([e, name])))

        applyQuakeFilters(collection, list, DEFAULT_MAG_RANGE, DEFAULT_DEPTH_RANGE)
        expect(changes).toEqual([])

        applyQuakeFilters(collection, list, [5, 10], DEFAULT_DEPTH_RANGE)
        expect(changes.filter(([, name]) => name === 'show').map(([e]) => e.name)).toEqual(['M3.2 - Alaska'])
    })

    it('batches the show changes inside one suspendEvents and resumeEvents pair', () => {
        const {collection, list} = loaded([SMALL, BIG])
        const suspend = vi.spyOn(collection, 'suspendEvents')
        const resume = vi.spyOn(collection, 'resumeEvents')
        let suspendedDuringShow = false
        list[0].entity.definitionChanged.addEventListener(() => {
            suspendedDuringShow = suspend.mock.calls.length === 1 && resume.mock.calls.length === 0
        })

        applyQuakeFilters(collection, list, [5, 10], DEFAULT_DEPTH_RANGE)

        expect(suspend).toHaveBeenCalledTimes(1)
        expect(resume).toHaveBeenCalledTimes(1)
        expect(suspendedDuringShow).toBe(true)
    })
})
