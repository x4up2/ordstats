"use client";

import { useMemo, useState } from "react";

import {
  calculateDistributionHealth,
  getDistributionHealthColor,
  type DistributionHealthHistoryPoint,
} from "@/lib/distribution-health";

type HealthPoint = DistributionHealthHistoryPoint & {
  holderDensity: number | null;
  effectiveHolders: number | null;
  averageHolding: number | null;
};

type Props = {
  points: HealthPoint[];
  periodDays: number;
  windowStartDate: string;
};

type HealthOwnership =
  Parameters<
    typeof calculateDistributionHealth
  >[0]["ownership"];

type HealthAdvanced = NonNullable<
  Parameters<
    typeof calculateDistributionHealth
  >[0]["advanced"]
>;

const DAY_IN_MS = 86_400_000;

function parseDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function formatDate(
  value: string,
  includeYear = false,
) {
  const date = parseDate(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: includeYear
      ? "2-digit"
      : undefined,
    timeZone: "UTC",
  }).format(date);
}

function labelDelta(value: number) {
  const rounded =
    Math.round(value * 10) / 10;

  if (rounded === 0) {
    return "No daily change";
  }

  return `${
    rounded > 0 ? "+" : ""
  }${rounded.toFixed(
    1,
  )} pts vs previous day`;
}

function buildHealthSeries(
  points: HealthPoint[],
) {
  const sorted = [...points].sort(
    (left, right) =>
      left.snapshotDate.localeCompare(
        right.snapshotDate,
      ),
  );

  return sorted.flatMap(
    (point, index) => {
      if (
        point.holdingAddresses <= 0 ||
        point.holderDensity === null ||
        point.effectiveHolders === null ||
        point.averageHolding === null ||
        point.giniCoefficient === null ||
        point.largestHolderShare === null ||
        point.top1SupplyShare === null ||
        point.singleHolderSupplyShare === null
      ) {
        return [];
      }

      const ownership = {
        holdingAddresses:
          point.holdingAddresses,
        ownershipRatio:
          point.holderDensity,
      } as HealthOwnership;

      const advanced = {
        giniCoefficient:
          point.giniCoefficient,
        effectiveHolders:
          point.effectiveHolders,
        averageHolding:
          point.averageHolding,
        largestHolder: {
          inscriptions: 0,
          share:
            point.largestHolderShare,
        },
        topHolderGroups: {
          top1Percent: {
            holderCount: 0,
            inscriptions: 0,
            share:
              point.top1SupplyShare,
          },
        },
        singleHolderSupply: {
          inscriptions: 0,
          share:
            point.singleHolderSupplyShare,
        },
      } as HealthAdvanced;

      const result =
        calculateDistributionHealth({
          ownership,
          advanced,
          historyPoints:
            sorted.slice(0, index + 1),
        });

      return result
        ? [
            {
              snapshotDate:
                point.snapshotDate,
              score: result.score,
              rawScore: result.rawScore,
              label: result.label,
              provisional:
                result.provisional,
            },
          ]
        : [];
    },
  );
}

