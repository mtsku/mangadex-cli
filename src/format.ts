import {
  altTitlesToArray,
  bestLocalizedText,
  relationshipByType,
  relationshipOne,
  type ChapterAttributes,
  type GroupAttributes,
  type MangaAttributes,
  type MdEntity,
  type PersonAttributes,
} from "./mangadex.js";

export interface RecommendationMeta {
  heuristic: string;
  excludedCount: number;
  inputTags: string[];
  usedFallback: boolean;
}

export function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

function formatDate(value?: string) {
  if (!value) return "n/a";
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return value;
  return new Date(ms).toISOString().replace(".000", "");
}

function chapterLabel(ch: MdEntity<ChapterAttributes>) {
  const num = ch.attributes.chapter ?? "?";
  const vol = ch.attributes.volume ? `v${ch.attributes.volume} ` : "";
  return `${vol}ch${num}`;
}

function mangaTitle(manga: MdEntity<MangaAttributes>) {
  return bestLocalizedText(manga.attributes.title) ?? altTitlesToArray(manga.attributes.altTitles)[0] ?? "Untitled";
}

function summary(text: string | undefined, maxLen = 280) {
  if (!text) return "n/a";
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLen) return compact;
  return `${compact.slice(0, maxLen - 1)}…`;
}

export function printMangaSearch(items: Array<MdEntity<MangaAttributes>>) {
  if (!items.length) {
    console.log("No manga found.");
    return;
  }

  for (const manga of items) {
    const title = mangaTitle(manga);
    const status = manga.attributes.status ?? "unknown";
    const year = manga.attributes.year ? ` • ${manga.attributes.year}` : "";
    console.log(`${title} (#${manga.id}) • ${status}${year}`);
  }
}

export function printAuthorSearch(items: Array<MdEntity<PersonAttributes>>) {
  if (!items.length) {
    console.log("No author found.");
    return;
  }

  for (const author of items) {
    const name = author.attributes.name ?? "Unknown";
    console.log(`${name} (#${author.id})`);
  }
}

export function printGroupSearch(items: Array<MdEntity<GroupAttributes>>) {
  if (!items.length) {
    console.log("No group found.");
    return;
  }

  for (const group of items) {
    const name = group.attributes.name ?? "Unknown";
    const verified = group.attributes.verified ? " • verified" : "";
    console.log(`${name} (#${group.id})${verified}`);
  }
}

export function printMangaDetails(manga: MdEntity<MangaAttributes>) {
  const title = mangaTitle(manga);
  const desc = bestLocalizedText(manga.attributes.description);
  const tags = manga.attributes.tags?.map((tag) => bestLocalizedText(tag.attributes.name) ?? tag.id).filter(Boolean) ?? [];
  const links = manga.attributes.links ?? {};

  console.log(`${title} (#${manga.id})`);
  console.log(`Status: ${manga.attributes.status ?? "unknown"}`);
  console.log(`Year: ${manga.attributes.year ?? "n/a"}`);
  console.log(`Rating: ${manga.attributes.contentRating ?? "n/a"}`);
  console.log(`Language: ${manga.attributes.originalLanguage ?? "n/a"}`);
  console.log(`Last chapter: ${manga.attributes.lastChapter ?? manga.attributes.latestUploadedChapter ?? "n/a"}`);

  const authorNames = relationshipByType(manga, "author")
    .map((rel) => (typeof rel.attributes?.name === "string" ? rel.attributes.name : rel.id))
    .slice(0, 5);
  if (authorNames.length) {
    console.log(`Authors: ${authorNames.join(", ")}`);
  }

  if (tags.length) {
    console.log(`Tags: ${tags.join(", ")}`);
  }

  console.log(`Synopsis: ${summary(desc, 500)}`);

  const linkEntries = Object.entries(links).filter(([, value]) => Boolean(value));
  if (linkEntries.length) {
    console.log("Links:");
    for (const [key, value] of linkEntries) {
      console.log(`- ${key}: ${value}`);
    }
  }
}

export function printChapterList(chapters: Array<MdEntity<ChapterAttributes>>) {
  if (!chapters.length) {
    console.log("No chapters found.");
    return;
  }

  for (const chapter of chapters) {
    const title = chapter.attributes.title?.trim() || "Untitled";
    const lang = chapter.attributes.translatedLanguage ?? "?";
    const pages = chapter.attributes.pages ?? "?";
    const group = relationshipOne(chapter, "scanlation_group");
    const groupName = typeof group?.attributes?.name === "string" ? group.attributes.name : group?.id ?? "unknown group";
    console.log(
      `${chapterLabel(chapter)} • ${title} (#${chapter.id}) • ${lang} • ${pages}p • ${formatDate(chapter.attributes.publishAt)} • ${groupName}`,
    );
  }
}

export function printChapterDetails(chapter: MdEntity<ChapterAttributes>) {
  console.log(`Chapter #${chapter.id}`);
  console.log(`Label: ${chapterLabel(chapter)}`);
  console.log(`Title: ${chapter.attributes.title ?? "Untitled"}`);
  console.log(`Language: ${chapter.attributes.translatedLanguage ?? "n/a"}`);
  console.log(`Pages: ${chapter.attributes.pages ?? "n/a"}`);
  console.log(`Published: ${formatDate(chapter.attributes.publishAt)}`);
  console.log(`Readable: ${formatDate(chapter.attributes.readableAt)}`);
  const manga = relationshipOne(chapter, "manga");
  if (manga) {
    const name = bestLocalizedText((manga.attributes?.title as Record<string, string>) ?? undefined) ?? manga.id;
    console.log(`Manga: ${name} (#${manga.id})`);
  }
  const groups = relationshipByType(chapter, "scanlation_group");
  if (groups.length) {
    console.log(`Groups: ${groups.map((g) => (typeof g.attributes?.name === "string" ? g.attributes.name : g.id)).join(", ")}`);
  }
}

export function printWorksByAuthor(authorId: string, manga: Array<MdEntity<MangaAttributes>>) {
  console.log(`Works by author ${authorId}`);
  printMangaSearch(manga);
}

export function printWorksByGroup(groupId: string, chapters: Array<MdEntity<ChapterAttributes>>) {
  if (!chapters.length) {
    console.log(`No recent releases found for group ${groupId}.`);
    return;
  }
  console.log(`Recent releases by group ${groupId}`);
  printChapterList(chapters);
}

export function printFeed(chapters: Array<MdEntity<ChapterAttributes>>, hours: number) {
  console.log(`Follow feed updates within ${hours}h`);
  printChapterList(chapters);
}

export function printRecommendations(
  items: Array<MdEntity<MangaAttributes>>,
  metadata: RecommendationMeta,
) {
  console.log("Recommendations");
  console.log(`Heuristic: ${metadata.heuristic}`);
  console.log(`Input tags: ${metadata.inputTags.length ? metadata.inputTags.join(", ") : "none"}`);
  console.log(`Excluded library entries: ${metadata.excludedCount}`);
  if (metadata.usedFallback) {
    console.log("Fallback: used broad popularity sort because no tag filter was available.");
  }
  printMangaSearch(items);
}
