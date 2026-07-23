import { promises as fsp } from "node:fs";
import path from "node:path";
import {
  internalError,
  invalidParams,
  resourceNotFound,
  type RpcHandlerError,
} from "./terminal-host";

export type ReadTextFileParams = {
  sessionId?: string;
  path?: string;
  line?: number | null;
  limit?: number | null;
  /** Fallback base for relative paths. */
  defaultCwd?: string | null;
};

export type WriteTextFileParams = {
  sessionId?: string;
  path?: string;
  content?: string;
  defaultCwd?: string | null;
};

/**
 * ACP `fs/read_text_file` — returns `{ content }`.
 * Supports 1-based `line` and line `limit` (limit 0 → empty string).
 */
export async function handleReadTextFile(
  params: ReadTextFileParams,
): Promise<{ content: string }> {
  const filePath = resolvePath(params.path, params.defaultCwd);
  let raw: string;
  try {
    raw = await fsp.readFile(filePath, "utf8");
  } catch (err) {
    throw mapFsError(err, filePath);
  }

  const line =
    typeof params.line === "number" && Number.isFinite(params.line)
      ? Math.max(0, Math.floor(params.line))
      : null;
  const limit =
    typeof params.limit === "number" && Number.isFinite(params.limit)
      ? Math.max(0, Math.floor(params.limit))
      : null;

  if (line == null && limit == null) {
    return { content: raw };
  }

  // Preserve trailing newline semantics lightly: split, slice lines, rejoin.
  const endsWithNl = raw.endsWith("\n");
  const lines = raw.split("\n");
  // split leaves a trailing empty segment when file ends with \n
  if (endsWithNl && lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  const start = line != null && line > 0 ? line - 1 : 0;
  const end = limit != null ? start + limit : lines.length;
  const sliced = lines.slice(start, end).join("\n");
  return { content: sliced };
}

/**
 * ACP `fs/write_text_file` — creates parent dirs, writes full content.
 * Returns `{}` per schema.
 */
export async function handleWriteTextFile(
  params: WriteTextFileParams,
): Promise<Record<string, never>> {
  const filePath = resolvePath(params.path, params.defaultCwd);
  if (typeof params.content !== "string") {
    throw invalidParams("content is required");
  }
  try {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, params.content, "utf8");
  } catch (err) {
    throw mapFsError(err, filePath);
  }
  return {};
}

function resolvePath(
  rawPath: string | undefined,
  defaultCwd?: string | null,
): string {
  if (!rawPath || !String(rawPath).trim()) {
    throw invalidParams("path is required");
  }
  const p = String(rawPath);
  if (path.isAbsolute(p)) return p;
  const base = (defaultCwd && String(defaultCwd).trim()) || process.cwd();
  return path.resolve(base, p);
}

function mapFsError(err: unknown, filePath: string): RpcHandlerError {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: unknown }).code)
      : "";
  const message =
    err instanceof Error ? err.message : `filesystem error: ${String(err)}`;

  if (code === "ENOENT") {
    return resourceNotFound(`File not found: ${filePath}`);
  }
  if (code === "EACCES" || code === "EPERM") {
    return internalError(`Permission denied: ${filePath}`);
  }
  if (code === "EISDIR") {
    return invalidParams(`Path is a directory: ${filePath}`);
  }
  return internalError(message);
}
