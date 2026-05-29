"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, KeyRound, ExternalLink, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { PROVIDER_CATALOG } from "@/lib/integration-hub/catalog";
import type { ProviderMeta, ProviderName } from "@/lib/integration-hub/types";
import { addProviderAction, testProviderAction } from "@/lib/integration-hub/actions";

const kindLabel: Record<string, string> = {
  llm: "LLM",
  tts: "TTS / Voice",
  avatar: "Avatar",
  render: "Render",
  storage: "Storage",
  publish: "Publish",
};

export function AddProviderDialog() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ProviderMeta | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; latencyMs?: number } | null>(null);
  const [isPending, startTransition] = useTransition();

  const reset = () => {
    setSelected(null);
    setFormData({});
    setTestResult(null);
  };

  const handleAdd = () => {
    if (!selected) return;
    startTransition(async () => {
      const { apiKey, ...config } = formData;
      const result = await addProviderAction({ name: selected.name as ProviderName, apiKey, config });
      // Auto-test after add
      const t = await testProviderAction(result.id);
      setTestResult(t);
      if (t.ok) {
        setTimeout(() => {
          reset();
          setOpen(false);
        }, 1500);
      }
    });
  };

  const grouped = PROVIDER_CATALOG.reduce<Record<string, ProviderMeta[]>>((acc, p) => {
    (acc[p.kind] = acc[p.kind] || []).push(p);
    return acc;
  }, {});

  return (
    <>
      <Button variant="accent" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add provider
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="max-w-2xl">
          {!selected ? (
            <>
              <DialogHeader>
                <DialogTitle>Chọn provider</DialogTitle>
                <DialogDescription>Chọn dịch vụ bạn muốn kết nối vào Integration Hub</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                {Object.entries(grouped).map(([kind, items]) => (
                  <div key={kind} className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
                      {kindLabel[kind] || kind}
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      {items.map((p) => (
                        <button
                          key={p.name}
                          onClick={() => setSelected(p)}
                          className="flex items-center gap-3 rounded-md border border-border p-3 text-left hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
                            <KeyRound className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">{p.label}</div>
                            <div className="text-[10px] text-muted-foreground">{p.homepage.replace(/^https?:\/\//, "")}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <DialogTitle>{selected.label}</DialogTitle>
                  <Badge variant="outline">{kindLabel[selected.kind]}</Badge>
                </div>
                <DialogDescription>
                  Lấy API key tại{" "}
                  <a href={selected.homepage} target="_blank" rel="noreferrer" className="text-accent inline-flex items-center gap-1 hover:underline">
                    {selected.homepage.replace(/^https?:\/\//, "")}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                {selected.fields.map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <label className="text-sm font-medium">
                      {f.label} {f.required && <span className="text-rose-500">*</span>}
                    </label>
                    {f.type === "select" ? (
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        value={formData[f.key] || (selected.defaultConfig?.[f.key] as string) || ""}
                        onChange={(e) => setFormData({ ...formData, [f.key]: e.target.value })}
                      >
                        <option value="">— Chọn —</option>
                        {f.options?.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        type={f.type}
                        placeholder={f.placeholder}
                        value={formData[f.key] || ""}
                        onChange={(e) => setFormData({ ...formData, [f.key]: e.target.value })}
                      />
                    )}
                  </div>
                ))}

                {testResult && (
                  <div
                    className={`rounded-md p-3 flex items-center gap-2 text-sm ${
                      testResult.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                    }`}
                  >
                    {testResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    {testResult.ok
                      ? `Kết nối thành công · ${testResult.latencyMs}ms`
                      : `Lỗi: ${testResult.error}`}
                  </div>
                )}
              </div>

              <div className="flex justify-between mt-6">
                <Button variant="ghost" onClick={() => reset()}>
                  ← Chọn provider khác
                </Button>
                <Button variant="accent" onClick={handleAdd} disabled={isPending || !formData.apiKey}>
                  {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isPending ? "Đang kiểm tra..." : "Lưu & Test connection"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
