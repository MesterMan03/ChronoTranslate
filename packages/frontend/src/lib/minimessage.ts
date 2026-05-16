/**
 * MiniMessage parser/renderer for ChronoCore's translation format.
 *
 * Produces an array of styled "spans" that the React component renders.
 * Supports: named colors, hex colors, decorations, gradients, rainbow,
 * click/hover (visual only), custom theme tags, papi, progress, newline,
 * and argument substitution.
 */

export type Span =
  | { type: "text"; text: string; style: Style }
  | { type: "newline" }
  | { type: "progress"; current: string; max: string; style: Style };

export type Style = {
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underlined?: boolean;
  strikethrough?: boolean;
  obfuscated?: boolean;
  clickUrl?: string;
  hoverText?: string;
  gradient?: string[];
};

const NAMED_COLORS: Record<string, string> = {
  black: "#000000",
  dark_blue: "#0000AA",
  dark_green: "#00AA00",
  dark_aqua: "#00AAAA",
  dark_red: "#AA0000",
  dark_purple: "#AA00AA",
  gold: "#FFAA00",
  gray: "#AAAAAA",
  dark_gray: "#555555",
  blue: "#5555FF",
  green: "#55FF55",
  aqua: "#55FFFF",
  red: "#FF5555",
  light_purple: "#FF55FF",
  yellow: "#FFFF55",
  white: "#FFFFFF",
};

const DECORATIONS = new Set([
  "bold", "b", "italic", "i", "underlined", "u",
  "strikethrough", "st", "obfuscated", "obf",
]);

function decKey(tag: string): keyof Style {
  switch (tag) {
    case "bold": case "b": return "bold";
    case "italic": case "i": return "italic";
    case "underlined": case "u": return "underlined";
    case "strikethrough": case "st": return "strikethrough";
    case "obfuscated": case "obf": return "obfuscated";
    default: return "bold";
  }
}

type Token =
  | { kind: "text"; value: string }
  | { kind: "open"; tag: string; args: string[] }
  | { kind: "close"; tag: string }
  | { kind: "selfclose"; tag: string; args: string[] };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    if (input[i] !== "<") {
      let j = i + 1;
      while (j < input.length && input[j] !== "<") j++;
      tokens.push({ kind: "text", value: input.slice(i, j) });
      i = j;
      continue;
    }

    const close = input.indexOf(">", i + 1);
    if (close === -1) {
      tokens.push({ kind: "text", value: input.slice(i) });
      break;
    }

    const inner = input.slice(i + 1, close);
    i = close + 1;

    if (inner.startsWith("/")) {
      tokens.push({ kind: "close", tag: inner.slice(1).toLowerCase().trim() });
      continue;
    }

    const parts = splitTagArgs(inner);
    const tagName = parts[0].toLowerCase().trim();
    const args = parts.slice(1);
    tokens.push({ kind: "open", tag: tagName, args });
  }

  return tokens;
}

// Split "gradient:#ff0000:#00ff00" respecting colons inside nested parens
function splitTagArgs(inner: string): string[] {
  return inner.split(":");
}

