import SiteFooter from "@/components/site-footer";
import Image from "next/image";
import Link from "next/link";
import CollectionDirectory from "@/components/collection-directory";
import { getPublicCollections } from "@/lib/collection-data";

export default async function Home() {
  const collections = await getPublicCollections();

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

  const directoryCollections = orderedCollections.map(
    (collection) => {
      const ownership =
        collection.current_ownership.ownership;

      const supply =
        collection.current_ownership.supply;

      const advanced =
        collection.advanced_ownership;

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
        top1SupplyShare:
          advanced?.topHolderGroups.top1Percent.share ??
          null,
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
