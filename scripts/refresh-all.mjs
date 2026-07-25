import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const ordBaseUrl = (
  process.env.ORD_BASE_URL ?? "http://127.0.0.1"
).replace(/\/$/, "");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecret = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL is missing from .env.local.");
}

if (!supabaseSecret) {
  throw new Error(
    "SUPABASE_SECRET_KEY is missing from .env.local.",
  );
}

const supabase = createClient(
  supabaseUrl,
  supabaseSecret,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);

async function checkOrdServer() {
  let response;

  try {
    response = await fetch(`${ordBaseUrl}/status`, {
      headers: {
        Accept: "application/json",
      },
    });
  } catch {
    throw new Error(
      `Unable to reach ord server at ${ordBaseUrl}.`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `ord server returned HTTP ${response.status}.`,
    );
  }

  const status = await response.json();

  if (!status.json_api || !status.inscription_index) {
    throw new Error(
      "The ord server does not expose the required inscription API.",
    );
  }

  return status;
}

function indexCollection(slug) {
  return spawnSync(
    process.execPath,
    ["scripts/index-collection.mjs", slug],
    {
      stdio: "inherit",
      env: process.env,
    },
  );
}

async function main() {
  console.log("");
  console.log("ORDstats snapshot refresh");
  console.log("=========================");

  const ordStatus = await checkOrdServer();

  console.log(
    `ord server ready · Bitcoin block ${Number(
      ordStatus.height,
    ).toLocaleString("en-US")}`,
  );

  const { data: collections, error } = await supabase
    .from("collections")
    .select("slug, name")
    .eq("catalog_active", true)
    .order("slug", {
      ascending: true,
    });

  if (error) {
    throw new Error(
      `Unable to retrieve collections: ${error.message}`,
    );
  }

  if (!collections?.length) {
    console.log("No indexed collections found in Supabase.");
    return;
  }

  console.log(
    `${collections.length} collection(s) to refresh.`,
  );

  const succeeded = [];
  const failed = [];

  for (const [index, collection] of collections.entries()) {
    console.log("");
    console.log(
      `[${index + 1}/${collections.length}] ${collection.name}`,
    );
    console.log("-".repeat(50));

    const result = indexCollection(collection.slug);

    if (result.error) {
      failed.push({
        slug: collection.slug,
        error: result.error.message,
      });

      continue;
    }

    if (result.status !== 0) {
      failed.push({
        slug: collection.slug,
        error: `Process exited with status ${result.status}`,
      });

      continue;
    }

    succeeded.push(collection.slug);
  }

  console.log("");
  console.log("Refresh summary");
  console.log("===============");
  console.log(`Succeeded: ${succeeded.length}`);
  console.log(`Failed:    ${failed.length}`);

  if (succeeded.length > 0) {
    console.log("");
    console.log("Updated collections:");

    for (const slug of succeeded) {
      console.log(`- ${slug}`);
    }
  }

  if (failed.length > 0) {
    console.log("");
    console.log("Failed collections:");

    for (const failure of failed) {
      console.log(`- ${failure.slug}: ${failure.error}`);
    }

    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("");
  console.error("Snapshot refresh failed:");
  console.error(
    error instanceof Error ? error.message : String(error),
  );

  process.exit(1);
});
