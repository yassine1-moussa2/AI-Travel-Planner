"use client";
// What makes it a holiday for this traveller: interests, where to sleep, what to eat, pace.
import type { ChangeEvent, ReactNode } from "react";
import { HOBBIES, HOBBY_CHIPS } from "@/lib/hobbies";
import type { Hobby } from "@/lib/hobbies";
import { INTEREST_WORDS, PACE_WORDS, STYLE_WORDS, TRIP_STYLE_WORDS } from "@/lib/words";
import type { Interest, Pace, Preferences, StayStyle, TripStyle } from "@/lib/types";

interface Props {
  preferences: Preferences;
  onChange: (preferences: Preferences) => void;
}

const ALL_INTERESTS: Interest[] = ["history", "museums", "nature", "beaches", "nightlife", "shopping", "outlets"];
const ALL_STYLES: StayStyle[] = ["budget", "comfort", "treat"];
const ALL_PACES: Pace[] = ["slow", "balanced", "full"];
const ALL_TRIP_STYLES: TripStyle[] = ["classic", "balanced", "adventurous"];
const ABOUT_MAX = 300;

export default function HolidayPrefs({ preferences, onChange }: Props) {
  function change(edit: (copy: Preferences) => void) {
    const copy = structuredClone(preferences);
    edit(copy);
    onChange(copy);
  }

  // Add the interest if it's missing, remove it if it's there.
  function toggleInterest(interest: Interest) {
    change(function (copy) {
      const position = copy.interests.indexOf(interest);
      if (position === -1) {
        copy.interests.push(interest);
      } else {
        copy.interests.splice(position, 1);
      }
    });
  }

  // Same toggle as interests, for the group's hobbies.
  function toggleHobby(hobby: Hobby) {
    change(function (copy) {
      const position = copy.hobbies.indexOf(hobby);
      if (position === -1) {
        copy.hobbies.push(hobby);
      } else {
        copy.hobbies.splice(position, 1);
      }
    });
  }

  function handleAboutText(event: ChangeEvent<HTMLTextAreaElement>) {
    const value = event.target.value.slice(0, ABOUT_MAX);
    change(function (copy) {
      copy.aboutText = value;
    });
  }

  function handleStepFree(event: ChangeEvent<HTMLInputElement>) {
    const checked = event.target.checked;
    change(function (copy) {
      copy.stepFree = checked;
    });
  }

  function handleText(field: "stayArea" | "food" | "mustSee", event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    change(function (copy) {
      copy[field] = value;
    });
  }

  const interestChips: ReactNode[] = [];
  for (const interest of ALL_INTERESTS) {
    const chosen = preferences.interests.includes(interest);
    interestChips.push(
      <button type="button" key={interest} className="chip" aria-pressed={chosen} onClick={() => toggleInterest(interest)}>
        {INTEREST_WORDS[interest]}
      </button>,
    );
  }

  const styleChoices: ReactNode[] = [];
  for (const style of ALL_STYLES) {
    styleChoices.push(
      <label key={style} className="choice">
        <input type="radio" name="stay-style" checked={preferences.stayStyle === style} onChange={() => change((copy) => { copy.stayStyle = style; })} />
        <span>{STYLE_WORDS[style]}</span>
      </label>,
    );
  }

  const paceChoices: ReactNode[] = [];
  for (const pace of ALL_PACES) {
    paceChoices.push(
      <label key={pace} className="choice">
        <input type="radio" name="pace" checked={preferences.pace === pace} onChange={() => change((copy) => { copy.pace = pace; })} />
        <span>{PACE_WORDS[pace]}</span>
      </label>,
    );
  }

  const hobbyChips: ReactNode[] = [];
  for (const hobby of HOBBY_CHIPS) {
    const chosen = preferences.hobbies.includes(hobby);
    hobbyChips.push(
      <button type="button" key={hobby} className="chip" aria-pressed={chosen} onClick={() => toggleHobby(hobby)}>
        {HOBBIES[hobby].label}
      </button>,
    );
  }

  const tripStyleChoices: ReactNode[] = [];
  for (const tripStyle of ALL_TRIP_STYLES) {
    const words = TRIP_STYLE_WORDS[tripStyle];
    tripStyleChoices.push(
      <label key={tripStyle} className="choice choice-with-hint">
        <input type="radio" name="trip-style" checked={preferences.tripStyle === tripStyle} onChange={() => change((copy) => { copy.tripStyle = tripStyle; })} />
        <span>
          {words.label}
          <span className="choice-hint">{words.hint}</span>
        </span>
      </label>,
    );
  }

  return (
    <section className="prefs" aria-labelledby="prefs-title">
      <h2 id="prefs-title">What makes it a holiday for you?</h2>
      <div className="chips">{interestChips}</div>

      <div className="prefs-grid">
        <fieldset>
          <legend>Where you sleep</legend>
          <div className="choices">{styleChoices}</div>
          <label className="field">
            <span>Near a particular neighbourhood?</span>
            <input value={preferences.stayArea} placeholder="Alfama, by the old town, near the beach…" onChange={(event) => handleText("stayArea", event)} />
          </label>
        </fieldset>

        <fieldset>
          <legend>What you like to eat</legend>
          <label className="field">
            <span>Cuisines, diets, anything to avoid</span>
            <input value={preferences.food} placeholder="Grilled fish, vegetarian options, no fast food" onChange={(event) => handleText("food", event)} />
          </label>
          <label className="field">
            <span>Places you can&apos;t miss, separated by commas</span>
            <input value={preferences.mustSee} placeholder="Belém Tower, Time Out Market" onChange={(event) => handleText("mustSee", event)} />
          </label>
        </fieldset>

        <div>
          <fieldset>
            <legend>Your rhythm</legend>
            <div className="choices">{paceChoices}</div>
          </fieldset>
          <fieldset>
            <legend>Your style</legend>
            <div className="choices">{tripStyleChoices}</div>
          </fieldset>
        </div>
      </div>

      {/* About you: one trip can have several people, so it asks about the group. */}
      <div className="about-you">
        <h3>What does your group love?</h3>
        <div className="chips">{hobbyChips}</div>
        <label className="field about-text">
          <span>Anything else we should know?</span>
          <textarea
            value={preferences.aboutText}
            maxLength={ABOUT_MAX}
            rows={2}
            placeholder="I collect vinyl records, we love Art Deco, travelling with a 6-year-old"
            onChange={handleAboutText}
          />
          <span className="field-count">{preferences.aboutText.length} / {ABOUT_MAX}</span>
        </label>
        <label className="choice choice-with-hint">
          <input type="checkbox" checked={preferences.stepFree} onChange={handleStepFree} />
          <span>
            Step-free routes preferred
            <span className="choice-hint">Kept in this browser only.</span>
          </span>
        </label>
      </div>
    </section>
  );
}
