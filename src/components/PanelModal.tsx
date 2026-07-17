import { useI18n } from "../i18n";
import type { PanelId } from "../lib/types";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  panel: Exclude<PanelId, null>;
  body: string;
  onClose: () => void;
}

export function PanelModal({ panel, body, onClose }: Props) {
  const { t } = useI18n();

  const titles: Record<Exclude<PanelId, null>, string> = {
    sessions: t("panel.sessions"),
    settings: t("panel.settings"),
    history: t("panel.history"),
    docs: t("panel.docs"),
    hooks: "Hooks",
    plugins: "Plugins",
    marketplace: "Marketplace",
    skills: "Skills",
    mcps: "MCP Servers",
    agents: "Agents",
    personas: "Personas",
    rewind: "Rewind",
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[min(80vh,720px)] w-[min(640px,calc(100vw-32px))] flex-col p-0">
        <DialogHeader>
          <DialogTitle>{titles[panel]}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="min-h-0 flex-1">
          <DialogBody className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">
            {body}
          </DialogBody>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
