/** Codex-style markdown → safe HTML for assistant bubbles. */

import { highlightCode, normalizeLang } from "./highlight";

function escapeHtml(src: string): string {
  return src
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function langLabel(lang: string): string {
  const l = normalizeLang(lang);
  if (l === "plaintext") return "text";
  if (l === "typescript") return "ts";
  if (l === "javascript") return "js";
  if (l === "python") return "py";
  if (l === "bash") return "sh";
  return l;
}

function renderInline(text: string): string {
  let s = escapeHtml(text);
  // inline code chips (Codex-style pills)
  s = s.replace(
    /`([^`\n]+)`/g,
    '<code class="md-chip">$1</code>',
  );
  // bold / italic
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
  // simple links
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a class="md-link" href="$2" target="_blank" rel="noreferrer">$1</a>',
  );
  return s;
}

function renderTable(block: string): string {
  const rows = block
    .trim()
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean);
  if (rows.length < 2) return `<p>${renderInline(block)}</p>`;

  const parseRow = (row: string) =>
    row
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());

  const header = parseRow(rows[0]);
  const sep = rows[1] || "";
  if (!/^\|?[\s:-]+\|/.test(sep) && !/^[\s|:-]+$/.test(sep)) {
    return `<p>${renderInline(block)}</p>`;
  }
  const body = rows.slice(2).map(parseRow);
  const th = header.map((h) => `<th>${renderInline(h)}</th>`).join("");
  const tr = body
    .map(
      (cells) =>
        `<tr>${cells.map((c) => `<td>${renderInline(c)}</td>`).join("")}</tr>`,
    )
    .join("");
  return `<div class="md-table-wrap"><table class="md-table"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

/**
 * Convert markdown to HTML. Fenced code becomes structured blocks
 * with language label (copy button wired in React via data attributes).
 */
export function renderMarkdown(src: string): string {
  if (!src) return "";

  // Extract fenced code first so we don't touch insides
  const fences: string[] = [];
  let text = src.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (_m, lang, code) => {
    const i = fences.length;
    const rawLang = String(lang || "").trim();
    const label = langLabel(rawLang);
    const raw = String(code).replace(/\n$/, "");
    const highlighted = highlightCode(raw, rawLang || label);
    fences.push(
      `<div class="md-codeblock" data-lang="${label}">` +
        `<div class="md-code-bar"><span class="md-code-lang">${label}</span>` +
        `<button type="button" class="md-copy" data-copy="${encodeURIComponent(raw)}">复制</button></div>` +
        `<pre class="md-code"><code class="hljs language-${escapeHtml(normalizeLang(rawLang || label))}">${highlighted}</code></pre></div>`,
    );
    return `\n\n@@FENCE_${i}@@\n\n`;
  });

  // Split into blocks by blank lines, but keep table blocks intact
  const rawBlocks = text.split(/\n{2,}/);
  const htmlBlocks: string[] = [];

  for (const raw of rawBlocks) {
    const block = raw.trim();
    if (!block) continue;

    const fenceMatch = block.match(/^@@FENCE_(\d+)@@$/);
    if (fenceMatch) {
      htmlBlocks.push(fences[Number(fenceMatch[1])] || "");
      continue;
    }

    // tables
    if (block.includes("|") && /\n\s*\|?\s*[-:]+/.test(block)) {
      htmlBlocks.push(renderTable(block));
      continue;
    }

    // headings
    if (/^### /.test(block)) {
      htmlBlocks.push(
        `<h4 class="md-h">${renderInline(block.replace(/^### /, ""))}</h4>`,
      );
      continue;
    }
    if (/^## /.test(block)) {
      htmlBlocks.push(
        `<h3 class="md-h">${renderInline(block.replace(/^## /, ""))}</h3>`,
      );
      continue;
    }
    if (/^# /.test(block)) {
      htmlBlocks.push(
        `<h3 class="md-h">${renderInline(block.replace(/^# /, ""))}</h3>`,
      );
      continue;
    }

    // hr
    if (/^(-{3,}|\*{3,})$/.test(block)) {
      htmlBlocks.push('<hr class="md-hr" />');
      continue;
    }

    // unordered list
    if (/^[-*] /.test(block) || /\n[-*] /.test(block)) {
      const items = block
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => /^[-*] /.test(l))
        .map((l) => `<li>${renderInline(l.replace(/^[-*] /, ""))}</li>`)
        .join("");
      htmlBlocks.push(`<ul class="md-list">${items}</ul>`);
      continue;
    }

    // ordered list
    if (/^\d+\. /.test(block) || /\n\d+\. /.test(block)) {
      const items = block
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => /^\d+\. /.test(l))
        .map((l) => `<li>${renderInline(l.replace(/^\d+\. /, ""))}</li>`)
        .join("");
      htmlBlocks.push(`<ol class="md-list">${items}</ol>`);
      continue;
    }

    // paragraph (preserve single newlines as <br>)
    const lines = block.split("\n").map((l) => renderInline(l));
    htmlBlocks.push(`<p class="md-p">${lines.join("<br/>")}</p>`);
  }

  return htmlBlocks.join("");
}

export function countDiffLines(
  oldText: string,
  newText: string,
): { added: number; removed: number } {
  const a = (oldText || "").split("\n");
  const b = (newText || "").split("\n");
  // rough line-level: treat full rewrite as +b -a when old empty
  if (!oldText) return { added: b.filter(Boolean).length || b.length, removed: 0 };
  if (!newText) return { added: 0, removed: a.filter(Boolean).length || a.length };
  // LCS-free cheap heuristic
  const aSet = new Map<string, number>();
  for (const line of a) aSet.set(line, (aSet.get(line) || 0) + 1);
  let common = 0;
  for (const line of b) {
    const n = aSet.get(line) || 0;
    if (n > 0) {
      common += 1;
      aSet.set(line, n - 1);
    }
  }
  return {
    added: Math.max(0, b.length - common),
    removed: Math.max(0, a.length - common),
  };
}

export function basename(p: string): string {
  const s = p.replace(/\\/g, "/");
  const i = s.lastIndexOf("/");
  return i >= 0 ? s.slice(i + 1) : s;
}

export function extLang(path: string): string {
  const b = basename(path);
  const i = b.lastIndexOf(".");
  if (i < 0) return "file";
  return b.slice(i + 1).toLowerCase() || "file";
}
