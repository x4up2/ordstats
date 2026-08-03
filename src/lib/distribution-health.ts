import type {
  AdvancedOwnership,
  OwnershipSnapshot,
} from "@/lib/collection-data";

export const DISTRIBUTION_HEALTH_METHODOLOGY_VERSION = 1;

type ScoreAnchor = readonly [number, number];

type StructureMetricKey =
  | "gini"
  | "top1"
  | "largestHolder"
  | "ownershipEvenness"
  | "holderDensity"
  | "singleHolderSupply";

type TrendMetricKey =
  | "giniCoefficient"
  | "top1SupplyShare"
  | "largestHolderShare"
  | "ownershipEvenness"
  | "holdingAddresses"
  | "singleHolderSupplyShare";

export type DistributionHealthHistoryPoint = {
  snapshotDate: string;
  holdingAddresses: number;
  ownershipEvenness: number | null;
  giniCoefficient: number | null;
  largestHolderShare: number | null;
  top1SupplyShare: number | null;
  singleHolderSupplyShare: number | null;
};

export type DistributionHealthStructureMetric = {
  key: StructureMetricKey;
  label: string;
  value: number;
  formattedValue: string;
  direction: string;
  definition: string;
  weightPercent: number;
  subscore: number;
  weightedPoints: number;
  maxPoints: number;
};

export type DistributionHealthTrendMetric = {
  key: TrendMetricKey;
  label: string;
  baseline: number;
  current: number;
  formattedBaseline: string;
  formattedCurrent: string;
  formattedChange: string;
  direction: string;
  definition: string;
  weightPercent: number;
  subscore: number;
  weightedPoints: number;
  maxPoints: number;
};

export type DistributionHealthResult = {
  methodologyVersion: number;
  score: number;
  rawScore: number;
  label:
    | "Very concentrated"
    | "Concentrated"
    | "Mixed"
    | "Balanced"
    | "Healthy"
    | "Broadly distributed";
  provisional: boolean;
  historyDays: number;
  historyObservations: number;
  trendWindowDays: number;
  structureScore: number;
  structureWeightPercent: number;
  trendScore: number | null;
  trendWeightPercent: number;
  structureMetrics: DistributionHealthStructureMetric[];
  trendMetrics: DistributionHealthTrendMetric[];
};

type CalculateDistributionHealthInput = {
  ownership: OwnershipSnapshot["ownership"];
  advanced: AdvancedOwnership | null;
  historyPoints: DistributionHealthHistoryPoint[];
};

const DAY_IN_MS = 86_400_000;

const structureAnchors: Record<
  StructureMetricKey,
  readonly ScoreAnchor[]
> = {
  gini: [
    [0, 100],
    [0.15, 95],
    [0.25, 85],
    [0.35, 72],
    [0.45, 58],
    [0.55, 42],
    [0.65, 25],
    [0.75, 12],
    [0.9, 0],
  ],
  top1: [
    [0, 100],
    [3, 100],
    [8, 90],
    [12, 80],
    [18, 68],
    [25, 52],
    [35, 35],
    [50, 15],
    [80, 0],
    [100, 0],
  ],
  largestHolder: [
    [0, 100],
    [0.5, 100],
    [1, 95],
    [2, 88],
    [3, 80],
    [5, 68],
    [8, 55],
    [12, 40],
    [20, 25],
    [40, 10],
    [80, 0],
    [100, 0],
  ],
  ownershipEvenness: [
    [0, 0],
    [3, 10],
    [5, 20],
    [10, 35],
    [20, 55],
    [35, 70],
    [50, 82],
    [70, 92],
    [90, 100],
    [100, 100],
  ],
  holderDensity: [
    [0, 0],
    [10, 15],
    [20, 30],
    [35, 48],
    [50, 65],
    [65, 78],
    [80, 90],
    [95, 100],
    [100, 100],
  ],
  singleHolderSupply: [
    [0, 0],
    [10, 15],
    [20, 30],
    [35, 50],
    [50, 65],
    [65, 80],
    [80, 92],
    [95, 100],
    [100, 100],
  ],
};

const trendGiniAnchors: readonly ScoreAnchor[] = [
  [-0.05, 0],
  [-0.02, 20],
  [-0.005, 40],
  [0, 50],
  [0.005, 60],
  [0.02, 80],
  [0.05, 100],
];

const trendPercentagePointAnchors: readonly ScoreAnchor[] = [
  [-10, 0],
  [-4, 20],
  [-1, 40],
  [0, 50],
  [1, 60],
  [4, 80],
  [10, 100],
];