export default function DistributionHealthHistory({
  points,
  periodDays,
  windowStartDate,
}: Props) {
  const [
    hovered,
    setHovered,
  ] = useState<number | null>(null);

  const allScores = useMemo(
    () => buildHealthSeries(points),
    [points],
  );

  const scores = allScores.filter(
    (point) =>
      point.snapshotDate >=
      windowStartDate,
  );

  if (scores.length < 2) {
    return (
      <article className="history-health-card">
        <div className="history-health-empty">
          Not enough complete observations
          to chart Distribution health.
        </div>
      </article>
    );
  }

  const width = 100;
  const height = 58;
  const padX = 3;
  const padY = 5;

  const start =
    parseDate(
      windowStartDate,
    ).getTime();

  const end =
    start +
    (periodDays - 1) *
      DAY_IN_MS;

  const span =
    Math.max(1, end - start);

  const coordinates = scores.map(
    (point) => {
      const date =
        parseDate(
          point.snapshotDate,
        ).getTime();

      return {
        x:
          padX +
          ((date - start) / span) *
            (width - padX * 2),
        y:
          padY +
          ((100 - point.rawScore) /
            100) *
            (height - padY * 2),
      };
    },
  );

  const line = coordinates
    .map(
      ({ x, y }) =>
        `${x.toFixed(
          2,
        )},${y.toFixed(2)}`,
    )
    .join(" ");

  const guides = [
    100,
    75,
    50,
    25,
    0,
  ];

  const ticks = [
    0,
    1 / 3,
    2 / 3,
    1,
  ].map(
    (ratio, index) => {
      const date = new Date(
        start +
        ratio * span,
      );

      return {
        key: index,
        label: formatDate(
          date
            .toISOString()
            .slice(0, 10),
          periodDays >= 365,
        ),
      };
    },
  );

  const latest =
    scores.at(-1)!;

  const previous =
    scores.at(-2)!;

  const latestDelta =
    latest.rawScore -
    previous.rawScore;

  const hoveredPoint =
    hovered === null
      ? null
      : scores[hovered] ?? null;

  const hoveredCoordinate =
    hovered === null
      ? null
      : coordinates[hovered] ??
        null;

  const hoveredPrevious =
    hovered !== null &&
    hovered > 0
      ? scores[hovered - 1]
      : null;

  return (
    <article className="history-health-card">
      <div className="history-health-heading">
        <div>
          <span>
            Distribution health
          </span>

          <p>
            Daily Methodology v1
            score · 0–100
          </p>
        </div>

        <div className="history-health-latest">
          <strong>
            {latest.score}
          </strong>

          <div>
            <span
              style={{
                color:
                  getDistributionHealthColor(
                    latest.score,
                  ),
              }}
            >
              {latest.label}
            </span>

            <small>
              {labelDelta(
                latestDelta,
              )}
            </small>
          </div>

          {latest.provisional ? (
            <em>Provisional</em>
          ) : null}
        </div>
      </div>

      <div className="history-health-layout">
        <div className="history-health-y-axis">
          {guides.map(
            (score) => (
              <span key={score}>
                {score}
              </span>
            ),
          )}
        </div>

        <div className="history-health-wrap">
          <svg
            className="history-health-chart"
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`Distribution health evolution across ${scores.length} daily snapshots`}
          >
            {guides.map(
              (score) => {
                const y =
                  padY +
                  ((100 - score) /
                    100) *
                    (
                      height -
                      padY * 2
                    );

                return (
                  <line
                    className="history-health-guide"
                    key={score}
                    x1={padX}
                    y1={y}
                    x2={
                      width -
                      padX
                    }
                    y2={y}
                  />
                );
              },
            )}

            <polyline
              className="history-health-line"
              points={line}
            />

            {coordinates.map(
              (
                coordinate,
                index,
              ) => {
                const point =
                  scores[index];

                const modifier = `${
                  index ===
                  coordinates.length -
                    1
                    ? " history-health-point-latest"
                    : ""
                }${
                  hovered === index
                    ? " history-health-point-hovered"
                    : ""
                }`;

                return (
                  <g
                    key={
                      point.snapshotDate
                    }
                  >
                    <line
                      className="history-health-hit"
                      x1={
                        coordinate.x
                      }
                      y1={
                        coordinate.y
                      }
                      x2={
                        coordinate.x
                      }
                      y2={
                        coordinate.y
                      }
                      onMouseEnter={() =>
                        setHovered(
                          index,
                        )
                      }
                      onMouseLeave={() =>
                        setHovered(
                          null,
                        )
                      }
                    />

                    <line
                      className={`history-health-outline${modifier}`}
                      x1={
                        coordinate.x -
                        0.01
                      }
                      y1={
                        coordinate.y
                      }
                      x2={
                        coordinate.x +
                        0.01
                      }
                      y2={
                        coordinate.y
                      }
                    />

                    <line
                      className={`history-health-point${modifier}`}
                      x1={
                        coordinate.x -
                        0.01
                      }
                      y1={
                        coordinate.y
                      }
                      x2={
                        coordinate.x +
                        0.01
                      }
                      y2={
                        coordinate.y
                      }
                      style={{
                        stroke:
                          getDistributionHealthColor(
                            point.score,
                          ),
                      }}
                    />
                  </g>
                );
              },
            )}
          </svg>

          {hoveredPoint &&
          hoveredCoordinate ? (
            <div
              className={`history-health-tooltip${
                hoveredCoordinate.x <
                14
                  ? " history-health-tooltip-left"
                  : hoveredCoordinate.x >
                      86
                    ? " history-health-tooltip-right"
                    : ""
              }`}
              style={{
                left: `${
                  (
                    hoveredCoordinate.x /
                    width
                  ) * 100
                }%`,
                top: `${
                  (
                    hoveredCoordinate.y /
                    height
                  ) * 100
                }%`,
              }}
            >
              <strong>
                {hoveredPoint.score}
                {" / 100"}
              </strong>

              <span
                style={{
                  color:
                    getDistributionHealthColor(
                      hoveredPoint.score,
                    ),
                }}
              >
                {hoveredPoint.label}
              </span>

              <small>
                {formatDate(
                  hoveredPoint
                    .snapshotDate,
                  true,
                )}
              </small>

              <small>
                {hoveredPrevious
                  ? labelDelta(
                      hoveredPoint
                        .rawScore -
                        hoveredPrevious
                          .rawScore,
                    )
                  : "First observation"}
              </small>
            </div>
          ) : null}
        </div>
      </div>

      <div className="history-health-x-axis">
        {ticks.map(
          (tick) => (
            <span key={tick.key}>
              {tick.label}
            </span>
          ),
        )}
      </div>

      <p className="history-health-note">
        Each point is recalculated with
        Methodology v1 using only data
        available on that date. Scores
        remain provisional until a
        complete 30-day trend window is
        available.
      </p>
    </article>
  );
}
