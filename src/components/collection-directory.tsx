"use client";

import { useMemo, useState } from "react";
import AdaptiveCollectionImage from "@/components/adaptive-collection-image";
import Link from "next/link";
import LocalSnapshotTime from "@/components/local-snapshot-time";

export type CollectionDirectoryItem = {
  slug: string;
  name: string;
  ordRank30d: number | null;
  collectionType: string;
  latestBlockHeight: number | null;
  latestSnapshotAt: string | null;
  imageUrl: string;
  circulatingSupply: number;
  burned: number;
  holdingAddresses: number;
  singleHolderRate: number;
  averageHolding: number | null;
  giniCoefficient: number | null;
  top1SupplyShare: number | null;
};

type CollectionDirectoryProps = {
  collections: CollectionDirectoryItem[];
};

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function CollectionDirectory({
  collections,
}: CollectionDirectoryProps) {
  const [query, setQuery] = useState("");

  const normalizedQuery = normalizeSearchValue(query);

  const filteredCollections = useMemo(() => {
    if (!normalizedQuery) {
      return collections;
    }

    return collections.filter((collection) => {
      const searchableName =
        normalizeSearchValue(collection.name);

      const searchableSlug =
        normalizeSearchValue(collection.slug);

      return (
        searchableName.includes(normalizedQuery) ||
        searchableSlug.includes(normalizedQuery)
      );
    });
  }, [collections, normalizedQuery]);

  if (collections.length === 0) {
    return (
      <div className="empty-catalog">
        No indexed collection is currently available.
      </div>
    );
  }

  const resultLabel =
    filteredCollections.length === 1
      ? "1 collection"
      : `${filteredCollections.length} collections`;

  return (
    <>
      <div className="directory-search">
        <div className="directory-search-field">
          <label
            className="sr-only"
            htmlFor="collection-directory-search"
          >
            Search indexed collections
          </label>

          <input
            id="collection-directory-search"
            type="search"
            value={query}
            onChange={(event) =>
              setQuery(event.target.value)
            }
            placeholder="Search indexed collections..."
            autoComplete="off"
            spellCheck={false}
            aria-controls="collection-directory-results"
          />

          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear collection search"
            >
              Clear
            </button>
          ) : null}
        </div>

        <p
          className="directory-search-count"
          aria-live="polite"
        >
          {resultLabel}
        </p>
      </div>

      {filteredCollections.length > 0 ? (
        <div
          className="directory-table"
          id="collection-directory-results"
        >
          <div
            className="directory-table-header"
            aria-hidden="true"
          >
            <span
              className="directory-header-tooltip"
              data-tooltip="Collection name and current 30-day rank on ord.net."
            >
              Collection
            </span>

            <span
              className="directory-header-tooltip"
              data-tooltip="Circulating inscriptions currently available in the collection. An inscription is considered burned when its sat is spent to an unspendable OP_RETURN output."
            >
              Supply
            </span>

            <span
              className="directory-header-tooltip"
              data-tooltip="Bitcoin addresses holding at least one inscription from the collection."
            >
              Addresses
            </span>

            <span
              className="directory-header-tooltip"
              data-tooltip="Average number of circulating inscriptions held per holding address."
            >
              Average holding
            </span>

            <span
              className="directory-header-tooltip"
              data-tooltip="Ownership inequality across holding addresses. 0 is more even; 1 is more concentrated."
            >
              Gini
            </span>

            <span
              className="directory-header-tooltip"
              data-tooltip="Share of circulating supply held by the largest 1% of holding addresses."
            >
              Top 1%
            </span>

            <span
              className="directory-header-tooltip"
              data-tooltip="Date and Bitcoin block used for the latest ownership calculation."
            >
              Snapshot
            </span>
          </div>

          <div className="directory-body">
            {filteredCollections.map((collection) => (
              <Link
                className="directory-row"
                href={`/collection/${collection.slug}`}
                key={collection.slug}
              >
                <div className="directory-collection">
                  <span className="directory-rank">
                    {collection.ordRank30d !== null
                      ? `#${collection.ordRank30d}`
                      : "—"}
                  </span>

                  <div className="directory-artwork">
                    <AdaptiveCollectionImage
                      src={collection.imageUrl}
                      alt=""
                      width={58}
                      height={58}
                      unoptimized
                    />
                  </div>

                  <div className="directory-name">
                    <strong>{collection.name}</strong>

                    <span>
                      {collection.collectionType}
                    </span>
                  </div>
                </div>

                <div
                  className="directory-value"
                  data-label="Supply"
                >
                  <strong>
                    {collection.circulatingSupply.toLocaleString(
                      "en-US",
                    )}
                  </strong>

                  <span>
                    {collection.burned > 0
                      ? `${collection.burned} burned`
                      : "circulating"}
                  </span>
                </div>

                <div
                  className="directory-value"
                  data-label="Addresses"
                >
                  <strong>
                    {collection.holdingAddresses.toLocaleString(
                      "en-US",
                    )}
                  </strong>

                  <span>
                    {collection.singleHolderRate}% single
                  </span>
                </div>

                <div
                  className="directory-value"
                  data-label="Average holding"
                >
                  <strong>
                    {collection.averageHolding !== null
                      ? collection.averageHolding.toLocaleString(
                          "en-US",
                          {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          },
                        )
                      : "—"}
                  </strong>

                  <span>per address</span>
                </div>

                <div
                  className="directory-value"
                  data-label="Gini"
                >
                  <strong>
                    {collection.giniCoefficient !== null
                      ? collection.giniCoefficient.toFixed(3)
                      : "—"}
                  </strong>

                  <span>inequality</span>
                </div>

                <div
                  className="directory-value"
                  data-label="Top 1%"
                >
                  <strong>
                    {collection.top1SupplyShare !== null
                      ? `${collection.top1SupplyShare}%`
                      : "—"}
                  </strong>

                  <span>supply held</span>
                </div>

                <div
                  className="directory-snapshot"
                  data-label="Snapshot"
                >
                  <strong>
                    <LocalSnapshotTime
                      value={
                        collection.latestSnapshotAt
                      }
                      dateOnly
                    />
                  </strong>

                  <span>
                    {collection.latestBlockHeight !== null
                      ? `Block ${collection.latestBlockHeight.toLocaleString(
                          "en-US",
                        )}`
                      : "Block unavailable"}
                  </span>
                </div>

                <span
                  className="directory-arrow"
                  aria-hidden="true"
                >
                  →
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div
          className="empty-catalog directory-search-empty"
          id="collection-directory-results"
        >
          No collection matches “{query.trim()}”.
        </div>
      )}
    </>
  );
}
