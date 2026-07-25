import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_URL =
  "https://ord.net/collections?window=30d";

const COLLECTION_LIMIT = 50;

const outputDirectory = path.resolve("data");

const textOutputPath = path.join(
  outputDirectory,
  "ord-net-top-50-30d.txt",
);

const jsonOutputPath = path.join(
  outputDirectory,
  "ord-net-top-50-30d.json",
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
  const candidates = await page.evaluate(() => {
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

        const url = new URL(href, window.location.origin);

        const match = url.pathname.match(
          /^\/collection\/([^/?#]+)\/?$/,
        );

        if (
          url.hostname !== "ord.net" ||
          !match
        ) {
          return null;
        }

        let current = anchor;
        let detectedRank = null;

        /*
         * Look through the closest parent elements for a row
         * beginning with an integer ranking number.
         */
        for (
          let depth = 0;
          depth < 7 && current;
          depth += 1
        ) {
          const text = (
            current.textContent ?? ""
          )
            .replace(/\s+/g, " ")
            .trim();

          const rankMatch = text.match(
            /^(\d{1,3})(?:\s|$)/,
          );

          if (rankMatch) {
            const possibleRank = Number(rankMatch[1]);

            if (
              Number.isInteger(possibleRank) &&
              possibleRank >= 1 &&
              possibleRank <= 500
            ) {
              detectedRank = possibleRank;
              break;
            }
          }

          current = current.parentElement;
        }

        const name = (
          anchor.textContent ?? ""
        )
          .replace(/\s+/g, " ")
          .trim();

        const slug = decodeURIComponent(match[1]);

        return {
          rank: detectedRank,
          domIndex,
          slug,
          name: name || slug,
          url: `https://ord.net/collection/${slug}`,
        };
      })
      .filter(Boolean);
  });

  const unique = deduplicateBySlug(candidates);

  /*
   * Prefer the ranking number when it can be detected.
   * Otherwise preserve the order in which links appear.
   */
  const ranked = unique
    .filter(
      (collection) =>
        Number.isInteger(collection.rank) &&
        collection.rank >= 1,
    )
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        left.domIndex - right.domIndex,
    );

  if (ranked.length >= COLLECTION_LIMIT) {
    return deduplicateBySlug(ranked);
  }

  return unique.sort(
    (left, right) =>
      left.domIndex - right.domIndex,
  );
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

    for (let round = 0; round < 60; round += 1) {
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

      if (unchangedRounds >= 8) {
        break;
      }
    }

    collections = (
      await extractCollections(page)
    ).slice(0, COLLECTION_LIMIT);

    if (collections.length < COLLECTION_LIMIT) {
      throw new Error(
        `Only ${collections.length} collections were detected. ` +
          `The ord.net page structure may have changed.`,
      );
    }

    const normalizedCollections = collections.map(
      (collection, index) => ({
        rank: index + 1,
        slug: collection.slug,
        name: collection.name,
        url: collection.url,
      }),
    );

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
    console.log("Top 50 catalogue generated");
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
