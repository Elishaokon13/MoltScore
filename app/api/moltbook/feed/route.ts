import { fetchRecentPosts } from "@/lib/moltbookCrawler";
import { NextResponse } from "next/server";

/**
 * GET /api/moltbook/feed
 * Fetches recent Moltbook feed and returns unique agent usernames.
 * Use to verify MOLTBOOK_API_KEY is set and the crawler works.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 10, 50);

    const usernames = await fetchRecentPosts(limit);
    return NextResponse.json({
      success: true,
      count: usernames.length,
      usernames,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const isAuth = message.includes("MOLTBOOK_API_KEY");
    return NextResponse.json(
      { success: false, error: message },
      { status: isAuth ? 401 : 500 }
    );
  }
}
