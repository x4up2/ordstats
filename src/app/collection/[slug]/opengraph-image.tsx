import { ImageResponse } from "next/og";
import sharp from "sharp";

import {
  getCollectionSnapshots,
  getPublicCollection,
  type HistoricalCollectionSnapshot,
  type PublicCollection,
} from "@/lib/collection-data";
import {
  calculateDistributionHealth,
  getDistributionHealthColor,
  type DistributionHealthHistoryPoint,
} from "@/lib/distribution-health";

export const runtime = "nodejs";

export const alt =
  "ORDstats collection ownership analytics";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export const revalidate = 86400;

type OpenGraphImageProps = {
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
        word.charAt(0).toUpperCase() +
        word.slice(1),
    )
    .join(" ");
}

async function getImageDataUrl(
  imageUrl: string | null,
) {
  const baseUrl =
    "https://www.ordstats.net";

  const candidates = [
    imageUrl,
    "/ordstats-mark.png",
  ].filter(
    (value): value is string =>
      Boolean(value),
  );

  const targetSize = 248;
  const pixelThreshold = 300;
  const cornerRadius = 30;

  for (const candidate of candidates) {
    try {
      const sourceUrl = new URL(
        candidate,
        baseUrl,
      );

      const response = await fetch(
        sourceUrl,
        {
          cache: "force-cache",
          next: {
            revalidate: 86400,
          },
        },
      );

      if (!response.ok) {
        console.error(
          `Unable to load OG source image: ${sourceUrl} — HTTP ${response.status}`,
        );

        continue;
      }

      const inputBuffer = Buffer.from(
        await response.arrayBuffer(),
      );

      const sourceImage = sharp(
        inputBuffer,
        {
          animated: false,
        },
      );

      const metadata =
        await sourceImage.metadata();

      const sourceWidth =
        metadata.width ?? 0;

      const sourceHeight =
        metadata.height ?? 0;

      if (
        sourceWidth <= 0 ||
        sourceHeight <= 0
      ) {
        console.error(
          `Invalid OG source image dimensions: ${sourceUrl}`,
        );

        continue;
      }

      const pixelated =
        sourceWidth < pixelThreshold ||
        sourceHeight < pixelThreshold;

      const resizeKernel = pixelated
        ? sharp.kernel.nearest
        : sharp.kernel.lanczos3;

      const resizedBuffer =
        await sourceImage
          .resize(
            targetSize,
            targetSize,
            {
              fit: "cover",
              position: "center",
              kernel: resizeKernel,
            },
          )
          .png({
            compressionLevel: 9,
          })
          .toBuffer();

      /*
       * ImageResponse does not always clip nested images
       * perfectly. The rounded mask is therefore applied
       * directly to the generated PNG.
       */
      const roundedMask = Buffer.from(
        `<svg
          width="${targetSize}"
          height="${targetSize}"
          viewBox="0 0 ${targetSize} ${targetSize}"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect
            width="${targetSize}"
            height="${targetSize}"
            rx="${cornerRadius}"
            ry="${cornerRadius}"
            fill="#ffffff"
          />
        </svg>`,
      );

      const pngBuffer =
        await sharp(resizedBuffer)
          .composite([
            {
              input: roundedMask,
              blend: "dest-in",
            },
          ])
          .png({
            compressionLevel: 9,
          })
          .toBuffer();

      console.info(
        [
          "[ORDstats OG artwork]",
          `${sourceWidth}×${sourceHeight}`,
          pixelated
            ? "pixelated enlargement"
            : "smooth interpolation",
          sourceUrl.toString(),
        ].join(" · "),
      );

      return (
        "data:image/png;base64," +
        pngBuffer.toString("base64")
      );
    } catch (error) {
      console.error(
        `Unable to prepare OG source image: ${candidate}`,
        error,
      );
    }
  }

  return null;
}

