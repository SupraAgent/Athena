import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as fs from "fs/promises";
import * as path from "path";
import * as YAML from "yaml";

const HERMES_DIR = path.join(process.cwd(), ".athena", "hermes");
const MEMORIES_DIR = path.join(HERMES_DIR, "memories");

export async function GET() {
  // Auth check
  const supabase = await createClient();
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  try {
    const files = await fs.readdir(MEMORIES_DIR).catch(() => []);
    const memories = [];

    for (const f of files.filter((f) => f.endsWith(".yaml"))) {
      try {
        const raw = await fs.readFile(path.join(MEMORIES_DIR, f), "utf-8");
        const parsed = YAML.parse(raw);
        if (parsed?.id && parsed?.content) {
          memories.push({
            id: parsed.id,
            type: parsed.type,
            content: parsed.content,
            tags: parsed.tags ?? [],
            scope: parsed.scope ?? "user",
            relevance: parsed.relevance ?? 0.5,
            createdAt: parsed.created_at,
            updatedAt: parsed.updated_at,
            source: parsed.source,
          });
        }
      } catch {
        // Skip malformed files
      }
    }

    // Sort by most recent first
    memories.sort((a, b) =>
      new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()
    );

    return NextResponse.json({ memories, count: memories.length });
  } catch {
    return NextResponse.json({ memories: [], count: 0 });
  }
}
