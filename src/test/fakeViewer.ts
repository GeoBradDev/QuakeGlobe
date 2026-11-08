import {Clock, EntityCollection, JulianDate, type Entity} from 'cesium'

// The part of a Cesium Viewer CesiumGlobe touches, with a real Clock and a real
// EntityCollection so tests can assert on the entities the component adds.
export type FakeViewer = {
    clock: Clock
    timeline: { zoomTo: (...args: unknown[]) => void }
    entities: EntityCollection
    selectedEntity: Entity | undefined
    trackedEntity: Entity | undefined
    isDestroyed: () => boolean
    allowDataSourcesToSuspendAnimation: boolean
}

export function makeFakeViewer(overrides: Partial<FakeViewer> = {}): FakeViewer {
    return {
        clock: new Clock(),
        timeline: {zoomTo: () => {}},
        entities: new EntityCollection(),
        selectedEntity: undefined,
        trackedEntity: undefined,
        isDestroyed: () => false,
        allowDataSourcesToSuspendAnimation: true,
        ...overrides,
    }
}

// Names of the entities currently shown, in the order they were added.
export function shownEntityNames(viewer: { entities: EntityCollection }): string[] {
    return viewer.entities.values.filter((e) => e.show).map((e) => e.name ?? '')
}

export function shownEntities(viewer: { entities: EntityCollection }): Entity[] {
    return viewer.entities.values.filter((e) => e.show)
}

export function entityByName(viewer: { entities: EntityCollection }, name: string): Entity {
    const entity = viewer.entities.values.find((e) => e.name === name)
    if (!entity) throw new Error(`no entity named ${name}`)
    return entity
}

export function availabilityStartIso(entity: Entity): string {
    const start = entity.availability?.get(0)?.start
    return start ? JulianDate.toIso8601(start, 0) : ''
}
