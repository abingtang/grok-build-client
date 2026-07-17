import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "../i18n";

/**
 * Chat-transcript-shaped skeleton shown while a session is loading.
 * Layout mirrors AiMessageList ConversationContent (chat-col width).
 */
export function ChatSessionSkeleton() {
  const { t } = useI18n();
  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      role="status"
      aria-busy="true"
      aria-label={t("skeleton.loadingSession")}
      aria-live="polite"
    >
      <div className="chat-col flex w-full flex-col gap-6 px-[var(--chat-col-pad-x)] py-5">
        {/* User bubble — right-aligned */}
        <div className="flex justify-end">
          <Skeleton className="h-12 w-[40%] rounded-2xl" />
        </div>

        {/* Assistant — full-width lines */}
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-3.5 w-[92%]" />
          <Skeleton className="h-3.5 w-[78%]" />
          <Skeleton className="h-3.5 w-[85%]" />
          <Skeleton className="h-3.5 w-[55%]" />
        </div>

        {/* Optional process / tool line */}
        <Skeleton className="h-2.5 w-36" />

        {/* User bubble */}
        <div className="flex justify-end">
          <Skeleton className="h-12 w-[36%] rounded-2xl" />
        </div>

        {/* Assistant block */}
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-3.5 w-[88%]" />
          <Skeleton className="h-3.5 w-[70%]" />
          <Skeleton className="h-3.5 w-[94%]" />
          <Skeleton className="h-3.5 w-[42%]" />
        </div>
      </div>
    </div>
  );
}
