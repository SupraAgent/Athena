import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as fs from "fs/promises";
import * as path from "path";
import * as YAML from "yaml";

const HERMES_DIR = path.join(process.cwd(), ".athena", "hermes");
const TRACES_DIR = path.join(HERMES_DIR, "traces");

const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export async function GET(request: Request) {
  // Auth check
  const supabase = await createClient();
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  // Validate sessionId to prevent path traversal
  if (sessionId && !SAFE_ID_PATTERN.test(sessionId)) {
    return NextResponse.json({ error: "Invalid sessionId" }, { status: 400 });
  }

  try {
    // If sessionId provided, return specific trace
    if (sessionId) {
      const files = await fs.readdir(TRACES_DIR).catch(() => []);
      const match = files.find((f) => f.endsWith(`-${sessionId}.yaml`));
      if (!match) {
        return NextResponse.json({ error: "Trace not found" }, { status: 404 });
      }
      const raw = await fs.readFile(path.join(TRACES_DIR, match), "utf-8");
      const parsed = YAML.parse(raw);
      return NextResponse.json(parsed);
    }

    // List all traces
    const files = await fs.readdir(TRACES_DIR).catch(() => []);
    const traces = files
      .filter((f) => f.endsWith(".yaml"))
      .sort()
      .reverse()
      .slice(0, 50)
      .map((f) => {
        const parts = f.replace(".yaml", "").split("-");
        const date = parts.slice(0, 3).join("-");
        const sid = parts.slice(3).join("-");
        return { filename: f, date, sessionId: sid };
      });

    return NextResponse.json({ traces });
  } catch {
    return NextResponse.json({ traces: [] });
  }
}
