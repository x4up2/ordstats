import type { Metadata } from "next";

import SiteFooter from "@/components/site-footer";
import DistributionHealth from "@/components/distribution-health";
import AdaptiveCollectionImage from "@/components/adaptive-collection-image";
import Link from "next/link";
import LocalSnapshotTime from "@/components/local-snapshot-time";
import { MetricCard } from "@/components/metric-card";
import OwnershipHistory, {
  type OwnershipHistoryPoint,
} from "@/components/ownership-history";
import {
  getCollectionSnapshots,
  getPublicCollection,
} from "@/lib/collection-data";
import { calculateDistributionHealth } from "@/lib/distribution-health";

type CollectionPageProps = {
  params: Promise<{
    slug: string;
  }>;
};



function humanizeSlug(slug: string) {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map(
      (word) =>
        word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

export async function generateMetadata({
  params,
}: CollectionPageProps): Promise<Metadata> {
  const { slug: encodedSlug } = await params;
  const slug = decodeURIComponent(
    encodedSlug,
  ).toLowerCase();

  const collection = await getPublicCollection(slug);

  const canonicalPath =
    `/collection/${encodeURIComponent(slug)}`;

  if (!collection) {
    const fallbackName = humanizeSlug(slug);

    return {
      title: `${fallbackName} — Collection not indexed`,
      description:
        `ORDstats has no ownership snapshot for ${fallbackName}.`,
      alternates: {
        canonical: canonicalPath,
      },
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const description =
    `Daily ownership analytics and holder distribution metrics for ${collection.name}.`;

  const socialTitle =
    `${collection.name} — Ordinals ownership analytics`;

  const socialImagePath =
    `${canonicalPath}/opengraph-image?v=4`;

  return {
    title: collection.name,
    description,

    alternates: {
      canonical: canonicalPath,
    },

    openGraph: {
      type: "website",
      url: canonicalPath,
      siteName: "ORDstats",
      title: socialTitle,
      description,
      images: [
        {
          url: socialImagePath,
          width: 1200,
          height: 630,
          alt: `${collection.name} ownership analytics on ORDstats`,
        },
      ],
    },

    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: [
        socialImagePath,
      ],
    },
  };
}

export default async function CollectionPage({
  params,
}: CollectionPageProps) {
  const { slug: encodedSlug } = await params;
  const slug = decodeURIComponent(encodedSlug).toLowerCase();

  const collection = await getPublicCollection(slug);

  if (!collection) {
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
            Ordinals collection analytics
          </p>
        </header>

        <main className="shell dashboard pending-page">
          <Link
            className="collection-home-link"
            href="/"
          >
                        Home
          </Link>

          <div className="pending-status">
            <span className="status-dot" />
            No ORDstats snapshot
          </div>

          <p className="eyebrow">
            Collection not indexed
          </p>

          <h1>{humanizeSlug(slug)}</h1>

          <p className="pending-description">
            ORDstats has no snapshot for this collection slug. The
            collection may exist on ord.net, or the URL may be invalid.
            In either case, it has not been indexed by ORDstats.
          </p>

          <div className="pending-actions">
            <a
              className="primary-link"
              href={`https://ord.net/collection/${slug}`}
              target="_blank"
              rel="noreferrer"
            >
              Check collection on ord.net ↗
            </a>

            <Link
              className="secondary-link"
              href="/#collections"
            >
              Browse indexed collections
            </Link>
          </div>
        </main>

        <SiteFooter />
      </div>
    );
  }

  const recentSnapshots =
    await getCollectionSnapshots(slug, 370);

  const snapshot = collection.current_ownership;
  const ownership = snapshot.ownership;
  const advanced = collection.advanced_ownership;
  const supply = snapshot.supply;

  const imageUrl =
    collection.image_url ??
    "/ordstats-mark.png";

  const ownershipEvenness =
    advanced && ownership.holdingAddresses > 0
      ? Math.min(
          100,
          Math.max(
            0,
            (advanced.effectiveHolders /
              ownership.holdingAddresses) *
              100,
          ),
        )
      : null;

  const multiHolderSupplyShare = advanced
    ? Math.min(
        100,
        Math.max(
          0,
          100 - advanced.singleHolderSupply.share,
        ),
      )
    : null;

  const largestHolderMultiple =
    advanced && advanced.averageHolding > 0
      ? advanced.largestHolder.inscriptions /
        advanced.averageHolding
      : null;

  const concentratedWhaleTiers = advanced
    ? advanced.whaleTiers.filter((tier) =>
        ["mega", "large", "whale"].includes(
          tier.tier,
        ),
      )
    : [];

  const whaleTierSupplyShare =
    concentratedWhaleTiers.reduce(
      (total, tier) => total + tier.shareOfSupply,
      0,
    );

  const whaleTierAddresses =
    concentratedWhaleTiers.reduce(
      (total, tier) => total + tier.addresses,
      0,
    );

  const overviewMetrics = [
    {
      label: "Circulating supply",
      value: supply.circulating.toLocaleString("en-US"),
      detail:
        supply.burned > 0
          ? `${supply.unavailable.toLocaleString(
              "en-US",
            )} unavailable, including ${supply.burned.toLocaleString(
              "en-US",
            )} burned`
          : `${supply.unavailable.toLocaleString(
              "en-US",
            )} unavailable`,
      status: "snapshot" as const,
    },
    {
      label: "Holding addresses",
      value: ownership.holdingAddresses.toLocaleString(
        "en-US",
      ),
      detail:
        `Across ${supply.circulating.toLocaleString(
          "en-US",
        )} circulating inscriptions`,
      status: "snapshot" as const,
    },
    {
      label: "Single holders",
      value: `${ownership.singleHolderRate}%`,
      detail: "Of holding addresses",
      status: "snapshot" as const,
    },

    ...(advanced
      ? [
          {
            label: "Average holding",
            value: advanced.averageHolding.toLocaleString(
              "en-US",
              {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              },
            ),
            detail:
              `Median holding: ${advanced.medianHolding.toLocaleString(
                "en-US",
              )}`,
            status: "snapshot" as const,
          },
          {
            label: "Largest holder",
            value: `${advanced.largestHolder.share}%`,
            detail:
              `${advanced.largestHolder.inscriptions.toLocaleString(
                "en-US",
              )} inscriptions held`,
            status: "snapshot" as const,
          },
          {
            label: "Single-holder supply",
            value: `${advanced.singleHolderSupply.share}%`,
            detail: "Of circulating supply",
            status: "snapshot" as const,
          },
        ]
      : [
          {
            label: "Top 10 concentration",
            value: `${ownership.top10.share}%`,
            detail:
              `${ownership.top10.inscriptions.toLocaleString(
                "en-US",
              )} inscriptions held`,
            status: "snapshot" as const,
          },
          {
            label: "Top 25 concentration",
            value: `${ownership.top25.share}%`,
            detail:
              `${ownership.top25.inscriptions.toLocaleString(
                "en-US",
              )} inscriptions held`,
            status: "snapshot" as const,
          },
          {
            label: "Top 100 concentration",
            value: `${ownership.top100.share}%`,
            detail:
              `${ownership.top100.inscriptions.toLocaleString(
                "en-US",
              )} inscriptions held`,
            status: "snapshot" as const,
          },
        ]),

  ];

  const concentrationRows = [
    {
      label: "Top 10",
      value: ownership.top10.share,
      inscriptions: ownership.top10.inscriptions,
    },
    {
      label: "Top 25",
      value: ownership.top25.share,
      inscriptions: ownership.top25.inscriptions,
    },
    {
      label: "Top 100",
      value: ownership.top100.share,
      inscriptions: ownership.top100.inscriptions,
    },
  ];

  const advancedMetrics = advanced
    ? [
        {
          label: "Ownership evenness",
          value:
            ownershipEvenness !== null
              ? `${ownershipEvenness.toFixed(1)}%`
              : "—",
          detail:
            `${Math.round(
              advanced.effectiveHolders,
            ).toLocaleString(
              "en-US",
            )} effective holders across ${ownership.holdingAddresses.toLocaleString(
              "en-US",
            )} addresses`,
          status: "snapshot" as const,
        },
        {
          label: "Effective holders",
          value: Math.round(
            advanced.effectiveHolders,
          ).toLocaleString("en-US"),
          detail:
            "Concentration-adjusted holder count",
          status: "snapshot" as const,
        },
        {
          label: "Gini coefficient",
          value: advanced.giniCoefficient.toFixed(3),
          detail:
            "0 means equal · 1 means highly concentrated",
          status: "snapshot" as const,
        },
        {
          label: "Top 1% supply",
          value:
            `${advanced.topHolderGroups.top1Percent.share}%`,
          detail:
            `${advanced.topHolderGroups.top1Percent.holderCount.toLocaleString(
              "en-US",
            )} largest addresses`,
          status: "snapshot" as const,
        },
        {
          label: "Top 5% supply",
          value:
            `${advanced.topHolderGroups.top5Percent.share}%`,
          detail:
            `${advanced.topHolderGroups.top5Percent.holderCount.toLocaleString(
              "en-US",
            )} largest addresses`,
          status: "snapshot" as const,
        },
        {
          label: "Top 10% supply",
          value:
            `${advanced.topHolderGroups.top10Percent.share}%`,
          detail:
            `${advanced.topHolderGroups.top10Percent.holderCount.toLocaleString(
              "en-US",
            )} largest addresses`,
          status: "snapshot" as const,
        },
        {
          label: "Whale-tier supply",
          value: `${whaleTierSupplyShare.toFixed(2)}%`,
          detail:
            `${whaleTierAddresses.toLocaleString(
              "en-US",
            )} addresses each hold at least 0.1% of supply`,
          status: "snapshot" as const,
        },
        {
          label: "Multi-holder supply",
          value:
            multiHolderSupplyShare !== null
              ? `${multiHolderSupplyShare.toFixed(2)}%`
              : "—",
          detail:
            "Supply held by addresses owning two or more pieces",
          status: "snapshot" as const,
        },
        {
          label: "Largest holder multiple",
          value:
            largestHolderMultiple !== null
              ? `${largestHolderMultiple.toFixed(1)}×`
              : "—",
          detail:
            "Largest balance relative to average holding",
          status: "snapshot" as const,
        },
      ]
    : [];

  const bottom50SupplyShare =
    advanced?.distributionThresholds?.bottom50Percent
      .share ??
    advanced?.lorenzCurve.find(
      (point) => point.holdersShare === 50,
    )?.supplyShare ??
    null;

  const holdersControlling50Share =
    advanced?.distributionThresholds
      ?.holdersControlling50Percent.holderShare ??
    null;

  const lorenzPoints = advanced
    ? advanced.lorenzCurve
        .map(
          (point) =>
            `${point.holdersShare},${
              100 - point.supplyShare
            }`,
        )
        .join(" ")
    : "";

  const historyPointByDate =
    new Map<string, OwnershipHistoryPoint>();

  recentSnapshots.forEach((historicalSnapshot) => {
    const historicalAdvanced =
      historicalSnapshot.advanced_ownership;

    const historicalHoldingAddresses =
      historicalSnapshot.holding_addresses;

    const historicalEvenness =
      historicalAdvanced &&
      historicalHoldingAddresses > 0
        ? Math.min(
            100,
            Math.max(
              0,
              (historicalAdvanced.effectiveHolders /
                historicalHoldingAddresses) *
                100,
            ),
          )
        : null;

    historyPointByDate.set(
      historicalSnapshot.snapshot_date,
      {
        snapshotDate:
          historicalSnapshot.snapshot_date,
        capturedAt:
          historicalSnapshot.captured_at,
        blockHeight:
          historicalSnapshot.block_height,
        holdingAddresses:
          historicalHoldingAddresses,
        singleHolders:
          historicalSnapshot.single_holders,
        holderDensity:
          historicalSnapshot.ownership_ratio,
        ownershipEvenness:
          historicalEvenness,
        effectiveHolders:
          historicalAdvanced?.effectiveHolders ?? null,
        giniCoefficient:
          historicalAdvanced?.giniCoefficient ?? null,
        largestHolderShare:
          historicalAdvanced?.largestHolder.share ?? null,
        top1SupplyShare:
          historicalAdvanced?.topHolderGroups
            .top1Percent.share ?? null,
        singleHolderSupplyShare:
          historicalAdvanced?.singleHolderSupply.share ??
          null,
        averageHolding:
          historicalAdvanced?.averageHolding ?? null,
      },
    );
  });

  const currentCapturedAt =
    collection.latest_snapshot_at;

  if (currentCapturedAt) {
    const currentDate = new Date(currentCapturedAt);

    if (!Number.isNaN(currentDate.getTime())) {
      const currentSnapshotDateParts =
        Object.fromEntries(
          new Intl.DateTimeFormat("en-CA", {
            timeZone: "Europe/Paris",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          })
            .formatToParts(currentDate)
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

      const currentSnapshotDate =
        `${currentSnapshotDateParts.year}-` +
        `${currentSnapshotDateParts.month}-` +
        `${currentSnapshotDateParts.day}`;

      historyPointByDate.set(
        currentSnapshotDate,
        {
          snapshotDate: currentSnapshotDate,
          capturedAt: currentCapturedAt,
          blockHeight:
            collection.latest_block_height,
          holdingAddresses:
            ownership.holdingAddresses,
          singleHolders:
            ownership.singleHolders,
          holderDensity:
            ownership.ownershipRatio,
          ownershipEvenness,
          effectiveHolders:
            advanced?.effectiveHolders ?? null,
          giniCoefficient:
            advanced?.giniCoefficient ?? null,
          largestHolderShare:
            advanced?.largestHolder.share ?? null,
          top1SupplyShare:
            advanced?.topHolderGroups.top1Percent.share ??
            null,
          singleHolderSupplyShare:
            advanced?.singleHolderSupply.share ?? null,
          averageHolding:
            advanced?.averageHolding ?? null,
        },
      );
    }
  }

  const historyPoints = Array.from(
    historyPointByDate.values(),
  ).sort((left, right) =>
    left.snapshotDate.localeCompare(
      right.snapshotDate,
    ),
  );

  const distributionHealth =
    calculateDistributionHealth({
      ownership,
      advanced,
      historyPoints,
    });

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

        <nav
          className="dashboard-nav"
          aria-label="Collection sections"
        >
          <a href="#advanced">Advanced</a>
          <a href="#history">History</a>
        </nav>
      </header>

      <main className="shell dashboard">
        <Link
          className="collection-home-link"
          href="/"
        >
                    Home
        </Link>

        <section className="collection-heading">
          <div className="collection-identity">
            <div className="collection-artwork">
              <AdaptiveCollectionImage
                src={imageUrl}
                alt={`${collection.name} collection artwork`}
                width={300}
                height={300}
                priority
                unoptimized
              />
            </div>

            <div className="collection-copy">
              <div className="demo-label">
                <span className="status-dot" />
                Snapshot captured ·{" "}
                <LocalSnapshotTime
                  value={collection.latest_snapshot_at}
                />
              </div>

              <h1>{collection.name}</h1>

              <p className="collection-source">
                {supply.gallery.toLocaleString("en-US")} inscriptions
                <span>·</span>
                Collection verified in curated registry
              </p>

              {collection.latest_block_height ? (
                <p className="collection-block">
                  Indexed at Bitcoin block{" "}
                  {collection.latest_block_height.toLocaleString(
                    "en-US",
                  )}
                </p>
              ) : null}
            </div>
          </div>

          <div className="collection-actions">
            <a
              className="external-link"
              href={`https://ord.net/collection/${collection.slug}`}
              target="_blank"
              rel="noreferrer"
            >
              View on ord.net ↗
            </a>

            <p>Data served from Supabase</p>
          </div>
        </section>

        {distributionHealth ? (
          <DistributionHealth
            result={distributionHealth}
          />
        ) : null}

        <section
          className="metric-grid"
          aria-label="Collection overview"
        >
          {overviewMetrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </section>

        {advanced ? (
          <section
            className="dashboard-section advanced-section"
            id="advanced"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">
                  Ownership · Advanced snapshot
                </p>

                <h2>Ownership analytics</h2>
              </div>

              <p className="section-description">
                Distribution metrics designed to reveal how evenly
                the circulating supply is held across Bitcoin
                addresses.
              </p>
            </div>

            <div
              className="metric-grid advanced-metric-grid"
              aria-label="Advanced ownership metrics"
            >
              {advancedMetrics.map((metric) => (
                <MetricCard
                  key={metric.label}
                  {...metric}
                />
              ))}
            </div>

            <article
              className="panel metric-methodology"
              aria-labelledby="metric-methodology-title"
            >
              <div className="panel-heading">
                <h3 id="metric-methodology-title">
                  How to read these metrics
                </h3>

                <p>
                  Nine advanced ownership metrics calculated from the
                  current address distribution.
                </p>
              </div>

              <div className="metric-definition-grid">
                <details>
                  <summary>
                    <span>Ownership evenness</span>
                    <i aria-hidden="true">+</i>
                  </summary>

                  <p>
                    Effective holders divided by observed holding
                    addresses. A value of 100% means that every
                    holding address owns exactly the same number of
                    inscriptions.
                  </p>
                </details>

                <details>
                  <summary>
                    <span>Effective holders</span>
                    <i aria-hidden="true">+</i>
                  </summary>

                  <p>
                    The number of equally weighted holders that would
                    produce the same concentration as the observed
                    distribution. A higher value indicates broader
                    distribution; a lower value indicates greater concentration.
                  </p>
                </details>

                <details>
                  <summary>
                    <span>Gini coefficient</span>
                    <i aria-hidden="true">+</i>
                  </summary>

                  <p>
                    Measures inequality across holding addresses. A
                    value of 0 represents equal holdings, while a
                    value approaching 1 represents extreme
                    concentration.
                  </p>
                </details>

                <details>
                  <summary>
                    <span>Top 1% supply</span>
                    <i aria-hidden="true">+</i>
                  </summary>

                  <p>
                    Share of circulating supply held by the largest
                    1% of observed holding addresses.
                  </p>
                </details>

                <details>
                  <summary>
                    <span>Top 5% supply</span>
                    <i aria-hidden="true">+</i>
                  </summary>

                  <p>
                    Share of circulating supply held by the largest
                    5% of observed holding addresses.
                  </p>
                </details>

                <details>
                  <summary>
                    <span>Top 10% supply</span>
                    <i aria-hidden="true">+</i>
                  </summary>

                  <p>
                    Share of circulating supply held by the largest
                    10% of observed holding addresses.
                  </p>
                </details>

                <details>
                  <summary>
                    <span>Whale-tier supply</span>
                    <i aria-hidden="true">+</i>
                  </summary>

                  <p>
                    Combined share of supply held by addresses that
                    each control at least 0.1% of the circulating
                    collection.
                  </p>
                </details>

                <details>
                  <summary>
                    <span>Multi-holder supply</span>
                    <i aria-hidden="true">+</i>
                  </summary>

                  <p>
                    Share of circulating supply held by addresses
                    owning two or more inscriptions from the
                    collection.
                  </p>
                </details>

                <details>
                  <summary>
                    <span>Largest holder multiple</span>
                    <i aria-hidden="true">+</i>
                  </summary>

                  <p>
                    Largest address balance divided by the average
                    holding. A value of 10× means that the largest
                    address holds ten times the collection-wide
                    average balance.
                  </p>
                </details>
              </div>

              <p className="methodology-note">
                Top 1%, Top 5% and Top 10% are nested groups and
                should not be added together.
              </p>

              <p className="methodology-warning">
                Bitcoin addresses are not the same as individual
                collectors. One person may control several addresses,
                while one address may represent a marketplace,
                custodian, shared wallet or organization.
              </p>
            </article>

            <div className="advanced-visual-grid">
              <article className="panel supply-comparison-panel">
                <div className="panel-heading">
                  <h3>Holder size versus supply</h3>

                  <p>
                    Address share compared with the share of
                    inscriptions controlled
                  </p>
                </div>

                <div className="comparison-legend">
                  <span>
                    <i className="comparison-address-dot" />
                    Addresses
                  </span>

                  <span>
                    <i className="comparison-supply-dot" />
                    Supply
                  </span>
                </div>

                <div className="supply-comparison-list">
                  {advanced.supplyDistribution.map(
                    (bucket) => (
                      <div
                        className="supply-comparison-row"
                        key={bucket.bucket}
                      >
                        <div className="comparison-bucket">
                          <strong>{bucket.bucket}</strong>
                          <span>pieces per address</span>
                        </div>

                        <div className="comparison-bars">
                          <div className="comparison-line">
                            <div className="comparison-track">
                              <div
                                className="comparison-fill comparison-address-fill"
                                style={{
                                  width: `${Math.max(
                                    bucket.shareOfHolders,
                                    0.4,
                                  )}%`,
                                }}
                              />
                            </div>

                            <span>
                              {bucket.shareOfHolders}%
                            </span>
                          </div>

                          <div className="comparison-line">
                            <div className="comparison-track">
                              <div
                                className="comparison-fill comparison-supply-fill"
                                style={{
                                  width: `${Math.max(
                                    bucket.shareOfSupply,
                                    0.4,
                                  )}%`,
                                }}
                              />
                            </div>

                            <span>
                              {bucket.shareOfSupply}%
                            </span>
                          </div>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </article>

              <article className="panel lorenz-panel">
                <div className="panel-heading">
                  <h3>Lorenz curve</h3>

                  <p>
                    Cumulative holders versus cumulative supply
                  </p>
                </div>

                <p className="panel-explanation">
                  The curve compares the cumulative share of holding
                  addresses with the cumulative share of supply. The
                  further it sits below the equality line, the more
                  concentrated ownership is.
                </p>

                <div className="lorenz-chart-wrap">
                  <svg
                    className="lorenz-chart"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    role="img"
                    aria-label={`Lorenz curve with a Gini coefficient of ${advanced.giniCoefficient}`}
                  >
                    <line
                      className="lorenz-equality"
                      x1="0"
                      y1="100"
                      x2="100"
                      y2="0"
                    />

                    <polygon
                      className="lorenz-area"
                      points={`0,100 ${lorenzPoints} 100,100`}
                    />

                    <polyline
                      className="lorenz-curve"
                      points={lorenzPoints}
                    />

                    {advanced.lorenzCurve.map((point) => {
                      const pointX = point.holdersShare;
                      const pointY =
                        100 - point.supplyShare;

                      return (
                        <g
                          key={point.holdersShare}
                          aria-hidden="true"
                        >
                          <line
                            className="lorenz-chart-point-outline"
                            x1={pointX - 0.01}
                            y1={pointY}
                            x2={pointX + 0.01}
                            y2={pointY}
                          />

                          <line
                            className="lorenz-chart-point"
                            x1={pointX - 0.01}
                            y1={pointY}
                            x2={pointX + 0.01}
                            y2={pointY}
                          />
                        </g>
                      );
                    })}
                  </svg>

                  <span className="lorenz-axis lorenz-axis-y">
                    Cumulative supply
                  </span>

                  <span className="lorenz-axis lorenz-axis-x">
                    Cumulative addresses
                  </span>
                </div>

                <div className="lorenz-summary">
                  <div>
                    <span>Bottom 50% supply</span>
                    <strong>
                      {bottom50SupplyShare === null
                        ? "—"
                        : `${bottom50SupplyShare.toFixed(
                            2,
                          )}%`}
                    </strong>
                    <small>
                      Supply held by the least-funded half
                      of addresses.
                    </small>
                  </div>

                  <div>
                    <span>Holders controlling 50%</span>
                    <strong>
                      {holdersControlling50Share === null
                        ? "—"
                        : `${holdersControlling50Share.toFixed(
                            2,
                          )}%`}
                    </strong>
                    <small>
                      Smallest share of the largest addresses
                      needed to hold at least 50% of supply.
                    </small>
                  </div>
                </div>
              </article>
            </div>

            <article className="panel whale-panel">
              <div className="panel-heading">
                <h3>Holding thresholds and whale tiers</h3>

                <p>
                  Holder-balance percentiles and supply-based
                  wallet categories
                </p>
              </div>

              <p className="panel-explanation">
                P90 is the minimum balance held by approximately the
                top 10% of addresses, P95 by the top 5%, and P99 by
                the top 1%.
              </p>

              <div className="percentile-grid">
                <div>
                  <span>P90 holding</span>
                  <strong>
                    {advanced.holdingPercentiles.p90.toLocaleString(
                      "en-US",
                    )}
                  </strong>
                  <small>
                    Top 10% threshold
                  </small>
                </div>

                <div>
                  <span>P95 holding</span>
                  <strong>
                    {advanced.holdingPercentiles.p95.toLocaleString(
                      "en-US",
                    )}
                  </strong>
                  <small>
                    Top 5% threshold
                  </small>
                </div>

                <div>
                  <span>P99 holding</span>
                  <strong>
                    {advanced.holdingPercentiles.p99.toLocaleString(
                      "en-US",
                    )}
                  </strong>
                  <small>
                    Top 1% threshold
                  </small>
                </div>
              </div>

              <div className="fixed-concentration-block">
                <div className="panel-heading">
                  <h3>Fixed-address concentration</h3>

                  <p>
                    Supply held by the largest fixed number of
                    addresses
                  </p>
                </div>

                <div className="depth-list">
                  {concentrationRows.map((row) => (
                    <div
                      className="depth-row"
                      key={row.label}
                    >
                      <div className="fixed-concentration-label">
                        <p>{row.label} addresses</p>

                        <small>
                          {row.inscriptions.toLocaleString(
                            "en-US",
                          )}{" "}
                          inscriptions
                        </small>
                      </div>

                      <div className="depth-track">
                        <div
                          className="depth-fill"
                          style={{
                            width: `${row.value}%`,
                          }}
                        />
                      </div>

                      <strong>{row.value}%</strong>
                    </div>
                  ))}
                </div>
              </div>

              <p className="panel-explanation panel-explanation-secondary">
                Whale tiers group addresses according to the
                percentage of circulating supply they control. They
                describe address size only and do not identify the
                person or organization behind an address.
              </p>

              <div className="whale-table">
                <div className="whale-table-header">
                  <span>Tier</span>
                  <span>Addresses</span>
                  <span>Inscriptions</span>
                  <span>Supply</span>
                </div>

                {advanced.whaleTiers.map((tier) => (
                  <div
                    className="whale-table-row"
                    key={tier.tier}
                  >
                    <div>
                      <strong>{tier.tier}</strong>
                      <small>{tier.label}</small>
                    </div>

                    <span>
                      {tier.addresses.toLocaleString(
                        "en-US",
                      )}
                    </span>

                    <span>
                      {tier.inscriptions.toLocaleString(
                        "en-US",
                      )}
                    </span>

                    <strong>
                      {tier.shareOfSupply}%
                    </strong>
                  </div>
                ))}
              </div>
            </article>
          </section>
        ) : null}

        <OwnershipHistory
          points={historyPoints}
        />

        <p className="demo-disclaimer">
          Ownership values come from an on-chain snapshot generated
          with a local ord index and published to Supabase. An address
          does not necessarily represent one individual owner. No
          investment conclusion should be drawn from these metrics.
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
