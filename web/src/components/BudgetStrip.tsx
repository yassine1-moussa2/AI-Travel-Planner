"use client";
// The running total, pinned to the bottom of the screen like a luggage tag.
import type { Budget } from "@/lib/recalculate";
import { formatMoney } from "@/lib/words";
import type { Trip } from "@/lib/types";

interface Props {
  trip: Trip;
  budget: Budget;
}

export default function BudgetStrip({ trip, budget }: Props) {
  const currency = trip.currency;
  const over = budget.remaining < 0;

  // How full the gauge is, capped at 100% so an over-budget trip doesn't overflow.
  let fillPercent = 100;
  if (trip.budget > 0) {
    fillPercent = Math.min(100, Math.round((budget.total / trip.budget) * 100));
  }

  let verdict = formatMoney(budget.remaining, currency) + " left to play with";
  if (over) {
    verdict = formatMoney(-budget.remaining, currency) + " over. Most of it goes on " + budget.biggestLabel + ".";
  }

  let stripClass = "budget";
  if (over) {
    stripClass = "budget budget-over";
  }

  let perPerson = "";
  if (trip.travelers > 1) {
    perPerson = "That's " + formatMoney(budget.perPerson, currency) + " each.";
  }

  return (
    <aside className={stripClass} aria-live="polite">
      <details>
        <summary>
          <span className="budget-total">
            {formatMoney(budget.total, currency)} <span className="budget-of">of {formatMoney(trip.budget, currency)}</span>
          </span>
          <span className="budget-gauge" aria-hidden="true">
            <span className="budget-fill" style={{ width: fillPercent + "%" }} />
          </span>
          <span className="budget-verdict">{verdict}</span>
        </summary>
        <dl className="budget-breakdown">
          <div><dt>Where you sleep</dt><dd>{formatMoney(budget.stays, currency)}</dd></div>
          <div><dt>Meals and visits</dt><dd>{formatMoney(budget.visitsAndFood, currency)}</dd></div>
          <div><dt>Metro and buses</dt><dd>{formatMoney(budget.localTransport, currency)}</dd></div>
          <div><dt>Getting between places</dt><dd>{formatMoney(budget.transfers, currency)}</dd></div>
        </dl>
        <p className="budget-note">{perPerson} Every figure is an estimate you can change on the plan.</p>
      </details>
    </aside>
  );
}
