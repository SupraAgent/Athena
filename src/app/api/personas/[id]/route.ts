import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Authenticate the user
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: "Not configured" }, { status: 503 });
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createSupabaseAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Not configured" }, { status: 503 });
    }

    // Only return personas owned by the authenticated user
    const { data: row, error } = await admin
      .from("personas")
      .select("*")
      .eq("id", id)
      .eq("created_by", user.id)
      .single();

    if (error || !row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ persona: row });
  } catch (err) {
    console.error("[api/personas/[id]] GET error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: "Not configured" }, { status: 503 });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createSupabaseAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Admin not configured" }, { status: 503 });
    }

    const body = await request.json();

    const { data: row, error } = await admin
      .from("personas")
      .update({
        name: body.name,
        role: body.role,
        system_prompt: body.system_prompt,
        capabilities: body.capabilities,
        output_format: body.output_format,
        review_focus: body.review_focus,
        scoring_weights: body.scoring_weights,
        icon: body.icon,
        heartbeat_minutes: body.heartbeat_minutes ?? 60,
        monthly_budget_usd: body.monthly_budget_usd ?? 50,
        reports_to: body.reports_to || null,
        triggers: body.triggers || [],
      })
      .eq("id", id)
      .eq("created_by", user.id)
      .select()
      .single();

    if (error) {
      console.error("[api/personas/[id]] PUT error:", error);
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    return NextResponse.json({ persona: row });
  } catch (err) {
    console.error("[api/personas/[id]] PUT error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: "Not configured" }, { status: 503 });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createSupabaseAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Admin not configured" }, { status: 503 });
    }

    const { error } = await admin
      .from("personas")
      .delete()
      .eq("id", id)
      .eq("created_by", user.id);

    if (error) {
      console.error("[api/personas/[id]] DELETE error:", error);
      return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api/personas/[id]] DELETE error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
