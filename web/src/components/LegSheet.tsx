"use client";
// One destination of the trip: where you sleep, each day, and local tips.
import type { ChangeEvent, ReactNode } from "react";
import { formatDayDate, placesById } from "@/lib/recalculate";
import { legKey } from "@/lib/storage";
import { setLegNumber, setStay, unusedPlaces } from "@/lib/tripEdits";
import type { Trip } from "@/lib/types";
import DayPlan from "./DayPlan";

interface Props {
  trip: Trip;
  legIndex: number;
  startOffset: number;
  onTripChange: (trip: Trip) => void;
  onReplan: (legIndex: number) => void;
}

export default function LegSheet(props: Props) {
  const { trip, legIndex, startOffset, onTripChange, onReplan } = props;
  const leg = trip.legs[legIndex];
  const plan = leg.plan;

  let title = leg.city;
  if (plan !== null) {
    title = plan.cityName;
  }
  if (title.trim() === "") {
    title = "Destination " + (legIndex + 1);
  }

  let dates = "";
  if (trip.startDate !== "") {
    dates = formatDayDate(trip.startDate, startOffset) + " to " + formatDayDate(trip.startDate, startOffset + leg.nights);
  }

  // What to show above the days, depending on where this destination is in its life.
  let status: ReactNode = null;
  if (leg.status === "loading") {
    status = <p className="leg-status leg-loading">Looking for the good spots in {leg.city}…</p>;
  } else if (leg.status === "error") {
    status = (
      <div className="leg-status leg-error" role="alert">
        <p>{leg.error}</p>
        <button type="button" className="secondary-button" onClick={() => onReplan(legIndex)}>Try {leg.city} again</button>
      </div>
    );
  } else if (plan !== null && leg.plannedFor !== legKey(leg.city, leg.nights)) {
    status = (
      <div className="leg-status leg-changed">
        <p>You changed this destination since it was planned, so the days below are from the old plan.</p>
        <button type="button" className="secondary-button" onClick={() => onReplan(legIndex)}>Re-plan {leg.city}</button>
      </div>
    );
  }

  if (plan === null) {
    return (
      <section className="leg">
        <header className="leg-header">
          <h2>{title}</h2>
          <p className="leg-dates">{dates}</p>
        </header>
        {status}
      </section>
    );
  }

  const index = placesById(plan);
  const freePlaces = unusedPlaces(plan);

  function handleStay(event: ChangeEvent<HTMLSelectElement>) {
    onTripChange(setStay(trip, legIndex, event.target.value));
  }

  function handleLegNumber(field: "nightlyPricePerRoom" | "localTransportPerPersonPerDay", event: ChangeEvent<HTMLInputElement>) {
    const value = Number(event.target.value);
    if (!Number.isNaN(value)) {
      onTripChange(setLegNumber(trip, legIndex, field, value));
    }
  }

  const stayOptions: ReactNode[] = [];
  for (const stay of plan.stays) {
    stayOptions.push(<option key={stay.id} value={stay.id}>{stay.name}</option>);
  }

  // Days are numbered across the whole trip, so Porto might start at "Day 4".
  const dayLabels: string[] = [];
  for (let dayIndex = 0; dayIndex < plan.days.length; dayIndex++) {
    dayLabels.push("Day " + (startOffset + dayIndex + 1));
  }

  const days: ReactNode[] = [];
  for (let dayIndex = 0; dayIndex < plan.days.length; dayIndex++) {
    days.push(
      <DayPlan
        key={dayIndex}
        trip={trip}
        legIndex={legIndex}
        dayIndex={dayIndex}
        date={formatDayDate(trip.startDate, startOffset + dayIndex)}
        dayLabels={dayLabels}
        index={index}
        freePlaces={freePlaces}
        onTripChange={onTripChange}
      />,
    );
  }

  const tips: ReactNode[] = [];
  for (let tipIndex = 0; tipIndex < plan.tips.length; tipIndex++) {
    tips.push(<li key={tipIndex}>{plan.tips[tipIndex]}</li>);
  }

  let stayPicker: ReactNode = <p className="stay-none">We couldn&apos;t find places to stay nearby. Add your own nightly price below.</p>;
  if (plan.stays.length > 0) {
    stayPicker = (
      <label className="field">
        <span>Sleeping at</span>
        <select value={plan.stayPlaceId} onChange={handleStay}>{stayOptions}</select>
      </label>
    );
  }

  return (
    <section className="leg">
      <header className="leg-header">
        <h2>{title}</h2>
        <p className="leg-dates">{dates}</p>
      </header>
      {status}

      <div className="stay">
        {stayPicker}
        <label className="field field-money">
          <span>Per room, per night</span>
          <input type="number" min={0} step={5} value={plan.nightlyPricePerRoom} onChange={(event) => handleLegNumber("nightlyPricePerRoom", event)} />
        </label>
        <label className="field field-money">
          <span>Metro and buses, per person per day</span>
          <input type="number" min={0} step={1} value={plan.localTransportPerPersonPerDay} onChange={(event) => handleLegNumber("localTransportPerPersonPerDay", event)} />
        </label>
        <p className="estimate-hint">These prices are our estimates. If you have a real quote, type it in and everything updates.</p>
      </div>

      {days}

      {tips.length > 0 && (
        <aside className="tips">
          <h3>Good to know in {plan.cityName}</h3>
          <ul>{tips}</ul>
        </aside>
      )}
    </section>
  );
}
