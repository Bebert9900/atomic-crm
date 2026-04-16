import { Mic } from "lucide-react";
import { type MouseEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { AudioRecorderDialog } from "./AudioRecorderDialog";

interface RecordButtonProps {
  contactId: number;
  contactName: string;
}

export function RecordButton({ contactId, contactName }: RecordButtonProps) {
  const [open, setOpen] = useState(false);

  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleClick}
          >
            <Mic className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Record call</TooltipContent>
      </Tooltip>

      <AudioRecorderDialog
        open={open}
        onOpenChange={setOpen}
        contactId={contactId}
        contactName={contactName}
      />
    </>
  );
}
