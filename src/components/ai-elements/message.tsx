import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ChatMarkdownImage,
  LOCAL_MEDIA_ORIGIN,
} from "@/lib/chat-media";
import { cn } from "@/lib/utils";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { UIMessage } from "ai";
import { memo, type ComponentProps, type HTMLAttributes } from "react";
import { harden } from "rehype-harden";
import {
  Streamdown,
  defaultRehypePlugins,
  type Components,
} from "streamdown";
import type { PluggableList } from "unified";

/** Allow relative local images (e.g. images/1.jpg) past rehype-harden. */
const chatRehypePlugins = [
  defaultRehypePlugins.raw,
  defaultRehypePlugins.sanitize,
  [
    harden,
    {
      allowedImagePrefixes: ["*"],
      allowedLinkPrefixes: ["*"],
      allowedProtocols: ["*"],
      allowDataImages: true,
      defaultOrigin: LOCAL_MEDIA_ORIGIN,
    },
  ],
] as PluggableList;

const chatMarkdownComponents = {
  img: ChatMarkdownImage,
} as Components;

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"];
};

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      "group flex w-full max-w-[95%] flex-col gap-2",
      from === "user" ? "is-user ml-auto justify-end" : "is-assistant",
      className,
    )}
    {...props}
  />
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageContent = ({
  children,
  className,
  ...props
}: MessageContentProps) => (
  <div
    className={cn(
      "chat-msg-body is-user:dark flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden",
      "group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground",
      "group-[.is-assistant]:text-foreground",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

export type MessageActionsProps = ComponentProps<"div">;

export const MessageActions = ({
  className,
  children,
  ...props
}: MessageActionsProps) => (
  <div className={cn("flex items-center gap-1", className)} {...props}>
    {children}
  </div>
);

export type MessageActionProps = ComponentProps<typeof Button> & {
  tooltip?: string;
  label?: string;
};

export const MessageAction = ({
  tooltip,
  children,
  label,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: MessageActionProps) => {
  const button = (
    <Button size={size} type="button" variant={variant} {...props}>
      {children}
      <span className="sr-only">{label || tooltip}</span>
    </Button>
  );

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
};

export type MessageResponseProps = ComponentProps<typeof Streamdown> & {
  isAnimating?: boolean;
};

/** Streamdown-powered markdown (AI Elements Message response). */
const MessageResponseBase = ({
  className,
  isAnimating,
  components,
  rehypePlugins,
  ...props
}: MessageResponseProps) => (
  <Streamdown
    data-streamdown
    className={cn(
      "ai-msg-prose size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
      isAnimating && "is-streaming",
      className,
    )}
    plugins={{ cjk, code, math, mermaid }}
    controls={false}
    lineNumbers={false}
    isAnimating={isAnimating}
    rehypePlugins={rehypePlugins ?? chatRehypePlugins}
    components={{ ...chatMarkdownComponents, ...components }}
    {...props}
  />
);

export const MessageResponse = memo(
  MessageResponseBase,
  (prev, next) =>
    prev.children === next.children &&
    prev.isAnimating === next.isAnimating &&
    prev.className === next.className &&
    prev.components === next.components &&
    prev.rehypePlugins === next.rehypePlugins,
);
