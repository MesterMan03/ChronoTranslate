import { db } from "../db/index.ts";
import {
  translationFiles,
  translationKeys,
  type DetectedArg,
} from "../db/schema.ts";
import { eq } from "drizzle-orm";
import { readdir, readFile } from "fs/promises";
import { join, relative, extname } from "path";

type FlatEntry = {
  key: string;
  value: string;
  isArrayItem: boolean;
  arrayParent: string | null;
};

function flattenJson(
  obj: Record<string, unknown>,
  prefix = ""
): FlatEntry[] {
  const entries: FlatEntry[] = [];

  for (const [k, v] of Object.entries(obj)) {
    // Empty-string key: use prefix as the key (parent path becomes the key)
    const fullKey = k === "" ? prefix : prefix ? `${prefix}.${k}` : k;
    // Skip the top-level "lang" wrapper key that LangEntry.kt ignores
    if (fullKey === "lang") continue;

    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        const element = v[i];
        if (typeof element !== "string") {
          throw new Error(`Non-string array element at ${fullKey}[${i}]`);
        }
        entries.push({
          key: `${fullKey}.${i}`,
          value: element,
          isArrayItem: true,
          arrayParent: fullKey,
        });
      }
    } else if (v !== null && typeof v === "object") {
      entries.push(...flattenJson(v as Record<string, unknown>, fullKey));
    } else if (typeof v === "string") {
      entries.push({ key: fullKey, value: v, isArrayItem: false, arrayParent: null });
    } else {
      throw new Error(`Unsupported JSON value type at ${fullKey}: ${typeof v}`);
    }
  }

  return entries;
}

// Detect <name> tags and {{name}} replacements in a MiniMessage string.
// Excludes known MiniMessage built-ins and ChronoCore theme/special tags.
const KNOWN_TAGS = new Set([
  // standard MiniMessage formatting
  "bold", "b", "italic", "i", "underlined", "u", "strikethrough", "st",
  "obfuscated", "obf", "reset", "newline", "br",
  "click", "hover", "insertion", "rainbow", "gradient", "transition",
  "font", "lang", "selector", "score", "nbt", "translate",
  // standard colors
  "black", "dark_blue", "dark_green", "dark_aqua", "dark_red",
  "dark_purple", "gold", "gray", "dark_gray", "blue", "green",
  "aqua", "red", "light_purple", "yellow", "white",
  // ChronoCore custom tags (not arguments)
  "primary", "secondary", "highlight", "text_color", "error_color", "dark_color",
  "auction_prefix", "party_prefix", "chat_prefix", "guild_prefix",
  "papi", "progress", "statchar", "special_prefix", "base_prefix",
  "type_rarity", "item",
]);

// Matches <tag_name> or <tag_name:...> but not closing tags </tag>
const TAG_RE = /<([a-zA-Z_][a-zA-Z0-9_]*)(?::[^>]*)?\/?>/g;
// Matches {{name}}
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
  const entries = await readdir(dir, { withFileTypes: true });
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

export async function importLangFiles(
  projectId: string,
  langDir: string
): Promise<{ filesImported: number; keysImported: number }> {
  // langDir should point to the source locale folder, e.g. .../lang/en
  const files = await collectJsonFiles(langDir);
  let keysImported = 0;
  let filesImported = 0;

  for (const filePath of files) {
    const fileName = filePath.slice(langDir.length + 1); // e.g. "ui.json" or "dialogue/mester.json"

    // Skip minecraft.json at any depth
    if (fileName === "minecraft.json" || fileName.endsWith("/minecraft.json")) {
      continue;
    }

    const filePathSlug = fileName.replace(/\.json$/, ""); // "ui" or "dialogue/mester"

    const content = await readFile(filePath, "utf-8");
    const json = JSON.parse(content) as Record<string, unknown>;
    const entries = flattenJson(json);

    if (entries.length === 0) continue;

    // Upsert the translation file record
    const [fileRecord] = await db
      .insert(translationFiles)
      .values({ projectId, filePath: filePathSlug })
      .onConflictDoUpdate({
        target: [translationFiles.projectId, translationFiles.filePath],
        set: { filePath: filePathSlug }, // no-op update to get the returning id
      })
      .returning();

    const fileId = fileRecord.id;
    filesImported++;

    // Upsert keys (update source value and args on re-import)
    for (const entry of entries) {
      const args = detectArgs(entry.value);
      await db
        .insert(translationKeys)
        .values({
          fileId,
          key: entry.key,
          sourceValue: entry.value,
          isArrayItem: entry.isArrayItem,
          arrayParent: entry.arrayParent,
          detectedArgs: args,
        })
        .onConflictDoUpdate({
          target: [translationKeys.fileId, translationKeys.key],
          set: { sourceValue: entry.value, detectedArgs: args },
        });
      keysImported++;
    }
  }

  return { filesImported, keysImported };
}
