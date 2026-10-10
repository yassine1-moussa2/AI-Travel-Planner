"use client";
// The whole page: holds the trip, saves it in this browser, and asks the server to plan cities.
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { buildTransfers, computeBudget, dailyBudgetPerPerson, legStartOffsets } from "@/lib/recalculate";
import type { TransferLine } from "@/lib/recalculate";
import { clearTrip, defaultTrip, legKey, loadTrip, saveTrip } from "@/lib/storage";
import type { LegPlan, LegRequest, Point, Trip } from "@/lib/types";
import BudgetStrip from "./BudgetStrip";
import HolidayPrefs from "./HolidayPrefs";
import LegSheet from "./LegSheet";
import TransferRow from "./TransferRow";
import TripSentence from "./TripSentence";

interface PlanReply {
  plan?: LegPlan;
  error?: string;
}

// Ask the server to plan one destination. Always resolves: either a plan or a message.
async function requestLegPlan(body: LegRequest): Promise<PlanReply> {
  try {
    const response = await fetch("/api/plan-leg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as PlanReply;
    if (!response.ok && data.error === undefined) {
      return { error: "The planner answered with an error (" + response.status + ")." };
    }
    return data;
  } catch {
    return { error: "We couldn't reach the planner. Check that npm run dev is still running." };
  }
}

async function requestOrigin(text: string): Promise<Point | null> {
  try {
    const response = await fetch("/api/geocode?q=" + encodeURIComponent(text));
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { point: Point };
    return data.point;
  } catch {
    return null;
  }
}

export default function Planner() {
  const [trip, setTrip] = useState<Trip>(defaultTrip);
  const [restored, setRestored] = useState(false);
  const [message, setMessage] = useState("");
  const [planning, setPlanning] = useState(false);

  // Restore the last trip from this browser once, after the page has loaded.
  useEffect(() => {
    const saved = loadTrip();
    if (saved !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading localStorage is only possible after mount
      setTrip(saved);
    }
    setRestored(true);
  }, []);

  // Save after every change (but not before the saved trip was restored, or we'd overwrite it).
  useEffect(() => {
    if (restored) {
      saveTrip(trip);
    }
  }, [trip, restored]);

  function updateLeg(legIndex: number, edit: (copy: Trip) => void) {
    setTrip(function (previous) {
      if (legIndex >= previous.legs.length) {
        return previous;
      }
      const copy = structuredClone(previous);
      edit(copy);
      return copy;
    });
  }

  async function planLegAt(legIndex: number, snapshot: Trip) {
    const leg = snapshot.legs[legIndex];
    const plannedFor = legKey(leg.city, leg.nights);

    updateLeg(legIndex, function (copy) {
      copy.legs[legIndex].status = "loading";
      copy.legs[legIndex].error = "";
    });

    const reply = await requestLegPlan({
      city: leg.city.trim(),
      nights: leg.nights,
      travelers: snapshot.travelers,
      currency: snapshot.currency,
      dailyBudgetPerPerson: dailyBudgetPerPerson(snapshot),
      preferences: snapshot.preferences,
    });

    updateLeg(legIndex, function (copy) {
      const target = copy.legs[legIndex];
      if (reply.plan !== undefined) {
        target.plan = reply.plan;
        target.status = "ready";
        target.plannedFor = plannedFor;
      } else {
        target.status = "error";
        target.error = reply.error || "Something went wrong while planning.";
      }
    });
  }

  async function planWholeTrip() {
    for (const leg of trip.legs) {
      if (leg.city.trim() === "") {
        setMessage("Tell us where you're going first: every stop needs a city.");
        return;
      }
    }
    setMessage("");
    setPlanning(true);

    // The home city is only needed for travel estimates, so a miss isn't fatal.
    if (trip.origin.trim() !== "" && trip.originPoint === null) {
      const origin = await requestOrigin(trip.origin.trim());
      if (origin === null) {
        setMessage("We couldn't find " + trip.origin + ", so getting there isn't in the budget yet.");
      } else {
        setTrip(function (previous) {
          const copy = structuredClone(previous);
          copy.originPoint = origin;
          return copy;
        });
      }
    }

    // One destination at a time, to stay inside the free map service's rate limit.
    const snapshot = trip;
    for (let legIndex = 0; legIndex < snapshot.legs.length; legIndex++) {
      await planLegAt(legIndex, snapshot);
    }
    setPlanning(false);
  }

  async function replanOne(legIndex: number) {
    setPlanning(true);
    await planLegAt(legIndex, trip);
    setPlanning(false);
  }

  function startOver() {
    clearTrip();
    setTrip(defaultTrip());
    setMessage("");
  }

  function setPreferences(preferences: Trip["preferences"]) {
    const copy = structuredClone(trip);
    copy.preferences = preferences;
    setTrip(copy);
  }

  // Index the journeys by key so each can be drawn between the right destinations.
  const transfers: Record<string, TransferLine> = {};
  for (const line of buildTransfers(trip)) {
    transfers[line.key] = line;
  }

  let anyPlan = false;
  for (const leg of trip.legs) {
    if (leg.plan !== null || leg.status !== "idle") {
      anyPlan = true;
    }
  }

  const offsets = legStartOffsets(trip);
  const sheets: ReactNode[] = [];
  for (let legIndex = 0; legIndex < trip.legs.length; legIndex++) {
    let arrivalKey = "leg-" + (legIndex - 1);
    if (legIndex === 0) {
      arrivalKey = "out";
    }
    if (arrivalKey in transfers) {
      sheets.push(<TransferRow key={"t-" + arrivalKey} line={transfers[arrivalKey]} trip={trip} onTripChange={setTrip} />);
    }
    sheets.push(<LegSheet key={"leg-" + legIndex} trip={trip} legIndex={legIndex} startOffset={offsets[legIndex]} onTripChange={setTrip} onReplan={replanOne} />);
  }
  if ("home" in transfers) {
    sheets.push(<TransferRow key="t-home" line={transfers.home} trip={trip} onTripChange={setTrip} />);
  }

  let buttonText = "Plan our trip";
  if (planning) {
    buttonText = "Planning…";
  }

  return (
    <main>
      <header className="hero">
        <div className="hero-inner">
          <p className="wordmark">Terrasse</p>
          <h1>Where to next?</h1>
          <TripSentence trip={trip} onChange={setTrip} />
        </div>
      </header>

      <HolidayPrefs preferences={trip.preferences} onChange={setPreferences} />

      <div className="plan-action">
        <button type="button" className="primary-button" onClick={planWholeTrip} disabled={planning}>
          {buttonText}
        </button>
        <button type="button" className="text-button" onClick={startOver} disabled={planning}>
          Start over
        </button>
        {message !== "" && <p className="plan-message" role="status">{message}</p>}
      </div>

      {anyPlan && <div className="plan">{sheets}</div>}
      {anyPlan && <BudgetStrip trip={trip} budget={computeBudget(trip)} />}

      <footer className="footer">
        <p>
          Runs on your own computer. Places from{" "}
          <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>, found with{" "}
          <a href="https://www.geoapify.com/">Geoapify</a>. Days drafted by Google Gemini, then checked against real places.
          Fame scores from <a href="https://www.wikidata.org/">Wikidata</a> (CC0).
        </p>
      </footer>
    </main>
  );
}