const trendEvennessAnchors: readonly ScoreAnchor[] = [
  [-15, 0],
  [-6, 20],
  [-1.5, 40],
  [0, 50],
  [1.5, 60],
  [6, 80],
  [15, 100],
];

const trendAddressAnchors: readonly ScoreAnchor[] = [
  [-10, 0],
  [-4, 20],
  [-1, 40],
  [0, 50],
  [1, 60],
  [4, 80],
  [10, 100],
];

const clamp = (value: number, min = 0, max = 100) =>
  Math.min(max, Math.max(min, value));

const round = (value: number, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

function interpolateScore(
  value: number,
  anchors: readonly ScoreAnchor[],
) {
  if (value <= anchors[0][0]) {
    return anchors[0][1];
  }

  const lastAnchor = anchors.at(-1);

  if (!lastAnchor) {
    return 0;
  }

  if (value >= lastAnchor[0]) {
    return lastAnchor[1];
  }

  for (let index = 0; index < anchors.length - 1; index += 1) {
    const current = anchors[index];
    const next = anchors[index + 1];

    if (value >= current[0] && value <= next[0]) {
      const progress =
        (value - current[0]) /
        (next[0] - current[0]);

      return clamp(
        current[1] +
          progress * (next[1] - current[1]),
      );
    }
  }

  return 0;
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)}%`;
}

function formatInteger(value: number) {
  return Math.round(value).toLocaleString("en-US");
}

function formatGini(value: number) {
  return value.toFixed(3);
}

function formatSigned(
  value: number,
  digits: number,
  suffix: string,
) {
  const rounded = round(value, digits);
  const prefix = rounded > 0 ? "+" : "";

  return `${prefix}${rounded.toFixed(digits)}${suffix}`;
}

function parseSnapshotDate(snapshotDate: string) {
  const timestamp = Date.parse(
    `${snapshotDate}T00:00:00Z`,
  );

  return Number.isNaN(timestamp) ? null : timestamp;
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function getLabel(score: number): DistributionHealthResult["label"] {
  if (score < 25) {
    return "Very concentrated";
  }

  if (score < 45) {
    return "Concentrated";
  }

  if (score < 60) {
    return "Mixed";
  }

  if (score < 70) {
    return "Balanced";
  }

  if (score < 85) {
    return "Healthy";
  }

  return "Broadly distributed";
}

function createStructureMetric(
  key: StructureMetricKey,
  label: string,
  value: number,
  formattedValue: string,
  direction: string,
  definition: string,
  weight: number,
): DistributionHealthStructureMetric {
  const subscore = interpolateScore(
    value,
    structureAnchors[key],
  );

  return {
    key,
    label,
    value,
    formattedValue,
    direction,
    definition,
    weightPercent: weight * 100,
    subscore: round(subscore),
    weightedPoints: round(subscore * weight),
    maxPoints: weight * 100,
  };
}

function getUniqueSortedHistory(
  points: DistributionHealthHistoryPoint[],
) {
  const pointsByDate =
    new Map<string, DistributionHealthHistoryPoint>();

  points.forEach((point) => {
    if (parseSnapshotDate(point.snapshotDate) !== null) {
      pointsByDate.set(point.snapshotDate, point);
    }
  });

  return Array.from(pointsByDate.values()).sort(
    (left, right) =>
      left.snapshotDate.localeCompare(
        right.snapshotDate,
      ),
  );
}

function getHistoryDays(
  points: DistributionHealthHistoryPoint[],
) {
  const first = points[0];
  const last = points.at(-1);

  if (!first || !last) {
    return 0;
  }

  const firstTimestamp =
    parseSnapshotDate(first.snapshotDate);
  const lastTimestamp =
    parseSnapshotDate(last.snapshotDate);

  if (
    firstTimestamp === null ||
    lastTimestamp === null
  ) {
    return 0;
  }

  return (
    Math.floor(
      (lastTimestamp - firstTimestamp) / DAY_IN_MS,
    ) + 1
  );
}

function getTrendWindow(
  points: DistributionHealthHistoryPoint[],
  historyDays: number,
) {
  const latest = points.at(-1);

  if (!latest) {
    return [];
  }

  const latestTimestamp =
    parseSnapshotDate(latest.snapshotDate);

  if (latestTimestamp === null) {
    return [];
  }

  const windowDays = Math.min(historyDays, 30);
  const cutoff =
    latestTimestamp -
    Math.max(0, windowDays - 1) * DAY_IN_MS;

  return points.filter((point) => {
    const timestamp =
      parseSnapshotDate(point.snapshotDate);

    return timestamp !== null && timestamp >= cutoff;
  });
}

type TrendDefinition = {
  key: TrendMetricKey;
  label: string;
  weight: number;
  direction: string;
  definition: string;
  scoringDirection:
    | "lower"
    | "higher"
    | "higher-relative";
  anchors: readonly ScoreAnchor[];
  formatValue: (value: number) => string;
  formatChange: (
    rawChange: number,
    improvement: number,
  ) => string;
};

const trendDefinitions: readonly TrendDefinition[] = [
  {
    key: "giniCoefficient",
    label: "Gini coefficient",
    weight: 0.25,
    direction: "Lower is improving",
    definition:
      "Tracks whether overall inequality across holding addresses is decreasing or increasing.",
    scoringDirection: "lower",
    anchors: trendGiniAnchors,
    formatValue: formatGini,
    formatChange: (rawChange) =>
      formatSigned(rawChange, 4, ""),
  },
  {
    key: "top1SupplyShare",
    label: "Top 1% supply",
    weight: 0.2,
    direction: "Lower is improving",
    definition:
      "Tracks whether the largest 1% of holding addresses control a smaller or larger share of supply.",
    scoringDirection: "lower",
    anchors: trendPercentagePointAnchors,
    formatValue: formatPercent,
    formatChange: (rawChange) =>
      formatSigned(rawChange, 2, " pt"),
  },
  {
    key: "largestHolderShare",
    label: "Largest holder",
    weight: 0.2,
    direction: "Lower is improving",
    definition:
      "Tracks whether the largest observable address is gaining or losing supply share.",
    scoringDirection: "lower",
    anchors: trendPercentagePointAnchors,
    formatValue: formatPercent,
    formatChange: (rawChange) =>
      formatSigned(rawChange, 2, " pt"),
  },
  {
    key: "ownershipEvenness",
    label: "Ownership evenness",
    weight: 0.15,
    direction: "Higher is improving",
    definition:
      "Tracks the effective-holder ratio derived from HHI relative to the number of holding addresses.",
    scoringDirection: "higher",
    anchors: trendEvennessAnchors,
    formatValue: formatPercent,
    formatChange: (rawChange) =>
      formatSigned(rawChange, 2, " pt"),
  },
  {
    key: "holdingAddresses",
    label: "Holding addresses",
    weight: 0.1,
    direction: "Higher is improving",
    definition:
      "Tracks the relative change in the number of addresses holding at least one circulating inscription.",
    scoringDirection: "higher-relative",
    anchors: trendAddressAnchors,
    formatValue: formatInteger,
    formatChange: (_rawChange, improvement) =>
      formatSigned(improvement, 2, "%"),
  },
  {
    key: "singleHolderSupplyShare",
    label: "Single-holder supply",
    weight: 0.1,
    direction: "Higher is improving",
    definition:
      "Tracks the share of circulating supply held by addresses with exactly one inscription.",
    scoringDirection: "higher",
    anchors: trendPercentagePointAnchors,
    formatValue: formatPercent,
    formatChange: (rawChange) =>
      formatSigned(rawChange, 2, " pt"),
  },
];

function createTrendMetrics(
  windowPoints: DistributionHealthHistoryPoint[],
) {
  const availableMetrics: Array<
    Omit<
      DistributionHealthTrendMetric,
      "weightPercent" | "weightedPoints" | "maxPoints"
    > & {
      originalWeight: number;
    }
  > = [];

  trendDefinitions.forEach((definition) => {
    const values = windowPoints
      .map((point) => point[definition.key])
      .filter(
        (value): value is number =>
          typeof value === "number" &&
          Number.isFinite(value),
      );

    if (values.length < 6) {
      return;
    }

    const baseline = median(values.slice(0, 3));
    const current = median(values.slice(-3));
    const rawChange = current - baseline;

    let improvement = rawChange;

    if (definition.scoringDirection === "lower") {
      improvement = -rawChange;
    }

    if (
      definition.scoringDirection ===
      "higher-relative"
    ) {
      improvement =
        baseline > 0
          ? (rawChange / baseline) * 100
          : 0;
    }

    const subscore = interpolateScore(
      improvement,
      definition.anchors,
    );

    availableMetrics.push({
      key: definition.key,
      label: definition.label,
      baseline,
      current,
      formattedBaseline:
        definition.formatValue(baseline),
      formattedCurrent:
        definition.formatValue(current),
      formattedChange: definition.formatChange(
        rawChange,
        improvement,
      ),
      direction: definition.direction,
      definition: definition.definition,
      subscore: round(subscore),
      originalWeight: definition.weight,
    });
  });

  const availableWeight = availableMetrics.reduce(
    (sum, metric) => sum + metric.originalWeight,
    0,
  );

  if (availableWeight <= 0) {
    return [];
  }

  return availableMetrics.map(
    ({
      originalWeight,
      ...metric
    }): DistributionHealthTrendMetric => {
      const normalizedWeight =
        originalWeight / availableWeight;

      return {
        ...metric,
        weightPercent: round(
          normalizedWeight * 100,
        ),
        weightedPoints: round(
          metric.subscore * normalizedWeight,
        ),
        maxPoints: round(
          normalizedWeight * 100,
        ),
      };
    },
  );
}

export function calculateDistributionHealth({
  ownership,
  advanced,
  historyPoints,
}: CalculateDistributionHealthInput): DistributionHealthResult | null {
  if (
    !advanced ||
    ownership.holdingAddresses <= 0
  ) {
    return null;
  }

  const ownershipEvenness = clamp(
    (advanced.effectiveHolders /
      ownership.holdingAddresses) *
      100,
  );

  const structureMetrics: DistributionHealthStructureMetric[] = [
    createStructureMetric(
      "gini",
      "Gini coefficient",
      advanced.giniCoefficient,
      formatGini(advanced.giniCoefficient),
      "Lower is better",
      "Measures inequality across holding addresses. A lower value indicates a more even distribution.",
      0.3,
    ),
    createStructureMetric(
      "top1",
      "Top 1% supply",
      advanced.topHolderGroups.top1Percent.share,
      formatPercent(
        advanced.topHolderGroups.top1Percent.share,
      ),
      "Lower is better",
      "Measures the share of circulating supply held by the largest 1% of holding addresses.",
      0.2,
    ),
    createStructureMetric(
      "largestHolder",
      "Largest holder",
      advanced.largestHolder.share,
      formatPercent(
        advanced.largestHolder.share,
      ),
      "Lower is better",
      "Measures the circulating-supply share held by the single largest observable address.",
      0.2,
    ),
    createStructureMetric(
      "ownershipEvenness",
      "Ownership evenness",
      ownershipEvenness,
      formatPercent(ownershipEvenness),
      "Higher is better",
      "Compares effective holders derived from HHI with the total number of holding addresses.",
      0.15,
    ),
    createStructureMetric(
      "holderDensity",
      "Holder density",
      ownership.ownershipRatio,
      formatPercent(ownership.ownershipRatio),
      "Higher is better",
      "Compares holding addresses with circulating supply. Higher density indicates broader address participation.",
      0.075,
    ),
    createStructureMetric(
      "singleHolderSupply",
      "Single-holder supply",
      advanced.singleHolderSupply.share,
      formatPercent(
        advanced.singleHolderSupply.share,
      ),
      "Higher is better",
      "Measures the share of circulating supply held by addresses containing exactly one inscription.",
      0.075,
    ),
  ];

  const structureScore = round(
    structureMetrics.reduce(
      (sum, metric) =>
        sum + metric.weightedPoints,
      0,
    ),
  );

  const sortedHistory =
    getUniqueSortedHistory(historyPoints);
  const historyDays =
    getHistoryDays(sortedHistory);
  const trendWindow =
    getTrendWindow(sortedHistory, historyDays);

  const targetTrendWeight =
    historyDays >= 30
      ? 0.25
      : historyDays >= 14
        ? 0.15
        : 0;

  const trendMetrics =
    targetTrendWeight > 0 &&
    trendWindow.length >= 6
      ? createTrendMetrics(trendWindow)
      : [];

  const trendScore =
    trendMetrics.length > 0
      ? round(
          trendMetrics.reduce(
            (sum, metric) =>
              sum + metric.weightedPoints,
            0,
          ),
        )
      : null;

  const trendWeight =
    trendScore === null ? 0 : targetTrendWeight;
  const structureWeight = 1 - trendWeight;

  const rawScore = round(
    structureScore * structureWeight +
      (trendScore ?? 0) * trendWeight,
  );

  return {
    methodologyVersion:
      DISTRIBUTION_HEALTH_METHODOLOGY_VERSION,
    score: Math.round(clamp(rawScore)),
    rawScore,
    label: getLabel(rawScore),
    provisional:
      historyDays < 30 || trendWeight < 0.25,
    historyDays,
    historyObservations: sortedHistory.length,
    trendWindowDays:
      trendWeight > 0
        ? Math.min(historyDays, 30)
        : 0,
    structureScore,
    structureWeightPercent:
      structureWeight * 100,
    trendScore,
    trendWeightPercent:
      trendWeight * 100,
    structureMetrics,
    trendMetrics,
  };
}
