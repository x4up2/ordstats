import { spawnSync } from "node:child_process";

const input = process.argv[2];

if (!input) {
  console.error("");
  console.error(
    "Usage: npm run index:collection -- https://ord.net/collection/wizards",
  );
  process.exit(1);
}

function extractSlug(value) {
  const trimmed = value.trim();

  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  let url;

  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(
      "Provide an ord.net collection URL or a valid collection slug.",
    );
  }

  const hostname = url.hostname.replace(/^www\./, "");

  if (url.protocol !== "https:" || hostname !== "ord.net") {
    throw new Error(
      "The URL must belong to https://ord.net.",
    );
  }

  const match = url.pathname.match(
    /^\/collection\/([a-zA-Z0-9_-]+)\/?$/,
  );

  if (!match) {
    throw new Error(
      "Expected an URL such as https://ord.net/collection/wizards.",
    );
  }

  return match[1].toLowerCase();
}

function runScript(filename, slug) {
  const result = spawnSync(
    process.execPath,
    [filename, slug],
    {
      stdio: "inherit",
      env: process.env,
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

try {
  const slug = extractSlug(input);

  console.log("");
  console.log("ORDstats collection indexer");
  console.log("---------------------------");
  console.log(`Input: ${input}`);
  console.log(`Slug:  ${slug}`);
  console.log("");

  console.log("Step 1/2 — Generating ownership snapshot");
  runScript("scripts/snapshot-ownership.mjs", slug);

  console.log("");
  console.log("Step 2/2 — Publishing snapshot to Supabase");
  runScript("scripts/upload-snapshot.mjs", slug);

  console.log("");
  console.log("Collection indexed successfully");
  console.log("--------------------------------");
  console.log(`Local page: http://localhost:3000/collection/${slug}`);
  console.log(`Public path: /collection/${slug}`);
} catch (error) {
  console.error("");
  console.error("Collection indexing failed:");
  console.error(
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
