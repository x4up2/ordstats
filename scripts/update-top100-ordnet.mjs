import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";

const SOURCE_URL =
  "https://ord.net/collections?window=30d";
const COLLECTION_LIMIT = 100;

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [30_000, 90_000];
const FIRST_ROWS_TIMEOUT_MS = 90_000;
const COLLECTION_TIMEOUT_MS = 180_000;
const NO_PROGRESS_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 1_000;

const outputDirectory = path.resolve("data");
const textOutputPath = path.join(
  outputDirectory,
  "ord-net-top-100-30d.txt",
);
const jsonOutputPath = path.join(
  outputDirectory,
  "ord-net-top-100-30d.json",
);

async function extractCollections(page) {
  const candidates = await page.evaluate(
    (collectionLimit) => {
      const anchors = Array.from(
        document.querySelectorAll(
          'a[href*="/collection/"]',
        ),
      );

      return anchors
        .map((anchor, domIndex) => {
          const href = anchor.getAttribute("href");

          if (!href) {
            return null;
          }

          const url = new URL(
            href,
            window.location.origin,
          );
          const match = url.pathname.match(
            /^\/collection\/([^/?#]+)\/?$/,
          );

          if (
            url.hostname !== "ord.net" ||
            !match
          ) {
            return null;
          }

          const rowText = (
            anchor.textContent ?? ""
          )
            .replace(/\s+/g, " ")
            .trim();
          const rankMatch = rowText.match(
            /^(\d{1,3})(?:\s|$)/,
          );

          if (!rankMatch) {
            return null;
          }

          const rank = Number(rankMatch[1]);

          if (
            !Number.isInteger(rank) ||
            rank < 1 ||
            rank > collectionLimit
          ) {
            return null;
          }

          const slug =
            decodeURIComponent(match[1]);
          const imageName = (
            anchor.querySelector("img[alt]")
              ?.getAttribute("alt") ?? ""
          ).trim();

          return {
            rank,
            domIndex,
            slug,
            name: imageName || slug,
            url:
              `https://ord.net/collection/${slug}`,
          };
        })
        .filter(Boolean);
    },
    COLLECTION_LIMIT,
  );

  const byRank = new Map();
  const slugRanks = new Map();

  for (const collection of candidates) {
    const existingAtRank =
      byRank.get(collection.rank);

    if (
      existingAtRank &&
      existingAtRank.slug !== collection.slug
    ) {
      throw new Error(
        `Conflicting collections detected at rank ` +
          `${collection.rank}: ` +
          `${existingAtRank.slug} and ` +
          `${collection.slug}.`,
      );
    }

    const existingSlugRank =
      slugRanks.get(collection.slug);

    if (
      existingSlugRank !== undefined &&
      existingSlugRank !== collection.rank
    ) {
      throw new Error(
        `Collection ${collection.slug} appears at ` +
          `ranks ${existingSlugRank} and ` +
          `${collection.rank}.`,
      );
    }

    if (!existingAtRank) {
      byRank.set(
        collection.rank,
        collection,
      );
    }

    slugRanks.set(
      collection.slug,
      collection.rank,
    );
  }

  return [...byRank.values()].sort(
    (left, right) =>
      left.rank - right.rank,
  );
}

function validateTop100(collections) {
  if (collections.length !== COLLECTION_LIMIT) {
    throw new Error(
      `Expected ${COLLECTION_LIMIT} ranked ` +
        `collections, but detected ` +
        `${collections.length}.`,
    );
  }

  const missingRanks = [];

  for (
    let rank = 1;
    rank <= COLLECTION_LIMIT;
    rank += 1
  ) {
    if (
      !collections.some(
        (collection) =>
          collection.rank === rank,
      )
    ) {
      missingRanks.push(rank);
    }
  }

  if (missingRanks.length > 0) {
    throw new Error(
      `Missing ord.net ranks: ` +
        `${missingRanks.join(", ")}.`,
    );
  }
}

async function clickLoadMore(page) {
  const buttons = [
    page.getByRole("button", { name: /load more/i }),
    page.getByRole("button", { name: /show more/i }),
    page.getByRole("button", { name: /more collections/i }),
  ];

  for (const button of buttons) {
    const candidate = button.first();
    if (!(await candidate.isVisible())) continue;

    try {
      await candidate.click({ timeout: 3_000 });
      return true;
    } catch (error) {
      console.warn(`Load-more click failed: ${error.message}`);
    }
  }

  return false;
}

function attachDiagnostics(page, events) {
  const record = (type, details) => {
    if (events.length >= 200) events.shift();
    events.push({ at: new Date().toISOString(), type, ...details });
  };

  page.on("pageerror", (error) => {
    record("pageerror", { message: error.message });
  });
  page.on("console", (message) => {
    if (["warning", "error"].includes(message.type())) {
      record("console", {
        level: message.type(),
        message: message.text().slice(0, 1_000),
      });
    }
  });
  page.on("requestfailed", (request) => {
    record("requestfailed", {
      url: request.url(),
      resourceType: request.resourceType(),
      message: request.failure()?.errorText,
    });
  });
  page.on("response", (response) => {
    const resourceType = response.request().resourceType();
    if (
      response.status() >= 400 ||
      ["document", "xhr", "fetch"].includes(resourceType)
    ) {
      record("response", {
        url: response.url(),
        status: response.status(),
        resourceType,
      });
    }
  });
}

async function saveFailureDiagnostics(page, directory, details) {
  await mkdir(directory, { recursive: true });

  let pageState = null;
  if (page && !page.isClosed()) {
    pageState = await page.evaluate(() => {
      const anchors = Array.from(
        document.querySelectorAll('a[href*="/collection/"]'),
      );
      return {
        url: window.location.href,
        title: document.title,
        readyState: document.readyState,
        rawCollectionLinks: anchors.length,
        bodyText: (document.body?.innerText ?? "").slice(0, 4_000),
        sampleLinks: anchors.slice(0, 20).map((anchor) => ({
          href: anchor.getAttribute("href"),
          text: (anchor.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
        })),
      };
    }).catch((error) => ({ inspectionError: error.message }));
  }

  await writeFile(
    path.join(directory, "diagnostic.json"),
    JSON.stringify({ ...details, pageState }, null, 2) + "\n",
    "utf8",
  );
  console.error(`Diagnostic: ${path.join(directory, "diagnostic.json")}`);

  if (page && !page.isClosed()) {
    try {
      await writeFile(path.join(directory, "page.html"), await page.content(), "utf8");
    } catch (error) {
      console.warn(`Unable to save page HTML: ${error.message}`);
    }
    try {
      await page.screenshot({
        path: path.join(directory, "page.png"),
        fullPage: false,
        timeout: 10_000,
      });
    } catch (error) {
      console.warn(`Unable to save screenshot: ${error.message}`);
    }
  }
}

async function extractAttempt(attempt, runDirectory) {
  let browser;
  let page;
  const events = [];
  let collections = [];
  let navigationStatus = null;

  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1200 },
    });
    context.setDefaultTimeout(15_000);
    page = await context.newPage();
    attachDiagnostics(page, events);

    const response = await page.goto(SOURCE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    navigationStatus = response?.status() ?? null;
    console.log(`Navigation HTTP ${navigationStatus ?? "unknown"}: ${page.url()}`);
    if (!response || !response.ok()) {
      throw new Error(`ord.net navigation failed: HTTP ${navigationStatus ?? "unknown"}.`);
    }

    const finalUrl = new URL(page.url());
    if (
      finalUrl.origin !== "https://ord.net" ||
      finalUrl.pathname.replace(/\/$/, "") !== "/collections" ||
      finalUrl.searchParams.get("window") !== "30d"
    ) {
      throw new Error(`Unexpected ranking URL: ${page.url()}`);
    }

    const firstRowsDeadline = Date.now() + FIRST_ROWS_TIMEOUT_MS;
    let lastLogAt = 0;
    while (true) {
      collections = await extractCollections(page);
      const now = Date.now();
      if (now - lastLogAt >= 10_000 || collections.length > 0) {
        const rawLinks = await page.locator('a[href*="/collection/"]').count();
        console.log(`Ranking load: ${rawLinks} collection link(s), ${collections.length} accepted rank(s).`);
        lastLogAt = now;
      }
      if (collections.length > 0) break;
      if (now >= firstRowsDeadline) {
        throw new Error(`No ranked collections appeared within ${FIRST_ROWS_TIMEOUT_MS / 1_000}s.`);
      }
      await delay(POLL_INTERVAL_MS);
    }

    const collectionDeadline = Date.now() + COLLECTION_TIMEOUT_MS;
    let highestCount = collections.length;
    let lastProgressAt = Date.now();
    let lastLoggedCount = -1;
    lastLogAt = 0;

    while (true) {
      const now = Date.now();
      if (collections.length > highestCount) {
        highestCount = collections.length;
        lastProgressAt = now;
      }
      if (collections.length !== lastLoggedCount || now - lastLogAt >= 10_000) {
        console.log(`Detected ${collections.length}/${COLLECTION_LIMIT} ranked collections.`);
        lastLoggedCount = collections.length;
        lastLogAt = now;
      }
      if (collections.length === COLLECTION_LIMIT) {
        validateTop100(collections);
        return collections;
      }
      if (now >= collectionDeadline || now - lastProgressAt >= NO_PROGRESS_TIMEOUT_MS) {
        throw new Error(`Ranking stalled at ${collections.length}/${COLLECTION_LIMIT} collections.`);
      }

      await clickLoadMore(page);
      await page.evaluate(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" });
        for (const element of document.querySelectorAll("*")) {
          const style = getComputedStyle(element);
          if (
            element.scrollHeight > element.clientHeight + 50 &&
            ["auto", "scroll"].includes(style.overflowY)
          ) {
            element.scrollTop = element.scrollHeight;
          }
        }
      });
      await delay(POLL_INTERVAL_MS);
      collections = await extractCollections(page);
    }
  } catch (error) {
    console.error(`Attempt ${attempt}/${MAX_ATTEMPTS} failed: ${error.message}`);
    const lastError = [...events].reverse().find((event) =>
      event.type === "pageerror" ||
      event.type === "requestfailed" ||
      (event.type === "response" && event.status >= 400),
    );
    if (lastError) console.error(`Browser detail: ${JSON.stringify(lastError)}`);

    try {
      await saveFailureDiagnostics(page, path.join(runDirectory, `attempt-${attempt}`), {
        source: SOURCE_URL,
        attempt,
        failedAt: new Date().toISOString(),
        navigationStatus,
        acceptedRanks: collections.length,
        error: error.stack ?? String(error),
        events,
      });
    } catch (diagnosticError) {
      console.warn(`Unable to save diagnostics: ${diagnosticError.message}`);
    }
    throw error;
  } finally {
    if (browser) {
      await browser.close().catch((error) => {
        console.warn(`Browser cleanup failed: ${error.message}`);
      });
    }
  }
}

