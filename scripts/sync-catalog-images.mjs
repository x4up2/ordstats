import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const catalog = JSON.parse(
  await readFile(
    "data/ord-net-top-100-30d.json",
    "utf8",
  ),
);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#x2F;", "/");
}

function extractCollectionImage(html, collectionName) {
  const escapedName = collectionName.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );

  /*
   * Cherche une balise img dont le texte alternatif correspond
   * au nom de la collection. C'est l'image réellement affichée
   * par ord.net dans l'en-tête de la collection.
   */
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
   * Repli : première image render.ord.net présente dans la zone
   * principale, en excluant les images sociales de type og:image.
   */
  const bodyHtml = html
    .replace(
      /<head[\s\S]*?<\/head>/i,
      "",
    );

  const renderMatches = [
    ...bodyHtml.matchAll(
      /https:\/\/render\.ord\.net\/v\d+\/snapshots\/[^"'<> ]+\/512\.webp/gi,
    ),
  ];

  return renderMatches[0]?.[0] ?? null;
}

const updated = [];
const missing = [];
const failed = [];

for (const collection of catalog.collections) {
  try {
    const { data: existing, error: existingError } =
      await supabase
        .from("collections")
        .select("image_url")
        .eq("slug", collection.slug)
        .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    /*
     * Une image locale est une correction manuelle :
     * elle ne doit jamais être remplacée par ord.net.
     */
    if (existing?.image_url?.startsWith("/")) {
      console.log(
        `#${collection.rank} ${collection.slug} ` +
          `→ local image preserved`,
      );

      continue;
    }
    const response = await fetch(collection.url, {
      headers: {
        Accept: "text/html",
        "User-Agent": "ORDstats/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();

    const name =
      collection.name
        .replace(/^\d+\s+/, "")
        .split(/\s{2,}/)[0]
        .trim();

    const imageUrl = extractCollectionImage(
      html,
      name,
    );

    if (!imageUrl) {
      missing.push({
        rank: collection.rank,
        slug: collection.slug,
      });
      continue;
    }

    const { error } = await supabase
      .from("collections")
      .update({
        image_url: imageUrl,
      })
      .eq("slug", collection.slug);

    if (error) {
      throw new Error(error.message);
    }

    updated.push({
      rank: collection.rank,
      slug: collection.slug,
      imageUrl,
    });

    console.log(
      `#${collection.rank} ${collection.slug} → ${imageUrl}`,
    );
  } catch (error) {
    failed.push({
      rank: collection.rank,
      slug: collection.slug,
      error:
        error instanceof Error
          ? error.message
          : String(error),
    });
  }
}

console.log("");
console.log("ORDstats image synchronization");
console.log("--------------------------------");
console.log(`Updated: ${updated.length}`);
console.log(`Missing: ${missing.length}`);
console.log(`Failed:  ${failed.length}`);

if (missing.length > 0) {
  console.log("");
  console.log("No image found:");
  console.table(missing);
}

if (failed.length > 0) {
  console.log("");
  console.log("Errors:");
  console.table(failed);
  process.exitCode = 1;
}
