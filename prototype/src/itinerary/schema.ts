import { z } from "zod";

/**
 * What we ask the LLM to return. Note `placeId` is a string, not a full
 * place — the model can only point at places we gave it, never invent one.
 * Unknown/invented ids are dropped in generateItinerary.ts, after this
 * schema has already validated the shape.
 */
export const rawItineraryItemSchema = z.object({
  placeId: z.string(),
  startTime: z.string().describe('24h time, e.g. "09:00"'),
  durationMin: z.number().int().positive(),
  note: z.string().describe("One sentence on why this fits here in the day"),
  estimatedCost: z.number().nonnegative(),
});

export const rawItineraryDaySchema = z.object({
  dayNumber: z.number().int().positive(),
  title: z.string().describe('Short theme for the day, e.g. "Old Town & Museums"'),
  items: z.array(rawItineraryItemSchema),
});

export const rawItinerarySchema = z.object({
  days: z.array(rawItineraryDaySchema),
  budgetBreakdown: z.object({
    accommodation: z.number().nonnegative(),
    food: z.number().nonnegative(),
    activities: z.number().nonnegative(),
    transport: z.number().nonnegative(),
    total: z.number().nonnegative(),
  }),
  tips: z.array(z.string()),
});

export type RawItinerary = z.infer<typeof rawItinerarySchema>;