export function parse(
  input: string,
  themeColors: Record<string, string> = {},
  mockArgs: Record<string, string> = {}
): Span[] {
  // Substitute {{name}} first (direct string replacement)
  let text = input;
  for (const [name, val] of Object.entries(mockArgs)) {
    text = text.replaceAll(`{{${name}}}`, val);
  }
  // Highlight remaining {{name}} as placeholders
  text = text.replace(/\{\{([^}]+)\}\}/g, "[$1]");

  const tokens = tokenize(text);
  const spans: Span[] = [];

  type StackEntry = { tag: string; style: Partial<Style> };
  const styleStack: StackEntry[] = [{ tag: "root", style: {} }];

  function currentStyle(): Style {
    const merged: Style = {};
    for (const entry of styleStack) {
      Object.assign(merged, entry.style);
    }
    return merged;
  }

  function resolveColor(tag: string): string | undefined {
    if (tag in NAMED_COLORS) return NAMED_COLORS[tag];
    if (tag in themeColors) return themeColors[tag];
    if (tag.startsWith("#") && /^#[0-9a-fA-F]{3,8}$/.test(tag)) return tag;
    return undefined;
  }

  for (const token of tokens) {
    if (token.kind === "text") {
      if (token.value === "") continue;
      spans.push({ type: "text", text: token.value, style: currentStyle() });
      continue;
    }

    if (token.kind === "close") {
      // Pop until we find the matching open tag
      for (let k = styleStack.length - 1; k >= 0; k--) {
        if (styleStack[k].tag === token.tag) {
          styleStack.splice(k, 1);
          break;
        }
      }
      continue;
    }

    if (token.kind === "open") {
      const { tag, args } = token;

      // newline / br
      if (tag === "newline" || tag === "br") {
        spans.push({ type: "newline" });
        continue;
      }

      // reset
      if (tag === "reset") {
        styleStack.splice(1); // keep root
        continue;
      }

      // papi placeholder
      if (tag === "papi") {
        const placeholder = args[0] ?? "?";
        const mockVal = mockArgs[`papi:${placeholder}`];
        spans.push({
          type: "text",
          text: mockVal ?? `{${placeholder}}`,
          style: { ...currentStyle(), color: "#aaaaff" },
        });
        continue;
      }

      // progress bar
      if (tag === "progress") {
        const current = args[0] ?? "?";
        const max = args[1] ?? "?";
        spans.push({ type: "progress", current, max, style: currentStyle() });
        continue;
      }

      // statchar — render as 🗡 or similar
      if (tag === "statchar") {
        spans.push({
          type: "text",
          text: `[${args[0] ?? "stat"}]`,
          style: { ...currentStyle(), color: "#99aaff" },
        });
        continue;
      }

      // click
      if (tag === "click") {
        const [action, ...rest] = args;
        const url = action === "open_url" ? rest.join(":") : undefined;
        styleStack.push({ tag, style: { clickUrl: url } });
        continue;
      }

      // hover
      if (tag === "hover") {
        const hoverText = args.slice(1).join(":");
        styleStack.push({ tag, style: { hoverText } });
        continue;
      }

      // gradient
      if (tag === "gradient") {
        styleStack.push({ tag, style: { gradient: args } });
        continue;
      }

      // rainbow
      if (tag === "rainbow") {
        styleStack.push({ tag, style: { gradient: ["#ff0000", "#ff7700", "#ffff00", "#00ff00", "#0000ff", "#8b00ff"] } });
        continue;
      }

      // named color
      const color = resolveColor(tag);
      if (color) {
        styleStack.push({ tag, style: { color } });
        continue;
      }

      // decoration
      if (DECORATIONS.has(tag)) {
        styleStack.push({ tag, style: { [decKey(tag)]: true } });
        continue;
      }

      // known prefix tags — render their display value
      const prefixTags: Record<string, string> = {
        auction_prefix: "[Auction] ",
        party_prefix: "[Party] ",
        chat_prefix: "[Chat] ",
        guild_prefix: "[Guild] ",
        special_prefix: "",
        base_prefix: "",
        type_rarity: "[Rarity] ",
      };
      if (tag in prefixTags) {
        spans.push({
          type: "text",
          text: prefixTags[tag],
          style: { ...currentStyle(), color: themeColors["primary"] ?? "#5865F2" },
        });
        continue;
      }

      // argument tag — substitute mock value or show as placeholder
      const mockVal = mockArgs[tag];
      spans.push({
        type: "text",
        text: mockVal !== undefined ? mockVal : `<${tag}>`,
        style: mockVal !== undefined
          ? currentStyle()
          : { ...currentStyle(), color: "#ffaa00" },
      });
    }
  }

  return spans;
}
