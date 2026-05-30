"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, XCircle, KeyRound, Loader2, Trash2, Star } from "lucide-react";
import { testProviderAction, deleteProviderAction, setDefaultProviderAction } from "@/lib/integration-hub/actions";
import { Card, CardContent } from "@/components/ui/card";
import type { ProviderName } from "@/lib/integration-hub/types";
import { EditProviderDialog } from "./edit-provider-dialog";

type ProviderWithStatus = {
  id: string;
  kind: string;
  name: string;
  label: string;
  enabled: boolean;
  isDefault: boolean;
  config: Record<string, unknown>;
  maskedKey: string;
  hasKey: boolean;
  totalCost: number;
  totalRequests: number;
  rotatedAt?: string;
  lastHealth?: { ok: boolean; latencyMs?: number; error?: string; checkedAt: string };
};

const kindLabel: Record<string, string> = {
  llm: "LLM", tts: "TTS", avatar: "Avatar", render: "Render", storage: "Storage", publish: "Publish",
};

export function ProviderRow({ provider }: { provider: ProviderWithStatus }) {
  const [isPending, startTransition] = useTransition();
  const [localHealth, setLocalHealth] = useState(provider.lastHealth);

  const handleTest = () => {
    startTransition(async () => {
      const result = await testProviderAction(provider.id);
      setLocalHealth({ ...result, checkedAt: new Date().toISOString() });
    });
  };

  const handleDelete = () => {
    if (!confirm(`Xóa provider ${provider.label}?`)) return;
    startTransition(async () => {
      await deleteProviderAction(provider.id);
    });
  };

  const handleSetDefault = () => {
    startTransition(async () => {
      await setDefaultProviderAction(provider.id);
    });
  };

  const status = !provider.hasKey
    ? { icon: XCircle, color: "text-zinc-400", label: "Chưa có key", variant: "outline" as const }
    : localHealth?.ok
    ? { icon: CheckCircle2, color: "text-emerald-500", label: `OK ${localHealth.latencyMs}ms`, variant: "success" as const }
    : localHealth?.ok === false
    ? { icon: AlertCircle, color: "text-rose-500", label: "Lỗi", variant: "destructive" as const }
    : { icon: AlertCircle, color: "text-amber-500", label: "Chưa test", variant: "warning" as const };

  const StatusIcon = status.icon;

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-4 flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px]">{kindLabel[provider.kind] || provider.kind}</Badge>
            <h3 className="text-sm font-semibold">{provider.label}</h3>
            <StatusIcon className={`h-3.5 w-3.5 ${status.color}`} />
            <Badge variant={status.variant}>{status.label}</Badge>
            {provider.isDefault && (
              <Badge variant="accent" className="text-[10px]">
                <Star className="h-2.5 w-2.5 mr-1 fill-current" /> Default
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 font-mono">
            {provider.maskedKey || "Chưa cấu hình"} {provider.totalRequests > 0 && `· ${provider.totalRequests} requests`}
            {localHealth?.error && ` · ${localHealth.error.slice(0, 60)}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold">${provider.totalCost.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground">đã dùng</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleTest} disabled={isPending}>
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Test"}
          </Button>
          <EditProviderDialog
            provider={{
              id: provider.id,
              name: provider.name as ProviderName,
              label: provider.label,
              kind: provider.kind,
              config: provider.config || {},
              maskedKey: provider.maskedKey,
              hasKey: provider.hasKey,
              isDefault: provider.isDefault,
              enabled: provider.enabled,
            }}
          />
          {!provider.isDefault && (
            <Button variant="outline" size="sm" onClick={handleSetDefault} disabled={isPending}>
              Đặt default
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleDelete} disabled={isPending}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
