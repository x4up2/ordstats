import fs from "node:fs/promises";
import path from "node:path";
import {
  calculateAdvancedOwnership,
} from "./ownership-metrics.mjs";

const slug = process.argv[2] ?? "wizards";

const ORD_BASE_URL = (
  process.env.ORD_BASE_URL ?? "http://127.0.0.1"
).replace(/\/$/, "");

const COLLECTIONS_REGISTRY_URL =
  "https://raw.githubusercontent.com/TheWizardsOfOrd/ordinals-collections/main/collections.json";

const BATCH_SIZE = 100;

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} from ${url}\n${body.slice(0, 300)}`,
    );
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error(
      `Invalid JSON from ${url}\n${body.slice(0, 300)}`,
    );
  }
}

function extractGalleryId(item, index) {
  if (typeof item === "string") {
    return item;
  }

  const id =
    item?.id ??
    item?.inscription ??
    item?.inscription_id;

  if (typeof id !== "string" || id.length === 0) {
    throw new Error(
      `Gallery item ${index + 1} has no inscription ID.`,
    );
  }

  return id;
}

async function fetchGalleryInscriptionIds(
  galleryId,
) {
  const galleryInscription = await fetchJson(
    `${ORD_BASE_URL}/inscription/${encodeURIComponent(
      galleryId,
    )}`,
    {
      headers: {
        Accept: "application/json",
      },
    },
  );

  const gallery =
    galleryInscription?.properties?.gallery ??
    galleryInscription?.gallery;

  if (!Array.isArray(gallery)) {
    throw new Error(
      "The gallery inscription does not contain a gallery property.",
    );
  }

  return gallery.map(extractGalleryId);
}

async function fetchParentChildren(parentId) {
  const inscriptionIds = [];
  let page = 0;

  while (true) {
    const pageSuffix =
      page === 0 ? "" : `/${page}`;

    const response = await fetchJson(
      `${ORD_BASE_URL}/r/children/${encodeURIComponent(
        parentId,
      )}${pageSuffix}`,
      {
        headers: {
          Accept: "application/json",
        },
      },
    );

    if (!Array.isArray(response?.ids)) {
      throw new Error(
        `Unexpected children response for parent ` +
          `${parentId}, page ${page}.`,
      );
    }

    inscriptionIds.push(...response.ids);

    if (
      page === 0 ||
      !response.more ||
      (page + 1) % 25 === 0
    ) {
      console.log(
        `Parent children: page ${page + 1} · ` +
          `${inscriptionIds.length.toLocaleString(
            "en-US",
          )} found`,
      );
    }

    if (!response.more) {
      break;
    }

    page += 1;

    if (page > 10_000) {
      throw new Error(
        `Children pagination exceeded 10,000 pages ` +
          `for parent ${parentId}.`,
      );
    }
  }

  return inscriptionIds;
}

async function resolveCollectionInscriptionIds(
  collection,
) {
  let sourceIds;
  let rawInscriptionIds;

  if (collection.type === "gallery") {
    if (
      typeof collection.id !== "string" ||
      collection.id.length === 0
    ) {
      throw new Error(
        "Gallery collection has no valid gallery ID.",
      );
    }

    sourceIds = [collection.id];

    rawInscriptionIds =
      await fetchGalleryInscriptionIds(
        collection.id,
      );
  } else if (collection.type === "multi_gallery") {
    if (
      !Array.isArray(collection.ids) ||
      collection.ids.length === 0
    ) {
      throw new Error(
        "Multi-gallery collection has no valid gallery IDs.",
      );
    }

    sourceIds = collection.ids;
    rawInscriptionIds = [];

    for (
      let index = 0;
      index < sourceIds.length;
      index += 1
    ) {
      const galleryId = sourceIds[index];

      console.log(
        `Reading gallery ${index + 1}/${sourceIds.length}: ` +
          galleryId,
      );

      const galleryInscriptionIds =
        await fetchGalleryInscriptionIds(galleryId);

      console.log(
        `Gallery ${index + 1}: ` +
          `${galleryInscriptionIds.length.toLocaleString(
            "en-US",
          )} inscription(s)`,
      );

      rawInscriptionIds.push(...galleryInscriptionIds);
    }
  } else if (collection.type === "parent") {
    if (
      !Array.isArray(collection.ids) ||
      collection.ids.length === 0
    ) {
      throw new Error(
        "Parent collection has no valid parent IDs.",
      );
    }

    sourceIds = collection.ids;
    rawInscriptionIds = [];

    for (
      let index = 0;
      index < sourceIds.length;
      index += 1
    ) {
      const parentId = sourceIds[index];

      console.log(
        `Reading parent ${index + 1}/${sourceIds.length}: ` +
          parentId,
      );

      const children =
        await fetchParentChildren(parentId);

      rawInscriptionIds.push(...children);
    }
  } else {
    throw new Error(
      `Unsupported collection type: ${collection.type}`,
    );
  }

  const inscriptionIds = [
    ...new Set(rawInscriptionIds),
  ];

  return {
    sourceIds,
    inscriptionIds,
    duplicateCount:
      rawInscriptionIds.length -
      inscriptionIds.length,
  };
}

function percentage(value, total) {
  if (total === 0) {
    return 0;
  }

  return Number(((value / total) * 100).toFixed(2));
}

function topShare(holderCounts, holderNumber, supply) {
  const held = holderCounts
    .slice(0, holderNumber)
    .reduce((sum, item) => sum + item.count, 0);

  return {
    holders: Math.min(holderNumber, holderCounts.length),
    inscriptions: held,
    share: percentage(held, supply),
  };
}

function distributionBucket(count) {
  if (count === 1) return "1";
  if (count === 2) return "2";
  if (count <= 5) return "3-5";
  if (count <= 10) return "6-10";
  if (count <= 25) return "11-25";
  if (count <= 50) return "26-50";
  return "51+";
}

async function main() {
  console.log(`Resolving collection: ${slug}`);

  const registry = await fetchJson(COLLECTIONS_REGISTRY_URL);

  const collection = registry.find(
    (entry) =>
      entry.slug?.toLowerCase() === slug.toLowerCase(),
  );

  if (!collection) {
    throw new Error(
      `Collection "${slug}" was not found in the curated registry.`,
    );
  }

  console.log(`Collection: ${collection.name}`);
  console.log(`Type:       ${collection.type}`);

  const {
    sourceIds,
    inscriptionIds,
    duplicateCount,
  } = await resolveCollectionInscriptionIds(
    collection,
  );

  console.log(
    `Source inscriptions: ${sourceIds.length}`,
  );

  console.log(
    `Collection supply:   ${inscriptionIds.length.toLocaleString(
      "en-US",
    )}`,
  );

  if (duplicateCount > 0) {
    console.log(
      `Duplicate IDs removed: ${duplicateCount}`,
    );
  }

  const ordStatus = await fetchJson(
    `${ORD_BASE_URL}/status`,
    {
      headers: {
        Accept: "application/json",
      },
    },
  );

  const blockHeight =
    typeof ordStatus?.height === "number"
      ? ordStatus.height
      : null;

  console.log(
    `Ord index height: ${blockHeight ?? "unknown"}`,
  );

  const inscriptions = [];

  for (
    let start = 0;
    start < inscriptionIds.length;
    start += BATCH_SIZE
  ) {
    const batch = inscriptionIds.slice(
      start,
      start + BATCH_SIZE,
    );

    const batchNumber =
      Math.floor(start / BATCH_SIZE) + 1;

    const totalBatches =
      Math.ceil(inscriptionIds.length / BATCH_SIZE);

    console.log(
      `Fetching batch ${batchNumber}/${totalBatches} ` +
        `(${batch.length} inscriptions)`,
    );

    try {
      const result = await fetchJson(
        `${ORD_BASE_URL}/inscriptions`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(batch),
        },
      );

      if (!Array.isArray(result)) {
        throw new Error(
          `Unexpected response for batch ${batchNumber}.`,
        );
      }

      inscriptions.push(...result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      if (!message.startsWith("HTTP 404")) {
        throw error;
      }

      console.warn(
        `Batch ${batchNumber} contains at least one ` +
          "missing inscription. Retrying individually.",
      );

      for (const inscriptionId of batch) {
        try {
          const inscription = await fetchJson(
            `${ORD_BASE_URL}/inscription/${encodeURIComponent(
              inscriptionId,
            )}`,
            {
              headers: {
                Accept: "application/json",
              },
            },
          );

          inscriptions.push(inscription);
        } catch (individualError) {
          const individualMessage =
            individualError instanceof Error
              ? individualError.message
              : String(individualError);

          if (!individualMessage.startsWith("HTTP 404")) {
            throw individualError;
          }

          console.warn(
            `Missing inscription: ${inscriptionId}`,
          );

          inscriptions.push({
            id: inscriptionId,
            number: null,
            address: null,
            charms: [],
            satpoint: null,
          });
        }
      }
    }
  }

  const addressCounts = new Map();
  const charmCounts = new Map();

  const unavailable = [];
  const burned = [];
  const current = [];

  for (const inscription of inscriptions) {
    const charms = Array.isArray(inscription.charms)
      ? inscription.charms
      : [];

    for (const charm of charms) {
      charmCounts.set(
        charm,
        (charmCounts.get(charm) ?? 0) + 1,
      );
    }

    const isBurned = charms.includes("burned");

    if (isBurned) {
      burned.push(inscription.id);
    }

    if (
      typeof inscription.address !== "string" ||
      inscription.address.length === 0
    ) {
      unavailable.push({
        id: inscription.id,
        number: inscription.number ?? null,
        charms,
        satpoint: inscription.satpoint ?? null,
      });

      continue;
    }

    current.push(inscription);

    addressCounts.set(
      inscription.address,
      (addressCounts.get(inscription.address) ?? 0) + 1,
    );
  }

  const holders = [...addressCounts.entries()]
    .map(([address, count]) => ({
      address,
      count,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }

      return a.address.localeCompare(b.address);
    });

  const advancedOwnership =
    calculateAdvancedOwnership(
      holders.map((holder) => holder.count),
    );

  const distribution = {
    "1": 0,
    "2": 0,
    "3-5": 0,
    "6-10": 0,
    "11-25": 0,
    "26-50": 0,
    "51+": 0,
  };

  for (const holder of holders) {
    distribution[distributionBucket(holder.count)] += 1;
  }

  const uniqueHolders = holders.length;
  const circulatingSupply = current.length;
  const singleHolders = distribution["1"];
  const multiHolders = uniqueHolders - singleHolders;

  const snapshot = {
    generatedAt: new Date().toISOString(),
    source: {
      registry: COLLECTIONS_REGISTRY_URL,
      ordServer: ORD_BASE_URL,
      collectionSlug: slug,
      collectionName: collection.name,
      collectionType: collection.type,
      sourceId: sourceIds[0],
      galleryId: sourceIds[0],
      sourceIds,
      duplicateCount,
      blockHeight,
    },
    supply: {
      gallery: inscriptionIds.length,
      circulating: circulatingSupply,
      unavailable: unavailable.length,
      burned: burned.length,
      circulatingRate: percentage(
        circulatingSupply,
        inscriptionIds.length,
      ),
    },
    ownership: {
      holdingAddresses: uniqueHolders,
      advanced: advancedOwnership,
      ownershipRatio: percentage(
        uniqueHolders,
        circulatingSupply,
      ),
      singleHolders,
      singleHolderRate: percentage(
        singleHolders,
        uniqueHolders,
      ),
      multiHolders,
      multiHolderRate: percentage(
        multiHolders,
        uniqueHolders,
      ),
      top10: topShare(
        holders,
        10,
        circulatingSupply,
      ),
      top25: topShare(
        holders,
        25,
        circulatingSupply,
      ),
      top100: topShare(
        holders,
        100,
        circulatingSupply,
      ),
      distribution: Object.entries(distribution).map(
        ([bucket, addresses]) => ({
          bucket,
          addresses,
          shareOfHolders: percentage(
            addresses,
            uniqueHolders,
          ),
        }),
      ),
    },
    charms: [...charmCounts.entries()]
      .map(([charm, count]) => ({
        charm,
        count,
      }))
      .sort((a, b) => b.count - a.count),
    largestHolders: holders.slice(0, 100),
    unavailableInscriptions: unavailable,
  };

  const outputPath = path.join(
    process.cwd(),
    "src",
    "data",
    "generated",
    `${slug}-ownership.json`,
  );

  await fs.writeFile(
    outputPath,
    `${JSON.stringify(snapshot, null, 2)}\n`,
  );

  console.log("");
  console.log("Snapshot complete");
  console.log("-----------------");
  console.log(`Gallery supply:      ${snapshot.supply.gallery}`);
  console.log(
    `Circulating supply:  ${snapshot.supply.circulating}`,
  );
  console.log(`Burned:              ${snapshot.supply.burned}`);
  console.log(
    `Holding addresses:   ${snapshot.ownership.holdingAddresses}`,
  );
  console.log(
    `Single holders:      ${snapshot.ownership.singleHolders} ` +
      `(${snapshot.ownership.singleHolderRate}%)`,
  );
  console.log(
    `Top 10 share:        ${snapshot.ownership.top10.share}%`,
  );
  console.log(
    `Top 25 share:        ${snapshot.ownership.top25.share}%`,
  );
  console.log(
    `Top 100 share:       ${snapshot.ownership.top100.share}%`,
  );
  console.log("");
  console.log(`Written to: ${outputPath}`);
}

main().catch((error) => {
  console.error("");
  console.error("Ownership snapshot failed:");
  console.error(
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
