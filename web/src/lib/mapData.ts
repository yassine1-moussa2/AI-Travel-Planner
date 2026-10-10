// What the day map draws: numbered stops, the line joining them, and the hotel.
// Built from scheduleDay() output so the map's numbers and times always match the list.
// Pure, like recalculate.ts: no browser, no network.
import type { Feature, FeatureCollection, LineString, Point as GeoPoint } from "geojson";
import { formatClock } from "./recalculate";
import type { ScheduledDay } from "./recalculate";
import type { Place } from "./types";

// The base map. Switching map provider means changing only this line.
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export interface MapStopProperties {
  order: number;
  name: string;
  time: string;
}

export interface MapStayProperties {
  name: string;
}

// [[west, south], [east, north]], the shape MapLibre's fitBounds accepts.
export type MapBounds = [[number, number], [number, number]];

export interface DayMapData {
  stops: FeatureCollection<GeoPoint, MapStopProperties>;
  route: Feature<LineString> | null;
  stay: Feature<GeoPoint, MapStayProperties> | null;
  bounds: MapBounds | null;
}

// Grow a bounding box so it also covers one more point.
function extendBounds(bounds: MapBounds | null, lon: number, lat: number): MapBounds {
  if (bounds === null) {
    return [[lon, lat], [lon, lat]];
  }
  const west = Math.min(bounds[0][0], lon);
  const south = Math.min(bounds[0][1], lat);
  const east = Math.max(bounds[1][0], lon);
  const north = Math.max(bounds[1][1], lat);
  return [[west, south], [east, north]];
}

export function dayMapData(schedule: ScheduledDay, stay: Place | null): DayMapData {
  const stopFeatures: Feature<GeoPoint, MapStopProperties>[] = [];
  const routeCoordinates: number[][] = [];
  let bounds: MapBounds | null = null;

  // Number each stop by its place in the day, so "Stop 2" is the second row of the list.
  // A stop whose place has gone missing keeps its number but is not drawn.
  for (let stopIndex = 0; stopIndex < schedule.stops.length; stopIndex++) {
    const scheduled = schedule.stops[stopIndex];
    const place = scheduled.place;
    if (place === null) {
      continue;
    }
    const coordinates = [place.lon, place.lat];
    stopFeatures.push({
      type: "Feature",
      geometry: { type: "Point", coordinates },
      properties: { order: stopIndex + 1, name: place.name, time: formatClock(scheduled.startMinutes) },
    });
    routeCoordinates.push(coordinates);
    bounds = extendBounds(bounds, place.lon, place.lat);
  }

  // A line needs at least two points; an empty or one-stop day has no route.
  let route: Feature<LineString> | null = null;
  if (routeCoordinates.length >= 2) {
    route = { type: "Feature", geometry: { type: "LineString", coordinates: routeCoordinates }, properties: {} };
  }

  // The hotel is drawn and framed, but is not part of the numbered route.
  let stayFeature: Feature<GeoPoint, MapStayProperties> | null = null;
  if (stay !== null) {
    stayFeature = {
      type: "Feature",
      geometry: { type: "Point", coordinates: [stay.lon, stay.lat] },
      properties: { name: stay.name },
    };
    bounds = extendBounds(bounds, stay.lon, stay.lat);
  }

  return {
    stops: { type: "FeatureCollection", features: stopFeatures },
    route,
    stay: stayFeature,
    bounds,
  };
}
