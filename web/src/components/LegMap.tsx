"use client";
// The map of one day in one destination. Loaded only in the browser (MapLibre needs WebGL).
// The map is created once; edits only swap the markers and the route line.
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { FeatureCollection } from "geojson";
import { MapLibreMap, Marker, Popup, getVersion, setWorkerUrl } from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import { MAP_STYLE_URL } from "@/lib/mapData";
import type { DayMapData, MapBounds } from "@/lib/mapData";
import type { Point } from "@/lib/types";

// MapLibre's worker is served from our own site (copied there by scripts/copy-map-worker.ts):
// the bundler can't ship it together with the shared file it imports. The version in the
// address stops a browser from keeping an old worker after an upgrade.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs?v=" + getVersion());

interface Props {
  data: DayMapData;
  center: Point;
  label: string;
}

const ROUTE_SOURCE = "day-route";
const EMPTY_ROUTE: FeatureCollection = { type: "FeatureCollection", features: [] };

// A small bed, drawn inline so the hotel marker needs no image file and no emoji.
const BED_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">' +
  '<path fill="currentColor" d="M3 6h2v7h6V8h7a3 3 0 0 1 3 3v7h-2v-2H5v2H3V6zm4.5 1.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/></svg>';

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Frame everything worth seeing. A single point has no area to fit, so zoom in on it instead.
function frameBounds(map: MapLibreMap, bounds: MapBounds): void {
  let duration = 600;
  if (prefersReducedMotion()) {
    duration = 0;
  }
  const west = bounds[0][0];
  const south = bounds[0][1];
  const east = bounds[1][0];
  const north = bounds[1][1];
  if (west === east && south === north) {
    map.easeTo({ center: [west, south], zoom: 15, duration });
    return;
  }
  map.fitBounds(bounds, { padding: 48, duration, maxZoom: 17 });
}

// Warm the base map to match the page. Only touch layers this style really has.
type PaintName = Parameters<MapLibreMap["setPaintProperty"]>[1];

function warmBaseMap(map: MapLibreMap): void {
  const tints: [string, PaintName, string][] = [
    ["background", "background-color", "#f8ecdf"],
    ["water", "fill-color", "#b3d3db"],
  ];
  for (const tint of tints) {
    const layer = map.getLayer(tint[0]);
    if (layer === undefined) {
      continue;
    }
    try {
      map.setPaintProperty(tint[0], tint[1], tint[2]);
    } catch {
      // A layer of another type: leave the provider's colour alone.
    }
  }
}

// The dotted line joining the stops, added once the style is ready.
function addRouteLayer(map: MapLibreMap): void {
  map.addSource(ROUTE_SOURCE, { type: "geojson", data: EMPTY_ROUTE });
  map.addLayer({
    id: ROUTE_SOURCE,
    type: "line",
    source: ROUTE_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#1E6A82", "line-width": 3, "line-dasharray": [0.1, 2] },
  });
}

function setRoute(map: MapLibreMap, data: DayMapData): void {
  const source = map.getSource<GeoJSONSource>(ROUTE_SOURCE);
  if (source === undefined) {
    return;
  }
  if (data.route === null) {
    source.setData(EMPTY_ROUTE);
  } else {
    source.setData(data.route);
  }
}

// Markers are plain elements. They are focusable, and Enter or Space opens their popup.
function markerElement(className: string, label: string): HTMLDivElement {
  const element = document.createElement("div");
  element.className = className;
  element.setAttribute("role", "button");
  element.setAttribute("tabindex", "0");
  element.setAttribute("aria-label", label);
  return element;
}

function buildMarkers(map: MapLibreMap, data: DayMapData): Marker[] {
  const markers: Marker[] = [];

  // The hotel goes first so numbered stops are drawn on top of it if they overlap.
  if (data.stay !== null) {
    const stayName = data.stay.properties.name;
    const element = markerElement("map-marker map-stay", "Hotel: " + stayName);
    element.innerHTML = BED_ICON;
    const popup = new Popup({ offset: 18 }).setText(stayName);
    const lonLat = data.stay.geometry.coordinates;
    markers.push(new Marker({ element }).setLngLat([lonLat[0], lonLat[1]]).setPopup(popup).addTo(map));
  }

  for (const feature of data.stops.features) {
    const stop = feature.properties;
    const element = markerElement("map-marker map-stop", "Stop " + stop.order + ": " + stop.name + " at " + stop.time);
    element.textContent = String(stop.order);
    const popup = new Popup({ offset: 18 }).setText(stop.time + " " + stop.name);
    const lonLat = feature.geometry.coordinates;
    markers.push(new Marker({ element }).setLngLat([lonLat[0], lonLat[1]]).setPopup(popup).addTo(map));
  }
  return markers;
}

export default function LegMap(props: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const latestDataRef = useRef<DayMapData | null>(null);
  const framedBoundsRef = useRef("");
  const [failed, setFailed] = useState(false);

  // Compare by content: the trip is copied on every edit, but the map only changes
  // when a stop, its time, or the hotel changes.
  const dataKey = JSON.stringify(props.data);
  const centerLon = props.center.lon;
  const centerLat = props.center.lat;

  // Create the map once for this destination, and tidy it away when the destination goes.
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    const map = new MapLibreMap({
      container,
      style: MAP_STYLE_URL,
      center: [centerLon, centerLat],
      zoom: 12,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    let styleReady = false;

    // If the map is re-created (a new city centre), put the current day straight back on it.
    if (latestDataRef.current !== null) {
      markersRef.current = buildMarkers(map, latestDataRef.current);
      if (latestDataRef.current.bounds !== null) {
        frameBounds(map, latestDataRef.current.bounds);
        framedBoundsRef.current = JSON.stringify(latestDataRef.current.bounds);
      }
    }

    map.on("style.load", () => {
      styleReady = true;
      warmBaseMap(map);
      addRouteLayer(map);
      if (latestDataRef.current !== null) {
        setRoute(map, latestDataRef.current);
      }
    });

    // Before the style arrives, any error means there is no map to show (offline, provider down).
    // Later errors are usually one missing tile, which the map survives on its own.
    map.on("error", () => {
      if (!styleReady) {
        setFailed(true);
      }
    });

    return () => {
      for (const marker of markersRef.current) {
        marker.remove();
      }
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
      framedBoundsRef.current = "";
    };
  }, [centerLon, centerLat]);

  // Redraw markers and the route when the day changes, and move the camera only if
  // the area to show has changed (reordering stops keeps the same view).
  useEffect(() => {
    const map = mapRef.current;
    if (map === null) {
      return;
    }
    const data = JSON.parse(dataKey) as DayMapData;
    latestDataRef.current = data;

    for (const marker of markersRef.current) {
      marker.remove();
    }
    markersRef.current = buildMarkers(map, data);
    setRoute(map, data);

    const boundsKey = JSON.stringify(data.bounds);
    if (data.bounds !== null && boundsKey !== framedBoundsRef.current) {
      frameBounds(map, data.bounds);
    }
    framedBoundsRef.current = boundsKey;
  }, [dataKey]);

  return (
    <div className="leg-map-box" role="region" aria-label={props.label}>
      <div ref={containerRef} className="leg-map-canvas" />
      {failed && <p className="leg-map-failed">The map couldn&apos;t load. Your plan is unaffected.</p>}
    </div>
  );
}
