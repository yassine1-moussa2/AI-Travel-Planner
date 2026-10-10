"use client";
// One visit in a day: its times, what it costs, and every way to change it.
import type { ChangeEvent, ReactNode } from "react";
import type { ScheduledStop } from "@/lib/recalculate";
import { formatClock } from "@/lib/recalculate";
import { moveStop, moveStopToDay, removeStop, swapStop, updateStopNumber } from "@/lib/tripEdits";
import { CATEGORY_WORDS } from "@/lib/words";
import type { Place, Trip } from "@/lib/types";
import { findPlace, placeOptionGroups } from "./placeOptions";

interface Props {
  scheduled: ScheduledStop;
  trip: Trip;
  legIndex: number;
  dayIndex: number;
  stopIndex: number;
  stopCount: number;
  dayLabels: string[];
  freePlaces: Place[];
  onTripChange: (trip: Trip) => void;
}

export default function StopRow(props: Props) {
  const { scheduled, trip, legIndex, dayIndex, stopIndex, onTripChange } = props;
  const stop = scheduled.stop;

  let name = "A place that is no longer listed";
  let kind = "";
  if (scheduled.place !== null) {
    name = scheduled.place.name;
    kind = CATEGORY_WORDS[scheduled.place.category];
  }

  function handleNumber(field: "durationMinutes" | "costPerPerson", event: ChangeEvent<HTMLInputElement>) {
    const value = Number(event.target.value);
    if (Number.isNaN(value)) {
      return;
    }
    onTripChange(updateStopNumber(trip, legIndex, dayIndex, stopIndex, field, value));
  }

  function handleMoveToDay(event: ChangeEvent<HTMLSelectElement>) {
    const targetDay = Number(event.target.value);
    onTripChange(moveStopToDay(trip, legIndex, dayIndex, stopIndex, targetDay));
  }

  function handleSwap(event: ChangeEvent<HTMLSelectElement>) {
    const place = findPlace(props.freePlaces, event.target.value);
    if (place !== null) {
      onTripChange(swapStop(trip, legIndex, dayIndex, stopIndex, place));
    }
  }

  // "Move to another day" only lists the other days.
  const dayOptions: ReactNode[] = [];
  for (let otherDay = 0; otherDay < props.dayLabels.length; otherDay++) {
    if (otherDay !== dayIndex) {
      dayOptions.push(<option key={otherDay} value={otherDay}>{props.dayLabels[otherDay]}</option>);
    }
  }

  let note: ReactNode = null;
  if (stop.note !== "") {
    note = <p className="stop-note">{stop.note}</p>;
  }

  return (
    <li className="stop">
      <div className="stop-time">
        <span className="stop-start">{formatClock(scheduled.startMinutes)}</span>
        <span className="stop-end">until {formatClock(scheduled.endMinutes)}</span>
      </div>

      <div className="stop-body">
        <h4 className="stop-name">{name}</h4>
        <span className="stop-kind">{kind}</span>
        {note}
        <div className="stop-numbers">
          <label>
            <input type="number" min={10} max={600} step={5} value={stop.durationMinutes} onChange={(event) => handleNumber("durationMinutes", event)} aria-label={"Minutes at " + name} />
            <span>min there</span>
          </label>
          <label>
            <input type="number" min={0} step={1} value={stop.costPerPerson} onChange={(event) => handleNumber("costPerPerson", event)} aria-label={"Cost per person at " + name} />
            <span>{trip.currency} each</span>
          </label>
        </div>
      </div>

      <details className="stop-menu">
        <summary>Change</summary>
        <div className="stop-menu-panel">
          <div className="stop-menu-row">
            <button type="button" disabled={stopIndex === 0} onClick={() => onTripChange(moveStop(trip, legIndex, dayIndex, stopIndex, -1))}>Earlier</button>
            <button type="button" disabled={stopIndex === props.stopCount - 1} onClick={() => onTripChange(moveStop(trip, legIndex, dayIndex, stopIndex, 1))}>Later</button>
            <button type="button" className="danger" onClick={() => onTripChange(removeStop(trip, legIndex, dayIndex, stopIndex))}>Remove</button>
          </div>
          <label className="field">
            <span>Swap for another place</span>
            <select value="" onChange={handleSwap}>
              <option value="" disabled>Choose…</option>
              {placeOptionGroups(props.freePlaces)}
            </select>
          </label>
          <label className="field">
            <span>Move to another day</span>
            <select value="" onChange={handleMoveToDay} disabled={dayOptions.length === 0}>
              <option value="" disabled>Choose…</option>
              {dayOptions}
            </select>
          </label>
        </div>
      </details>
    </li>
  );
}
