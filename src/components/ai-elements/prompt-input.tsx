/**
 * AI Elements PromptInput (desktop-adapted subset).
 * Full attachment menus / select menus can grow later; core submit+status matches AI SDK ChatStatus.
 */
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { ChatStatus } from "ai";
import { CornerDownLeftIcon, SquareIcon, XIcon } from "lucide-react";
import {
  type ComponentProps,
  type FormEvent,
  type FormEventHandler,
  type HTMLAttributes,
  type KeyboardEventHandler,
  useCallback,
  useState,
} from "react";

export interface PromptInputMessage {
  text: string;
}

export type PromptInputProps = Omit<
  HTMLAttributes<HTMLFormElement>,
  "onSubmit"
> & {
  onSubmit: (
    message: PromptInputMessage,
    event: FormEvent<HTMLFormElement>,
  ) => void | Promise<void>;
};

export function PromptInput({
  className,
  onSubmit,
  children,
  ...props
}: PromptInputProps) {
  const handleSubmit: FormEventHandler<HTMLFormElement> = useCallback(
    async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const text = String(data.get("message") ?? "");
      await onSubmit({ text }, event);
    },
    [onSubmit],
  );

  return (
    <form
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-xl border border-border bg-card/80 shadow-sm",
        "focus-within:border-ring/50 focus-within:ring-1 focus-within:ring-ring/30",
        className,
      )}
      onSubmit={handleSubmit}
      {...props}
    >
      {children}
    </form>
  );
}

export type PromptInputBodyProps = HTMLAttributes<HTMLDivElement>;

export function PromptInputBody({ className, ...props }: PromptInputBodyProps) {
  return <div className={cn("contents", className)} {...props} />;
}

export type PromptInputTextareaProps = ComponentProps<"textarea">;

export function PromptInputTextarea({
  className,
  onKeyDown,
  placeholder = "向 Grok 发送消息…",
  ...props
}: PromptInputTextareaProps) {
  const [isComposing, setIsComposing] = useState(false);

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key !== "Enter" || e.shiftKey) return;
    if (isComposing || e.nativeEvent.isComposing) return;
    e.preventDefault();
    const form = e.currentTarget.form;
    const submit = form?.querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement | null;
    if (submit?.disabled) return;
    form?.requestSubmit();
  };

  return (
    <textarea
      name="message"
      rows={1}
      placeholder={placeholder}
      className={cn(
        "field-sizing-content max-h-48 min-h-[72px] w-full resize-none bg-transparent px-3.5 py-3 text-sm outline-none",
        "placeholder:text-muted-foreground/70",
        className,
      )}
      onCompositionStart={() => setIsComposing(true)}
      onCompositionEnd={() => setIsComposing(false)}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
}

export type PromptInputHeaderProps = HTMLAttributes<HTMLDivElement>;

export function PromptInputHeader({
  className,
  ...props
}: PromptInputHeaderProps) {
  return (
    <div
      className={cn("flex flex-wrap gap-1.5 px-3 pt-2.5", className)}
      {...props}
    />
  );
}

export type PromptInputFooterProps = HTMLAttributes<HTMLDivElement>;

export function PromptInputFooter({
  className,
  ...props
}: PromptInputFooterProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-1",
        className,
      )}
      {...props}
    />
  );
}

export type PromptInputToolsProps = HTMLAttributes<HTMLDivElement>;

export function PromptInputTools({
  className,
  ...props
}: PromptInputToolsProps) {
  return (
    <div
      className={cn("flex min-w-0 flex-1 items-center gap-1", className)}
      {...props}
    />
  );
}

export type PromptInputButtonProps = ComponentProps<typeof Button>;

export function PromptInputButton({
  className,
  variant = "ghost",
  size = "sm",
  type = "button",
  ...props
}: PromptInputButtonProps) {
  return (
    <Button
      type={type}
      variant={variant}
      size={size}
      className={cn("h-8 gap-1.5 px-2 text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

export type PromptInputSubmitProps = ComponentProps<typeof Button> & {
  status?: ChatStatus;
  onStop?: () => void;
};

/** Submit / stop button driven by AI SDK ChatStatus. */
export function PromptInputSubmit({
  className,
  variant = "default",
  size = "icon-sm",
  status = "ready",
  onStop,
  onClick,
  children,
  disabled,
  ...props
}: PromptInputSubmitProps) {
  const isGenerating = status === "submitted" || status === "streaming";

  let icon = <CornerDownLeftIcon className="size-4" />;
  if (status === "submitted") icon = <Spinner />;
  else if (status === "streaming") icon = <SquareIcon className="size-3.5" />;
  else if (status === "error") icon = <XIcon className="size-4" />;

  return (
    <Button
      type={isGenerating && onStop ? "button" : "submit"}
      variant={variant}
      size={size}
      disabled={disabled && !isGenerating}
      aria-label={isGenerating ? "停止" : "发送"}
      className={cn(
        "size-8 shrink-0 rounded-lg",
        isGenerating && "bg-destructive text-white hover:bg-destructive/90",
        className,
      )}
      onClick={(e) => {
        if (isGenerating && onStop) {
          e.preventDefault();
          onStop();
          return;
        }
        onClick?.(e);
      }}
      {...props}
    >
      {children ?? icon}
    </Button>
  );
}
