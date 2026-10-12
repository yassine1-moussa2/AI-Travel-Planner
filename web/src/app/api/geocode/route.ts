// GET /api/geocode?q=Paris — finds the traveller's home city, used for flight estimates.
import { errorResponse } from "@/lib/server/debug";
import { geocode } from "@/lib/server/geoapify";
import { allowLookup } from "@/lib/server/rateLimit";

export async function GET(request: Request) {
  const limit = allowLookup(request, "geocode");
  if (!limit.ok) {
    return Response.json({ error: limit.message }, { status: 429 });
  }

  const query = new URL(request.url).searchParams.get("q");
  // Same bounds as a destination name, so nobody can send a page of text to the paid geocoder.
  if (query === null || query.trim().length < 2 || query.trim().length > 80) {
    return Response.json({ error: "Type a city to search for." }, { status: 400 });
  }

  try {
    const point = await geocode(query.trim(), null);
    if (point === null) {
      return Response.json({ error: "We couldn't find \"" + query.trim() + "\" on the map." }, { status: 404 });
    }
    return Response.json({ point });
  } catch (error) {
    return errorResponse("geocode", error);
  }
}
