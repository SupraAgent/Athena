import { NextRequest, NextResponse } from "next/server";
import { loadTasks, createTask, getTaskStats } from "@/lib/tasks";

function repoRoot(): string {
  return process.cwd();
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const statsOnly = searchParams.get("stats") === "true";

    if (statsOnly) {
      const stats = await getTaskStats(repoRoot());
      return NextResponse.json({ stats });
    }

    const tasks = await loadTasks(repoRoot());
    const stats = await getTaskStats(repoRoot());
    return NextResponse.json({ tasks, stats });
  } catch (err) {
    console.error("[api/tasks] GET error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const task = await createTask(repoRoot(), {
      title: body.title,
      description: body.description,
      status: body.status,
      priority: body.priority,
      tags: body.tags,
      assignee: body.assignee,
    });

    return NextResponse.json({ task });
  } catch (err) {
    console.error("[api/tasks] POST error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
