import "server-only";
import { unstable_cache } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";

export type DistributionBucket = {
  bucket: string;
  addresses: number;
  shareOfHolders: number;
};

export type ConcentrationMetric = {
  holders: number;
  inscriptions: number;
  share: number;
};

export type LorenzPoint = {
  holdersShare: number;
  supplyShare: number;
};

export type AdvancedSupplyBucket = {
  bucket: string;
  addresses: number;
  shareOfHolders: number;
  inscriptions: number;
  shareOfSupply: number;
};

export type WhaleTier = {
  tier: "mega" | "large" | "whale" | "regular";
  label: string;
  addresses: number;
  inscriptions: number;
  shareOfSupply: number;
};

export type HolderGroupMetric = {
  holderCount: number;
  inscriptions: number;
  share: number;
};

export type AdvancedOwnership = {
  methodologyVersion: number;
  giniCoefficient: number;
  hhi: number;
  effectiveHolders: number;
  medianHolding: number;
  averageHolding: number;

  largestHolder: {
    inscriptions: number;
    share: number;
  };

  holdingPercentiles: {
    p90: number;
    p95: number;
    p99: number;
  };

  singleHolderSupply: {
    addresses: number;
    inscriptions: number;
    share: number;
  };

  supplyDistribution: AdvancedSupplyBucket[];

  topHolderGroups: {
    top1Percent: HolderGroupMetric;
    top5Percent: HolderGroupMetric;
    top10Percent: HolderGroupMetric;
  };

  distributionThresholds?: {
    bottom50Percent: {
      holderCount: number;
      inscriptions: number;
      share: number;
    };
    holdersControlling50Percent: {
      holderCount: number;
      holderShare: number;
      inscriptions: number;
      share: number;
    };
  };

  whaleTiers: WhaleTier[];
  lorenzCurve: LorenzPoint[];
};

export type OwnershipSnapshot = {
  supply: {
    gallery: number;
    circulating: number;
    unavailable: number;
    burned: number;
    circulatingRate: number;
  };
  ownership: {
    holdingAddresses: number;
    ownershipRatio: number;

    singleHolders: number;
    singleHolderRate: number;

    multiHolders: number;
    multiHolderRate: number;

    top10: ConcentrationMetric;
    top25: ConcentrationMetric;
    top100: ConcentrationMetric;

    distribution: DistributionBucket[];
  };
  charms: Array<{
    charm: string;
    count: number;
  }>;
};

export type PublicCollection = {
  slug: string;
  name: string;
  collection_type: "gallery" | "multi_gallery" | "parent";
  source_id: string;
  image_url: string | null;
  gallery_supply: number;
  latest_snapshot_at: string | null;
  latest_block_height: number | null;
  current_ownership: OwnershipSnapshot;
  advanced_ownership: AdvancedOwnership | null;
  ord_rank_30d: number | null;
  ranking_window: string | null;
  ranking_captured_at: string | null;
  catalog_active: boolean;
};

export type HistoricalCollectionSnapshot = {
  collection_slug: string;
  snapshot_date: string;
  captured_at: string;
  block_height: number | null;
  holding_addresses: number;
  single_holders: number;
  ownership_ratio: number;
  advanced_ownership: AdvancedOwnership | null;
};


export type DirectoryHealthSnapshot = {
  collection_slug: string;
  snapshot_date: string;
  captured_at: string;
  holding_addresses: number;
  gini_coefficient: number | string | null;
  effective_holders: number | string | null;
  largest_holder_share: number | string | null;
  top1_supply_share: number | string | null;
  single_holder_supply_share: number | string | null;
};

const collectionFields = [
  "slug",
  "name",
  "collection_type",
  "source_id",
  "image_url",
  "gallery_supply",
  "latest_snapshot_at",
  "latest_block_height",
  "current_ownership",
  "advanced_ownership",
  "ord_rank_30d",
  "ranking_window",
  "ranking_captured_at",
  "catalog_active",
].join(",");

const getCachedCollection = unstable_cache(
  async (slug: string): Promise<PublicCollection | null> => {
    const { data, error } = await supabaseServer
      .from("collections")
      .select(collectionFields)
      .eq("slug", slug)
      .maybeSingle()
      .overrideTypes<
        PublicCollection | null,
        { merge: false }
      >();

    if (error) {
      throw new Error(
        `Unable to read collection "${slug}": ${error.message}`,
      );
    }

    return data;
  },
  ["ordstats-public-collection"],
  {
    revalidate: 300,
  },
);

