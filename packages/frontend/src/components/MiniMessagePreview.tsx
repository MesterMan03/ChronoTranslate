import { parse, type Span, type Style } from "../lib/minimessage.ts";

type Props = {
  value: string;
  themeColors?: Record<string, string>;
  mockArgs?: Record<string, string>;
  className?: string;
};

function renderProgressBar(current: string, max: string): string {
  const cur = parseFloat(current);
  const mx = parseFloat(max);
  if (isNaN(cur) || isNaN(mx) || mx === 0) return `[${current}/${max}]`;
  const filled = Math.round((cur / mx) * 10);
  return "▓".repeat(filled) + "░".repeat(10 - filled);
}

function styleToCSS(style: Style): React.CSSProperties {
  const css: React.CSSProperties = {};
  if (style.color) css.color = style.color;
  if (style.bold) css.fontWeight = "bold";
  if (style.italic) css.fontStyle = "italic";

  const decs: string[] = [];
  if (style.underlined) decs.push("underline");
  if (style.strikethrough) decs.push("line-through");
  if (decs.length > 0) css.textDecoration = decs.join(" ");

  if (style.obfuscated) {
    css.filter = "blur(3px)";
    css.userSelect = "none";
  }
  if (style.clickUrl) css.cursor = "pointer";

  return css;
}

function renderSpan(span: Span, i: number): React.ReactNode {
  if (span.type === "newline") return <br key={i} />;

  if (span.type === "progress") {
    const bar = renderProgressBar(span.current, span.max);
    return (
      <span key={i} style={styleToCSS(span.style)}>
        {bar}
      </span>
    );
  }

  const css = styleToCSS(span.style);
  const content = span.style.gradient
    ? renderGradient(span.text, span.style.gradient)
    : span.text;

  const el = (
    <span key={i} style={css} title={span.style.hoverText}>
      {content}
    </span>
  );

  return el;
}

function renderGradient(text: string, stops: string[]): React.ReactNode {
  if (stops.length < 2 || text.length === 0) return text;

  const chars = [...text];
  return chars.map((ch, i) => {
    const t = chars.length === 1 ? 0 : i / (chars.length - 1);
    const color = interpolateGradient(stops, t);
    return (
      <span key={i} style={{ color }}>
        {ch}
      </span>
    );
  });
}

function interpolateGradient(stops: string[], t: number): string {
  const validStops = stops.filter((s) => /^#[0-9a-fA-F]{3,8}$/.test(s));
  if (validStops.length === 0) return "#ffffff";
  if (validStops.length === 1) return validStops[0];

  const segment = (validStops.length - 1) * t;
  const idx = Math.min(Math.floor(segment), validStops.length - 2);
  const localT = segment - idx;

  return lerpColor(validStops[idx], validStops[idx + 1], localT);
}

function lerpColor(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const bv = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${bv})`;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const n = parseInt(full.slice(0, 6), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export function MiniMessagePreview({
  value,
  themeColors = {},
  mockArgs = {},
  className = "",
}: Props) {
  const spans = parse(value, themeColors, mockArgs);

  return (
    <div
      className={`mc-preview rounded px-3 py-2 bg-black/40 border border-white/10 ${className}`}
    >
      {spans.map((span, i) => renderSpan(span, i))}
    </div>
  );
}
