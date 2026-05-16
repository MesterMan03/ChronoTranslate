import { MiniMessage } from "minimessage-js";

export type CustomTag = {
  name: string;
  miniMessage: string;
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

// Singleton — lenient mode, standard tags, no custom preprocessing
const mm = MiniMessage.miniMessage();

/**
 * Transforms a raw ChronoCore MiniMessage string into standard MiniMessage
 * by resolving all project-specific and ChronoCore-specific tags before the
 * library parser sees them.
 */
export function preprocessForPreview(
  input: string,
  mockArgs: Record<string, string> = {},
  customTags: CustomTag[] = []
): string {
  let text = input;

  // 1a. {{name}} → mock value (known mocks only)
  for (const [name, val] of Object.entries(mockArgs)) {
    text = text.replaceAll(`{{${name}}}`, val);
  }

  // 1b. <progress:cur:max> — processed here while unknown {{}} are still raw literals.
  //     parseFloat("{{name}}") = NaN → defaults to 1 (fully-filled bar).
  //     (Moved ahead of the blue-placeholder pass to prevent regex confusion.)
  text = text.replace(/<progress:([^:>]+):([^>]+)>/g, (_, cur, max) => {
    const curNum = parseFloat(cur);
    const maxNum = parseFloat(max);
    const effectiveCur = isNaN(curNum) ? 1 : curNum;
    const effectiveMax = isNaN(maxNum) || maxNum <= 0 ? 1 : maxNum;
    const filled = effectiveMax < effectiveCur ? 10 : Math.round((effectiveCur / effectiveMax) * 10);
    return "▓".repeat(filled) + "░".repeat(10 - filled);
  });

  // 1c. Remaining {{name}} → blue placeholder
  text = text.replace(/\{\{([^}]+)\}\}/g, "<color:#aaaaff>[$1]</color>");

  // 2. <argName> tag substitution for mock values (before any other tag processing)
  for (const [name, val] of Object.entries(mockArgs)) {
    if (name.includes(":")) continue; // skip compound keys like "papi:foo"
    text = text.replaceAll(`<${name}>`, val);
    text = text.replaceAll(`</${name}>`, "");
  }

  // 3. Admin-defined custom tags: <name> → miniMessage value, </name> → </color>
  //    The </color> close works for color-wrapping tags; for self-contained tags it's harmless.
  for (const ct of customTags) {
    text = text.replaceAll(`<${ct.name}>`, ct.miniMessage);
    text = text.replaceAll(`</${ct.name}>`, "</color>");
    text = text.replaceAll(`<${ct.name}/>`, ct.miniMessage);
  }

  // 4. <papi:placeholder> — PlaceholderAPI values (server-side only, show mock or label)
  text = text.replace(/<papi:([^>]+)>/g, (_, placeholder) => {
    const mockVal = mockArgs[`papi:${placeholder}`];
    return mockVal ? mockVal : `<color:#aaaaff>{${placeholder}}</color>`;
  });

  // 5. <statchar:stat> — stat icon placeholder
  text = text.replace(
    /<statchar:([^>]+)>/g,
    (_, stat) => `<color:#99aaff>[${stat}]</color>`
  );

  // 7. Any remaining unknown open tags — show as amber labels so they're visible
  text = text.replace(/<([a-zA-Z_][a-zA-Z0-9_]*)(?::[^>]*)?\/?>/g, (match, tagName) => {
    if (STANDARD_TAGS.has(tagName.toLowerCase())) return match;
    return `<color:#ffaa00>[${tagName}]</color>`;
  });
  // Drop orphaned closing tags for non-standard names
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
  mockArgs: Record<string, string> = {},
  customTags: CustomTag[] = []
): string {
  try {
    const preprocessed = preprocessForPreview(input, mockArgs, customTags);
    const component = mm.deserialize(preprocessed);
    return mm.toHTML(component);
  } catch {
    return `<span style="color:#ff5555">[render error]</span>`;
  }
}
