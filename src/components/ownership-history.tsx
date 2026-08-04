"use client";

import { useMemo, useState } from "react";
import DistributionHealthHistory from "@/components/distribution-health-history";

export type OwnershipHistoryPoint = {
  snapshotDate: string;
  capturedAt: string;
  blockHeight: number | null;
  holdingAddresses: number;
  singleHolders: number;
  holderDensity: number | null;
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
  decimals = metric.decimals,
) {
  if (metric.format === "integer") {
    return Math.round(value).toLocaleString("en-US");
  }

  if (metric.format === "gini") {
    return value.toFixed(decimals);
  }

  if (metric.format === "percent") {
    return `${value.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}%`;
  }

  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function getAxisDecimals(
  minimumValue: number,
  maximumValue: number,
  metric: HistoryMetricDefinition,
) {
  if (
    metric.format === "integer" ||
    maximumValue === minimumValue
  ) {
    return metric.decimals;
  }

  const middleValue =
    (maximumValue + minimumValue) / 2;

  const axisValues = [
    maximumValue,
    middleValue,
    minimumValue,
  ];

  let decimals = metric.decimals;

  while (decimals < 8) {
    const labels = axisValues.map((value) =>
      formatAxisValue(value, metric, decimals),
    );

    if (new Set(labels).size === labels.length) {
      return decimals;
    }

    decimals += 1;
  }

  return decimals;
}

function formatShortDate(
  snapshotDate: string,
  includeYear = false,
) {
  const date = parseSnapshotDate(snapshotDate);

  if (Number.isNaN(date.getTime())) {
    return snapshotDate;
  }

  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  };

  if (includeYear) {
    options.year = "2-digit";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    options,
  ).format(date);
}

function getTimeAxisTicks(
  windowStartDate: string,
  periodDays: number,
) {
  const startDate =
    parseSnapshotDate(windowStartDate);

  if (Number.isNaN(startDate.getTime())) {
    return [];
  }

  const spanDays =
    getPeriodSpanDays(periodDays);

  const ratios = [
    0,
    1 / 3,
    2 / 3,
    1,
  ];

  return ratios.map((ratio, index) => {
    const date = new Date(
      startDate.getTime() +
        spanDays * ratio * DAY_IN_MS,
    );

    const snapshotDate =
      date.toISOString().slice(0, 10);

    return {
      key: `${index}-${snapshotDate}`,
      label: formatShortDate(
        snapshotDate,
        periodDays >= 365,
      ),
    };
  });
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

  const chartValues = values;

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

  const axisDecimals = getAxisDecimals(
    minimumValue,
    maximumValue,
    metric,
  );

  const integerMiddleValue =
    Math.round(middleValue);

  const integerMiddleLabel =
    integerMiddleValue > minimumValue &&
    integerMiddleValue < maximumValue
      ? formatAxisValue(
          integerMiddleValue,
          metric,
        )
      : "";

  const yAxisLabels =
    maximumValue === minimumValue
      ? [
          "",
          formatAxisValue(
            maximumValue,
            metric,
            axisDecimals,
          ),
          "",
        ]
      : metric.format === "integer"
        ? [
            formatAxisValue(
              maximumValue,
              metric,
            ),
            integerMiddleLabel,
            formatAxisValue(
              minimumValue,
              metric,
            ),
          ]
        : [
            formatAxisValue(
              maximumValue,
              metric,
              axisDecimals,
            ),
            formatAxisValue(
              middleValue,
              metric,
              axisDecimals,
            ),
            formatAxisValue(
              minimumValue,
              metric,
              axisDecimals,
            ),
          ];

  const xAxisPositions = [
    0,
    1 / 3,
    2 / 3,
    1,
  ].map(
    (ratio) =>
      horizontalPadding +
      ratio *
        (width - horizontalPadding * 2),
  );

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
      ].map((guideY) => (
        <line
          className="history-sparkline-guide"
          key={guideY}
          x1={horizontalPadding}
          y1={guideY}
          x2={width - horizontalPadding}
          y2={guideY}
        />
      ))}

      <line
        className="history-sparkline-axis-y"
        x1={horizontalPadding}
        y1={verticalPadding}
        x2={horizontalPadding}
        y2={height - verticalPadding}
      />

      <line
        className="history-sparkline-axis-x"
        x1={horizontalPadding}
        y1={height - verticalPadding}
        x2={width - horizontalPadding}
        y2={height - verticalPadding}
      />

      {xAxisPositions.map((tickX, index) => (
        <line
          className="history-sparkline-axis-tick"
          key={`${tickX}-${index}`}
          x1={tickX}
          y1={height - verticalPadding}
          x2={tickX}
          y2={height - verticalPadding + 1.8}
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

        const isHovered =
          hoveredPointIndex === index;

        const modifier = `${
          isLatest
            ? " history-sparkline-point-latest"
            : ""
        }${
          isHovered
            ? " history-sparkline-point-hovered"
            : ""
        }`;

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
      </div>

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

          <DistributionHealthHistory
            points={sortedPoints}
            periodDays={activeChartState.days}
            windowStartDate={
              activeChartState.windowStartDate ??
              chartBaselinePoint.snapshotDate
            }
          />

          <div className="history-chart-grid">
            {chartMetrics.map((metric) => (
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
                    activeChartState.windowStartDate ??
                    chartBaselinePoint.snapshotDate
                  }
                />

                <div className="history-chart-axis">
                  {getTimeAxisTicks(
                    activeChartState
                      .windowStartDate ??
                      chartBaselinePoint
                        .snapshotDate,
                    activeChartState.days,
                  ).map((tick) => (
                    <span key={tick.key}>
                      {tick.label}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <p className="history-data-note">
            Each graph uses its full calendar window. Empty
            space represents dates not yet observed; lines
            connect recorded observations only. Missing dates
            are not interpolated or estimated.
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
              ORDstats activates each chart period as soon as
              sufficient historical observations are
              available. No historical value is interpolated
              or estimated.
            </p>
          </div>
        </article>
      )}
    </section>
  );
}
