import { NextRequest, NextResponse } from "next/server";

const ALLOWED_EVENTS = new Set([
  "entra_configuration_missing",
]);

export async function POST(request: NextRequest) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const record = payload as Record<string, unknown>;
  const event = typeof record.event === "string" ? record.event : "unknown";
  const detail = typeof record.detail === "string" ? record.detail : "No detail supplied.";
  const path = typeof record.path === "string" ? record.path : "unknown";

  if (!ALLOWED_EVENTS.has(event)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  console.error("[auth-client]", {
    event,
    detail,
    path,
  });

  return NextResponse.json({ ok: true });
}
