// GET /api/geocode?q=Paris — finds the traveller's home city, used for flight estimates.
import { errorResponse } from "@/lib/server/debug";
import { geocode } from "@/lib/server/geoapify";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q");
  if (query === null || query.trim().length < 2) {
    return Response.json({ error: "Type a city to search for." }, { status: 400 });
  }

  try {
    const point = await geocode(query.trim(), null);
    if (point === null) {
      return Response.json({ error: "We couldn't find \"" + query + "\" on the map." }, { status: 404 });
    }
    return Response.json({ point });
  } catch (error) {
    return errorResponse("geocode", error);
  }
}
