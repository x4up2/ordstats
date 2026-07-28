import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_URL =
  "https://ord.net/collections?window=30d";

const COLLECTION_LIMIT = 100;

const outputDirectory = path.resolve("data");

const textOutputPath = path.join(
  outputDirectory,
  "ord-net-top-100-30d.txt",
);

const jsonOutputPath = path.join(
  outputDirectory,
  "ord-net-top-100-30d.json",
);

function deduplicateBySlug(collections) {
  const seen = new Set();
  const unique = [];

  for (const collection of collections) {
    if (!collection.slug || seen.has(collection.slug)) {
      continue;
    }

    seen.add(collection.slug);
    unique.push(collection);
  }

  return unique;
}

async function extractCollections(page) {
  const candidates = await page.evaluate(
    (collectionLimit) => {
      const anchors = Array.from(
        document.querySelectorAll(
          'main a[href*="/collection/"]',
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

          /*
           * Chaque ligne actuelle du classement ord.net
           * est elle-même une balise <a> dont le texte
           * commence directement par son rang.
           */
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
    page.getByRole("button", {
      name: /load more/i,
    }),
    page.getByRole("button", {
      name: /show more/i,
    }),
    page.getByRole("button", {
      name: /more collections/i,
    }),
  ];

  for (const button of buttons) {
    const candidate = button.first();

    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click().catch(() => {});
      await page.waitForTimeout(800);
      return true;
    }
  }

  return false;
}

async function main() {
  console.log("Opening ord.net 30-day ranking…");

  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
  });

  try {
    const context = await browser.newContext({
      viewport: {
        width: 1440,
        height: 1200,
      },
    });

    const page = await context.newPage();

    await page.goto(SOURCE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });

    await page.waitForTimeout(3_000);

    let collections = [];
    let unchangedRounds = 0;
    let previousCount = 0;

    for (let round = 0; round < 120; round += 1) {
      collections = await extractCollections(page);

      console.log(
        `Detected ${collections.length} unique collection links…`,
      );

      if (collections.length >= COLLECTION_LIMIT) {
        break;
      }

      await clickLoadMore(page);

      await page.evaluate(() => {
        window.scrollTo({
          top: document.body.scrollHeight,
          behavior: "instant",
        });
      });

      await page.waitForTimeout(1_000);

      if (collections.length === previousCount) {
        unchangedRounds += 1;
      } else {
        unchangedRounds = 0;
      }

      previousCount = collections.length;

      if (unchangedRounds >= 12) {
        break;
      }
    }

    collections =
      await extractCollections(page);

    validateTop100(collections);

    const normalizedCollections =
      collections.map((collection) => ({
        rank: collection.rank,
        slug: collection.slug,
        name: collection.name,
        url: collection.url,
      }));

    await mkdir(outputDirectory, {
      recursive: true,
    });

    await writeFile(
      textOutputPath,
      normalizedCollections
        .map((collection) => collection.url)
        .join("\n") + "\n",
      "utf8",
    );

    await writeFile(
      jsonOutputPath,
      JSON.stringify(
        {
          source: SOURCE_URL,
          window: "30d",
          capturedAt: new Date().toISOString(),
          collectionCount:
            normalizedCollections.length,
          collections: normalizedCollections,
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );

    console.log("");
    console.log("Top 100 catalogue generated");
    console.log("--------------------------");
    console.log(`Text: ${textOutputPath}`);
    console.log(`JSON: ${jsonOutputPath}`);
    console.log(
      `Collections: ${normalizedCollections.length}`,
    );

    console.table(
      normalizedCollections.map(
        ({ rank, name, slug }) => ({
          rank,
          name,
          slug,
        }),
      ),
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("");
  console.error("Top 50 extraction failed");
  console.error("------------------------");
  console.error(error);
  process.exitCode = 1;
});
