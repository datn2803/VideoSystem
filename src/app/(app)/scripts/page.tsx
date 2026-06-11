import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { scriptStore } from "@/lib/scripts/storage";
import { store } from "@/lib/integration-hub/storage";
import { ScriptFromLink } from "@/components/scripts/script-from-link";
import { FileText, ShieldCheck, ShieldAlert, ShieldX, Flame, ClipboardCheck, CheckCircle2, XCircle } from "lucide-react";

const REVIEW_BADGE: Record<string, { label: string; variant: "outline" | "warning" | "success" | "destructive" | "accent"; icon?: typeof CheckCircle2 }> = {
  draft: { label: "Draft", variant: "outline" },
  in_review: { label: "In Review", variant: "warning", icon: ClipboardCheck },
  approved: { label: "Approved", variant: "success", icon: CheckCircle2 },
  rejected: { label: "Rejected", variant: "destructive", icon: XCircle },
  exported: { label: "Exported", variant: "accent", icon: CheckCircle2 },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function ScriptsPage() {
  const scripts = (await scriptStore.list()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const profilesById = Object.fromEntries((await store.listProfiles()).map((p) => [p.id, p]));

  return (
    <>
      <Topbar title="Scripts" subtitle="Tất cả script đã sinh + kết quả audit" />
      <div className="p-8 space-y-4">
        <ScriptFromLink profiles={Object.values(profilesById).map((p) => ({ id: p.id, name: p.name }))} />
        {scripts.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center space-y-3">
              <FileText className="h-8 w-8 mx-auto text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Chưa có script nào</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Vào <Link href="/projects" className="text-accent underline">Projects</Link> và click "Sinh script" trên 1 chủ đề
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {scripts.map((s) => {
              const StatusIcon =
                s.audit?.status === "pass"
                  ? ShieldCheck
                  : s.audit?.status === "fail"
                  ? ShieldX
                  : ShieldAlert;
              const statusColor =
                s.audit?.status === "pass"
                  ? "text-emerald-500"
                  : s.audit?.status === "fail"
                  ? "text-rose-500"
                  : "text-amber-500";
              const profile = profilesById[s.profileId];
              const reviewBadge = REVIEW_BADGE[s.reviewState || "draft"];
              const ReviewIcon = reviewBadge.icon;
              return (
                <Link key={s.id} href={`/scripts/${s.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-indigo-100 text-indigo-600">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm truncate">{s.topic}</h3>
                          <Badge variant={reviewBadge.variant} className="text-[10px]">
                            {ReviewIcon && <ReviewIcon className="h-2.5 w-2.5 mr-1" />}
                            {reviewBadge.label}
                          </Badge>
                          {s.audit && (
                            <Badge
                              variant={
                                s.audit.status === "pass"
                                  ? "success"
                                  : s.audit.status === "fail"
                                  ? "destructive"
                                  : "warning"
                              }
                              className="text-[10px]"
                            >
                              <StatusIcon className={`h-2.5 w-2.5 mr-1 ${statusColor}`} />
                              {s.audit.score}/100
                            </Badge>
                          )}
                          {s.priority && (
                            <div className="flex items-center gap-0.5">
                              {Array.from({ length: s.priority }).map((_, k) => (
                                <Flame key={k} className="h-3 w-3 text-amber-500 fill-amber-500" />
                              ))}
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          {profile?.name} · {s.painPoint}
                        </p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <div>v{s.version} · {s.script.estimatedDurationSec}s</div>
                        <div>{new Date(s.createdAt).toLocaleString("vi-VN")}</div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
