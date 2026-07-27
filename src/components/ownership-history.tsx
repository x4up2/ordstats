"use client";

import { useMemo, useState } from "react";

export type OwnershipHistoryPoint = {
  snapshotDate: string;
  capturedAt: string;
  blockHeight: number | null;
  holdingAddresses: number;
  ownershipEvenness: number | null;
  effectiveHolders: number | null;
  giniCoefficient: number | null;
  largestHolderShare: number | null;
  top1SupplyShare: number | null;
  singleHolderSupplyShare: number | null;
  averageHolding: number | null;
};

type OwnershipHistoryProps = {
  points: OwnershipHistoryPoint[];
};

type HistoryMetricKey =
  | "holdingAddresses"
  | "ownershipEvenness"
  | "effectiveHolders"
  | "giniCoefficient"
  | "largestHolderShare"
  | "top1SupplyShare"
  | "singleHolderSupplyShare"
  | "averageHolding";

type HistoryMetricFormat =
  | "integer"
  | "percent"
  | "gini"
  | "decimal";

type HistoryMetricDefinition = {
  key: HistoryMetricKey;
  label: string;
  format: HistoryMetricFormat;
  decimals: number;
  deltaSuffix: string;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const periodOptions = [
  {
    days: 1,
    label: "1 DAY",
  },
  {
    days: 7,
    label: "7 DAYS",
  },
  {
    days: 30,
    label: "30 DAYS",
  },
] as const;

const historyMetricDefinitions: HistoryMetricDefinition[] = [
  {
    key: "holdingAddresses",
    label: "Holding addresses",
    format: "integer",
    decimals: 0,
    deltaSuffix: "",
  },
  {
    key: "ownershipEvenness",
    label: "Ownership evenness",
    format: "percent",
    decimals: 1,
    deltaSuffix: " pt",
  },
  {
    key: "effectiveHolders",
    label: "Effective holders",
    format: "integer",
    decimals: 0,
    deltaSuffix: "",
  },
  {
    key: "giniCoefficient",
    label: "Gini coefficient",
    format: "gini",
    decimals: 3,
    deltaSuffix: "",
  },
  {
    key: "largestHolderShare",
    label: "Largest holder",
    format: "percent",
    decimals: 2,
    deltaSuffix: " pt",
  },
  {
    key: "top1SupplyShare",
    label: "Top 1% supply",
    format: "percent",
    decimals: 2,
    deltaSuffix: " pt",
  },
  {
    key: "singleHolderSupplyShare",
    label: "Single-holder supply",
    format: "percent",
    decimals: 2,
    deltaSuffix: " pt",
  },
  {
    key: "averageHolding",
    label: "Average holding",
    format: "decimal",
    decimals: 2,
    deltaSuffix: "",
  },
];

const chartMetricKeys: HistoryMetricKey[] = [
  "holdingAddresses",
  "effectiveHolders",
  "giniCoefficient",
  "top1SupplyShare",
];

function parseSnapshotDate(snapshotDate: string) {
  return new Date(`${snapshotDate}T00:00:00Z`);
}

function findBaseline(
  points: OwnershipHistoryPoint[],
  days: number,
) {
  if (points.length < 2) {
    return null;
  }

  const latest = points.at(-1);

  if (!latest) {
    return null;
  }

  const latestDate = parseSnapshotDate(
    latest.snapshotDate,
  );

  if (Number.isNaN(latestDate.getTime())) {
    return null;
  }

  const targetDate = new Date(
    latestDate.getTime() - days * DAY_IN_MS,
  );

  const targetKey = targetDate
    .toISOString()
    .slice(0, 10);

  return (
    points.find(
      (point) =>
        point.snapshotDate >= targetKey &&
        point.snapshotDate < latest.snapshotDate,
    ) ?? null
  );
}

function getMetricValue(
  point: OwnershipHistoryPoint,
  key: HistoryMetricKey,
) {
  return point[key];
}

function formatMetricValue(
  value: number | null,
  metric: HistoryMetricDefinition,
) {
  if (value === null) {
    return "—";
  }

  if (metric.format === "integer") {
    return Math.round(value).toLocaleString("en-US");
  }

  if (metric.format === "gini") {
    return value.toFixed(3);
  }

  if (metric.format === "percent") {
    return `${value.toLocaleString("en-US", {
      minimumFractionDigits: metric.decimals,
      maximumFractionDigits: metric.decimals,
    })}%`;
  }

  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: metric.decimals,
  });
}

