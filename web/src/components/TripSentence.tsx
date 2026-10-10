"use client";
// The trip written as a sentence the traveller fills in, instead of a form panel.
import type { ChangeEvent, ReactNode } from "react";
import { emptyLeg } from "@/lib/storage";
import type { Currency, Trip } from "@/lib/types";

interface Props {
  trip: Trip;
  onChange: (trip: Trip) => void;
}

const CURRENCIES: Currency[] = ["EUR", "USD", "GBP", "MAD"];

function readNumber(text: string, fallback: number): number {
  const value = Number(text);
  if (Number.isNaN(value)) {
    return fallback;
  }
  return value;
}

function clamp(value: number, lowest: number, highest: number): number {
  return Math.min(Math.max(value, lowest), highest);
}

export default function TripSentence({ trip, onChange }: Props) {
  // Copy the trip, let the caller change the copy, then hand it back up.
  function change(edit: (copy: Trip) => void) {
    const copy = structuredClone(trip);
    edit(copy);
    onChange(copy);
  }

  // More travellers usually means more rooms: one room per two people by default.
  function handleTravelers(event: ChangeEvent<HTMLInputElement>) {
    const travelers = clamp(readNumber(event.target.value, trip.travelers), 1, 12);
    change(function (copy) {
      copy.travelers = travelers;
      copy.rooms = Math.ceil(travelers / 2);
    });
  }

  function handleRooms(event: ChangeEvent<HTMLInputElement>) {
    const rooms = clamp(readNumber(event.target.value, trip.rooms), 1, 12);
    change(function (copy) {
      copy.rooms = rooms;
    });
  }

  // A new home city means the old coordinates no longer apply.
  function handleOrigin(event: ChangeEvent<HTMLInputElement>) {
    const origin = event.target.value;
    change(function (copy) {
      copy.origin = origin;
      copy.originPoint = null;
    });
  }

  function handleDate(event: ChangeEvent<HTMLInputElement>) {
    const date = event.target.value;
    change(function (copy) {
      copy.startDate = date;
    });
  }

  function handleBudget(event: ChangeEvent<HTMLInputElement>) {
    const budget = Math.max(0, readNumber(event.target.value, trip.budget));
    change(function (copy) {
      copy.budget = budget;
    });
  }

  function handleCurrency(event: ChangeEvent<HTMLSelectElement>) {
    const currency = event.target.value as Currency;
    change(function (copy) {
      copy.currency = currency;
    });
  }

  function setLegCity(legIndex: number, city: string) {
    change(function (copy) {
      copy.legs[legIndex].city = city;
    });
  }

  function setLegNights(legIndex: number, text: string) {
    const nights = clamp(readNumber(text, 3), 1, 14);
    change(function (copy) {
      copy.legs[legIndex].nights = nights;
    });
  }

  function addLeg() {
    change(function (copy) {
      copy.legs.push(emptyLeg());
    });
  }

  // Removing a city changes every journey between cities, so custom transfer prices are reset.
  function removeLeg(legIndex: number) {
    change(function (copy) {
      copy.legs.splice(legIndex, 1);
      copy.transferOverrides = {};
    });
  }

  let travellerWord = "travellers";
  if (trip.travelers === 1) {
    travellerWord = "traveller";
  }
  let roomWord = "rooms";
  if (trip.rooms === 1) {
    roomWord = "room";
  }

  const currencyOptions: ReactNode[] = [];
  for (const code of CURRENCIES) {
    currencyOptions.push(<option key={code} value={code}>{code}</option>);
  }

  // The destination part of the sentence: "First X for N nights, then Y for M nights."
  const legPhrases: ReactNode[] = [];
  for (let legIndex = 0; legIndex < trip.legs.length; legIndex++) {
    const leg = trip.legs[legIndex];
    const position = legIndex + 1;

    let opener = "then";
    if (legIndex === 0) {
      opener = "First";
    }
    let ending = ". ";
    if (legIndex < trip.legs.length - 1) {
      ending = ", ";
    }

    let removeButton: ReactNode = null;
    if (trip.legs.length > 1) {
      removeButton = (
        <button type="button" className="text-button" onClick={() => removeLeg(legIndex)} aria-label={"Remove destination " + position}>
          remove
        </button>
      );
    }

    legPhrases.push(
      <span className="sentence-leg" key={legIndex}>
        {opener}{" "}
        <input
          className="blank blank-city"
          aria-label={"Destination " + position}
          placeholder="Lisbon"
          value={leg.city}
          onChange={(event) => setLegCity(legIndex, event.target.value)}
        />{" "}
        for{" "}
        <input
          className="blank blank-number"
          type="number"
          min={1}
          max={14}
          aria-label={"Nights in destination " + position}
          value={leg.nights}
          onChange={(event) => setLegNights(legIndex, event.target.value)}
        />{" "}
        nights{removeButton}{ending}
      </span>,
    );
  }

  return (
    <div className="sentence">
      <p>
        We are{" "}
        <input className="blank blank-number" type="number" min={1} max={12} aria-label="Number of travellers" value={trip.travelers} onChange={handleTravelers} />{" "}
        {travellerWord} in{" "}
        <input className="blank blank-number" type="number" min={1} max={12} aria-label="Number of rooms" value={trip.rooms} onChange={handleRooms} />{" "}
        {roomWord}, leaving from{" "}
        <input className="blank blank-city" aria-label="Home city" placeholder="Paris" value={trip.origin} onChange={handleOrigin} />{" "}
        on <input className="blank blank-date" type="date" aria-label="Departure date" value={trip.startDate} onChange={handleDate} />.
      </p>
      <p>
        {legPhrases}
        <button type="button" className="text-button add-leg" onClick={addLeg}>
          add another stop
        </button>
      </p>
      <p>
        We have about{" "}
        <input className="blank blank-money" type="number" min={0} step={50} aria-label="Total budget" value={trip.budget} onChange={handleBudget} />{" "}
        <select className="blank blank-currency" aria-label="Currency" value={trip.currency} onChange={handleCurrency}>
          {currencyOptions}
        </select>{" "}
        to spend, everything included.
      </p>
    </div>
  );
}
