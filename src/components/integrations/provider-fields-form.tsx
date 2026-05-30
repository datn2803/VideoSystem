"use client";
import { Input } from "@/components/ui/input";
import type { ProviderMeta } from "@/lib/integration-hub/types";

/**
 * Form render các field của provider — dùng chung cho Add và Edit.
 * Khác biệt mode "edit" cho field apiKey (password): KHÔNG điền key thật,
 * placeholder = key đang dùng (mask) + helper "Để trống = giữ key hiện tại".
 */
export function ProviderFieldsForm({
  meta,
  values,
  onChange,
  mode,
  maskedKey,
}: {
  meta: ProviderMeta;
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  mode: "add" | "edit";
  maskedKey?: string;
}) {
  const set = (key: string, val: string) => onChange({ ...values, [key]: val });

  return (
    <div className="space-y-3">
      {meta.fields.map((f) => (
        <div key={f.key} className="space-y-1.5">
          <label className="text-sm font-medium">
            {f.label} {f.required && mode === "add" && <span className="text-rose-500">*</span>}
          </label>
          {f.type === "select" ? (
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              value={values[f.key] || (meta.defaultConfig?.[f.key] as string) || ""}
              onChange={(e) => set(f.key, e.target.value)}
            >
              <option value="">— Chọn —</option>
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : f.type === "toggle" ? (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input accent-accent"
                checked={(values[f.key] ?? String(meta.defaultConfig?.[f.key] ?? "false")) === "true"}
                onChange={(e) => set(f.key, e.target.checked ? "true" : "false")}
              />
              {f.placeholder || "Bật"}
            </label>
          ) : f.type === "number" ? (
            <Input
              type="number"
              step="0.05"
              min="0"
              max="1"
              placeholder={f.placeholder}
              value={values[f.key] ?? String(meta.defaultConfig?.[f.key] ?? "")}
              onChange={(e) => set(f.key, e.target.value)}
            />
          ) : f.type === "password" && mode === "edit" ? (
            <>
              <Input
                type="password"
                placeholder={maskedKey || f.placeholder}
                value={values[f.key] || ""}
                onChange={(e) => set(f.key, e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Để trống = giữ key hiện tại</p>
            </>
          ) : (
            <Input
              type={f.type}
              placeholder={f.placeholder}
              value={values[f.key] || ""}
              onChange={(e) => set(f.key, e.target.value)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
