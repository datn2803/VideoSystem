"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Pencil, CheckCircle2, XCircle, Loader2, Star } from "lucide-react";
import { getProviderMeta } from "@/lib/integration-hub/catalog";
import type { ProviderName } from "@/lib/integration-hub/types";
import { updateProviderAction, testProviderAction } from "@/lib/integration-hub/actions";
import { ProviderFieldsForm } from "./provider-fields-form";

const kindLabel: Record<string, string> = {
  llm: "LLM", tts: "TTS", avatar: "Avatar", render: "Render", image: "Image", storage: "Storage", publish: "Publish",
};

export type EditableProvider = {
  id: string;
  name: ProviderName;
  label: string;
  kind: string;
  config: Record<string, unknown>;
  maskedKey: string;
  hasKey: boolean;
  isDefault: boolean;
  enabled: boolean;
};

// Dựng values khởi tạo cho form từ config hiện tại (trừ apiKey — không điền key thật).
function initialValues(provider: EditableProvider): Record<string, string> {
  const meta = getProviderMeta(provider.name);
  const values: Record<string, string> = {};
  if (!meta) return values;
  for (const f of meta.fields) {
    if (f.type === "password") continue; // apiKey để trống
    const cur = provider.config[f.key] ?? meta.defaultConfig?.[f.key];
    if (cur !== undefined && cur !== null) values[f.key] = String(cur);
  }
  return values;
}

export function EditProviderDialog({ provider }: { provider: EditableProvider }) {
  const meta = getProviderMeta(provider.name);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(provider));
  const [setDefault, setSetDefault] = useState(provider.isDefault);
  const [enabled, setEnabled] = useState(provider.enabled);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; latencyMs?: number } | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!meta) return null;

  const handleOpen = (o: boolean) => {
    setOpen(o);
    if (o) {
      // reset về trạng thái hiện tại mỗi lần mở
      setValues(initialValues(provider));
      setSetDefault(provider.isDefault);
      setEnabled(provider.enabled);
      setTestResult(null);
    }
  };

  const handleSave = () => {
    const { apiKey: typedKey, ...config } = values;
    startTransition(async () => {
      await updateProviderAction({
        id: provider.id,
        apiKey: typedKey?.trim() ? typedKey.trim() : undefined, // rỗng = giữ key cũ
        config,
        isDefault: setDefault || undefined,
        enabled,
      });
      // auto-test sau khi lưu
      const t = await testProviderAction(provider.id);
      setTestResult(t);
      if (t.ok) {
        setTimeout(() => setOpen(false), 1200);
      }
    });
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => handleOpen(true)}>
        <Pencil className="h-3 w-3" />
      </Button>

      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>Chỉnh sửa {provider.label}</DialogTitle>
              <Badge variant="outline">{kindLabel[provider.kind] || provider.kind}</Badge>
            </div>
            <DialogDescription>
              Sửa key / cấu hình ngay tại chỗ. Để trống ô API key nếu không muốn đổi.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <ProviderFieldsForm
              meta={meta}
              values={values}
              onChange={setValues}
              mode="edit"
              maskedKey={provider.maskedKey}
            />

            <div className="space-y-2 pt-2 border-t border-border">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input accent-accent"
                  checked={setDefault}
                  onChange={(e) => setSetDefault(e.target.checked)}
                  disabled={provider.isDefault}
                />
                <Star className="h-3.5 w-3.5 text-amber-500" />
                Đặt làm mặc định cho {kindLabel[provider.kind] || provider.kind}
                {provider.isDefault && <span className="text-xs text-muted-foreground">(đang là default)</span>}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input accent-accent"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                Bật provider (enabled)
              </label>
            </div>

            {testResult && (
              <div
                className={`rounded-md p-3 flex items-center gap-2 text-sm ${
                  testResult.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                }`}
              >
                {testResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {testResult.ok ? `Đã lưu · kết nối OK · ${testResult.latencyMs}ms` : `Lỗi: ${testResult.error}`}
              </div>
            )}
          </div>

          <div className="flex justify-end mt-6">
            <Button variant="accent" onClick={handleSave} disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isPending ? "Đang lưu & test..." : "Lưu thay đổi"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
