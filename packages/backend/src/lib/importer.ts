import { db } from "../db";
import {
  translationFiles,
  translationKeys,
  locales,
  translations,
  type DetectedArg,
} from "../db/schema.ts";
import { eq, and } from "drizzle-orm";
import { readdir, readFile } from "fs/promises";
import { join, extname } from "path";

type FlatEntry = {
  key: string;
  value: string;
  isArray: boolean;
};

function flattenJson(
  obj: Record<string, unknown>,
  prefix = ""
): FlatEntry[] {
  const entries: FlatEntry[] = [];

  for (const [k, v] of Object.entries(obj)) {
    const fullKey = k === "" ? prefix : prefix ? `${prefix}.${k}` : k;
    if (fullKey === "lang") continue;

    if (Array.isArray(v)) {
      const lines: string[] = [];
      for (let i = 0; i < v.length; i++) {
        const element = v[i];
        if (typeof element !== "string") {
          throw new Error(`Non-string array element at ${fullKey}[${i}]`);
        }
        lines.push(element);
      }
      entries.push({ key: fullKey, value: lines.join("\n"), isArray: true });
    } else if (v !== null && typeof v === "object") {
      entries.push(...flattenJson(v as Record<string, unknown>, fullKey));
    } else if (typeof v === "string") {
      entries.push({ key: fullKey, value: v, isArray: false });
    } else {
      throw new Error(`Unsupported JSON value type at ${fullKey}: ${typeof v}`);
    }
  }

  return entries;
}

const KNOWN_TAGS = new Set([
  "bold", "b", "italic", "i", "underlined", "u", "strikethrough", "st",
  "obfuscated", "obf", "reset", "newline", "br",
  "click", "hover", "insertion", "rainbow", "gradient", "transition",
  "font", "lang", "selector", "score", "nbt", "translate",
  "black", "dark_blue", "dark_green", "dark_aqua", "dark_red",
  "dark_purple", "gold", "gray", "dark_gray", "blue", "green",
  "aqua", "red", "light_purple", "yellow", "white",
  "primary", "secondary", "highlight", "text_color", "error_color", "dark_color",
  "auction_prefix", "party_prefix", "chat_prefix", "guild_prefix",
  "papi", "progress", "statchar", "special_prefix", "base_prefix",
  "type_rarity", "item",
]);

const TAG_RE = /<([a-zA-Z_][a-zA-Z0-9_]*)(?::[^>]*)?\/?>/g;
const BRACE_RE = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

export function detectArgs(value: string): DetectedArg[] {
  const found = new Map<string, DetectedArg>();

  for (const match of value.matchAll(TAG_RE)) {
    const name = match[1].toLowerCase();
    if (!KNOWN_TAGS.has(name) && !name.startsWith("#") && !found.has(name)) {
      found.set(name, { name, style: "tag" });
    }
  }

  for (const match of value.matchAll(BRACE_RE)) {
    const name = match[1];
    if (!found.has(name)) {
      found.set(name, { name, style: "brace" });
    }
  }

  return [...found.values()];
}

async function collectJsonFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectJsonFiles(fullPath)));
    } else if (entry.isFile() && extname(entry.name) === ".json") {
      results.push(fullPath);
    }
  }
  return results;
}

function isReservedFile(fileName: string): boolean {
  return fileName === "minecraft.json" || fileName.endsWith("/minecraft.json");
}

