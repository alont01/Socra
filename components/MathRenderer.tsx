"use client";

import React, { useMemo } from "react";
import { InlineMath, BlockMath } from "react-katex";

interface MathRendererProps {
  content: string;
}

/**
 * Parses text containing LaTeX math ($...$ and $$...$$) and renders it
 * using KaTeX. Plain text is rendered as HTML paragraphs.
 */
export default function MathRenderer({ content }: MathRendererProps) {
  const segments = useMemo(() => parseContent(content), [content]);

  return (
    <div className="prose-math">
      {segments.map((segment, i) => {
        if (segment.type === "block-math") {
          return (
            <div key={i} className="my-3 overflow-x-auto">
              <BlockMath math={segment.value} renderError={(error: Error) => (
                <span className="text-red-400 text-xs" title={error.message}>[Math rendering error]</span>
              )} />
            </div>
          );
        }
        if (segment.type === "inline-math") {
          return <InlineMath key={i} math={segment.value} renderError={(error: Error) => (
            <span className="text-red-400 text-xs" title={error.message}>[Math rendering error]</span>
          )} />;
        }
        // Plain text — render with paragraph and basic markdown-like styling
        return <PlainText key={i} text={segment.value} />;
      })}
    </div>
  );
}

type Segment =
  | { type: "text"; value: string }
  | { type: "inline-math"; value: string }
  | { type: "block-math"; value: string };

function parseContent(content: string): Segment[] {
  const segments: Segment[] = [];
  // Match $$...$$ first (block), then $...$ (inline)
  const regex = /(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    // Text before this math segment
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: content.slice(lastIndex, match.index) });
    }

    const raw = match[0];
    if (raw.startsWith("$$")) {
      segments.push({ type: "block-math", value: raw.slice(2, -2).trim() });
    } else {
      segments.push({ type: "inline-math", value: raw.slice(1, -1).trim() });
    }

    lastIndex = regex.lastIndex;
  }

  // Remaining text
  if (lastIndex < content.length) {
    segments.push({ type: "text", value: content.slice(lastIndex) });
  }

  return segments;
}

/**
 * Renders plain text with basic markdown-like formatting:
 * **bold**, numbered lists, and paragraph breaks.
 */
function PlainText({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let paraBuffer: string[] = [];

  const flushPara = () => {
    if (paraBuffer.length > 0) {
      const joined = paraBuffer.join(" ").trim();
      if (joined) {
        elements.push(
          <p key={elements.length}>{renderInline(joined)}</p>
        );
      }
      paraBuffer = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "") {
      flushPara();
      continue;
    }

    // Numbered list item (e.g. "1. Step one")
    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (numberedMatch) {
      flushPara();
      elements.push(
        <div key={elements.length} className="step-card">
          <span className="font-semibold text-blue-700">
            Step {numberedMatch[1]}:
          </span>{" "}
          {renderInline(numberedMatch[2])}
        </div>
      );
      continue;
    }

    // Bullet list item
    const bulletMatch = trimmed.match(/^[-*•]\s+(.+)$/);
    if (bulletMatch) {
      flushPara();
      elements.push(
        <div key={elements.length} className="flex gap-2 ml-2">
          <span className="text-blue-500 mt-1">•</span>
          <span>{renderInline(bulletMatch[1])}</span>
        </div>
      );
      continue;
    }

    paraBuffer.push(trimmed);
  }

  flushPara();

  return <>{elements}</>;
}

/**
 * Renders inline formatting: **bold** and `code`.
 */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}
