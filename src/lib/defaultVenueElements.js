import { wedflow } from '@/api/wedflowClient';

// Default venue elements every wedding's seating plan should start with, so
// couples never have to manually add a stage/bar — they just move the ones
// already on the map. Positions mirror the defaults HallVisualization falls
// back to for stage/bar when no location is set.
const DEFAULT_VENUE_ELEMENTS = [
  { name: 'במה', element_type: 'stage', capacity: 0, location_x: 50, location_y: 8 },
  { name: 'בר', element_type: 'bar', capacity: 0, location_x: 50, location_y: 50 },
];

export async function seedDefaultVenueElements(weddingId) {
  await Promise.all(
    DEFAULT_VENUE_ELEMENTS.map((el) =>
      wedflow.entities.Table.create({ ...el, wedding_id: weddingId })
    )
  );
}

// For weddings created before venue elements existed: check what's already
// there and create only the missing ones (stage and/or bar), without
// touching any existing guest tables or venue elements.
export async function ensureDefaultVenueElements(weddingId, existingTables) {
  const missing = DEFAULT_VENUE_ELEMENTS.filter(
    (el) => !existingTables.some((t) => t.element_type === el.element_type)
  );
  if (missing.length === 0) return false;
  await Promise.all(
    missing.map((el) => wedflow.entities.Table.create({ ...el, wedding_id: weddingId }))
  );
  return true;
}