const getCachedCollections = unstable_cache(
  async (): Promise<PublicCollection[]> => {
    const { data, error } = await supabaseServer
      .from("collections")
      .select(collectionFields)
      .order("name", {
        ascending: true,
      })
      .overrideTypes<
        PublicCollection[],
        { merge: false }
      >();

    if (error) {
      throw new Error(
        `Unable to read indexed collections: ${error.message}`,
      );
    }

    return data ?? [];
  },
  ["ordstats-public-collections"],
  {
    revalidate: 300,
  },
);

const getCachedCollectionSnapshots =
  unstable_cache(
    async (
      slug: string,
      limit: number,
    ): Promise<HistoricalCollectionSnapshot[]> => {
      const { data, error } = await supabaseServer
        .from("collection_snapshots")
        .select(
          [
            "collection_slug",
            "snapshot_date",
            "captured_at",
            "block_height",
            "holding_addresses",
            "single_holders",
            "ownership_ratio",
            "advanced_ownership",
          ].join(","),
        )
        .eq("collection_slug", slug)
        .order("captured_at", {
          ascending: false,
        })
        .limit(limit)
        .overrideTypes<
          HistoricalCollectionSnapshot[],
          { merge: false }
        >();

      if (error) {
        throw new Error(
          `Unable to read history for "${slug}": ${error.message}`,
        );
      }

      return data ?? [];
    },
    ["ordstats-collection-history"],
    {
      revalidate: 300,
    },
  );

export async function getPublicCollection(
  slug: string,
): Promise<PublicCollection | null> {
  return getCachedCollection(slug.trim().toLowerCase());
}

export async function getPublicCollections(): Promise<
  PublicCollection[]
> {
  return getCachedCollections();
}


export async function getCollectionSnapshots(
  slug: string,
  limit = 2,
): Promise<HistoricalCollectionSnapshot[]> {
  const normalizedSlug = slug.trim().toLowerCase();
  const safeLimit = Math.max(1, Math.min(limit, 370));

  return getCachedCollectionSnapshots(
    normalizedSlug,
    safeLimit,
  );
}

const getCachedRecentCollectionSnapshotsForDirectory =
  unstable_cache(
    async (
      days: number,
    ): Promise<DirectoryHealthSnapshot[]> => {
      const safeDays = Math.max(
        30,
        Math.min(days, 60),
      );

      /*
       * Two extra calendar days protect the 30-day window around
       * UTC/Europe-Paris date boundaries.
       */
      const cutoffDate = new Date(
        Date.now() -
          (safeDays + 2) * 86_400_000,
      )
        .toISOString()
        .slice(0, 10);

      const pageSize = 1_000;
      const snapshots: DirectoryHealthSnapshot[] = [];

      for (
        let offset = 0;
        offset < 10_000;
        offset += pageSize
      ) {
        const { data, error } = await supabaseServer
          .from("collection_snapshots")
          .select(
            [
              "collection_slug",
              "snapshot_date",
              "captured_at",
              "holding_addresses",
              "gini_coefficient:advanced_ownership->>giniCoefficient",
              "effective_holders:advanced_ownership->>effectiveHolders",
              "largest_holder_share:advanced_ownership->largestHolder->>share",
              "top1_supply_share:advanced_ownership->topHolderGroups->top1Percent->>share",
              "single_holder_supply_share:advanced_ownership->singleHolderSupply->>share",
            ].join(","),
          )
          .gte("snapshot_date", cutoffDate)
          .order("captured_at", {
            ascending: true,
          })
          .range(
            offset,
            offset + pageSize - 1,
          )
          .overrideTypes<
            DirectoryHealthSnapshot[],
            { merge: false }
          >();

        if (error) {
          throw new Error(
            `Unable to read recent directory history: ${error.message}`,
          );
        }

        const page = data ?? [];
        snapshots.push(...page);

        if (page.length < pageSize) {
          break;
        }
      }

      return snapshots;
    },
    ["ordstats-directory-recent-history"],
    {
      revalidate: 300,
    },
  );

export async function getRecentCollectionSnapshotsForDirectory(
  days = 40,
): Promise<DirectoryHealthSnapshot[]> {
  const safeDays = Math.max(
    30,
    Math.min(days, 60),
  );

  return getCachedRecentCollectionSnapshotsForDirectory(
    safeDays,
  );
}
