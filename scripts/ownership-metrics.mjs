const round = (value, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

function normalizeHoldings(values) {
  const holdings = Array.from(values, Number);

  for (const value of holdings) {
    if (
      !Number.isFinite(value) ||
      !Number.isInteger(value) ||
      value <= 0
    ) {
      throw new Error(
        `Invalid holder balance: ${JSON.stringify(value)}`,
      );
    }
  }

  return holdings;
}

function percentile(sortedAscending, percentage) {
  if (sortedAscending.length === 0) {
    return 0;
  }

  const rank = Math.ceil(
    (percentage / 100) * sortedAscending.length,
  );

  const index = Math.max(
    0,
    Math.min(sortedAscending.length - 1, rank - 1),
  );

  return sortedAscending[index];
}

function median(sortedAscending) {
  const length = sortedAscending.length;

  if (length === 0) {
    return 0;
  }

  const middle = Math.floor(length / 2);

  if (length % 2 === 1) {
    return sortedAscending[middle];
  }

  return round(
    (
      sortedAscending[middle - 1] +
      sortedAscending[middle]
    ) / 2,
    2,
  );
}

function calculateGini(sortedAscending, totalSupply) {
  const holderCount = sortedAscending.length;

  if (holderCount <= 1 || totalSupply === 0) {
    return 0;
  }

  let weightedSum = 0;

  for (let index = 0; index < holderCount; index += 1) {
    weightedSum += (index + 1) * sortedAscending[index];
  }

  const gini =
    (2 * weightedSum) / (holderCount * totalSupply) -
    (holderCount + 1) / holderCount;

  return round(Math.max(0, Math.min(1, gini)), 4);
}

function calculateLorenzCurve(
  sortedAscending,
  totalSupply,
) {
  const holderCount = sortedAscending.length;

  if (holderCount === 0 || totalSupply === 0) {
    return [
      {
        holdersShare: 0,
        supplyShare: 0,
      },
      {
        holdersShare: 100,
        supplyShare: 100,
      },
    ];
  }

  const cumulative = [0];

  for (const holding of sortedAscending) {
    cumulative.push(
      cumulative[cumulative.length - 1] + holding,
    );
  }

  const points = [];

  for (let percentage = 0; percentage <= 100; percentage += 5) {
    const holderPosition =
      percentage === 100
        ? holderCount
        : Math.floor(
            (holderCount * percentage) / 100,
          );

    points.push({
      holdersShare: percentage,
      supplyShare: round(
        (cumulative[holderPosition] / totalSupply) * 100,
        2,
      ),
    });
  }

  return points;
}

function calculateTopGroup(
  sortedDescending,
  totalSupply,
  percentage,
) {
  if (
    sortedDescending.length === 0 ||
    totalSupply === 0
  ) {
    return {
      holderCount: 0,
      inscriptions: 0,
      share: 0,
    };
  }

  const holderCount = Math.max(
    1,
    Math.ceil(
      sortedDescending.length * (percentage / 100),
    ),
  );

  const inscriptions = sortedDescending
    .slice(0, holderCount)
    .reduce((sum, value) => sum + value, 0);

  return {
    holderCount,
    inscriptions,
    share: round(
      (inscriptions / totalSupply) * 100,
      2,
    ),
  };
}

function calculateSupplyDistribution(
  holdings,
  totalSupply,
) {
  const definitions = [
    {
      bucket: "1",
      matches: (value) => value === 1,
    },
    {
      bucket: "2",
      matches: (value) => value === 2,
    },
    {
      bucket: "3-5",
      matches: (value) => value >= 3 && value <= 5,
    },
    {
      bucket: "6-10",
      matches: (value) => value >= 6 && value <= 10,
    },
    {
      bucket: "11-25",
      matches: (value) => value >= 11 && value <= 25,
    },
    {
      bucket: "26-50",
      matches: (value) => value >= 26 && value <= 50,
    },
    {
      bucket: "51+",
      matches: (value) => value >= 51,
    },
  ];

  return definitions.map((definition) => {
    const balances = holdings.filter(
      definition.matches,
    );

    const inscriptions = balances.reduce(
      (sum, value) => sum + value,
      0,
    );

    return {
      bucket: definition.bucket,
      addresses: balances.length,
      shareOfHolders:
        holdings.length === 0
          ? 0
          : round(
              (balances.length / holdings.length) * 100,
              2,
            ),
      inscriptions,
      shareOfSupply:
        totalSupply === 0
          ? 0
          : round(
              (inscriptions / totalSupply) * 100,
              2,
            ),
    };
  });
}

function calculateWhaleTiers(
  holdings,
  totalSupply,
) {
  const tiers = [
    {
      tier: "mega",
      label: "≥ 1% of supply",
      minShare: 1,
      maxShare: null,
    },
    {
      tier: "large",
      label: "0.5%–1% of supply",
      minShare: 0.5,
      maxShare: 1,
    },
    {
      tier: "whale",
      label: "0.1%–0.5% of supply",
      minShare: 0.1,
      maxShare: 0.5,
    },
    {
      tier: "regular",
      label: "< 0.1% of supply",
      minShare: 0,
      maxShare: 0.1,
    },
  ];

  return tiers.map((tier) => {
    const tierHoldings = holdings.filter((holding) => {
      const share =
        totalSupply === 0
          ? 0
          : (holding / totalSupply) * 100;

      const aboveMinimum = share >= tier.minShare;
      const belowMaximum =
        tier.maxShare === null || share < tier.maxShare;

      return aboveMinimum && belowMaximum;
    });

    const inscriptions = tierHoldings.reduce(
      (sum, value) => sum + value,
      0,
    );

    return {
      tier: tier.tier,
      label: tier.label,
      addresses: tierHoldings.length,
      inscriptions,
      shareOfSupply:
        totalSupply === 0
          ? 0
          : round(
              (inscriptions / totalSupply) * 100,
              2,
            ),
    };
  });
}

export function calculateAdvancedOwnership(values) {
  const holdings = normalizeHoldings(values);

  const sortedAscending = [...holdings].sort(
    (left, right) => left - right,
  );

  const sortedDescending = [...sortedAscending].reverse();

  const totalSupply = holdings.reduce(
    (sum, value) => sum + value,
    0,
  );

  const holderCount = holdings.length;

  if (holderCount === 0 || totalSupply === 0) {
    return {
      methodologyVersion: 1,
      giniCoefficient: 0,
      hhi: 0,
      effectiveHolders: 0,
      medianHolding: 0,
      averageHolding: 0,
      largestHolder: {
        inscriptions: 0,
        share: 0,
      },
      holdingPercentiles: {
        p90: 0,
        p95: 0,
        p99: 0,
      },
      singleHolderSupply: {
        addresses: 0,
        inscriptions: 0,
        share: 0,
      },
      supplyDistribution: [],
      topHolderGroups: {
        top1Percent: {
          holderCount: 0,
          inscriptions: 0,
          share: 0,
        },
        top5Percent: {
          holderCount: 0,
          inscriptions: 0,
          share: 0,
        },
        top10Percent: {
          holderCount: 0,
          inscriptions: 0,
          share: 0,
        },
      },
      whaleTiers: [],
      lorenzCurve: [],
    };
  }

  const hhi = holdings.reduce((sum, holding) => {
    const share = holding / totalSupply;
    return sum + share ** 2;
  }, 0);

  const singleHolderAddresses = holdings.filter(
    (value) => value === 1,
  ).length;

  const largestHolding = sortedDescending[0];

  return {
    methodologyVersion: 1,

    giniCoefficient: calculateGini(
      sortedAscending,
      totalSupply,
    ),

    hhi: round(hhi, 6),

    effectiveHolders: round(1 / hhi, 2),

    medianHolding: median(sortedAscending),

    averageHolding: round(
      totalSupply / holderCount,
      2,
    ),

    largestHolder: {
      inscriptions: largestHolding,
      share: round(
        (largestHolding / totalSupply) * 100,
        2,
      ),
    },

    holdingPercentiles: {
      p90: percentile(sortedAscending, 90),
      p95: percentile(sortedAscending, 95),
      p99: percentile(sortedAscending, 99),
    },

    singleHolderSupply: {
      addresses: singleHolderAddresses,
      inscriptions: singleHolderAddresses,
      share: round(
        (singleHolderAddresses / totalSupply) * 100,
        2,
      ),
    },

    supplyDistribution: calculateSupplyDistribution(
      holdings,
      totalSupply,
    ),

    topHolderGroups: {
      top1Percent: calculateTopGroup(
        sortedDescending,
        totalSupply,
        1,
      ),

      top5Percent: calculateTopGroup(
        sortedDescending,
        totalSupply,
        5,
      ),

      top10Percent: calculateTopGroup(
        sortedDescending,
        totalSupply,
        10,
      ),
    },

    whaleTiers: calculateWhaleTiers(
      holdings,
      totalSupply,
    ),

    lorenzCurve: calculateLorenzCurve(
      sortedAscending,
      totalSupply,
    ),
  };
}
