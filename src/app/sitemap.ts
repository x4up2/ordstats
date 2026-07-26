import type { MetadataRoute } from "next";

import { getPublicCollections } from "@/lib/collection-data";

const siteUrl = "https://www.ordstats.net";

export const revalidate = 300;

export default async function sitemap(): Promise<
  MetadataRoute.Sitemap
> {
  const collections = await getPublicCollections();

  const collectionEntries = collections
    .filter((collection) => collection.catalog_active)
    .sort((first, second) =>
      first.slug.localeCompare(second.slug),
    )
    .map((collection) => ({
      url:
        `${siteUrl}/collection/` +
        encodeURIComponent(collection.slug),
      changeFrequency: "daily" as const,
      priority: 0.8,
      ...(collection.latest_snapshot_at
        ? {
            lastModified:
              collection.latest_snapshot_at,
          }
        : {}),
    }));

  return [
    {
      url: siteUrl,
      changeFrequency: "daily",
      priority: 1,
    },
    ...collectionEntries,
  ];
}
