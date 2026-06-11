"use client";
/**
 * BrandKit panel (Design Director — Tầng 2) trên card profile.
 * Hiển thị swatch + hệ đã chọn; cho Tommy: đổi hệ (15 hệ vendor), đổi accent,
 * đổi skin, hoặc để Director tự sinh lại. Token chảy thẳng vào render C2/C3.
 */
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Palette, RefreshCw } from "lucide-react";
import type { BrandKit, StyleVariant } from "@/lib/design/brandkit";
import {
  chooseBrandSystemAction,
  regenerateBrandKitAction,
  updateBrandTokensAction,
} from "@/lib/design/actions";

const STYLE_LABEL: Record<StyleVariant, string> = {
  classic: "Classic (bento)",
  poster: "Poster (đậm)",
  editorial: "Editorial (tạp chí)",
};

export function BrandKitPanel({
  profileId,
  kit: initial,
  systems,
}: {
  profileId: string;
  kit: BrandKit | null;
  systems: { id: string; name: string; mode: string }[];
}) {
  const [kit, setKit] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const apply = (fn: () => Promise<{ kit?: BrandKit; error?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      if (r.kit) setKit(r.kit);
      else if (r.error) alert(r.error);
    });

  if (!kit) {
    return (
      <div className="rounded-lg border border-border p-3">
        <Button variant="outline" size="sm" disabled={isPending} onClick={() => apply(() => regenerateBrandKitAction(profileId))}>
          <Palette className="h-3.5 w-3.5" /> Tạo BrandKit
        </Button>
      </div>
    );
  }

  const t = kit.tokens;
  const swatches: [string, string][] = [
    ["bg1", t.bg1], ["bg2", t.bg2], ["card", t.card], ["ink", t.ink], ["accent", t.accent], ["accent2", t.accent2],
  ];

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <button className="flex items-center gap-2 text-xs font-medium" onClick={() => setOpen(!open)}>
          <Palette className="h-3.5 w-3.5 text-muted-foreground" />
          BrandKit
          <Badge variant="outline" className="text-[9px]">{kit.systemId}</Badge>
          <Badge variant={t.mode === "dark" ? "accent" : "outline"} className="text-[9px]">{t.mode}</Badge>
          {kit.overridden && <Badge variant="outline" className="text-[9px]">đã sửa tay</Badge>}
        </button>
        <div className="flex gap-1">
          {swatches.map(([k, c]) => (
            <span key={k} title={`${k}: ${c}`} className="h-4 w-4 rounded-full border border-border" style={{ background: c }} />
          ))}
        </div>
      </div>

      {open && (
        <div className="space-y-2 pt-1 border-t border-border">
          <p className="text-[10px] text-muted-foreground">{kit.rationale}</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] space-y-1">
              <span className="text-muted-foreground">Design system</span>
              <select
                className="flex h-7 w-full rounded-md border border-input bg-background px-2 text-[11px]"
                value={kit.systemId}
                disabled={isPending}
                onChange={(e) => apply(() => chooseBrandSystemAction(profileId, e.target.value))}
              >
                {systems.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.mode})</option>
                ))}
              </select>
            </label>
            <label className="text-[10px] space-y-1">
              <span className="text-muted-foreground">Skin bố cục</span>
              <select
                className="flex h-7 w-full rounded-md border border-input bg-background px-2 text-[11px]"
                value={t.styleVariant}
                disabled={isPending}
                onChange={(e) => apply(() => updateBrandTokensAction(profileId, { styleVariant: e.target.value as StyleVariant }))}
              >
                {(Object.keys(STYLE_LABEL) as StyleVariant[]).map((s) => (
                  <option key={s} value={s}>{STYLE_LABEL[s]}</option>
                ))}
              </select>
            </label>
            <label className="text-[10px] space-y-1">
              <span className="text-muted-foreground">Accent</span>
              <input
                type="color"
                className="h-7 w-full rounded-md border border-input bg-background"
                value={t.accent}
                disabled={isPending}
                onChange={(e) => apply(() => updateBrandTokensAction(profileId, { accent: e.target.value }))}
              />
            </label>
            <label className="text-[10px] space-y-1">
              <span className="text-muted-foreground">Accent 2</span>
              <input
                type="color"
                className="h-7 w-full rounded-md border border-input bg-background"
                value={t.accent2}
                disabled={isPending}
                onChange={(e) => apply(() => updateBrandTokensAction(profileId, { accent2: e.target.value }))}
              />
            </label>
          </div>
          <Button variant="outline" size="sm" className="h-7 text-[10px]" disabled={isPending}
            onClick={() => apply(() => regenerateBrandKitAction(profileId))}>
            <RefreshCw className="h-3 w-3" /> Director sinh lại (bỏ sửa tay)
          </Button>
        </div>
      )}
    </div>
  );
}
