"use client";
/**
 * Hook lịch đăng (Phase 5): danh sách export records + đặt thời điểm dự kiến
 * đăng từng nền tảng (lưu KV — auto-publish API là việc tương lai, D7 ghi rõ).
 */
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { CalendarClock } from "lucide-react";
import { scheduleExportAction } from "@/lib/export/actions";

type Item = {
  id: string;
  platform: string;
  topic: string;
  exportedAt: string;
  scheduledAt?: string;
};

const toLocalInput = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function ExportSchedule({ items: initial }: { items: Item[] }) {
  const [items, setItems] = useState(initial);
  const [isPending, startTransition] = useTransition();

  if (items.length === 0) return null;

  const setWhen = (id: string, local: string) =>
    startTransition(async () => {
      const iso = local ? new Date(local).toISOString() : null;
      const r = await scheduleExportAction(id, iso);
      if ("record" in r && r.record) {
        setItems((prev) => prev.map((it) => (it.id === id ? { ...it, scheduledAt: r.record.scheduledAt } : it)));
      }
    });

  return (
    <div className="rounded-xl border border-border p-4 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <CalendarClock className="h-4 w-4 text-accent" /> Lịch đăng
        <Badge variant="outline" className="text-[9px]">{items.filter((i) => i.scheduledAt).length}/{items.length} đã đặt lịch</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
            <Badge variant="accent" className="text-[9px] shrink-0">{it.platform}</Badge>
            <span className="text-[11px] truncate flex-1" title={it.topic}>{it.topic}</span>
            <input
              type="datetime-local"
              className="h-7 rounded-md border border-input bg-background px-2 text-[10px]"
              disabled={isPending}
              value={toLocalInput(it.scheduledAt)}
              onChange={(e) => setWhen(it.id, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