function formatPercent(value: number | null) {
  if (value === null) {
    return "—";
  }

  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })}%`;
}

function getCollectionNameSize(name: string) {
  if (name.length > 28) {
    return 45;
  }

  if (name.length > 20) {
    return 52;
  }

  return 62;
}

function getCurrentSnapshotDate(
  capturedAt: string,
) {
  const currentDate = new Date(capturedAt);

  if (Number.isNaN(currentDate.getTime())) {
    return null;
  }

  const parts = Object.fromEntries(
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

  return (
    `${parts.year}-` +
    `${parts.month}-` +
    `${parts.day}`
  );
}

function buildHealthHistoryPoints(
  collection: PublicCollection,
  recentSnapshots: HistoricalCollectionSnapshot[],
): DistributionHealthHistoryPoint[] {
  const historyPointByDate =
    new Map<
      string,
      DistributionHealthHistoryPoint
    >();

  recentSnapshots.forEach(
    (historicalSnapshot) => {
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
          holdingAddresses:
            historicalHoldingAddresses,
          ownershipEvenness:
            historicalEvenness,
          giniCoefficient:
            historicalAdvanced?.giniCoefficient ??
            null,
          largestHolderShare:
            historicalAdvanced?.largestHolder
              .share ?? null,
          top1SupplyShare:
            historicalAdvanced?.topHolderGroups
              .top1Percent.share ?? null,
          singleHolderSupplyShare:
            historicalAdvanced?.singleHolderSupply
              .share ?? null,
        },
      );
    },
  );

  const currentCapturedAt =
    collection.latest_snapshot_at;

  if (currentCapturedAt) {
    const currentSnapshotDate =
      getCurrentSnapshotDate(
        currentCapturedAt,
      );

    if (currentSnapshotDate) {
      const ownership =
        collection.current_ownership.ownership;

      const advanced =
        collection.advanced_ownership;

      const ownershipEvenness =
        advanced &&
        ownership.holdingAddresses > 0
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

      historyPointByDate.set(
        currentSnapshotDate,
        {
          snapshotDate:
            currentSnapshotDate,
          holdingAddresses:
            ownership.holdingAddresses,
          ownershipEvenness,
          giniCoefficient:
            advanced?.giniCoefficient ?? null,
          largestHolderShare:
            advanced?.largestHolder.share ??
            null,
          top1SupplyShare:
            advanced?.topHolderGroups
              .top1Percent.share ?? null,
          singleHolderSupplyShare:
            advanced?.singleHolderSupply
              .share ?? null,
        },
      );
    }
  }

  return Array.from(
    historyPointByDate.values(),
  ).sort((left, right) =>
    left.snapshotDate.localeCompare(
      right.snapshotDate,
    ),
  );
}

function renderFallbackCard(name: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "54px",
          color: "#f7f9fc",
          background:
            "linear-gradient(135deg, #061426 0%, #0a1d35 58%, #07182d 100%)",
          fontFamily:
            "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 32,
            fontWeight: 700,
          }}
        >
          <span style={{ color: "#5790d7" }}>
            ORD
          </span>
          <span style={{ color: "#a9b8c9" }}>
            stats
          </span>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 66,
              fontWeight: 700,
              letterSpacing: "-2px",
            }}
          >
            {name}
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 18,
              fontSize: 29,
              color: "#aab8c8",
            }}
          >
            No ORDstats ownership snapshot
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 24,
            color: "#7790aa",
          }}
        >
          ordstats.net
        </div>
      </div>
    ),
    size,
  );
}

export default async function OpenGraphImage({
  params,
}: OpenGraphImageProps) {
  const { slug: encodedSlug } = await params;

  const slug = decodeURIComponent(
    encodedSlug,
  ).toLowerCase();

  const collection =
    await getPublicCollection(slug);

  if (!collection) {
    return renderFallbackCard(
      humanizeSlug(slug),
    );
  }

  const recentSnapshots =
    await getCollectionSnapshots(slug, 370);

  const ownership =
    collection.current_ownership.ownership;

  const advanced =
    collection.advanced_ownership;

  const historyPoints =
    buildHealthHistoryPoints(
      collection,
      recentSnapshots,
    );

  const distributionHealth =
    calculateDistributionHealth({
      ownership,
      advanced,
      historyPoints,
    });

  const healthColor = distributionHealth
    ? getDistributionHealthColor(
        distributionHealth.score,
      )
    : "#64748b";

  const healthValue = distributionHealth
    ? `${distributionHealth.score}/100`
    : "—";

  const healthCaption = distributionHealth
    ? `${distributionHealth.label}${
        distributionHealth.provisional
          ? " · Provisional"
          : ""
      }`
    : "Not available";

  const rankCaption =
    collection.ord_rank_30d !== null
      ? `#${collection.ord_rank_30d} on ord.net · 30-day ranking`
      : "Ordinals ownership analytics";

  const imageDataUrl =
    await getImageDataUrl(
      collection.image_url,
    );

  const largestHolderShare =
    advanced?.largestHolder.share ?? null;

  const nameFontSize =
    getCollectionNameSize(
      collection.name,
    );

  const metrics = [
    {
      label: "Distribution health",
      value: healthValue,
      detail: healthCaption,
      accent: healthColor,
    },
    {
      label: "Holding addresses",
      value:
        ownership.holdingAddresses.toLocaleString(
          "en-US",
        ),
      detail: "Observable holders",
      accent: "#f6f8fb",
    },
    {
      label: "Top 10 share",
      value: formatPercent(
        ownership.top10.share,
      ),
      detail: "Of circulating supply",
      accent: "#f6f8fb",
    },
    {
      label: "Largest holder",
      value: formatPercent(
        largestHolderShare,
      ),
      detail: "Of circulating supply",
      accent: "#f6f8fb",
    },
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          padding: "46px 50px",
          color: "#f7f9fc",
          background:
            "linear-gradient(135deg, #061426 0%, #0a1e37 56%, #07182c 100%)",
          fontFamily:
            "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent:
              "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 31,
              fontWeight: 700,
              letterSpacing: "-0.7px",
            }}
          >
            <span
              style={{
                color: "#5790d7",
              }}
            >
              ORD
            </span>

            <span
              style={{
                color: "#a9b8c9",
              }}
            >
              stats
            </span>
          </div>

          <div
            style={{
              display: "flex",
              padding: "10px 17px",
              border:
                "1px solid rgba(111, 147, 183, 0.28)",
              borderRadius: 999,
              fontSize: 18,
              color: "#91a6ba",
              background:
                "rgba(9, 25, 45, 0.52)",
            }}
          >
            {rankCaption}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent:
              "space-between",
            marginTop: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 748,
              paddingRight: 30,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 21,
                fontWeight: 700,
                letterSpacing: "2.4px",
                textTransform: "uppercase",
                color: "#648fbe",
              }}
            >
              Collection ownership
            </div>

            <div
              style={{
                display: "flex",
                marginTop: 13,
                maxWidth: 735,
                fontSize: nameFontSize,
                lineHeight: 1.02,
                fontWeight: 700,
                letterSpacing: "-2px",
              }}
            >
              {collection.name}
            </div>

            <div
              style={{
                display: "flex",
                marginTop: 18,
                fontSize: 27,
                color: "#aebac7",
              }}
            >
              Inside Ordinals ownership.
            </div>
          </div>

          <div
            style={{
              width: 248,
              height: 248,
              display: "flex",
              overflow: "hidden",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 30,
              border:
                "1px solid rgba(94, 137, 182, 0.38)",
              background:
                "rgba(5, 16, 30, 0.65)",
              boxShadow:
                "0 22px 55px rgba(0, 0, 0, 0.32)",
            }}
          >
            {imageDataUrl ? (
              <img
                src={imageDataUrl}
                alt=""
                width="248"
                height="248"
                style={{
                  width: "248px",
                  height: "248px",
                  objectFit: "cover",
                }}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "248px",
                  height: "248px",
                  fontSize: 48,
                  fontWeight: 700,
                  color: "#5790d7",
                }}
              >
                ORD
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            width: "100%",
            display: "flex",
            gap: 13,
          }}
        >
          {metrics.map((metric) => (
            <div
              key={metric.label}
              style={{
                width: 266,
                minHeight: 116,
                display: "flex",
                flexDirection: "column",
                justifyContent:
                  "space-between",
                padding: "16px 18px",
                border:
                  "1px solid rgba(105, 137, 170, 0.22)",
                borderRadius: 18,
                background:
                  "rgba(8, 24, 43, 0.78)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: 16,
                  color: "#879caf",
                }}
              >
                {metric.label}
              </div>

              <div
                style={{
                  display: "flex",
                  marginTop: 7,
                  fontSize: 31,
                  lineHeight: 1,
                  fontWeight: 700,
                  letterSpacing: "-0.8px",
                  color: metric.accent,
                }}
              >
                {metric.value}
              </div>

              <div
                style={{
                  display: "flex",
                  marginTop: 8,
                  fontSize: 14,
                  color: "#73899e",
                }}
              >
                {metric.detail}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            marginTop: 17,
            fontSize: 17,
            color: "#668099",
          }}
        >
          <span>
            Daily on-chain ownership analytics
          </span>

          <span>
            ordstats.net/collection/{slug}
          </span>
        </div>
      </div>
    ),
    size,
  );
}
