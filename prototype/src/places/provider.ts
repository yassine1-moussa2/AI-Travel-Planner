import type { Place, PlaceCategory } from "../types.js";

/**
 * Anything that can turn a destination into real, existing places implements
 * this interface. Swapping Geoapify for Google Places later means writing one
 * new file, not touching the generation engine.
 */
export interface PlacesProvider {
  /** Turn a free-text destination into coordinates. */
  geocode(destination: string): Promise<{ lat: number; lng: number } | null>;

  /** Fetch candidate places near a point, for the given interest categories. */
  searchPlaces(params: {
    lat: number;
    lng: number;
    categories: PlaceCategory[];
    radiusMeters?: number;
    limitPerCategory?: number;
  }): Promise<Place[]>;
}
