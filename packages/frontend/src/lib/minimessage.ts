import { MiniMessage } from "minimessage-js";

export type CustomTag = {
  name: string;
  display: string;
  color: string;
};

// Tags that the library handles natively — do not intercept these
const STANDARD_TAGS = new Set([
  // Named colors
  "black", "dark_blue", "dark_green", "dark_aqua", "dark_red", "dark_purple",
  "gold", "gray", "dark_gray", "blue", "green", "aqua", "red", "light_purple",
  "yellow", "white",
  // Decorations
  "bold", "b", "italic", "i", "underlined", "u", "strikethrough", "st",
  "obfuscated", "obf",
  // Layout / reset
  "reset", "newline", "br",
  // Effects
  "rainbow", "gradient", "transition",
  // Events
  "click", "hover", "insertion",
  // Color shorthand
  "color", "colour", "c",
  // Misc
  "font", "lang", "translate", "translatable", "tr",
  "selector", "score", "nbt",
  "keybind", "key",
  "head", "sprite", "pride",
  "shadow_color", "shadow_colour",
]);

// Built-in ChronoCore prefix tags rendered as colored text if not admin-overridden
const BUILTIN_PREFIX_TAGS: [string, string][] = [
  ["auction_prefix", "[Auction] "],
  ["party_prefix", "[Party] "],
  ["chat_prefix", "[Chat] "],
  ["guild_prefix", "[Guild] "],
  ["special_prefix", ""],
  ["base_prefix", ""],
  ["type_rarity", "[Rarity] "],
];

// Singleton — lenient mode, standard tags, no custom preprocessing
const mm = MiniMessage.miniMessage();

/**
 * Transforms a raw ChronoCore MiniMessage string into standard MiniMessage
 * by resolving all project-specific and ChronoCore-specific tags before the
 * library parser sees them.
 */
export function preprocessForPreview(
  input: string,
  themeColors: Record<string, string> = {},
  mockArgs: Record<string, string> = {},
  customTags: CustomTag[] = []
): string {
  let text = input;

  // 1. {{name}} brace substitution — direct string replacement
  for (const [name, val] of Object.entries(mockArgs)) {
    text = text.replaceAll(`{{${name}}}`, val);
  }
  // Remaining {{name}} shown as blue placeholder
  text = text.replace(/\{\{([^}]+)\}\}/g, "<color:#aaaaff>[$1]</color>");

  // 2. <argName> tag substitution for mock values (before any other tag processing)
  for (const [name, val] of Object.entries(mockArgs)) {
    if (name.includes(":")) continue; // skip compound keys like "papi:foo"
    text = text.replaceAll(`<${name}>`, val);
    text = text.replaceAll(`</${name}>`, "");
  }

  // 3. Theme color tags: <primary> → <color:#hex>  </primary> → </color>
  for (const [name, hex] of Object.entries(themeColors)) {
    if (STANDARD_TAGS.has(name)) continue;
    text = text.replaceAll(`<${name}>`, `<color:${hex}>`);
    text = text.replaceAll(`</${name}>`, `</color>`);
    text = text.replaceAll(`<${name}/>`, "");
  }

  // 4. Admin-defined custom tags: <party_prefix> → <color:#hex>display</color>
  for (const ct of customTags) {
    text = text.replaceAll(`<${ct.name}>`, `<color:${ct.color}>${ct.display}</color>`);
    text = text.replaceAll(`</${ct.name}>`, "");
    text = text.replaceAll(`<${ct.name}/>`, "");
  }

  // 5. Built-in prefix tag fallbacks (only if not already covered by theme/custom/mock)
  const handled = new Set([
    ...Object.keys(themeColors),
    ...customTags.map((ct) => ct.name),
    ...Object.keys(mockArgs).filter((k) => !k.includes(":")),
  ]);
  const primaryColor = themeColors.primary ?? "#5865F2";
  for (const [name, display] of BUILTIN_PREFIX_TAGS) {
    if (handled.has(name)) continue;
    text = text.replaceAll(
      `<${name}>`,
      display ? `<color:${primaryColor}>${display}</color>` : ""
    );
    text = text.replaceAll(`</${name}>`, "");
    text = text.replaceAll(`<${name}/>`, "");
  }

  // 6. <papi:placeholder> — PlaceholderAPI values (server-side only, show mock or label)
  text = text.replace(/<papi:([^>]+)>/g, (_, placeholder) => {
    const mockVal = mockArgs[`papi:${placeholder}`];
    return mockVal ? mockVal : `<color:#aaaaff>{${placeholder}}</color>`;
  });

  // 7. <progress:cur:max> — render as ASCII progress bar
  text = text.replace(/<progress:([^:>]+):([^>]+)>/g, (_, cur, max) => {
    const curNum = parseFloat(cur);
    const maxNum = parseFloat(max);
    if (!isNaN(curNum) && !isNaN(maxNum) && maxNum > 0) {
      const filled = Math.round((curNum / maxNum) * 10);
      return "▓".repeat(filled) + "░".repeat(10 - filled);
    }
    return `<color:#aaaaff>[${cur}/${max}]</color>`;
  });

  // 8. <statchar:stat> — stat icon placeholder
  text = text.replace(
    /<statchar:([^>]+)>/g,
    (_, stat) => `<color:#99aaff>[${stat}]</color>`
  );

  // 9. Any remaining unknown open tags — the library silently drops them in lenient
  //    mode, which would make arg placeholders invisible. Show them as amber labels.
  text = text.replace(/<([a-zA-Z_][a-zA-Z0-9_]*)(?::[^>]*)?\/?>/g, (match, tagName) => {
    if (STANDARD_TAGS.has(tagName.toLowerCase())) return match;
    return `<color:#ffaa00>[${tagName}]</color>`;
  });
  // Drop orphaned closing tags for non-standard names (already converted above)
  text = text.replace(/<\/([a-zA-Z_][a-zA-Z0-9_]*)>/g, (match, tagName) => {
    if (STANDARD_TAGS.has(tagName.toLowerCase())) return match;
    return "";
  });

  return text;
}

/**
 * Renders a ChronoCore MiniMessage string to an HTML string.
 */
export function renderToHTML(
  input: string,
  themeColors: Record<string, string> = {},
  mockArgs: Record<string, string> = {},
  customTags: CustomTag[] = []
): string {
  try {
    const preprocessed = preprocessForPreview(input, themeColors, mockArgs, customTags);
    const component = mm.deserialize(preprocessed);
    return mm.toHTML(component);
  } catch {
    return `<span style="color:#ff5555">[render error]</span>`;
  }
}
