import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const catalogPath = path.resolve(
  "data/ord-net-top-100-30d.json",
);

function createSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    throw new Error(
      "SUPABASE_URL or SUPABASE_SECRET_KEY is missing.",
    );
  }

  return createClient(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function main() {
  const catalog = JSON.parse(
    await readFile(catalogPath, "utf8"),
  );

  if (
    !Array.isArray(catalog.collections) ||
    catalog.collections.length === 0
  ) {
    throw new Error(
      "The Top 100 catalogue is empty or invalid.",
    );
  }

  const capturedAt =
    catalog.capturedAt ?? new Date().toISOString();

  const supabase = createSupabaseClient();

  /*
   * Les anciennes collections restent en base,
   * mais ne sont plus affichées sur l'accueil.
   */
  const { error: resetError } = await supabase
    .from("collections")
    .update({
      catalog_active: false,
    })
    .eq("catalog_active", true);

  if (resetError) {
    throw new Error(
      `Unable to reset catalogue status: ${resetError.message}`,
    );
  }

  const updated = [];
  const pending = [];
  const failed = [];

  for (const collection of catalog.collections) {
    const { data, error } = await supabase
      .from("collections")
      .update({
        ord_rank_30d: collection.rank,
        ranking_window: "30d",
        ranking_captured_at: capturedAt,
        catalog_active: true,
      })
      .eq("slug", collection.slug)
      .select("slug");

    if (error) {
      failed.push({
        rank: collection.rank,
        slug: collection.slug,
        error: error.message,
      });

      continue;
    }

    if (!data || data.length === 0) {
      /*
       * La collection est dans le Top 100,
       * mais elle n'a pas encore été indexée.
       */
      pending.push({
        rank: collection.rank,
        slug: collection.slug,
      });

      continue;
    }

    updated.push({
      rank: collection.rank,
      slug: collection.slug,
    });
  }

  console.log("");
  console.log("ORDstats ranking synchronization");
  console.log("--------------------------------");
  console.log(`Catalogue entries: ${catalog.collections.length}`);
  console.log(`Indexed and ranked: ${updated.length}`);
  console.log(`Awaiting indexing:  ${pending.length}`);
  console.log(`Failed:             ${failed.length}`);

  if (updated.length > 0) {
    console.log("");
    console.log("Currently visible:");
    console.table(updated);
  }

  if (pending.length > 0) {
    console.log("");
    console.log("Top 100 collections not indexed yet:");
    console.table(pending);
  }

  if (failed.length > 0) {
    console.log("");
    console.log("Errors:");
    console.table(failed);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("");
  console.error("Ranking synchronization failed");
  console.error("------------------------------");
  console.error(error);
  process.exitCode = 1;
});
