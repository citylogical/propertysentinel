// app/api/complaints/paraphrase/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { paraphraseComplaint, type ParaphraseInput } from "@/lib/paraphrase-complaint";

export const runtime = "nodejs";
export const maxDuration = 30;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin check via subscribers.role — NOT Clerk publicMetadata
  const { data: sub, error: subErr } = await supabase
    .from("subscribers")
    .select("role")
    .eq("clerk_id", userId)
    .single();

  if (subErr || sub?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { sr_number?: string } & ParaphraseInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { sr_number, ...input } = body;

  if (!input.sr_short_code) {
    return NextResponse.json({ error: "sr_short_code is required" }, { status: 400 });
  }

  const result = await paraphraseComplaint(input);

  if (!result) {
    return NextResponse.json({ error: "Paraphrase failed" }, { status: 502 });
  }

  // If sr_number provided, persist back to DB. Persistence failure does NOT
  // fail the request — admin still gets the result for immediate display.
  if (sr_number) {
    const { error: updateErr } = await supabase
      .from("complaints_311")
      .update({
        standard_description: result.standard_description,
        trade_category: result.trade_category,
        urgency_tier: result.urgency_tier,
        paraphrased_at: new Date().toISOString(),
      })
      .eq("sr_number", sr_number);

    if (updateErr) {
      console.error("[paraphrase route] DB update failed:", updateErr);
    }
  }

  return NextResponse.json(result);
}