async function main() {
  console.log("Opening ord.net 30-day ranking…");
  const runId = new Date().toISOString().replace(/[:.]/g, "-") + `-${process.pid}`;
  const runDirectory = path.resolve("logs", "ordnet-top100", runId);
  let collections;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    console.log(`Top 100 extraction attempt ${attempt}/${MAX_ATTEMPTS}`);
    try {
      collections = await extractAttempt(attempt, runDirectory);
      break;
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(
          `Top 100 extraction failed after ${MAX_ATTEMPTS} attempts. ` +
          `Existing catalogue files were not changed. Last error: ${error.message}`,
          { cause: error },
        );
      }
      const retryDelay = RETRY_DELAYS_MS[attempt - 1];
      console.log(`Retrying with a fresh browser in ${retryDelay / 1_000}s…`);
      await delay(retryDelay);
    }
  }

  validateTop100(collections);
  const normalizedCollections = collections.map((collection) => ({
    rank: collection.rank,
    slug: collection.slug,
    name: collection.name,
    url: collection.url,
  }));

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    textOutputPath,
    normalizedCollections.map((collection) => collection.url).join("\n") + "\n",
    "utf8",
  );
  await writeFile(
    jsonOutputPath,
    JSON.stringify({
      source: SOURCE_URL,
      window: "30d",
      capturedAt: new Date().toISOString(),
      collectionCount: normalizedCollections.length,
      collections: normalizedCollections,
    }, null, 2) + "\n",
    "utf8",
  );

  console.log("");
  console.log("Top 100 catalogue generated");
  console.log("--------------------------");
  console.log(`Text: ${textOutputPath}`);
  console.log(`JSON: ${jsonOutputPath}`);
  console.log(`Collections: ${normalizedCollections.length}`);
  console.table(normalizedCollections.map(({ rank, name, slug }) => ({ rank, name, slug })));
}

main().catch((error) => {
  console.error("");
  console.error("Top 100 catalogue update failed");
  console.error("------------------------------");
  console.error(error);
  process.exitCode = 1;
});