function normalizeDelta(
  delta: number,
  metric: HistoryMetricDefinition,
) {
  const threshold =
    0.5 * 10 ** -metric.decimals;

  return Math.abs(delta) < threshold
    ? 0
    : delta;
}

function formatDelta(
  delta: number,
  metric: HistoryMetricDefinition,
) {
  const normalizedDelta =
    normalizeDelta(delta, metric);

  if (normalizedDelta === 0) {
    return "-";
  }

  const formatted =
    normalizedDelta.toLocaleString("en-US", {
      minimumFractionDigits: metric.decimals,
      maximumFractionDigits: metric.decimals,
    });

  const signed =
    normalizedDelta > 0
      ? `+${formatted}`
      : formatted;

  return `${signed}${metric.deltaSuffix}`;
}

function deltaTone(
  delta: number,
  metric: HistoryMetricDefinition,
) {
  const normalizedDelta =
    normalizeDelta(delta, metric);

  if (normalizedDelta > 0) {
    return "positive";
  }

  if (normalizedDelta < 0) {
    return "negative";
  }

  return "neutral";
}

function formatShortDate(snapshotDate: string) {
  const date = parseSnapshotDate(snapshotDate);

  if (Number.isNaN(date.getTime())) {
    return snapshotDate;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

function formatLongDate(snapshotDate: string) {
  const date = parseSnapshotDate(snapshotDate);

  if (Number.isNaN(date.getTime())) {
    return snapshotDate;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function differenceInDays(
  startDate: string,
  endDate: string,
) {
  const start = parseSnapshotDate(startDate);
  const end = parseSnapshotDate(endDate);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.round(
      (end.getTime() - start.getTime()) /
        DAY_IN_MS,
    ),
  );
}

type SparklineProps = {
  points: OwnershipHistoryPoint[];
  metric: HistoryMetricDefinition;
};

function Sparkline({
  points,
  metric,
}: SparklineProps) {
  const [hoveredPointIndex, setHoveredPointIndex] =
    useState<number | null>(null);

  const observations = points
    .map((point) => ({
      point,
      value: getMetricValue(point, metric.key),
    }))
    .filter(
      (
        observation,
      ): observation is {
        point: OwnershipHistoryPoint;
        value: number;
      } => observation.value !== null,
    );

  if (observations.length < 2) {
    return (
      <div className="history-sparkline-empty">
        Not enough observations
      </div>
    );
  }

  const width = 100;
  const height = 42;
  const horizontalPadding = 3;
  const verticalPadding = 4;

  const dates = observations.map((observation) =>
    parseSnapshotDate(
      observation.point.snapshotDate,
    ).getTime(),
  );

  const values = observations.map(
    (observation) => observation.value,
  );

  const chartValues = values.map((value) =>
    Number(value.toFixed(metric.decimals)),
  );

  const firstDate = Math.min(...dates);
  const lastDate = Math.max(...dates);
  const minimumValue = Math.min(...chartValues);
  const maximumValue = Math.max(...chartValues);

  const dateRange = Math.max(
    1,
    lastDate - firstDate,
  );

  const valueRange = Math.max(
    0.0000001,
    maximumValue - minimumValue,
  );

  const coordinates = observations.map(
    (observation, index) => {
      const date = dates[index];

      const x =
        horizontalPadding +
        ((date - firstDate) / dateRange) *
          (width - horizontalPadding * 2);

      const y =
        maximumValue === minimumValue
          ? height / 2
          : verticalPadding +
            ((maximumValue - chartValues[index]) /
              valueRange) *
              (height - verticalPadding * 2);

      return {
        x,
        y,
      };
    },
  );

  const linePoints = coordinates
    .map(
      (coordinate) =>
        `${coordinate.x.toFixed(2)},${coordinate.y.toFixed(
          2,
        )}`,
    )
    .join(" ");

  const firstCoordinate = coordinates[0];
  const lastCoordinate =
    coordinates[coordinates.length - 1];

  const areaPoints = [
    `${firstCoordinate.x.toFixed(2)},${(
      height - verticalPadding
    ).toFixed(2)}`,
    linePoints,
    `${lastCoordinate.x.toFixed(2)},${(
      height - verticalPadding
    ).toFixed(2)}`,
  ].join(" ");

  const hoveredObservation =
    hoveredPointIndex === null
      ? null
      : observations[hoveredPointIndex] ?? null;

  const hoveredCoordinate =
    hoveredPointIndex === null
      ? null
      : coordinates[hoveredPointIndex] ?? null;

  return (
    <div className="history-sparkline-wrap">
      <svg
        className="history-sparkline"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${metric.label} evolution across ${observations.length} daily snapshots`}
    >
      <line
        className="history-sparkline-guide"
        x1="0"
        y1={height / 2}
        x2={width}
        y2={height / 2}
      />

      <polygon
        className="history-sparkline-area"
        points={areaPoints}
      />

      <polyline
        className="history-sparkline-line"
        points={linePoints}
      />

      {coordinates.map((coordinate, index) => {
        const isLatest =
          index === coordinates.length - 1;

        const modifier = isLatest
          ? " history-sparkline-point-latest"
          : "";

        return (
          <g
            key={`${coordinate.x.toFixed(
              2,
            )}-${coordinate.y.toFixed(2)}-${index}`}
          >
            <line
              className="history-sparkline-point-hit"
              x1={coordinate.x}
              y1={coordinate.y}
              x2={coordinate.x}
              y2={coordinate.y}
              onMouseEnter={() => {
                setHoveredPointIndex(index);
              }}
              onMouseLeave={() => {
                setHoveredPointIndex(null);
              }}
            />

            <line
              className={`history-sparkline-point-outline${modifier}`}
              x1={coordinate.x - 0.01}
              y1={coordinate.y}
              x2={coordinate.x + 0.01}
              y2={coordinate.y}
            />

            <line
              className={`history-sparkline-point${modifier}`}
              x1={coordinate.x - 0.01}
              y1={coordinate.y}
              x2={coordinate.x + 0.01}
              y2={coordinate.y}
            />
          </g>
        );
      })}
      </svg>

      {hoveredObservation && hoveredCoordinate ? (
        <div
          className={`history-sparkline-tooltip${
            hoveredCoordinate.x < 14
              ? " history-sparkline-tooltip-left"
              : hoveredCoordinate.x > 86
                ? " history-sparkline-tooltip-right"
                : ""
          }`}
          style={{
            left: `${
              (hoveredCoordinate.x / width) * 100
            }%`,
            top: `${
              (hoveredCoordinate.y / height) * 100
            }%`,
          }}
        >
          <strong>
            {formatMetricValue(
              hoveredObservation.value,
              metric,
            )}
          </strong>

          <span>
            {hoveredObservation.point.blockHeight === null
              ? "Block unavailable"
              : `Block ${Math.round(
                  hoveredObservation.point.blockHeight,
                ).toLocaleString("en-US")}`}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export default function OwnershipHistory({
  points,
}: OwnershipHistoryProps) {
  const [requestedPeriod, setRequestedPeriod] =
    useState(1);

  const sortedPoints = useMemo(
    () =>
      [...points].sort((left, right) =>
        left.snapshotDate.localeCompare(
          right.snapshotDate,
        ),
      ),
    [points],
  );

  const latestPoint = sortedPoints.at(-1) ?? null;

  const periodStates = useMemo(
    () =>
      periodOptions.map((period) => ({
        ...period,
        baseline: findBaseline(
          sortedPoints,
          period.days,
        ),
      })),
    [sortedPoints],
  );

  const requestedState =
    periodStates.find(
      (period) =>
        period.days === requestedPeriod &&
        period.baseline,
    ) ?? null;

  const firstAvailableState =
    periodStates.find(
      (period) => period.baseline,
    ) ?? null;

  const activeState =
    requestedState ?? firstAvailableState;

  const baselinePoint =
    activeState?.baseline ?? null;

  const activePoints =
    baselinePoint && latestPoint
      ? sortedPoints.filter(
          (point) =>
            point.snapshotDate >=
            baselinePoint.snapshotDate,
        )
      : [];

  const availableMetrics =
    baselinePoint && latestPoint
      ? historyMetricDefinitions.filter(
          (metric) =>
            getMetricValue(
              baselinePoint,
              metric.key,
            ) !== null &&
            getMetricValue(
              latestPoint,
              metric.key,
            ) !== null,
        )
      : [];

  const chartMetrics =
    availableMetrics.filter((metric) =>
      chartMetricKeys.includes(metric.key),
    );

  const observedDays =
    baselinePoint && latestPoint
      ? differenceInDays(
          baselinePoint.snapshotDate,
          latestPoint.snapshotDate,
        )
      : 0;

  return (
    <section
      className="dashboard-section history-section"
      id="history"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            Evolution · Daily snapshots
          </p>

          <h2>Ownership history</h2>
        </div>

        <p className="section-description">
          Large figures show metric variations over the
          selected period. Smaller values show baseline
          → current.
        </p>
      </div>

      <div
        className="history-period-tabs"
        aria-label="History comparison period"
      >
        {periodStates.map((period) => {
          const isAvailable =
            period.baseline !== null;

          const isActive =
            activeState?.days === period.days;

          return (
            <button
              type="button"
              key={period.days}
              disabled={!isAvailable}
              className={
                isActive
                  ? "history-period-active"
                  : undefined
              }
              onClick={() =>
                setRequestedPeriod(period.days)
              }
            >
              {period.label}
            </button>
          );
        })}
      </div>

      {baselinePoint &&
      latestPoint &&
      availableMetrics.length > 0 ? (
        <>
          <article className="panel history-panel">
            <div className="history-summary-grid">
              {availableMetrics.map((metric) => {
                const previousValue =
                  getMetricValue(
                    baselinePoint,
                    metric.key,
                  );

                const currentValue =
                  getMetricValue(
                    latestPoint,
                    metric.key,
                  );

                if (
                  previousValue === null ||
                  currentValue === null
                ) {
                  return null;
                }

                const delta =
                  currentValue - previousValue;

                return (
                  <div
                    className={`history-card history-${deltaTone(delta, metric)}`}
                    key={metric.key}
                  >
                    <span className="history-label">
                      {metric.label}
                    </span>

                    <strong>
                      {formatDelta(delta, metric)}
                    </strong>

                    <small>
                      {formatMetricValue(
                        previousValue,
                        metric,
                      )}
                      <span aria-hidden="true">
                        {" "}
                        →{" "}
                      </span>
                      {formatMetricValue(
                        currentValue,
                        metric,
                      )}
                    </small>
                  </div>
                );
              })}
            </div>

            <div className="panel-footer history-footer">
              <p>
                Compared with{" "}
                {formatLongDate(
                  baselinePoint.snapshotDate,
                )}
                {baselinePoint.blockHeight
                  ? ` · Bitcoin block ${baselinePoint.blockHeight.toLocaleString(
                      "en-US",
                    )}`
                  : ""}
              </p>

              <p>
                {observedDays} observed day
                {observedDays === 1 ? "" : "s"} · Direction
                does not imply investment quality
              </p>
            </div>
          </article>

          {chartMetrics.length > 0 ? (
            <div className="history-chart-grid">
              {chartMetrics.map((metric) => {
                const previousValue =
                  getMetricValue(
                    baselinePoint,
                    metric.key,
                  );

                const currentValue =
                  getMetricValue(
                    latestPoint,
                    metric.key,
                  );

                if (
                  previousValue === null ||
                  currentValue === null
                ) {
                  return null;
                }

                const delta =
                  currentValue - previousValue;

                return (
                  <article
                    className="history-chart-card"
                    key={metric.key}
                  >
                    <div className="history-chart-heading">
                      <div>
                        <span>{metric.label}</span>

                        <strong>
                          {formatMetricValue(
                            currentValue,
                            metric,
                          )}
                        </strong>
                      </div>

                      <small
                        className={`history-chart-change history-chart-${deltaTone(delta, metric)}`}
                      >
                        {formatDelta(delta, metric)}
                      </small>
                    </div>

                    <Sparkline
                      points={activePoints}
                      metric={metric}
                    />

                    <div className="history-chart-axis">
                      <span>
                        {formatShortDate(
                          baselinePoint.snapshotDate,
                        )}
                      </span>

                      <span>
                        {formatShortDate(
                          latestPoint.snapshotDate,
                        )}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}

          <p className="history-data-note">
            Each tab shows recorded observations within its
            maximum time window. Lines connect observations
            only; missing dates are not interpolated or
            estimated.
          </p>
        </>
      ) : (
        <article className="panel history-empty">
          <span className="history-empty-number">
            01 → 02
          </span>

          <div>
            <h3>
              More daily snapshots are needed
            </h3>

            <p>
              ORDstats activates each comparison period as
              soon as at least two observations fall within
              the selected time window. No historical value
              is estimated.
            </p>
          </div>
        </article>
      )}
    </section>
  );
}
