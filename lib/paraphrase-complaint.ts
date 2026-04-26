// lib/paraphrase-complaint.ts

import { GoogleGenAI, Type } from "@google/genai";
import { PARAPHRASE_SYSTEM_PROMPT } from "./paraphrase-complaint-prompt";

export const TRADE_CATEGORIES = [
  "restoration", "plumbing", "roofing", "pest", "electrical",
  "hvac", "general_contractor", "food_safety", "str_compliance",
  "business_compliance", "other",
] as const;

export const URGENCY_TIERS = ["emergency", "urgent", "standard", "non_urgent"] as const;

export type TradeCategory = (typeof TRADE_CATEGORIES)[number];
export type UrgencyTier = (typeof URGENCY_TIERS)[number];

export interface ParaphraseInput {
  sr_short_code: string;
  sr_type?: string | null;
  description?: string | null;
  complainant_type?: string | null;
  unit_number?: string | null;
  danger_reported?: boolean | string | null;
  owner_notified?: boolean | string | null;
  owner_occupied?: boolean | string | null;
  concern_category?: string | null;
  restaurant_name?: string | null;
  business_name?: string | null;
  problem_category?: string | null;
}

export interface ParaphraseOutput {
  standard_description: string;
  trade_category: TradeCategory;
  urgency_tier: UrgencyTier;
}

let _client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!_client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
}

/**
 * Best-effort paraphrase. Returns null on any failure — callers MUST handle null
 * by leaving paraphrase columns NULL and continuing. Never throws.
 */
export async function paraphraseComplaint(
  input: ParaphraseInput
): Promise<ParaphraseOutput | null> {
  // Strip null/undefined/empty-string fields to keep the user payload lean.
  // Keep boolean false (e.g. danger_reported=false is meaningful).
  const compact: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === null || v === undefined || v === "") continue;
    compact[k] = v;
  }

  if (!compact.sr_short_code) return null;

  try {
    const response = await getClient().models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: JSON.stringify(compact),
      config: {
        systemInstruction: PARAPHRASE_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            standard_description: { type: Type.STRING },
            trade_category: { type: Type.STRING, enum: [...TRADE_CATEGORIES] },
            urgency_tier: { type: Type.STRING, enum: [...URGENCY_TIERS] },
          },
          required: ["standard_description", "trade_category", "urgency_tier"],
          propertyOrdering: ["standard_description", "trade_category", "urgency_tier"],
        },
        temperature: 0.2,
        maxOutputTokens: 200,
      },
    });

    const raw = response.text;
    if (!raw) return null;

    const parsed = JSON.parse(raw) as ParaphraseOutput;

    // Defense in depth: schema enforcement should make these unreachable,
    // but if Gemini ever hallucinates an out-of-enum value, snap to a safe default.
    if (!TRADE_CATEGORIES.includes(parsed.trade_category)) {
      parsed.trade_category = "other";
    }
    if (!URGENCY_TIERS.includes(parsed.urgency_tier)) {
      parsed.urgency_tier = "standard";
    }
    if (!parsed.standard_description || parsed.standard_description.length > 200) {
      return null;
    }

    return parsed;
  } catch (err) {
    console.error("[paraphraseComplaint] Gemini call failed:", err);
    return null;
  }
}