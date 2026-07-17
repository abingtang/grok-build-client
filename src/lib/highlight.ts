import hljs from "highlight.js/lib/core";
import { rt } from "../i18n";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

let registered = false;

function ensureRegistered(): void {
  if (registered) return;
  hljs.registerLanguage("javascript", javascript);
  hljs.registerLanguage("js", javascript);
  hljs.registerLanguage("typescript", typescript);
  hljs.registerLanguage("ts", typescript);
  hljs.registerLanguage("tsx", typescript);
  hljs.registerLanguage("jsx", javascript);
  hljs.registerLanguage("json", json);
  hljs.registerLanguage("python", python);
  hljs.registerLanguage("py", python);
  hljs.registerLanguage("bash", bash);
  hljs.registerLanguage("sh", bash);
  hljs.registerLanguage("shell", bash);
  hljs.registerLanguage("zsh", bash);
  hljs.registerLanguage("css", css);
  hljs.registerLanguage("html", xml);
  hljs.registerLanguage("xml", xml);
  hljs.registerLanguage("svg", xml);
  hljs.registerLanguage("yaml", yaml);
  hljs.registerLanguage("yml", yaml);
  hljs.registerLanguage("markdown", markdown);
  hljs.registerLanguage("md", markdown);
  hljs.registerLanguage("diff", diff);
  hljs.registerLanguage("go", go);
  hljs.registerLanguage("rust", rust);
  hljs.registerLanguage("rs", rust);
  hljs.registerLanguage("java", java);
  hljs.registerLanguage("sql", sql);
  registered = true;
}

const ALIAS: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  tsx: "typescript",
  jsx: "javascript",
  py: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  yml: "yaml",
  md: "markdown",
  rs: "rust",
  htm: "html",
  vue: "xml",
  svelte: "xml",
  toml: "yaml",
  text: "plaintext",
  txt: "plaintext",
  file: "plaintext",
};

export function normalizeLang(lang?: string | null): string {
  const raw = (lang || "").trim().toLowerCase();
  if (!raw) return "plaintext";
  return ALIAS[raw] || raw;
}

