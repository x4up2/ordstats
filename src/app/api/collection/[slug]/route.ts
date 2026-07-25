import { NextResponse } from "next/server";
import { getCollectionSummary } from "@/lib/ordinals";

export const runtime = "nodejs";

type RouteProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function GET(
  _request: Request,
  { params }: RouteProps,
) {
  const { slug: encodedSlug } = await params;
  const slug = decodeURIComponent(encodedSlug).toLowerCase();

  try {
    const collection = await getCollectionSummary(slug);

    return NextResponse.json({
      ok: true,
      collection,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to retrieve the collection.";

    const status = message.includes("not present") ? 404 : 502;

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      {
        status,
      },
    );
  }
}
