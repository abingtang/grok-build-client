/**
 * Chat markdown local media helpers.
 *
 * Grok image tools emit relative paths like `images/1.jpg` (project cwd or
 * session dir). Streamdown's rehype-harden blocks bare relative URLs without a
 * defaultOrigin; even when allowed, Electron cannot load filesystem paths from
 * the Vite/http origin. We rewrite through a sentinel origin, then resolve via
 * `fs.readFileBase64` into data URLs.
 *
 * Attachment chips use the same IPC path — never `file://` in <img src>
 * (renderer CSP / origin blocks it).
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ImgHTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

const ATTACH_PREVIEW_MAX = 8 * 1024 * 1024;

/** Strip file:// / normalize for fs.readFileBase64. */
export function filesystemPathFromUri(src: string): string {
  let path = (src || "").trim();
  if (!path) return "";
  if (path.startsWith("file://")) {
    try {
      path = decodeURIComponent(path.replace(/^file:\/\//, ""));
    } catch {
      path = path.replace(/^file:\/\//, "");
    }
  }
  return path;
}

/**
 * Load a local image as a data URL via main-process IPC.
 * Returns null if missing / not an image / too large.
 */
export async function loadLocalImageDataUrl(
  filePath: string,
  maxBytes = ATTACH_PREVIEW_MAX,
): Promise<string | null> {
  const fp = filesystemPathFromUri(filePath);
  if (!fp) return null;
  // Absolute paths only (uploads live under ~/.grok/... absolute paths)
  if (!(fp.startsWith("/") || /^[A-Za-z]:[\\/]/.test(fp))) return null;
  try {
    const api = window.grokDesktop?.fs?.readFileBase64;
    if (!api) return null;
    const res = await api(fp, maxBytes);
    if (!res || "error" in res || !res.dataBase64) return null;
    const mime = String(res.mimeType || "application/octet-stream");
    if (
      !mime.startsWith("image/") &&
      !/\.(png|jpe?g|gif|webp|bmp|svg|heic)$/i.test(fp)
    ) {
      return null;
    }
    const safeMime = mime.startsWith("image/")
      ? mime
      : "image/png";
    return `data:${safeMime};base64,${res.dataBase64}`;
  } catch {
    return null;
  }
}

/**
 * Resolve preview for attachment chips: data:/blob: passthrough, else load path.
 */
export function useAttachmentPreviewUrl(
  previewUrl?: string | null,
  filePath?: string | null,
  enabled = true,
): { src: string | null; loading: boolean; failed: boolean } {
  const [src, setSrc] = useState<string | null>(() => {
    if (previewUrl && /^(data:|blob:)/i.test(previewUrl)) return previewUrl;
    return null;
  });
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!enabled) {
      setSrc(null);
      setLoading(false);
      setFailed(false);
      return;
    }

    if (previewUrl && /^(data:|blob:)/i.test(previewUrl)) {
      setSrc(previewUrl);
      setLoading(false);
      setFailed(false);
      return;
    }

    // file:// or bare path — must go through IPC
    const path =
      filePath ||
      (previewUrl && !/^(https?:|data:|blob:)/i.test(previewUrl)
        ? previewUrl
        : "");

    if (!path) {
      setSrc(null);
      setLoading(false);
      setFailed(true);
      return;
    }

    setLoading(true);
    setFailed(false);
    setSrc(null);

    void loadLocalImageDataUrl(path).then((url) => {
      if (cancelled) return;
      setLoading(false);
      if (url) {
        setSrc(url);
        setFailed(false);
      } else {
        setSrc(null);
        setFailed(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [previewUrl, filePath, enabled]);

  return { src, loading, failed };
}

/** Sentinel origin so rehype-harden accepts relative image paths. */
export const LOCAL_MEDIA_ORIGIN = "https://grok-local.invalid";

export type ChatMediaContextValue = {
  /** Absolute directories to try for relative media (project cwd, session dir). */
  baseDirs: string[];
};

const ChatMediaContext = createContext<ChatMediaContextValue>({ baseDirs: [] });

export function ChatMediaProvider({
  baseDirs,
  children,
}: {
  baseDirs: string[];
  children: ReactNode;
}) {
  const value = useMemo(() => ({ baseDirs }), [baseDirs.join("\0")]);
  return (
    <ChatMediaContext.Provider value={value}>
      {children}
    </ChatMediaContext.Provider>
  );
}

function isPassthroughUrl(src: string): boolean {
  if (/^(data:|blob:)/i.test(src)) return true;
  if (/^https?:\/\//i.test(src) && !src.startsWith(`${LOCAL_MEDIA_ORIGIN}/`)) {
    return true;
  }
  return false;
}

/** Build absolute filesystem candidates for a markdown image src. */
export function mediaSrcCandidates(
  src: string,
  baseDirs: string[],
): string[] {
  let path = src.trim();
  if (!path) return [];

  if (path.startsWith(`${LOCAL_MEDIA_ORIGIN}/`)) {
    path = path.slice(LOCAL_MEDIA_ORIGIN.length);
  } else if (path === LOCAL_MEDIA_ORIGIN) {
    return [];
  }

  if (path.startsWith("file://")) {
    try {
      path = decodeURIComponent(path.replace(/^file:\/\//, ""));
    } catch {
      path = path.replace(/^file:\/\//, "");
    }
  }

  const out: string[] = [];
  // Absolute filesystem path (macOS/Linux; Windows drive letters)
  if (
    (path.startsWith("/") && !path.startsWith("//")) ||
    /^[A-Za-z]:[\\/]/.test(path)
  ) {
    out.push(path);
  }

  const rel = path.replace(/^\.\//, "").replace(/^\//, "");
  if (rel && !rel.startsWith("..")) {
    for (const dir of baseDirs) {
      if (!dir) continue;
      const joined = dir.endsWith("/") || dir.endsWith("\\")
        ? `${dir}${rel}`
        : `${dir}/${rel}`;
      out.push(joined);
    }
  }

  return [...new Set(out)];
}

/**
 * Streamdown `components.img` — loads local relative images as data URLs.
 * Accepts Streamdown's loose component props (ExtraProps + unknown attrs).
 */
export function ChatMarkdownImage(
  props: ImgHTMLAttributes<HTMLImageElement> & Record<string, unknown>,
) {
  const { src, alt, className, node: _node, ...rest } = props;
  const srcStr = typeof src === "string" ? src : undefined;
  const altStr = typeof alt === "string" ? alt : "";
  const { baseDirs } = useContext(ChatMediaContext);
  const baseKey = baseDirs.join("\0");
  const [resolved, setResolved] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setResolved(null);

    void (async () => {
      if (!srcStr) {
        if (!cancelled) setFailed(true);
        return;
      }

      if (isPassthroughUrl(srcStr)) {
        if (!cancelled) setResolved(srcStr);
        return;
      }

      const candidates = mediaSrcCandidates(srcStr, baseDirs);
      for (const fp of candidates) {
        try {
          const res = await window.grokDesktop.fs.readFileBase64(fp);
          if (res && "dataBase64" in res && res.dataBase64) {
            if (!cancelled) {
              setResolved(`data:${res.mimeType};base64,${res.dataBase64}`);
            }
            return;
          }
        } catch {
          // try next candidate
        }
      }

      if (!cancelled) setFailed(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [srcStr, baseKey]);

  if (failed) {
    return (
      <span
        className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
        title={srcStr}
      >
        <span>{altStr ? `[${altStr}]` : "[image]"}</span>
        {srcStr ? (
          <span className="truncate opacity-70">
            {srcStr.replace(`${LOCAL_MEDIA_ORIGIN}/`, "")}
          </span>
        ) : null}
      </span>
    );
  }

  if (!resolved) {
    return (
      <span
        className="inline-block min-h-16 min-w-24 animate-pulse rounded-md bg-muted"
        aria-label={altStr || "loading image"}
      />
    );
  }

  return (
    <img
      src={resolved}
      alt={altStr}
      className={cn(
        "my-2 max-h-[min(70vh,640px)] max-w-full rounded-md border border-border/50 object-contain",
        typeof className === "string" ? className : undefined,
      )}
      loading="lazy"
      {...(rest as ImgHTMLAttributes<HTMLImageElement>)}
    />
  );
}