/** Escape HTML when highlighting fails / plaintext. */
function escapeHtml(src: string): string {
  return src
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Highlight source into HTML (no outer <pre>/<code> wrapper).
 */
export function highlightCode(code: string, lang?: string | null): string {
  ensureRegistered();
  const language = normalizeLang(lang);
  if (!code) return "";
  try {
    if (language === "plaintext" || !hljs.getLanguage(language)) {
      // try auto for unknown extensions
      if (language !== "plaintext") {
        const auto = hljs.highlightAuto(code, [
          "typescript",
          "javascript",
          "python",
          "json",
          "bash",
          "html",
          "css",
        ]);
        if (auto.value) return auto.value;
      }
      return escapeHtml(code);
    }
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(code);
  }
}

type DiffOp = { type: "add" | "del" | "ctx"; text: string };

/** Split text into lines; drop a single trailing empty line from final \\n. */
function splitLines(text: string): string[] {
  if (!text) return [];
  const lines = text.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Line-level LCS diff with common prefix/suffix trim.
 * Always yields add/del/ctx ops so UI can paint + green / - red.
 */
function lineDiff(oldLines: string[], newLines: string[]): DiffOp[] {
  let pref = 0;
  while (
    pref < oldLines.length &&
    pref < newLines.length &&
    oldLines[pref] === newLines[pref]
  ) {
    pref += 1;
  }
  let endA = oldLines.length;
  let endB = newLines.length;
  while (
    endA > pref &&
    endB > pref &&
    oldLines[endA - 1] === newLines[endB - 1]
  ) {
    endA -= 1;
    endB -= 1;
  }

  const aMid = oldLines.slice(pref, endA);
  const bMid = newLines.slice(pref, endB);
  const ops: DiffOp[] = [];

  for (let i = 0; i < pref; i++) {
    ops.push({ type: "ctx", text: oldLines[i] });
  }

  const n = aMid.length;
  const m = bMid.length;
  // Cap DP size; beyond that treat middle as full replace
  if (n > 0 && m > 0 && n * m <= 400_000) {
    const dp: Uint16Array[] = Array.from(
      { length: n + 1 },
      () => new Uint16Array(m + 1),
    );
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        if (aMid[i] === bMid[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
        else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]) as number;
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (aMid[i] === bMid[j]) {
        ops.push({ type: "ctx", text: aMid[i] });
        i += 1;
        j += 1;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        ops.push({ type: "del", text: aMid[i] });
        i += 1;
      } else {
        ops.push({ type: "add", text: bMid[j] });
        j += 1;
      }
    }
    while (i < n) {
      ops.push({ type: "del", text: aMid[i++] });
    }
    while (j < m) {
      ops.push({ type: "add", text: bMid[j++] });
    }
  } else {
    for (const l of aMid) ops.push({ type: "del", text: l });
    for (const l of bMid) ops.push({ type: "add", text: l });
  }

  for (let i = endB; i < newLines.length; i++) {
    ops.push({ type: "ctx", text: newLines[i] });
  }
  return ops;
}

/** Keep context near changes; collapse long unchanged stretches (Codex-style). */
function compactDiffOps(ops: DiffOp[], ctxRadius = 3): DiffOp[] {
  if (ops.length <= 120) return ops;
  const keep = new Uint8Array(ops.length);
  for (let i = 0; i < ops.length; i++) {
    if (ops[i].type === "add" || ops[i].type === "del") {
      const lo = Math.max(0, i - ctxRadius);
      const hi = Math.min(ops.length - 1, i + ctxRadius);
      for (let k = lo; k <= hi; k++) keep[k] = 1;
    }
  }
  // If almost everything is change, don't compact
  let kept = 0;
  for (let i = 0; i < keep.length; i++) if (keep[i]) kept += 1;
  if (kept > ops.length * 0.85) return ops;

  const out: DiffOp[] = [];
  let i = 0;
  while (i < ops.length) {
    if (keep[i]) {
      out.push(ops[i]);
      i += 1;
      continue;
    }
    let j = i;
    while (j < ops.length && !keep[j]) j += 1;
    out.push({
      type: "ctx",
      text: rt("markdown.unchangedLines", { n: j - i }),
    });
    i = j;
  }
  return out;
}

/** Collapse marker lines are not source — skip syntax highlight. */
function isCollapseMarker(text: string): boolean {
  return /^··· \d+/.test(text) && text.endsWith("···");
}

/**
 * Highlight one source line; keep empty lines empty.
 * Line-level highlight is imperfect for multi-line constructs but good enough in diffs.
 */
function highlightLine(text: string, lang?: string | null): string {
  if (!text) return "";
  if (isCollapseMarker(text)) return escapeHtml(text);
  try {
    return highlightCode(text, lang);
  } catch {
    return escapeHtml(text);
  }
}

/**
 * Render ops with BOTH:
 * - diff 高亮（行底色 + +/-）
 * - 语法高亮（行内 hljs token）
 */
function renderDiffOps(
  ops: DiffOp[],
  lang?: string | null,
): {
  html: string;
  added: number;
  removed: number;
} {
  let added = 0;
  let removed = 0;
  const parts: string[] = [];
  for (const op of ops) {
    const body = highlightLine(op.text, lang);
    if (op.type === "add") {
      added += 1;
      parts.push(
        `<span class="diff-line add"><span class="diff-sign">+</span><span class="diff-text">${body}</span></span>`,
      );
    } else if (op.type === "del") {
      removed += 1;
      parts.push(
        `<span class="diff-line del"><span class="diff-sign">-</span><span class="diff-text">${body}</span></span>`,
      );
    } else {
      parts.push(
        `<span class="diff-line ctx"><span class="diff-sign"> </span><span class="diff-text">${body}</span></span>`,
      );
    }
  }
  return {
    html: `<code class="hljs diff-view language-${escapeHtml(normalizeLang(lang))}">${parts.join("\n")}</code>`,
    added,
    removed,
  };
}

/**
 * Codex-style edit preview: additions (green +) / deletions (red -)
 * plus per-line syntax highlighting for both live tools and final summary.
 */
export function renderEditPreview(
  oldText: string,
  newText: string,
  lang?: string | null,
): { html: string; added: number; removed: number } {
  // If body is already a unified diff, render line markers + syntax
  if (
    !oldText &&
    newText &&
    /^(diff --git |@@ |index [0-9a-f])|^(--- |\+\+\+ )/m.test(newText)
  ) {
    const ops: DiffOp[] = splitLines(newText).map((line) => {
      if (line.startsWith("+") && !line.startsWith("+++"))
        return { type: "add" as const, text: line.slice(1) };
      if (line.startsWith("-") && !line.startsWith("---"))
        return { type: "del" as const, text: line.slice(1) };
      if (line.startsWith("+")) return { type: "add" as const, text: line };
      if (line.startsWith("-")) return { type: "del" as const, text: line };
      return { type: "ctx" as const, text: line };
    });
    return renderDiffOps(ops, lang);
  }

  const oldLines = splitLines(oldText || "");
  const newLines = splitLines(newText || "");

  // Pure write → all additions (green) + syntax
  if (!oldText && newText) {
    const ops = newLines.map((l) => ({ type: "add" as const, text: l }));
    return renderDiffOps(ops, lang);
  }
  // Pure delete → all deletions (red) + syntax
  if (oldText && !newText) {
    const ops = oldLines.map((l) => ({ type: "del" as const, text: l }));
    return renderDiffOps(ops, lang);
  }
  if (!oldText && !newText) {
    return {
      html: `<code class="hljs diff-view"></code>`,
      added: 0,
      removed: 0,
    };
  }

  const ops = compactDiffOps(lineDiff(oldLines, newLines));
  return renderDiffOps(ops, lang);
}
