"use client";
// One day of the trip, laid out as a timeline. Times are recalculated on every render.
import type { ChangeEvent, ReactNode } from "react";
import { isLongHop } from "@/lib/discovery";
import { scheduleDay } from "@/lib/recalculate";
import { addStop } from "@/lib/tripEdits";
import { describeHop } from "@/lib/words";
import type { Place, Trip } from "@/lib/types";
import { findPlace, placeOptionGroups } from "./placeOptions";
import StopRow from "./StopRow";

interface Props {
  trip: Trip;
  legIndex: number;
  dayIndex: number;
  date: string;
  dayLabels: string[];
  index: Record<string, Place>;
  freePlaces: Place[];
  shownOnMap: boolean;
  onShowOnMap: (dayIndex: number) => void;
  onTripChange: (trip: Trip) => void;
}

export default function DayPlan(props: Props) {
  const { trip, legIndex, dayIndex, onTripChange } = props;
  const plan = trip.legs[legIndex].plan;
  if (plan === null) {
    return null;
  }
  const day = plan.days[dayIndex];
  const schedule = scheduleDay(day, props.index, trip.preferences.pace);

  function handleAdd(event: ChangeEvent<HTMLSelectElement>) {
    const place = findPlace(props.freePlaces, event.target.value);
    if (place !== null) {
      onTripChange(addStop(trip, legIndex, dayIndex, place));
    }
  }

  // Each stop is preceded by how long it takes to get there from the previous one.
  const items: ReactNode[] = [];
  for (let stopIndex = 0; stopIndex < schedule.stops.length; stopIndex++) {
    const scheduled = schedule.stops[stopIndex];
    if (scheduled.hopBefore !== null) {
      items.push(
        <li key={scheduled.stop.uid + "-hop"} className={"hop hop-" + scheduled.hopBefore.mode}>
          {describeHop(scheduled.hopBefore)}
        </li>,
      );
      // A far stop is worth it, but the traveller should know before they go.
      if (isLongHop(scheduled.hopBefore)) {
        items.push(
          <li key={scheduled.stop.uid + "-long"} className="hop-notice">
            Long trip across town: about {scheduled.hopBefore.minutes} min each way.
          </li>,
        );
      }
    }
    items.push(
      <StopRow
        key={scheduled.stop.uid}
        scheduled={scheduled}
        trip={trip}
        legIndex={legIndex}
        dayIndex={dayIndex}
        stopIndex={stopIndex}
        stopCount={schedule.stops.length}
        dayLabels={props.dayLabels}
        freePlaces={props.freePlaces}
        onTripChange={onTripChange}
      />,
    );
  }

  const notices: ReactNode[] = [];
  if (schedule.missingLunch) {
    notices.push(<p key="lunch" className="notice">No lunch yet. Add a meal around midday, or move one earlier.</p>);
  }
  if (schedule.endsLate) {
    notices.push(<p key="late" className="notice">This day runs past 22:00. Shorten a visit or move one to another day.</p>);
  }

  let empty: ReactNode = null;
  if (day.stops.length === 0) {
    empty = <p className="day-empty">Nothing planned. Keep it free, or add a place below.</p>;
  }

  return (
    <article className="day">
      <header className="day-header">
        <div className="day-header-top">
          <h3>
            {props.dayLabels[dayIndex]}
            <span className="day-date">{props.date}</span>
          </h3>
          <button type="button" className="map-button" aria-pressed={props.shownOnMap} onClick={() => props.onShowOnMap(dayIndex)}>
            Show on map
          </button>
        </div>
        <p className="day-title">{day.title}</p>
      </header>

      {empty}
      <ol className="timeline">{items}</ol>
      {notices}

      <label className="field add-stop">
        <span>Add a place to this day</span>
        <select value="" onChange={handleAdd} disabled={props.freePlaces.length === 0}>
          <option value="" disabled>Choose from what we found…</option>
          {placeOptionGroups(props.freePlaces)}
        </select>
      </label>
    </article>
  );
}
