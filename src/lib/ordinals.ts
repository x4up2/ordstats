const COLLECTIONS_REGISTRY_URL =
  "https://raw.githubusercontent.com/TheWizardsOfOrd/ordinals-collections/main/collections.json";

const ORD_BASE_URL = (
  process.env.ORD_BASE_URL ?? "http://127.0.0.1"
).replace(/\/$/, "");

type GalleryRegistryEntry = {
  name: string;
  type: "gallery";
  id: string;
  slug: string;
};

type ParentRegistryEntry = {
  name: string;
  type: "parent";
  ids: string[];
  slug: string;
};

type RegistryEntry =
  | GalleryRegistryEntry
  | ParentRegistryEntry;

type GalleryItem =
  | string
  | {
      id?: string;
      inscription?: string;
      inscription_id?: string;
      attributes?: unknown;
    };

type InscriptionResponse = {
  id?: string;
  properties?: {
    gallery?: GalleryItem[];
    [key: string]: unknown;
  };
  gallery?: GalleryItem[];
  [key: string]: unknown;
};

type ChildrenResponse = {
  ids?: string[];
  more?: boolean;
  page?: number;
  page_index?: number;
  [key: string]: unknown;
};

export type CollectionSummary = {
  name: string;
  slug: string;
  type: "gallery" | "parent";
  sourceId: string;
  sourceIds: string[];
  supply: number;
  duplicateCount: number;
  imageUrl: string;
  firstInscriptionIds: string[];
};

async function fetchJson<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, options);
  const responseBody = await response.text();

  if (!response.ok) {
    throw new Error(
      `Request failed with status ${response.status}: ${url}`,
    );
  }

  try {
    return JSON.parse(responseBody) as T;
  } catch {
    const preview = responseBody
      .slice(0, 120)
      .replace(/\s+/g, " ");

    throw new Error(
      `The server returned invalid JSON from ${url}. ` +
        `Response starts with: ${preview}`,
    );
  }
}

export async function getRegistryEntry(
  slug: string,
): Promise<RegistryEntry | null> {
  const normalizedSlug = slug.trim().toLowerCase();

  const registry = await fetchJson<RegistryEntry[]>(
    COLLECTIONS_REGISTRY_URL,
    {
      headers: {
        Accept: "application/json",
      },
      next: {
        revalidate: 86_400,
      },
    },
  );

  return (
    registry.find(
      (entry) =>
        entry.slug.toLowerCase() === normalizedSlug,
    ) ?? null
  );
}

function extractGalleryId(
  item: GalleryItem,
  index: number,
): string {
  if (typeof item === "string") {
    return item;
  }

  const possibleId =
    item.id ??
    item.inscription ??
    item.inscription_id;

  if (
    typeof possibleId !== "string" ||
    possibleId.length === 0
  ) {
    throw new Error(
      `Gallery item ${index + 1} does not contain ` +
        "a valid inscription ID.",
    );
  }

  return possibleId;
}

export async function getGalleryInscriptionIds(
  galleryId: string,
): Promise<string[]> {
  const inscription =
    await fetchJson<InscriptionResponse>(
      `${ORD_BASE_URL}/inscription/${encodeURIComponent(
        galleryId,
      )}`,
      {
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );

  const gallery =
    inscription.properties?.gallery ??
    inscription.gallery;

  if (!Array.isArray(gallery)) {
    throw new Error(
      "The inscription does not contain a gallery property.",
    );
  }

  return gallery.map(extractGalleryId);
}

async function getSingleParentChildren(
  parentId: string,
): Promise<string[]> {
  const inscriptionIds: string[] = [];

  let page = 0;

  while (true) {
    const pageSuffix =
      page === 0 ? "" : `/${page}`;

    const response =
      await fetchJson<ChildrenResponse>(
        `${ORD_BASE_URL}/r/children/${encodeURIComponent(
          parentId,
        )}${pageSuffix}`,
        {
          headers: {
            Accept: "application/json",
          },
          cache: "no-store",
        },
      );

    if (!Array.isArray(response.ids)) {
      throw new Error(
        `Unexpected children response for parent ${parentId}, ` +
          `page ${page}.`,
      );
    }

    inscriptionIds.push(...response.ids);

    if (!response.more) {
      break;
    }

    page += 1;

    if (page > 10_000) {
      throw new Error(
        `Children pagination exceeded 10,000 pages ` +
          `for parent ${parentId}.`,
      );
    }
  }

  return inscriptionIds;
}

export async function getParentInscriptionIds(
  parentIds: string[],
): Promise<string[]> {
  if (parentIds.length === 0) {
    throw new Error(
      "The parent collection does not contain any parent ID.",
    );
  }

  const inscriptionIds: string[] = [];

  for (const parentId of parentIds) {
    const children =
      await getSingleParentChildren(parentId);

    inscriptionIds.push(...children);
  }

  return inscriptionIds;
}

export async function getCollectionSummary(
  slug: string,
): Promise<CollectionSummary> {
  const entry = await getRegistryEntry(slug);

  if (!entry) {
    throw new Error(
      "This collection is not present in the curated registry.",
    );
  }

  const sourceIds =
    entry.type === "gallery"
      ? [entry.id]
      : entry.ids;

  if (sourceIds.length === 0) {
    throw new Error(
      `Collection "${entry.slug}" has no source inscription.`,
    );
  }

  const rawInscriptionIds =
    entry.type === "gallery"
      ? await getGalleryInscriptionIds(entry.id)
      : await getParentInscriptionIds(entry.ids);

  const inscriptionIds = [
    ...new Set(rawInscriptionIds),
  ];

  const sourceId = sourceIds[0];

  return {
    name: entry.name,
    slug: entry.slug,
    type: entry.type,
    sourceId,
    sourceIds,
    supply: inscriptionIds.length,
    duplicateCount:
      rawInscriptionIds.length -
      inscriptionIds.length,
    imageUrl:
      `https://render.ord.net/v5/snapshots/` +
      `${sourceId}/512.webp`,
    firstInscriptionIds:
      inscriptionIds.slice(0, 5),
  };
}
