/**
 * POST /api/keys/request — Public self-serve API key generation.
 * Generates read-only keys without admin auth.
 * Rate limited: max 3 keys per name per day.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateApiKey } from "@/lib/apiAuth";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { name?: string };
  try {
    body = (await req.json()) as { name?: string };
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

  // Simple rate limit: max 3 keys created today with this name
  try {
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS c FROM api_keys
       WHERE name = $1 AND created_at::date = CURRENT_DATE`,
      [name]
    );
    const todayCount = (countResult.rows[0] as { c: number })?.c ?? 0;
    if (todayCount >= 3) {
      return NextResponse.json(
        { success: false, error: "Rate limit: max 3 keys per name per day." },
        { status: 429 }
      );
    }
  } catch {
    // api_keys table might not exist yet — let it fall through to generateApiKey
    // which will fail with a clearer error
  }

  try {
    const { rawKey, record } = await generateApiKey(name, "read");

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

    // Friendly message if the table doesn't exist yet
    if (message.includes("api_keys") || message.includes("does not exist")) {
      return NextResponse.json(
        {
          success: false,
          error: "API key system not initialized. Run the database setup first.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
