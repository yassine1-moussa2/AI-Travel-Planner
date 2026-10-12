import type { Place, PlaceCategory } from "../types.js";
import type { PlacesProvider } from "./provider.js";

// Our simple categories, mapped to Geoapify's category taxonomy.
// https://apidocs.geoapify.com/docs/places/#categories
const CATEGORY_MAP: Record<PlaceCategory, string[]> = {
  sight: ["tourism.sights", "entertainment.museum", "heritage"],
  food: ["catering.restaurant", "catering.cafe"],
  nightlife: ["nightlife.bar", "nightlife.club"],
  nature: ["natural", "leisure.park"],
};

interface GeoapifyFeature {
  properties: {
    place_id: string;
    name?: string;
    categories?: string[];
    formatted?: string;
    lat: number;
    lon: number;
    datasource?: { raw?: { price_range?: string } };
  };
}

export class GeoapifyPlacesProvider implements PlacesProvider {
  constructor(private readonly apiKey: string) {}

  async geocode(destination: string): Promise<{ lat: number; lng: number } | null> {
    const url = new URL("https://api.geoapify.com/v1/geocode/search");
    url.searchParams.set("text", destination);
    url.searchParams.set("limit", "1");
    url.searchParams.set("apiKey", this.apiKey);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Geoapify geocode failed: ${res.status} ${await res.text()}`);

    const data = (await res.json()) as { features: GeoapifyFeature[] };
    const first = data.features[0];
    if (!first) return null;

    return { lat: first.properties.lat, lng: first.properties.lon };
  }

  async searchPlaces(params: {
    lat: number;
    lng: number;
    categories: PlaceCategory[];
    radiusMeters?: number;
    limitPerCategory?: number;
  }): Promise<Place[]> {
    const radius = params.radiusMeters ?? 8000;
    const limit = params.limitPerCategory ?? 15;

    // One request per category, run in parallel — simpler to read than
    // building one giant combined-category query, and easy to cache per
    // category later.
    const results = await Promise.all(
      params.categories.map((category) => this.searchOneCategory(category, params.lat, params.lng, radius, limit))
    );

    // Flatten and dedupe (a place can legitimately match more than one category).
    const byId = new Map<string, Place>();
    for (const place of results.flat()) {
      byId.set(place.id, place);
    }
    return [...byId.values()];
  }

  private async searchOneCategory(
    category: PlaceCategory,
    lat: number,
    lng: number,
    radiusMeters: number,
    limit: number
  ): Promise<Place[]> {
    const url = new URL("https://api.geoapify.com/v2/places");
    url.searchParams.set("categories", CATEGORY_MAP[category].join(","));
    url.searchParams.set("filter", `circle:${lng},${lat},${radiusMeters}`);
    url.searchParams.set("bias", `proximity:${lng},${lat}`);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("apiKey", this.apiKey);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Geoapify places failed: ${res.status} ${await res.text()}`);

    const data = (await res.json()) as { features: GeoapifyFeature[] };

    return data.features
      .filter((f) => f.properties.name) // skip unnamed POIs, not useful in an itinerary
      .map((f) => ({
        id: `geoapify:${f.properties.place_id}`,
        name: f.properties.name!,
        category,
        lat: f.properties.lat,
        lng: f.properties.lon,
        address: f.properties.formatted ?? "",
        priceLevel: null, // Geoapify (OSM-backed) doesn't reliably provide this
        description: null,
      }));
  }
}
