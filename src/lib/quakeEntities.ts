import {Cartesian3, Entity, type EntityCollection} from "cesium"
import {
    matchesFilters,
    quakeAvailability,
    quakeDescription,
    quakeName,
    type Earthquake,
} from "./earthquakes.ts"
import {quakeCylinder} from "./quakeSymbol.ts"

export type QuakeEntity = {
    quake: Earthquake
    entity: Entity
}

// One Cesium entity per quake, built once per feed. Filters toggle entity.show, which
// Cesium applies through the batch's per-instance show attribute, so a filter change
// neither rebuilds geometry nor goes through React.
//
// No id is set: Cesium generates a unique one, so a feed that repeats a USGS id cannot
// make EntityCollection.add throw.
export function createQuakeEntities(quakes: Earthquake[]): QuakeEntity[] {
    return quakes.map((quake) => ({
        quake,
        entity: new Entity({
            name: quakeName(quake),
            availability: quakeAvailability(quake),
            position: Cartesian3.fromDegrees(quake.coordinates[0], quake.coordinates[1]),
            cylinder: quakeCylinder(quake),
            description: quakeDescription(quake),
        }),
    }))
}

export function addQuakeEntities(collection: EntityCollection, list: QuakeEntity[]): void {
    collection.suspendEvents()
    try {
        for (const {entity} of list) collection.add(entity)
    } finally {
        collection.resumeEvents()
    }
}

export function removeQuakeEntities(collection: EntityCollection, list: QuakeEntity[]): void {
    collection.suspendEvents()
    try {
        for (const {entity} of list) collection.remove(entity)
    } finally {
        collection.resumeEvents()
    }
}

export function applyQuakeFilters(
  collection: EntityCollection,
  list: QuakeEntity[],
  magRange: [number, number],
  depthRange: [number, number],
): void {
    collection.suspendEvents()
    try {
        for (const {quake, entity} of list) {
            const show = matchesFilters(quake, magRange, depthRange)
            if (entity.show !== show) entity.show = show
        }
    } finally {
        collection.resumeEvents()
    }
}
