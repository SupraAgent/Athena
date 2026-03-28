import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";

/**
 * Health check endpoint for Railway load balancer.
 * Returns 200 if the app is running and can reach Supabase.
 */
export async function GET() {
  const checks: Record<string, boolean> = {
    app: true,
    supabase: false,
  };

  // Check Supabase connectivity using the personas table (has migration)
  try {
    const admin = createSupabaseAdmin();
    if (admin) {
      const { error } = await admin.from("personas").select("id").limit(1);
      checks.supabase = !error;
    }
  } catch {
    checks.supabase = false;
  }

  const healthy = checks.app && checks.supabase;

  return NextResponse.json(
    {
      status: healthy ? "healthy" : "degraded",
      checks,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 }
  );
}
