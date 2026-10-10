"use client";
// A journey between two places: home to the first city, city to city, or back home.
import type { ChangeEvent } from "react";
import type { TransferLine } from "@/lib/recalculate";
import { setTransferCost } from "@/lib/tripEdits";
import { describeTransfer } from "@/lib/words";
import type { Trip } from "@/lib/types";

interface Props {
  line: TransferLine;
  trip: Trip;
  onTripChange: (trip: Trip) => void;
}

export default function TransferRow({ line, trip, onTripChange }: Props) {
  function handleCost(event: ChangeEvent<HTMLInputElement>) {
    const value = Number(event.target.value);
    if (!Number.isNaN(value)) {
      onTripChange(setTransferCost(trip, line.key, value));
    }
  }

  return (
    <div className="transfer">
      <p className="transfer-route">
        {line.fromName} to {line.toName}
      </p>
      <p className="transfer-detail">{describeTransfer(line.estimate)}</p>
      <label className="field field-money">
        <span>{trip.currency} per person, one way</span>
        <input type="number" min={0} step={5} value={line.costPerPerson} onChange={handleCost} aria-label={"Ticket price from " + line.fromName + " to " + line.toName} />
      </label>
    </div>
  );
}
