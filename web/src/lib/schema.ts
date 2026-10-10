// Contracts. Anything coming from the browser or from the AI is checked against these
// before the rest of the code is allowed to trust it.
import { z } from "zod";

const interestSchema = z.enum(["history", "museums", "nature", "beaches", "nightlife", "shopping", "outlets"]);

export const legRequestSchema = z.object({
  city: z.string().trim().min(2).max(80),
  nights: z.number().int().min(1).max(14),
  travelers: z.number().int().min(1).max(12),
  currency: z.enum(["EUR", "USD", "GBP", "MAD"]),
  dailyBudgetPerPerson: z.number().min(0).max(100000),
  preferences: z.object({
    interests: z.array(interestSchema).max(7),
    stayStyle: z.enum(["budget", "comfort", "treat"]),
    stayArea: z.string().max(80),
    food: z.string().max(200),
    mustSee: z.string().max(300),
    pace: z.enum(["slow", "balanced", "full"]),
    tripStyle: z.enum(["classic", "balanced", "adventurous"]).default("balanced"),
  }),
});

// The AI sometimes writes numbers as strings ("12"), so numbers are coerced.
const aiStopSchema = z.object({
  placeId: z.string(),
  durationMinutes: z.coerce.number(),
  costPerPerson: z.coerce.number(),
  note: z.string().default(""),
});

const aiDaySchema = z.object({
  title: z.string().default(""),
  stops: z.array(aiStopSchema).default([]),
});

export const aiLegSchema = z.object({
  days: z.array(aiDaySchema),
  stayPlaceId: z.string().default(""),
  nightlyPricePerRoom: z.coerce.number().default(0),
  localTransportPerPersonPerDay: z.coerce.number().default(0),
  tips: z.array(z.string()).default([]),
});

export type AiLeg = z.infer<typeof aiLegSchema>;
