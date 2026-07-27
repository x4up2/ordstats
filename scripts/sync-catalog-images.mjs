import {
  access,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const downloadOnly =
  process.argv.includes("--download-only");

const publishLocal =
  process.argv.includes("--publish-local");

const force = process.argv.includes("--force");

if (downloadOnly && publishLocal) {
  throw new Error(
    "--download-only and --publish-local cannot be combined.",
  );
}

const mode = publishLocal
  ? "publish"
  : downloadOnly
    ? "download"
    : "sync";

const projectRoot = process.cwd();

const outputDirectory = path.join(
  projectRoot,
  "public",
  "collection-images",
);

await mkdir(outputDirectory, {
  recursive: true,
});

const catalog = JSON.parse(
  await readFile(
    path.join(
      projectRoot,
      "data",
      "ord-net-top-100-30d.json",
    ),
    "utf8",
  ),
);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecret =
  process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecret) {
  throw new Error(
    "SUPABASE_URL or SUPABASE_SECRET_KEY is missing.",
  );
}

const supabase = createClient(
  supabaseUrl,
  supabaseSecret,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);

const supportedExtensions = [
  "webp",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "avif",
  "svg",
];

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#x2F;", "/");
}

function safeFilename(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractCollectionImage(
  html,
  collectionName,
) {
  const escapedName = collectionName.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );

  const patterns = [
    new RegExp(
      `<img[^>]+alt=["']${escapedName}["'][^>]+src=["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<img[^>]+src=["']([^"']+)["'][^>]+alt=["']${escapedName}["']`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match?.[1]) {
      return decodeHtml(match[1]);
    }
  }

  /*
   * Repli : recherche dans le corps de la page, afin
   * d’éviter les images sociales contenues dans <head>.
   */
  const bodyHtml = html.replace(
    /<head[\s\S]*?<\/head>/i,
    "",
  );

  const renderMatch = bodyHtml.match(
    /https:\/\/render\.ord\.net\/v\d+\/snapshots\/[^"'<> ]+\/512\.webp/i,
  );

  return renderMatch?.[0] ?? null;
}

function extensionFromContentType(contentType) {
  const mapping = {
    "image/webp": "webp",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/avif": "avif",
    "image/svg+xml": "svg",
  };

  return mapping[contentType] ?? null;
}

function extensionFromUrl(imageUrl) {
  try {
    const pathname = new URL(imageUrl).pathname;
    const match = pathname.match(
      /\.([a-z0-9]+)$/i,
    );

    const extension =
      match?.[1]?.toLowerCase() ?? null;

    return supportedExtensions.includes(extension)
      ? extension
      : null;
  } catch {
    return null;
  }
}

async function findLocalImage(slug) {
  const basename = safeFilename(slug);

  for (const extension of supportedExtensions) {
    const filename = `${basename}.${extension}`;

    const filePath = path.join(
      outputDirectory,
      filename,
    );

    try {
      await access(filePath);

      return {
        filename,
        filePath,
        publicUrl:
          `/collection-images/${filename}`,
      };
    } catch {
      // Continue avec l’extension suivante.
    }
  }

  return null;
}

async function updateSupabaseImage(
  slug,
  publicUrl,
) {
  const { error } = await supabase
    .from("collections")
    .update({
      image_url: publicUrl,
    })
    .eq("slug", slug);

  if (error) {
    throw new Error(error.message);
  }
}

async function downloadImage(imageUrl) {
  const response = await fetch(imageUrl, {
    headers: {
      Accept:
        "image/avif,image/webp,image/png,image/jpeg,image/*",
      "User-Agent": "ORDstats/1.0",
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(
      `Image HTTP ${response.status}: ${imageUrl}`,
    );
  }

  const contentType = (
    response.headers.get("content-type") ?? ""
  )
    .split(";")[0]
    .trim()
    .toLowerCase();

  const extension =
    extensionFromContentType(contentType) ??
    extensionFromUrl(imageUrl);

  if (!extension) {
    throw new Error(
      `Unsupported image type "${contentType || "unknown"}": ` +
        imageUrl,
    );
  }

  if (
    contentType.startsWith("text/") ||
    contentType.includes("json") ||
    contentType.includes("javascript")
  ) {
    throw new Error(
      `The image URL returned ${contentType}: ${imageUrl}`,
    );
  }

  const buffer = Buffer.from(
    await response.arrayBuffer(),
  );

  if (buffer.length < 32) {
    throw new Error(
      `Downloaded image is empty or invalid: ${imageUrl}`,
    );
  }

  return {
    buffer,
    extension,
    contentType,
  };
}

const downloaded = [];
const published = [];
const preserved = [];
const missing = [];
const failed = [];

for (const collection of catalog.collections) {
  const label =
    `#${collection.rank} ${collection.slug}`;

  try {
    const existingLocal =
      await findLocalImage(collection.slug);

    if (mode === "publish") {
      if (!existingLocal) {
        missing.push({
          rank: collection.rank,
          slug: collection.slug,
          reason: "local file missing",
        });

        continue;
      }

      await updateSupabaseImage(
        collection.slug,
        existingLocal.publicUrl,
      );

      published.push({
        rank: collection.rank,
        slug: collection.slug,
        imageUrl: existingLocal.publicUrl,
      });

      console.log(
        `${label} → ${existingLocal.publicUrl}`,
      );

      continue;
    }

    if (existingLocal && !force) {
      preserved.push({
        rank: collection.rank,
        slug: collection.slug,
        imageUrl: existingLocal.publicUrl,
      });

      console.log(
        `${label} → local file preserved`,
      );

      if (mode === "sync") {
        await updateSupabaseImage(
          collection.slug,
          existingLocal.publicUrl,
        );

        published.push({
          rank: collection.rank,
          slug: collection.slug,
          imageUrl: existingLocal.publicUrl,
        });
      }

      continue;
    }

    const pageResponse = await fetch(
      collection.url,
      {
        headers: {
          Accept: "text/html",
          "User-Agent": "ORDstats/1.0",
        },
        signal: AbortSignal.timeout(30_000),
      },
    );

    if (!pageResponse.ok) {
      throw new Error(
        `Collection page HTTP ${pageResponse.status}`,
      );
    }

    const html = await pageResponse.text();

    const name = collection.name
      .replace(/^\d+\s+/, "")
      .split(/\s{2,}/)[0]
      .trim();

    const extractedUrl =
      extractCollectionImage(html, name);

    if (!extractedUrl) {
      missing.push({
        rank: collection.rank,
        slug: collection.slug,
        reason: "image URL not found",
      });

      continue;
    }

    const absoluteImageUrl = new URL(
      extractedUrl,
      collection.url,
    ).href;

    const {
      buffer,
      extension,
      contentType,
    } = await downloadImage(absoluteImageUrl);

    const filename =
      `${safeFilename(collection.slug)}.${extension}`;

    const filePath = path.join(
      outputDirectory,
      filename,
    );

    const publicUrl =
      `/collection-images/${filename}`;

    await writeFile(filePath, buffer);

    downloaded.push({
      rank: collection.rank,
      slug: collection.slug,
      imageUrl: absoluteImageUrl,
      localUrl: publicUrl,
      contentType,
      bytes: buffer.length,
    });

    console.log(
      `${label} → ${publicUrl} ` +
        `(${Math.round(buffer.length / 1024)} kB)`,
    );

    if (mode === "sync") {
      await updateSupabaseImage(
        collection.slug,
        publicUrl,
      );

      published.push({
        rank: collection.rank,
        slug: collection.slug,
        imageUrl: publicUrl,
      });
    }
  } catch (error) {
    failed.push({
      rank: collection.rank,
      slug: collection.slug,
      error:
        error instanceof Error
          ? error.message
          : String(error),
    });

    console.error(
      `${label} → ERROR: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`,
    );
  }
}

console.log("");
console.log("ORDstats local image synchronization");
console.log("------------------------------------");
console.log(`Mode:       ${mode}`);
console.log(`Downloaded: ${downloaded.length}`);
console.log(`Preserved:  ${preserved.length}`);
console.log(`Published:  ${published.length}`);
console.log(`Missing:    ${missing.length}`);
console.log(`Failed:     ${failed.length}`);

if (missing.length > 0) {
  console.log("");
  console.log("Images missing:");
  console.table(missing);
}

if (failed.length > 0) {
  console.log("");
  console.log("Errors:");
  console.table(failed);
  process.exitCode = 1;
}
