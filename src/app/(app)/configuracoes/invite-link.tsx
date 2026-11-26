"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function InviteLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <code className="max-w-full truncate rounded bg-muted px-2 py-1 text-xs">{link}</code>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={async () => {
          await navigator.clipboard.writeText(link);
          setCopied(true);
        }}
      >
        {copied ? "Copiado" : "Copiar link"}
      </Button>
    </div>
  );
}
