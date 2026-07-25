import { spawn } from "node:child_process";
import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const projectRoot = process.cwd();

const catalogPath = path.resolve(
  projectRoot,
  "data/ord-net-top-100-30d.json",
);

const stateDirectory = path.resolve(
  projectRoot,
  "data/indexing",
);

const statePath = path.join(
  stateDirectory,
  "ord-net-top-100-state.json",
);

const logsDirectory = path.resolve(
  projectRoot,
  "logs/catalog-indexing",
);

function parseArguments(argv) {
  const options = {
    limit: null,
    from: 1,
    force: false,
    retryFailed: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--limit") {
      options.limit = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--from") {
      options.from = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--force") {
      options.force = true;
      continue;
    }

    if (argument === "--retry-failed") {
      options.retryFailed = true;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  if (
    options.limit !== null &&
    (!Number.isInteger(options.limit) ||
      options.limit <= 0)
  ) {
    throw new Error("--limit must be a positive integer.");
  }

  if (
    !Number.isInteger(options.from) ||
    options.from <= 0
  ) {
    throw new Error("--from must be a positive integer.");
  }

  return options;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readState() {
  try {
    return await readJson(statePath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }

    return {
      version: 1,
      updatedAt: null,
      collections: {},
    };
  }
}

async function saveState(state) {
  state.updatedAt = new Date().toISOString();

  await mkdir(stateDirectory, {
    recursive: true,
  });

  await writeFile(
    statePath,
    JSON.stringify(state, null, 2) + "\n",
    "utf8",
  );
}

async function checkOrdServer() {
  const baseUrl =
    process.env.ORD_BASE_URL ?? "http://127.0.0.1";

  const response = await fetch(`${baseUrl}/status`, {
    headers: {
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(
      `ord server returned HTTP ${response.status}.`,
    );
  }

  const status = await response.json();

  console.log(
    `ord server ready · block ${
      status.height?.toLocaleString("en-US") ?? "unknown"
    }`,
  );
}

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

async function getIndexedSlugs(supabase) {
  const indexed = new Set();

  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("collections")
      .select("slug")
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(
        `Unable to read indexed collections: ${error.message}`,
      );
    }

    for (const row of data ?? []) {
      indexed.add(row.slug);
    }

    if (!data || data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return indexed;
}

function runIndexCommand(collection, logPath) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        "--env-file=.env.local",
        "scripts/index-collection.mjs",
        collection.url,
      ],
      {
        cwd: projectRoot,
        env: process.env,
        stdio: [
          "ignore",
          "pipe",
          "pipe",
        ],
      },
    );

    let output = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });

    child.on("error", async (error) => {
      output += `\nProcess error: ${error.message}\n`;

      await writeFile(logPath, output, "utf8");

      resolve({
        success: false,
        exitCode: null,
        error: error.message,
      });
    });

    child.on("close", async (exitCode) => {
      await writeFile(logPath, output, "utf8");

      resolve({
        success: exitCode === 0,
        exitCode,
        error:
          exitCode === 0
            ? null
            : `Index process exited with code ${exitCode}.`,
      });
    });
  });
}

function safeFilename(value) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

async function main() {
  const options = parseArguments(
    process.argv.slice(2),
  );

  const catalog = await readJson(catalogPath);
  const state = await readState();

  if (!Array.isArray(catalog.collections)) {
    throw new Error(
      "The catalogue JSON does not contain a collections array.",
    );
  }

  await checkOrdServer();

  const supabase = createSupabaseClient();
  const indexedSlugs = await getIndexedSlugs(supabase);

  let selected = catalog.collections.filter(
    (collection) => collection.rank >= options.from,
  );

  if (options.retryFailed) {
    selected = selected.filter(
      (collection) =>
        state.collections[collection.slug]?.status ===
        "failed",
    );
  }

  if (options.limit !== null) {
    selected = selected.slice(0, options.limit);
  }

  await mkdir(logsDirectory, {
    recursive: true,
  });

  console.log("");
  console.log("ORDstats catalogue indexing");
  console.log("---------------------------");
  console.log(`Selected: ${selected.length}`);
  console.log(`Starting rank: ${options.from}`);
  console.log(`Force refresh: ${options.force}`);
  console.log(
    `Retry failed only: ${options.retryFailed}`,
  );

  const results = {
    indexed: [],
    skipped: [],
    failed: [],
  };

  for (
    let index = 0;
    index < selected.length;
    index += 1
  ) {
    const collection = selected[index];

    console.log("");
    console.log(
      `[${index + 1}/${selected.length}] ` +
        `#${collection.rank} ${collection.name}`,
    );
    console.log(collection.url);

    if (
      indexedSlugs.has(collection.slug) &&
      !options.force
    ) {
      console.log(
        "Already indexed in Supabase · skipped",
      );

      state.collections[collection.slug] = {
        rank: collection.rank,
        name: collection.name,
        url: collection.url,
        status: "skipped",
        reason: "already-indexed",
        lastAttemptAt: new Date().toISOString(),
      };

      results.skipped.push(collection.slug);
      await saveState(state);
      continue;
    }

    const startedAt = new Date();
    const timestamp = startedAt
      .toISOString()
      .replaceAll(":", "-");

    const logPath = path.join(
      logsDirectory,
      `${String(collection.rank).padStart(2, "0")}-` +
        `${safeFilename(collection.slug)}-${timestamp}.log`,
    );

    state.collections[collection.slug] = {
      rank: collection.rank,
      name: collection.name,
      url: collection.url,
      status: "running",
      startedAt: startedAt.toISOString(),
      lastAttemptAt: startedAt.toISOString(),
      logPath: path.relative(projectRoot, logPath),
    };

    await saveState(state);

    const result = await runIndexCommand(
      collection,
      logPath,
    );

    const finishedAt = new Date();
    const durationSeconds = Math.round(
      (finishedAt.getTime() - startedAt.getTime()) /
        1000,
    );

    if (result.success) {
      console.log(
        `Completed in ${durationSeconds}s`,
      );

      state.collections[collection.slug] = {
        ...state.collections[collection.slug],
        status: "success",
        finishedAt: finishedAt.toISOString(),
        durationSeconds,
        error: null,
      };

      indexedSlugs.add(collection.slug);
      results.indexed.push(collection.slug);
    } else {
      console.error(
        `Failed after ${durationSeconds}s`,
      );

      state.collections[collection.slug] = {
        ...state.collections[collection.slug],
        status: "failed",
        finishedAt: finishedAt.toISOString(),
        durationSeconds,
        exitCode: result.exitCode,
        error: result.error,
      };

      results.failed.push(collection.slug);
    }

    await saveState(state);
  }

  console.log("");
  console.log("Catalogue indexing complete");
  console.log("---------------------------");
  console.log(`Indexed: ${results.indexed.length}`);
  console.log(`Skipped: ${results.skipped.length}`);
  console.log(`Failed:  ${results.failed.length}`);
  console.log(`State:   ${statePath}`);
  console.log(`Logs:    ${logsDirectory}`);

  if (results.failed.length > 0) {
    console.log("");
    console.log("Failed collections:");
    for (const slug of results.failed) {
      console.log(`- ${slug}`);
    }

    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("");
  console.error("Catalogue indexing failed");
  console.error("-------------------------");
  console.error(error);
  process.exitCode = 1;
});
