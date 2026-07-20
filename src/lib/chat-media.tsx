/**
 * Chat markdown local media helpers.
 *
 * Grok image tools emit relative paths like `images/1.jpg` (project cwd or
 * session dir). Streamdown's rehype-harden blocks bare relative URLs without a
 * defaultOrigin; even when allowed, Electron cannot load filesystem paths from
 * the Vite/http origin. We rewrite through a sentinel origin, then resolve via
 * `fs.readFileBase64` into data URLs.
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
