import { spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";

const ordBaseUrl = (
  process.env.ORD_BASE_URL ?? "http://127.0.0.1"
).replace(/\/$/, "");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecret = process.env.SUPABASE_SECRET_KEY;

const collectionRetryDelaysMs = [
  2 * 60 * 1000,
  10 * 60 * 1000,
];

const serviceRetryDelaysMs = [
  30 * 1000,
  2 * 60 * 1000,
];

if (!supabaseUrl) {
  throw new Error(
    "SUPABASE_URL is missing from .env.local.",
  );
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

function timestamp() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(
    0,
    Math.round(milliseconds / 1000),
  );

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(
    (totalSeconds % 3600) / 60,
  );
  const seconds = totalSeconds % 60;

  return [
    hours > 0 ? `${hours}h` : null,
    minutes > 0 || hours > 0
      ? `${minutes}m`
      : null,
    `${seconds}s`,
  ]
    .filter(Boolean)
    .join(" ");
}

function describeResult(result) {
  if (result.error) {
    return result.error.message;
  }

  if (result.signal) {
    return (
      `Process terminated by signal ${result.signal}`
    );
  }

  return (
    `Process exited with status ` +
    `${result.status ?? "unknown"}`
  );
}

async function retryOperation(
  label,
  operation,
  retryDelaysMs = serviceRetryDelaysMs,
) {
  const totalAttempts =
    retryDelaysMs.length + 1;

  let lastError;

  for (
    let attempt = 1;
    attempt <= totalAttempts;
    attempt += 1
  ) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      const message =
        error instanceof Error
          ? error.message
          : String(error);

      console.error(
        `[${timestamp()}] ${label} failed ` +
          `(attempt ${attempt}/${totalAttempts}): ` +
          message,
      );

      if (attempt < totalAttempts) {
        const delayMs =
          retryDelaysMs[attempt - 1];

        console.log(
          `[${timestamp()}] Retrying ${label} in ` +
            `${formatDuration(delayMs)}.`,
        );

        await sleep(delayMs);
      }
    }
  }

  throw lastError;
}

async function checkOrdServer() {
  let response;

  try {
    response = await fetch(
      `${ordBaseUrl}/status`,
      {
        headers: {
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(20_000),
      },
    );
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.message
        : String(error);

    throw new Error(
      `Unable to reach ord server at ` +
        `${ordBaseUrl}: ${detail}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `ord server returned HTTP ` +
        `${response.status}.`,
    );
  }

  const status = await response.json();

  if (
    !status.json_api ||
    !status.inscription_index
  ) {
    throw new Error(
      "The ord server does not expose the " +
        "required inscription API.",
    );
  }

  return status;
}

async function loadCollections() {
  const {
    data: collections,
    error,
  } = await supabase
    .from("collections")
    .select("slug, name")
    .eq("catalog_active", true)
    .order("slug", {
      ascending: true,
    });

  if (error) {
    throw new Error(
      `Unable to retrieve collections: ` +
        `${error.message}`,
    );
  }

  return collections ?? [];
}

function indexCollection(slug) {
  return spawnSync(
    process.execPath,
    [
      "scripts/index-collection.mjs",
      slug,
    ],
    {
      stdio: "inherit",
      env: process.env,
    },
  );
}

async function runPass(
  collections,
  pass,
  totalPasses,
) {
  const failed = [];

  console.log("");
  console.log(
    `Collection pass ${pass}/${totalPasses} · ` +
      `${collections.length} collection(s)`,
  );
  console.log("=".repeat(50));

  for (
    const [index, collection]
    of collections.entries()
  ) {
    const startedAt = Date.now();

    console.log("");
    console.log(
      `[${timestamp()}] ` +
        `[pass ${pass}/${totalPasses}] ` +
        `[${index + 1}/${collections.length}] ` +
        `${collection.name} (${collection.slug})`,
    );
    console.log("-".repeat(50));

    const result =
      indexCollection(collection.slug);

    const duration = formatDuration(
      Date.now() - startedAt,
    );

    if (
      !result.error &&
      result.status === 0 &&
      !result.signal
    ) {
      console.log(
        `[${timestamp()}] SUCCESS ` +
          `${collection.slug} after ${duration}.`,
      );

      continue;
    }

    const error = describeResult(result);

    console.error(
      `[${timestamp()}] FAILED ` +
        `${collection.slug} after ${duration}: ` +
        error,
    );

    failed.push({
      ...collection,
      error,
    });
  }

  return failed;
}

async function main() {
  const startedAt = Date.now();

  console.log("");
  console.log("ORDstats snapshot refresh");
  console.log("=========================");
  console.log(`Started: ${timestamp()}`);

  const ordStatus = await retryOperation(
    "ord server check",
    checkOrdServer,
  );

  console.log(
    `ord server ready · Bitcoin block ${Number(
      ordStatus.height,
    ).toLocaleString("en-US")}`,
  );

  const collections = await retryOperation(
    "Supabase collection list",
    loadCollections,
  );

  if (!collections.length) {
    console.log(
      "No indexed collections found in Supabase.",
    );
    return;
  }

  const totalPasses =
    collectionRetryDelaysMs.length + 1;

  let pending = collections;

  const succeeded = new Set();
  const finalFailures = new Map();

  for (
    let pass = 1;
    pass <= totalPasses &&
    pending.length > 0;
    pass += 1
  ) {
    if (pass > 1) {
      const delayMs =
        collectionRetryDelaysMs[pass - 2];

      console.log("");
      console.log(
        `[${timestamp()}] Waiting ` +
          `${formatDuration(delayMs)} before ` +
          `retrying ${pending.length} failed ` +
          `collection(s).`,
      );

      await sleep(delayMs);

      await retryOperation(
        "ord server check before retry pass",
        checkOrdServer,
      );
    }

    const attemptedSlugs = new Set(
      pending.map(
        (collection) => collection.slug,
      ),
    );

    const failed = await runPass(
      pending,
      pass,
      totalPasses,
    );

    const failedSlugs = new Set(
      failed.map(
        (collection) => collection.slug,
      ),
    );

    for (const slug of attemptedSlugs) {
      if (!failedSlugs.has(slug)) {
        succeeded.add(slug);
        finalFailures.delete(slug);
      }
    }

    for (const failure of failed) {
      finalFailures.set(
        failure.slug,
        failure,
      );
    }

    pending = failed;
  }

  console.log("");
  console.log("Refresh summary");
  console.log("===============");
  console.log(`Completed: ${timestamp()}`);
  console.log(
    `Duration:  ${formatDuration(
      Date.now() - startedAt,
    )}`,
  );
  console.log(`Succeeded: ${succeeded.size}`);
  console.log(
    `Failed:    ${finalFailures.size}`,
  );

  if (finalFailures.size > 0) {
    console.log("");
    console.log(
      "Persistent failures after all retries:",
    );

    for (
      const failure
      of finalFailures.values()
    ) {
      console.log(
        `- ${failure.slug}: ${failure.error}`,
      );
    }

    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("");
  console.error("Snapshot refresh failed:");
  console.error(
    error instanceof Error
      ? error.message
      : String(error),
  );

  process.exit(1);
});
