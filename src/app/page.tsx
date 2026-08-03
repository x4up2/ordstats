import SiteFooter from "@/components/site-footer";
import Image from "next/image";
import Link from "next/link";
import CollectionDirectory from "@/components/collection-directory";
import {
  getPublicCollections,
  getRecentCollectionSnapshotsForDirectory,
} from "@/lib/collection-data";
import {
  calculateDistributionHealth,
  getDistributionHealthColor,
  type DistributionHealthHistoryPoint,
} from "@/lib/distribution-health";

function toFiniteNumber(
  value: number | string | null,
) {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  return null;
}

function getParisSnapshotDate(
  capturedAt: string | null,
) {
  if (!capturedAt) {
    return null;
  }

  const date = new Date(capturedAt);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .filter(
        (part) => part.type !== "literal",
      )
      .map(
        (part) => [
          part.type,
          part.value,
        ],
      ),
  );

  return (
    `${parts.year}-` +
    `${parts.month}-` +
    `${parts.day}`
  );
}

export default async function Home() {
  const [
    collections,
    recentSnapshots,
  ] = await Promise.all([
    getPublicCollections(),
    getRecentCollectionSnapshotsForDirectory(40),
  ]);

  const activeCollections = collections.filter(
    (collection) => collection.catalog_active,
  );

  /*
   * Le fallback évite une page vide avant la première
   * synchronisation du catalogue.
   */
  const displayedCollections =
    activeCollections.length > 0
      ? activeCollections
      : collections;

  const orderedCollections = [
    ...displayedCollections,
  ].sort((left, right) => {
    const leftRank =
      left.ord_rank_30d ?? Number.MAX_SAFE_INTEGER;

    const rightRank =
      right.ord_rank_30d ?? Number.MAX_SAFE_INTEGER;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return left.name.localeCompare(right.name);
  });

  const snapshotsBySlug = new Map<
    string,
    (typeof recentSnapshots)[number][]
  >();

  recentSnapshots.forEach((snapshot) => {
    const snapshots =
      snapshotsBySlug.get(
        snapshot.collection_slug,
      ) ?? [];

    snapshots.push(snapshot);
    snapshotsBySlug.set(
      snapshot.collection_slug,
      snapshots,
    );
  });

  const directoryCollections = orderedCollections.map(
    (collection) => {
      const ownership =
        collection.current_ownership.ownership;

      const supply =
        collection.current_ownership.supply;

      const advanced =
        collection.advanced_ownership;

      const healthHistoryByDate =
        new Map<
          string,
          DistributionHealthHistoryPoint
        >();

      const collectionSnapshots =
        snapshotsBySlug.get(
          collection.slug,
        ) ?? [];

      collectionSnapshots.forEach(
        (historicalSnapshot) => {
          const historicalHoldingAddresses =
            historicalSnapshot.holding_addresses;

          const historicalEffectiveHolders =
            toFiniteNumber(
              historicalSnapshot.effective_holders,
            );

          const historicalEvenness =
            historicalEffectiveHolders !== null &&
            historicalHoldingAddresses > 0
              ? Math.min(
                  100,
                  Math.max(
                    0,
                    (
                      historicalEffectiveHolders /
                      historicalHoldingAddresses
                    ) * 100,
                  ),
                )
              : null;

          healthHistoryByDate.set(
            historicalSnapshot.snapshot_date,
            {
              snapshotDate:
                historicalSnapshot.snapshot_date,
              holdingAddresses:
                historicalHoldingAddresses,
              ownershipEvenness:
                historicalEvenness,
              giniCoefficient:
                toFiniteNumber(
                  historicalSnapshot.gini_coefficient,
                ),
              largestHolderShare:
                toFiniteNumber(
                  historicalSnapshot.largest_holder_share,
                ),
              top1SupplyShare:
                toFiniteNumber(
                  historicalSnapshot.top1_supply_share,
                ),
              singleHolderSupplyShare:
                toFiniteNumber(
                  historicalSnapshot.single_holder_supply_share,
                ),
            },
          );
        },
      );

      const currentSnapshotDate =
        getParisSnapshotDate(
          collection.latest_snapshot_at,
        );

      if (currentSnapshotDate) {
        const currentEvenness =
          advanced &&
          ownership.holdingAddresses > 0
            ? Math.min(
                100,
                Math.max(
                  0,
                  (
                    advanced.effectiveHolders /
                    ownership.holdingAddresses
                  ) * 100,
                ),
              )
            : null;

        healthHistoryByDate.set(
          currentSnapshotDate,
          {
            snapshotDate: currentSnapshotDate,
            holdingAddresses:
              ownership.holdingAddresses,
            ownershipEvenness:
              currentEvenness,
            giniCoefficient:
              advanced?.giniCoefficient ?? null,
            largestHolderShare:
              advanced?.largestHolder.share ?? null,
            top1SupplyShare:
              advanced?.topHolderGroups
                .top1Percent.share ?? null,
            singleHolderSupplyShare:
              advanced?.singleHolderSupply.share ??
              null,
          },
        );
      }

      const distributionHealth =
        calculateDistributionHealth({
          ownership,
          advanced,
          historyPoints: Array.from(
            healthHistoryByDate.values(),
          ).sort((left, right) =>
            left.snapshotDate.localeCompare(
              right.snapshotDate,
            ),
          ),
        });

      return {
        slug: collection.slug,
        name: collection.name,
        ordRank30d: collection.ord_rank_30d ?? null,
        collectionType:
          collection.collection_type ?? "collection",
        latestBlockHeight:
          collection.latest_block_height ?? null,
        latestSnapshotAt:
          collection.latest_snapshot_at ?? null,
        imageUrl:
          collection.image_url ??
          "/ordstats-mark.png",
        circulatingSupply: supply.circulating,
        burned: supply.burned,
        holdingAddresses: ownership.holdingAddresses,
        singleHolderRate: ownership.singleHolderRate,
        averageHolding:
          ownership.holdingAddresses > 0
            ? supply.circulating /
              ownership.holdingAddresses
            : null,
        giniCoefficient:
          advanced?.giniCoefficient ?? null,
        distributionHealthScore:
          distributionHealth?.score ?? null,
        distributionHealthLabel:
          distributionHealth?.label ?? null,
        distributionHealthColor:
          distributionHealth
            ? getDistributionHealthColor(
                distributionHealth.score,
              )
            : null,
      };
    },
  );

  return (
    <div className="site-frame dashboard-frame">
      <header className="site-header shell">
        <Link
          className="wordmark"
          href="/"
          aria-label="ORDstats home"
        >
          <span className="wordmark-ord">ORD</span>
          <span className="wordmark-stats">stats</span>
        </Link>

        <p className="header-label">
          Ordinals ownership analytics
        </p>
      </header>

      <main>
        <section className="catalog-hero shell">
          <div className="catalog-hero-grid">
            <div className="catalog-hero-copy">
              <h1>
                Inside Ordinals
                <br />
                ownership.
              </h1>

              <p className="catalog-hero-description">
                ORDstats tracks the first 100 collections in the
                rolling{" "}
                <a
                  className="ord-net-mark"
                  href="https://ord.net"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ord.net
                </a>{" "}
                30-day ranking and analyzes their ownership structure
                every day from an independent local ord index.
              </p>
            </div>

            <div
              className="catalog-hero-art"
              aria-hidden="true"
            >
              <Image
                src="/ordstats-mark.png"
                alt=""
                width={512}
                height={512}
                priority
              />
            </div>
          </div>
        </section>

        <section
          className="collection-directory shell"
          id="collections"
        >
          <div className="directory-heading">
            <div>
              <p className="eyebrow">Collection directory</p>
              <h2>Indexed collections</h2>
            </div>

            <p>
              Select a collection to open its complete ownership
              report.
            </p>
          </div>

          <CollectionDirectory
            collections={directoryCollections}
          />
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
