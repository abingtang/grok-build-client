import { Button } from "@/components/ui/button";
import { highlightCode, normalizeLang } from "@/lib/highlight";
import { cn } from "@/lib/utils";
import { CheckIcon, CopyIcon } from "lucide-react";
import {
  type ComponentProps,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type CodeBlockContextValue = {
  code: string;
};

const CodeBlockContext = createContext<CodeBlockContextValue>({ code: "" });

export type CodeBlockProps = ComponentProps<"div"> & {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
};

export function CodeBlock({
  code,
  language,
  showLineNumbers,
  className,
  children,
  ...props
}: CodeBlockProps) {
  const value = useMemo(() => ({ code }), [code]);
  const lang = normalizeLang(language);
  const html = useMemo(() => highlightCode(code, language), [code, language]);
  const lines = useMemo(() => {
    if (!showLineNumbers) return null;
    // Highlight whole block then split by lines — imperfect but keeps tokens
    return html.split("\n");
  }, [html, showLineNumbers]);

  return (
    <CodeBlockContext.Provider value={value}>
      <div
        className={cn(
          "not-prose w-full overflow-hidden rounded-lg border border-border bg-muted/30",
          className,
        )}
        data-language={language}
        {...props}
      >
        {children}
        <pre className="max-h-96 overflow-auto p-3 font-mono text-[12px] leading-relaxed">
          {showLineNumbers && lines ? (
            <code
              className={cn("hljs language-" + lang, "grid grid-cols-[auto_1fr] gap-x-3")}
            >
              {lines.map((line, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <span key={i} className="contents">
                  <span className="select-none text-right text-muted-foreground/60">
                    {i + 1}
                  </span>
                  <span dangerouslySetInnerHTML={{ __html: line || " " }} />
                </span>
              ))}
            </code>
          ) : (
            <code
              className={cn("hljs language-" + lang)}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </pre>
      </div>
    </CodeBlockContext.Provider>
  );
}

export type CodeBlockHeaderProps = ComponentProps<"div">;

export function CodeBlockHeader({ className, ...props }: CodeBlockHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 border-b border-border/60 bg-muted/40 px-3 py-1.5",
        className,
      )}
      {...props}
    />
  );
}

export type CodeBlockTitleProps = ComponentProps<"div">;

export function CodeBlockTitle({ className, ...props }: CodeBlockTitleProps) {
  return (
    <div
      className={cn("flex min-w-0 items-center gap-2 text-xs", className)}
      {...props}
    />
  );
}

export type CodeBlockFilenameProps = ComponentProps<"span">;

export function CodeBlockFilename({
  className,
  ...props
}: CodeBlockFilenameProps) {
  return (
    <span
      className={cn("truncate font-mono text-muted-foreground", className)}
      {...props}
    />
  );
}

export type CodeBlockActionsProps = ComponentProps<"div">;

export function CodeBlockActions({
  className,
  ...props
}: CodeBlockActionsProps) {
  return (
    <div className={cn("flex items-center gap-1", className)} {...props} />
  );
}

export type CodeBlockCopyButtonProps = ComponentProps<typeof Button> & {
  onCopy?: () => void;
  onError?: (error: Error) => void;
  timeout?: number;
};

export function CodeBlockCopyButton({
  className,
  onCopy,
  onError,
  timeout = 2000,
  ...props
}: CodeBlockCopyButtonProps) {
  const { code } = useContext(CodeBlockContext);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      onCopy?.();
      window.setTimeout(() => setCopied(false), timeout);
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }, [code, onCopy, onError, timeout]);

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      className={cn("size-7", className)}
      onClick={() => void handleCopy()}
      {...props}
    >
      {copied ? (
        <CheckIcon className="size-3.5 text-emerald-500" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
      <span className="sr-only">复制代码</span>
    </Button>
  );
}
