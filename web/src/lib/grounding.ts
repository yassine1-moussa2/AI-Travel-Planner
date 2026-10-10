// The guarantee of the whole project: the AI can only use venues we gave it.
// Anything else it returns is dropped here, before the traveller ever sees it.
import { newUid } from "./tripEdits";
import type { Day } from "./types";
import type { AiLeg } from "./schema";

export interface GroundedDays {
  days: Day[];
  droppedStops: number;
}

function roundToFive(value: number): number {
  return Math.round(value / 5) * 5;
}

export function groundDays(aiDays: AiLeg["days"], validIds: Record<string, boolean>, dayCount: number): GroundedDays {
  const usedIds: Record<string, boolean> = {};
  const days: Day[] = [];
  let droppedStops = 0;

  for (let dayIndex = 0; dayIndex < dayCount; dayIndex++) {
    // The AI may return too few days; missing ones become free days the traveller can fill.
    if (dayIndex >= aiDays.length) {
      days.push({ title: "A free day", stops: [] });
      continue;
    }

    const aiDay = aiDays[dayIndex];
    const day: Day = { title: aiDay.title.trim(), stops: [] };
    if (day.title === "") {
      day.title = "Day " + (dayIndex + 1);
    }

    for (const aiStop of aiDay.stops) {
      // Unknown id = invented place. Repeated id = same venue twice. Both are dropped.
      if (!validIds[aiStop.placeId] || usedIds[aiStop.placeId]) {
        droppedStops = droppedStops + 1;
        continue;
      }
      usedIds[aiStop.placeId] = true;

      const minutes = Math.min(Math.max(roundToFive(aiStop.durationMinutes), 15), 360);
      const cost = Math.max(0, Math.round(aiStop.costPerPerson));
      day.stops.push({ uid: newUid(), placeId: aiStop.placeId, durationMinutes: minutes, costPerPerson: cost, note: aiStop.note.trim() });
    }
    days.push(day);
  }

  return { days, droppedStops };
}
