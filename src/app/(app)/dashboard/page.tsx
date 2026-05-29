import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Video,
  CircleDollarSign,
  UserCircle2,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ArrowRight,
} from "lucide-react";
import { store } from "@/lib/integration-hub/storage";
import { hub } from "@/lib/integration-hub/hub";
import { scriptStore } from "@/lib/scripts/storage";
import { footageStore } from "@/lib/footage/storage";
import { audioStore } from "@/lib/audio/storage";
import { videoStore } from "@/lib/video/storage";
import { exportStore } from "@/lib/export/storage";
import { IS_SERVERLESS } from "@/lib/paths";
import { isSupabaseConfigured } from "@/lib/backend/supabase-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [profiles, providers, usage, scripts, footage, audios, videos, exports, hubStatus] = await Promise.all([
    store.listProfiles(),
    store.listProviders(),
    store.listUsage(),
    scriptStore.list(),
    footageStore.listAll(),
    audioStore.list(),
    videoStore.list(),
    exportStore.list(),
    hub.status(),
  ]);
  const videosDone = videos.filter((v) => v.status === "done").length;
  const exportedScripts = scripts.filter((s) => s.reviewState === "exported").length;
  const totalCost = usage.reduce((s, u) => s + u.costEstimateUsd, 0);
  const totalRequests = usage.reduce((s, u) => s + u.requestCount, 0);
  const passedScripts = scripts.filter((s) => s.audit?.status === "pass").length;

  const approvedScripts = scripts.filter((s) => s.reviewState === "approved").length;
  const inReviewScripts = scripts.filter((s) => s.reviewState === "in_review").length;
  const stats = [
    { label: "Scripts", value: String(scripts.length), trend: `${passedScripts} pass · ${approvedScripts} approved`, icon: TrendingUp, color: "text-amber-600 bg-amber-100" },
    { label: "In review", value: String(inReviewScripts), trend: `${exportedScripts} exported`, icon: UserCircle2, color: "text-indigo-600 bg-indigo-100" },
    { label: "Videos rendered", value: `${videosDone}/${videos.length}`, trend: `${audios.length} audio · ${footage.length} footage`, icon: Video, color: "text-rose-600 bg-rose-100" },
    { label: "Cost", value: `$${totalCost.toFixed(2)}`, trend: `${totalRequests} API calls · ${exports.length} exports`, icon: CircleDollarSign, color: "text-emerald-600 bg-emerald-100" },
  ];

  const kindLabel: Record<string, string> = { llm: "LLM", tts: "TTS", avatar: "Avatar", render: "Render" };
  const requiredKinds: Array<"llm" | "tts" | "avatar" | "render"> = ["llm", "tts", "avatar", "render"];

  return (
    <>
      <Topbar title="Dashboard" subtitle="Tổng quan hệ thống sản xuất nội dung" />
      <div className="p-8 space-y-6">
        {IS_SERVERLESS && !isSupabaseConfigured() && (
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3 flex items-start gap-2 text-sm">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-amber-900">⚡ Demo mode trên Vercel — data ephemeral</p>
              <p className="text-xs text-amber-800 mt-1">
                Dữ liệu lưu tại /tmp có thể mất giữa các cold start. Xem <code className="bg-amber-100 px-1 rounded">supabase/SETUP.md</code> để wire Supabase persist data vĩnh viễn.
              </p>
            </div>
          </div>
        )}
        {IS_SERVERLESS && isSupabaseConfigured() && (
          <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 flex items-start gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-emerald-900">✓ Supabase đã kết nối — data persist vĩnh viễn</p>
              <p className="text-xs text-emerald-800 mt-1">
                Metadata lưu trong Postgres, file binary trong Storage buckets. Không lo mất data qua cold start.
              </p>
            </div>
          </div>
        )}
        <div className="grid grid-cols-4 gap-4">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <Card key={s.label}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
                      <p className="mt-2 text-2xl font-bold">{s.value}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{s.trend}</p>
                    </div>
                    <div className={`flex h-9 w-9 items-center justify-center rounded-md ${s.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline sẵn sàng</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-4 gap-3">
              {requiredKinds.map((kind) => {
                const provider = hubStatus.byKind[kind];
                const ready = !!provider;
                return (
                  <div
                    key={kind}
                    className={`rounded-md border p-4 ${
                      ready ? "border-emerald-200 bg-emerald-50/50" : "border-zinc-200 bg-zinc-50/50"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {ready ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-zinc-400" />
                      )}
                      <span className="text-xs font-semibold uppercase tracking-wide">{kindLabel[kind]}</span>
                    </div>
                    <p className="text-sm font-medium">{provider?.label || "Chưa cấu hình"}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {ready ? "Default provider" : "Cần thêm để pipeline chạy"}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-6">
          <Card className="col-span-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Bắt đầu nhanh</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link href="/settings/integrations" className="block">
                <div className="flex items-center justify-between rounded-md border border-border p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-indigo-100 text-indigo-600 text-sm font-bold">
                      1
                    </div>
                    <div>
                      <p className="text-sm font-medium">Kết nối API providers</p>
                      <p className="text-xs text-muted-foreground">
                        Thêm key cho LLM / TTS / Avatar / Render qua Integration Hub
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {providers.length > 0 ? (
                      <Badge variant="success">{providers.length} đã thêm</Badge>
                    ) : (
                      <Badge variant="warning">Chưa có</Badge>
                    )}
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </Link>

              <Link href="/profiles" className="block">
                <div className="flex items-center justify-between rounded-md border border-border p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-purple-100 text-purple-600 text-sm font-bold">
                      2
                    </div>
                    <div>
                      <p className="text-sm font-medium">Tạo profile chuyên môn</p>
                      <p className="text-xs text-muted-foreground">
                        Profile sẽ là input cho Content Planner Agent
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {profiles.length > 0 ? (
                      <Badge variant="success">{profiles.length} profile</Badge>
                    ) : (
                      <Badge variant="outline">Chưa có</Badge>
                    )}
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </Link>

              <Link href="/footage" className="block">
                <div className="flex items-center justify-between rounded-md border border-border p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-100 text-emerald-600 text-sm font-bold">
                      3
                    </div>
                    <div>
                      <p className="text-sm font-medium">Upload raw footage</p>
                      <p className="text-xs text-muted-foreground">
                        Upload các shot quay sẵn và gắn tag (intro/talk/broll/cta)
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>

              <Link href="/projects" className="block">
                <div className="flex items-center justify-between rounded-md border border-border p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-100 text-amber-600 text-sm font-bold">
                      4
                    </div>
                    <div>
                      <p className="text-sm font-medium">Sinh content calendar</p>
                      <p className="text-xs text-muted-foreground">AI Planner sinh 12 chủ đề từ profile</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Integration status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {providers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Chưa có provider nào. Bắt đầu từ Integration Hub.
                </p>
              ) : (
                providers.slice(0, 5).map((p) => (
                  <div key={p.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span className="text-sm font-medium truncate">{p.label}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">{p.kind.toUpperCase()}</Badge>
                  </div>
                ))
              )}
              <Link href="/settings/integrations">
                <Button variant="outline" size="sm" className="w-full mt-2">
                  Quản lý integrations
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
