import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const slug = process.argv[2] ?? "wizards";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecret = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL is missing from .env.local.");
}

if (!supabaseSecret) {
  throw new Error("SUPABASE_SECRET_KEY is missing from .env.local.");
}

const supabase = createClient(supabaseUrl, supabaseSecret, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

async function getCatalogRanking(slug) {
  const catalogPath = path.resolve(
    process.cwd(),
    "data",
    "ord-net-top-100-30d.json",
  );

  try {
    const catalog = JSON.parse(
      await fs.readFile(catalogPath, "utf8"),
    );

    const catalogueEntry =
      catalog.collections?.find(
        (collection) =>
          collection.slug?.toLowerCase() ===
          slug.toLowerCase(),
      ) ?? null;

    if (!catalogueEntry) {
      return null;
    }

    return {
      ord_rank_30d: catalogueEntry.rank,
      ranking_window: catalog.window ?? "30d",
      ranking_captured_at:
        catalog.capturedAt ?? new Date().toISOString(),
      catalog_active: true,
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      console.warn(
        "Top 100 catalogue not found · ranking skipped",
      );

      return null;
    }

    console.warn(
      `Unable to read Top 100 catalogue: ${error.message}`,
    );

    return null;
  }
}

async function main() {
  const snapshotPath = path.join(
    process.cwd(),
    "src",
    "data",
    "generated",
    `${slug}-ownership.json`,
  );

  const snapshot = JSON.parse(
    await fs.readFile(snapshotPath, "utf8"),
  );

  const {
    generatedAt,
    source,
    supply,
    ownership,
    charms,
  } = snapshot;

  if (!generatedAt || !source || !supply || !ownership) {
    throw new Error("The snapshot file has an unexpected structure.");
  }

  const blockHeight = source.blockHeight ?? null;

  const catalogRanking =
    await getCatalogRanking(source.collectionSlug);

  const collectionRow = {
    slug: source.collectionSlug,
    name: source.collectionName,
    collection_type: source.collectionType,
    source_id: source.galleryId,
    gallery_supply: supply.gallery,
    latest_snapshot_at: generatedAt,
    latest_block_height: blockHeight,
    advanced_ownership: ownership.advanced ?? null,
    ...(catalogRanking ?? {}),
    current_ownership: {
      supply,
      ownership,
      charms,
    },
    updated_at: new Date().toISOString(),
  };

  const {
    data: collectionData,
    error: collectionError,
  } = await supabase
    .from("collections")
    .upsert(collectionRow, {
      onConflict: "slug",
    })
    .select("slug")
    .single();

  if (collectionError) {
    throw new Error(
      `Collection upload failed: ${collectionError.message}`,
    );
  }

  const snapshotDateParts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date(generatedAt))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  const localSnapshotDate =
    process.env.ORDSTATS_SNAPSHOT_DATE ??
    `${snapshotDateParts.year}-` +
      `${snapshotDateParts.month}-` +
      `${snapshotDateParts.day}`;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(localSnapshotDate)) {
    throw new Error(
      `Invalid snapshot date: ${localSnapshotDate}`,
    );
  }

  const snapshotRow = {
    collection_slug: source.collectionSlug,
    snapshot_date: localSnapshotDate,
    captured_at: generatedAt,
    block_height: blockHeight,

    gallery_supply: supply.gallery,
    circulating_supply: supply.circulating,
    unavailable_count: supply.unavailable,
    burned_count: supply.burned,

    holding_addresses: ownership.holdingAddresses,
    ownership_ratio: ownership.ownershipRatio,

    single_holders: ownership.singleHolders,
    single_holder_rate: ownership.singleHolderRate,

    top10_inscriptions: ownership.top10.inscriptions,
    top10_share: ownership.top10.share,

    top25_inscriptions: ownership.top25.inscriptions,
    top25_share: ownership.top25.share,

    top100_inscriptions: ownership.top100.inscriptions,
    top100_share: ownership.top100.share,

    distribution: ownership.distribution,
    charms,
    advanced_ownership: ownership.advanced ?? null,
  };

  const {
    data: snapshotData,
    error: snapshotError,
  } = await supabase
    .from("collection_snapshots")
    .upsert(snapshotRow, {
      onConflict: "collection_slug,snapshot_date",
    })
    .select("id, snapshot_date")
    .single();

  if (snapshotError) {
    throw new Error(
      `Snapshot upload failed: ${snapshotError.message}`,
    );
  }

  console.log("");
  console.log("Supabase upload complete");
  console.log("------------------------");
  console.log(`Collection: ${source.collectionName}`);
  console.log(`Slug:       ${collectionData.slug}`);
  console.log(`Snapshot:   ${snapshotData.snapshot_date}`);
  console.log(`Block:      ${blockHeight ?? "not recorded yet"}`);
  console.log(`Supply:     ${supply.gallery}`);
  console.log(`Holders:    ${ownership.holdingAddresses}`);
}

main().catch((error) => {
  console.error("");
  console.error("Supabase upload failed:");
  console.error(
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