async function importSourceLocale(
  projectId: string,
  sourceDir: string
): Promise<{ filesImported: number; keysImported: number }> {
  const files = await collectJsonFiles(sourceDir);
  let keysImported = 0;
  let filesImported = 0;

  for (const filePath of files) {
    const fileName = filePath.slice(sourceDir.length + 1);
    if (isReservedFile(fileName)) continue;

    const filePathSlug = fileName.replace(/\.json$/, "");
    const content = await readFile(filePath, "utf-8");
    const json = JSON.parse(content) as Record<string, unknown>;
    const entries = flattenJson(json);
    if (entries.length === 0) continue;

    const [fileRecord] = await db
      .insert(translationFiles)
      .values({ projectId, filePath: filePathSlug })
      .onConflictDoUpdate({
        target: [translationFiles.projectId, translationFiles.filePath],
        set: { filePath: filePathSlug },
      })
      .returning();

    filesImported++;

    for (const entry of entries) {
      const args = detectArgs(entry.value);
      await db
        .insert(translationKeys)
        .values({
          fileId: fileRecord.id,
          key: entry.key,
          sourceValue: entry.value,
          isArray: entry.isArray,
          detectedArgs: args,
        })
        .onConflictDoUpdate({
          target: [translationKeys.fileId, translationKeys.key],
          set: { sourceValue: entry.value, isArray: entry.isArray, detectedArgs: args },
        });
      keysImported++;
    }
  }

  return { filesImported, keysImported };
}

async function importExistingTranslations(
  projectId: string,
  localeDir: string,
  localeId: string
): Promise<number> {
  // Build a lookup of filePath -> fileId from the already-imported source keys
  const fileRecords = await db
    .select()
    .from(translationFiles)
    .where(eq(translationFiles.projectId, projectId));

  const fileMap = new Map(fileRecords.map((f) => [f.filePath, f.id]));

  const files = await collectJsonFiles(localeDir);
  let translationsImported = 0;

  for (const filePath of files) {
    const fileName = filePath.slice(localeDir.length + 1);
    if (isReservedFile(fileName)) continue;

    const filePathSlug = fileName.replace(/\.json$/, "");
    const fileId = fileMap.get(filePathSlug);
    if (!fileId) continue; // no matching source file — skip

    const content = await readFile(filePath, "utf-8");
    const json = JSON.parse(content) as Record<string, unknown>;
    const entries = flattenJson(json);

    for (const entry of entries) {
      // Find the matching source key
      const [keyRecord] = await db
        .select()
        .from(translationKeys)
        .where(
          and(
            eq(translationKeys.fileId, fileId),
            eq(translationKeys.key, entry.key)
          )
        )
        .limit(1);

      if (!keyRecord) continue; // key doesn't exist in source — skip

      await db
        .insert(translations)
        .values({
          keyId: keyRecord.id,
          localeId,
          value: entry.value,
          status: "approved",
        })
        .onConflictDoUpdate({
          target: [translations.keyId, translations.localeId],
          set: { value: entry.value, status: "approved" },
        });

      translationsImported++;
    }
  }

  return translationsImported;
}

export async function importLangFiles(
  projectId: string,
  sourceLocale: string,
  langDir: string // points to the parent lang/ folder
): Promise<{
  filesImported: number;
  keysImported: number;
  translationsImported: Record<string, number>;
}> {
  const sourceDir = join(langDir, sourceLocale);
  const { filesImported, keysImported } = await importSourceLocale(projectId, sourceDir);

  // Find all locale folders other than the source
  const translationsImported: Record<string, number> = {};

  let localeDirs: string[] = [];
  try {
    const entries = await readdir(langDir, { withFileTypes: true });
    localeDirs = entries
      .filter((e) => e.isDirectory() && e.name !== sourceLocale)
      .map((e) => e.name);
  } catch {
    // langDir not readable — skip
  }

  for (const localeCode of localeDirs) {
    // Only import if this locale is registered in the project
    const [localeRecord] = await db
      .select()
      .from(locales)
      .where(
        and(
          eq(locales.projectId, projectId),
          eq(locales.localeCode, localeCode)
        )
      )
      .limit(1);

    if (!localeRecord) continue;

    const localeDir = join(langDir, localeCode);
    const count = await importExistingTranslations(projectId, localeDir, localeRecord.id);
    translationsImported[localeCode] = count;
  }

  return { filesImported, keysImported, translationsImported };
}
