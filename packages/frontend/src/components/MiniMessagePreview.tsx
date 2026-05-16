import { renderToHTML, type CustomTag } from "../lib/minimessage.ts";

type Props = {
  value: string;
  mockArgs?: Record<string, string>;
  customTags?: CustomTag[];
  className?: string;
};

export function MiniMessagePreview({
  value,
  mockArgs = {},
  customTags = [],
  className = "",
}: Props) {
  const html = renderToHTML(value, mockArgs, customTags);

  return (
    <div
      className={`mc-preview rounded px-3 py-2 bg-black/40 border border-white/10 ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(e) => e.preventDefault()}
    />
  );
}
