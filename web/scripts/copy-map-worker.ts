// Copies MapLibre's web worker into public/ so the browser can load it from our own site.
// The worker imports its sibling "maplibre-gl-shared.mjs", and the bundler would ship the worker
// without that sibling, so both files are copied side by side. Runs before every dev and build,
// so the copy always matches the installed maplibre-gl version.
//
// Usage:  runs automatically via "predev" and "prebuild"
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];
const source = path.join("node_modules", "maplibre-gl", "dist");
const target = path.join("public", "maplibre");

mkdirSync(target, { recursive: true });
for (const file of FILES) {
  copyFileSync(path.join(source, file), path.join(target, file));
}
console.log("Copied the map worker to " + target);
