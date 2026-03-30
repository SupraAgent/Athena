import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ personas: [], source: "none" });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createSupabaseAdmin();
    if (!admin) {
      return NextResponse.json({ personas: [], source: "none" });
    }

    const { data: rows, error } = await admin
      .from("personas")
      .select("*")
      .eq("created_by", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[api/personas] GET error:", error);
      return NextResponse.json({ personas: [], source: "error" });
    }

    return NextResponse.json({ personas: rows ?? [], source: "supabase" });
  } catch (err) {
    console.error("[api/personas] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createSupabaseAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Admin client not configured" }, { status: 503 });
    }

    const body = await request.json();

    if (!body.name || !body.system_prompt) {
      return NextResponse.json({ error: "name and system_prompt are required" }, { status: 400 });
    }

    const { data: row, error } = await admin
      .from("personas")
      .insert({
        name: body.name,
        role: body.role || "",
        system_prompt: body.system_prompt,
        capabilities: body.capabilities || [],
        output_format: body.output_format || "structured_report",
        review_focus: body.review_focus || ["general"],
        scoring_weights: body.scoring_weights || null,
        icon: body.icon || null,
        created_by: user.id,
        heartbeat_minutes: body.heartbeat_minutes ?? 60,
        monthly_budget_usd: body.monthly_budget_usd ?? 50,
        reports_to: body.reports_to || null,
        triggers: body.triggers || [],
      })
      .select()
      .single();

    if (error) {
      console.error("[api/personas] POST error:", error);
      return NextResponse.json({ error: "Failed to create persona" }, { status: 500 });
    }

    return NextResponse.json({ persona: row, source: "supabase" });
  } catch (err) {
    console.error("[api/personas] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
