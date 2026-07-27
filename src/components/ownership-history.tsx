"use client";

import { useMemo, useState } from "react";

export type OwnershipHistoryPoint = {
  snapshotDate: string;
  capturedAt: string;
  blockHeight: number | null;
  holdingAddresses: number;
  singleHolders: number;
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
  | "singleHolders"
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

const comparisonPeriodOptions = [
  {
    days: 1,
    label: "1 DAY",
    requiresFullWindow: false,
  },
  {
    days: 7,
    label: "7 DAYS",
    requiresFullWindow: false,
  },
  {
    days: 30,
    label: "30 DAYS",
    requiresFullWindow: false,
  },
  {
    days: 180,
    label: "6 MONTHS",
    requiresFullWindow: true,
  },
  {
    days: 365,
    label: "1 YEAR",
    requiresFullWindow: true,
  },
] as const;

const chartPeriodOptions = [
  {
    days: 30,
    label: "30 DAYS",
    requiresFullWindow: false,
  },
  {
    days: 180,
    label: "6 MONTHS",
    requiresFullWindow: true,
  },
  {
    days: 365,
    label: "1 YEAR",
    requiresFullWindow: true,
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
    key: "singleHolders",
    label: "Single holders",
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

const historyDisplayMetricKeys: HistoryMetricKey[] = [
  "holdingAddresses",
  "singleHolders",
  "averageHolding",
  "effectiveHolders",
  "giniCoefficient",
  "top1SupplyShare",
];

function parseSnapshotDate(snapshotDate: string) {
  return new Date(`${snapshotDate}T00:00:00Z`);
}

function getPeriodSpanDays(days: number) {
  return days === 1 ? 1 : days - 1;
}

function hasFullWindow(
  points: OwnershipHistoryPoint[],
  days: number,
) {
  const earliest = points[0];
  const latest = points.at(-1);

  if (!earliest || !latest) {
    return false;
  }

  const earliestDate = parseSnapshotDate(
    earliest.snapshotDate,
  );

  const latestDate = parseSnapshotDate(
    latest.snapshotDate,
  );

  if (
    Number.isNaN(earliestDate.getTime()) ||
    Number.isNaN(latestDate.getTime())
  ) {
    return false;
  }

  const requiredStart =
    latestDate.getTime() -
    getPeriodSpanDays(days) * DAY_IN_MS;

  return earliestDate.getTime() <= requiredStart;
}

function addDaysToSnapshotDate(
  snapshotDate: string,
  days: number,
) {
  const date = parseSnapshotDate(snapshotDate);

  if (Number.isNaN(date.getTime())) {
    return snapshotDate;
  }

  return new Date(
    date.getTime() + days * DAY_IN_MS,
  )
    .toISOString()
    .slice(0, 10);
}

function findWindowStartDate(
  points: OwnershipHistoryPoint[],
  days: number,
) {
  const earliest = points[0];
  const latest = points.at(-1);

  if (!earliest || !latest) {
    return null;
  }

  const earliestDate = parseSnapshotDate(
    earliest.snapshotDate,
  );
  const latestDate = parseSnapshotDate(
    latest.snapshotDate,
  );

  if (
    Number.isNaN(earliestDate.getTime()) ||
    Number.isNaN(latestDate.getTime())
  ) {
    return null;
  }

  const targetDate = new Date(
    latestDate.getTime() -
      getPeriodSpanDays(days) * DAY_IN_MS,
  );

  if (earliestDate.getTime() > targetDate.getTime()) {
    return earliest.snapshotDate;
  }

  return targetDate.toISOString().slice(0, 10);
}

function findBaseline(
  points: OwnershipHistoryPoint[],
  windowStartDate: string | null,
) {
  if (points.length < 2 || !windowStartDate) {
    return null;
  }

  const latest = points.at(-1);

  if (!latest) {
    return null;
  }

  return (
    points.find(
      (point) =>
        point.snapshotDate >= windowStartDate &&
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

function formatAxisValue(
  value: number,
  metric: HistoryMetricDefinition,
) {
  if (metric.format === "integer") {
    const decimals = Number.isInteger(value) ? 0 : 1;

    return value.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
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

function calculateDisplayedDelta(
  previousValue: number,
  currentValue: number,
  metric: HistoryMetricDefinition,
) {
  const previousDisplayed = Number(
    previousValue.toFixed(metric.decimals),
  );

  const currentDisplayed = Number(
    currentValue.toFixed(metric.decimals),
  );

  return Number(
    (
      currentDisplayed - previousDisplayed
    ).toFixed(metric.decimals),
  );
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

type SparklineProps = {
  points: OwnershipHistoryPoint[];
  metric: HistoryMetricDefinition;
  periodDays: number;
  windowStartDate: string;
};

function Sparkline({
  points,
  metric,
  periodDays,
  windowStartDate,
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

  const parsedWindowStart =
    parseSnapshotDate(windowStartDate).getTime();

  const firstDate = Number.isNaN(parsedWindowStart)
    ? Math.min(...dates)
    : parsedWindowStart;

  const lastDate =
    firstDate +
    getPeriodSpanDays(periodDays) * DAY_IN_MS;

  const minimumValue = Math.min(...chartValues);
  const maximumValue = Math.max(...chartValues);

  const middleValue =
    (maximumValue + minimumValue) / 2;

  const yAxisLabels =
    maximumValue === minimumValue
      ? [
          "",
          formatAxisValue(maximumValue, metric),
          "",
        ]
      : [
          formatAxisValue(maximumValue, metric),
          formatAxisValue(middleValue, metric),
          formatAxisValue(minimumValue, metric),
        ];

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
    <div className="history-sparkline-layout">
      <div
        className="history-sparkline-y-axis"
        aria-hidden="true"
      >
        {yAxisLabels.map((label, index) => (
          <span key={`${label}-${index}`}>
            {label}
          </span>
        ))}
      </div>

      <div className="history-sparkline-wrap">
        <svg
        className="history-sparkline"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${metric.label} evolution across ${observations.length} daily snapshots`}
    >
      {[
        verticalPadding,
        height / 2,
        height - verticalPadding,
      ].map((guideY) => (
        <line
          className="history-sparkline-guide"
          key={guideY}
          x1="0"
          y1={guideY}
          x2={width}
          y2={guideY}
        />
      ))}

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
    </div>
  );
}

export default function OwnershipHistory({
  points,
}: OwnershipHistoryProps) {
  const [requestedPeriod, setRequestedPeriod] =
    useState(1);

  const [
    requestedChartPeriod,
    setRequestedChartPeriod,
  ] = useState(30);

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
      comparisonPeriodOptions.map((period) => {
        const windowStartDate =
          findWindowStartDate(
            sortedPoints,
            period.days,
          );

        const hasRequiredHistory =
          !period.requiresFullWindow ||
          hasFullWindow(
            sortedPoints,
            period.days,
          );

        return {
          ...period,
          windowStartDate,
          baseline: hasRequiredHistory
            ? findBaseline(
                sortedPoints,
                windowStartDate,
              )
            : null,
        };
      }),
    [sortedPoints],
  );

  const chartPeriodStates = useMemo(
    () =>
      chartPeriodOptions.map((period) => {
        const windowStartDate =
          findWindowStartDate(
            sortedPoints,
            period.days,
          );

        const hasRequiredHistory =
          !period.requiresFullWindow ||
          hasFullWindow(
            sortedPoints,
            period.days,
          );

        return {
          ...period,
          windowStartDate,
          baseline: hasRequiredHistory
            ? findBaseline(
                sortedPoints,
                windowStartDate,
              )
            : null,
        };
      }),
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

  const requestedChartState =
    chartPeriodStates.find(
      (period) =>
        period.days === requestedChartPeriod &&
        period.baseline,
    ) ?? null;

  const firstAvailableChartState =
    chartPeriodStates.find(
      (period) => period.baseline,
    ) ?? null;

  const activeChartState =
    requestedChartState ??
    firstAvailableChartState;

  const chartBaselinePoint =
    activeChartState?.baseline ?? null;

  const chartActivePoints =
    chartBaselinePoint && latestPoint
      ? sortedPoints.filter(
          (point) =>
            point.snapshotDate >=
            chartBaselinePoint.snapshotDate,
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

  const summaryMetrics =
    historyDisplayMetricKeys
      .map((key) =>
        availableMetrics.find(
          (metric) => metric.key === key,
        ),
      )
      .filter(
        (
          metric,
        ): metric is HistoryMetricDefinition =>
          metric !== undefined,
      );

  const chartAvailableMetrics =
    chartBaselinePoint && latestPoint
      ? historyMetricDefinitions.filter(
          (metric) =>
            getMetricValue(
              chartBaselinePoint,
              metric.key,
            ) !== null &&
            getMetricValue(
              latestPoint,
              metric.key,
            ) !== null,
        )
      : [];

  const chartMetrics =
    historyDisplayMetricKeys
      .map((key) =>
        chartAvailableMetrics.find(
          (metric) => metric.key === key,
        ),
      )
      .filter(
        (
          metric,
        ): metric is HistoryMetricDefinition =>
          metric !== undefined,
      );

  const observedDays =
    baselinePoint && latestPoint
      ? activePoints.length
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
      summaryMetrics.length > 0 ? (
        <>
          <article className="panel history-panel">
            <div className="history-summary-grid history-summary-grid-six">
              {summaryMetrics.map((metric) => {
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

                const delta = calculateDisplayedDelta(
                  previousValue,
                  currentValue,
                  metric,
                );

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
                {" · Europe/Paris time"}
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

          {chartBaselinePoint &&
          activeChartState &&
          latestPoint &&
          chartMetrics.length > 0 ? (
            <>
              <div
                className="history-period-tabs history-chart-period-tabs"
                aria-label="History chart period"
              >
                {chartPeriodStates.map((period) => {
                  const isAvailable =
                    period.baseline !== null;

                  const isActive =
                    activeChartState.days ===
                    period.days;

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
                        setRequestedChartPeriod(
                          period.days,
                        )
                      }
                    >
                      {period.label}
                    </button>
                  );
                })}
              </div>

              <div className="history-chart-grid">
                {chartMetrics.map((metric) => {
                  return (
                    <article
                      className="history-chart-card"
                      key={metric.key}
                    >
                      <div className="history-chart-heading">
                        <div>
                          <span>{metric.label}</span>
                        </div>
                      </div>

                      <Sparkline
                        points={chartActivePoints}
                        metric={metric}
                        periodDays={
                          activeChartState.days
                        }
                        windowStartDate={
                          activeChartState
                            .windowStartDate ??
                          chartBaselinePoint
                            .snapshotDate
                        }
                      />

                      <div className="history-chart-axis">
                        <span>
                          {formatShortDate(
                            activeChartState
                              .windowStartDate ??
                              chartBaselinePoint
                                .snapshotDate,
                          )}
                        </span>

                        <span>
                          {formatShortDate(
                            addDaysToSnapshotDate(
                              activeChartState
                                .windowStartDate ??
                                chartBaselinePoint
                                  .snapshotDate,
                              getPeriodSpanDays(
                                activeChartState.days,
                              ),
                            ),
                          )}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          ) : null}

          <p className="history-data-note">
            Comparison tabs control the figures above.
            Chart tabs control the graphs independently. Each
            graph uses its full calendar window. Empty space
            represents dates not yet observed; lines connect
            recorded observations only. Missing dates are not
            interpolated or estimated.
            <br />
            Snapshot dates use Europe/Paris local time (UTC+02
            in summer, UTC+01 in winter).
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
