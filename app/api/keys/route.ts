/**
 * POST /api/keys — Generate a new API key.
 * Admin-only: requires CRON_SECRET for authorization (same as cron endpoint).
 *
 * Request body: { "name": "My Integration", "keyType": "read" }
 * Response: { "success": true, "apiKey": "ms_...", "record": { ... } }
 *
 * The raw API key is only shown once. Store it securely.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateApiKey } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

function verifyAdmin(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  return authHeader.replace(/^Bearer\s+/i, "") === secret;
}

export async function POST(req: NextRequest) {
  if (!verifyAdmin(req)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized. Admin access required." },
      { status: 401 }
    );
  }

  let body: { name?: string; keyType?: string };
  try {
    body = (await req.json()) as { name?: string; keyType?: string };
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const name = body.name?.trim();
  if (!name || name.length < 1 || name.length > 200) {
    return NextResponse.json(
      { success: false, error: "Name is required (1-200 characters)" },
      { status: 400 }
    );
  }

  const keyType = body.keyType === "write" ? "write" : "read";

  try {
    const { rawKey, record } = await generateApiKey(name, keyType as "read" | "write");

    return NextResponse.json(
      {
        success: true,
        message: "API key generated. Store the key securely — it won't be shown again.",
        apiKey: rawKey,
        record,
      },
      { status: 201 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
