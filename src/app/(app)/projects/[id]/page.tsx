import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, UserCircle2, FileText, Search } from "lucide-react";
import { store } from "@/lib/integration-hub/storage";
import { projectStore } from "@/lib/projects/storage";
import { scriptStore } from "@/lib/scripts/storage";
import { ProjectTopics, type DoneScript } from "@/components/projects/project-topics";
import { ProjectControls } from "@/components/projects/project-controls";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const reviewLabel: Record<string, string> = {
  draft: "Nháp",
  in_review: "Đang duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
  exported: "Đã xuất",
};

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await projectStore.get(id);
  if (!project) notFound();

  const profile = await store.getProfile(project.profileId);
  // Scripts thuộc project: ưu tiên theo scriptIds, fallback lọc theo projectId.
  const all = await scriptStore.list();
  const scripts = all.filter((s) => project.scriptIds.includes(s.id) || s.projectId === project.id);

  // Map topic -> script đã sinh (để hiện badge & link thay vì cho bấm lại)
  const doneByTopic: Record<string, DoneScript> = {};
  for (const s of scripts) {
    if (!doneByTopic[s.topic]) {
      doneByTopic[s.topic] = { id: s.id, score: s.audit?.score, reviewState: s.reviewState };
    }
  }

  return (
    <>
      <Topbar title={project.name} subtitle={`Content plan đã lưu · ${profile?.name || "Profile đã xóa"}`} />
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Link href="/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Tất cả projects
          </Link>
          <ProjectControls projectId={project.id} topicCount={project.topics.length} />
        </div>

        <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-100">
          <CardContent className="p-5 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <UserCircle2 className="h-4 w-4 text-indigo-600" />
              <span className="text-sm font-medium">{profile?.name || "Profile đã xóa"}</span>
            </div>
            <Badge variant="outline">{project.topics.length} chủ đề</Badge>
            <Badge variant="outline">{scripts.length} script</Badge>
            <span className="text-xs text-muted-foreground">Plan cost ${project.planCostUsd.toFixed(4)}</span>
          </CardContent>
        </Card>

        {(project.trendBrief || (project.trendSources && project.trendSources.length > 0)) && (
          <details className="rounded-md border border-border bg-muted/20 p-4">
            <summary className="cursor-pointer text-sm font-medium flex items-center gap-2 select-none">
              <Search className="h-4 w-4 text-indigo-500" />
              Nghiên cứu xu hướng (grounded)
              <Badge variant={project.trendSources && project.trendSources.length > 0 ? "success" : "outline"}>
                {project.trendSources?.length || 0} nguồn
              </Badge>
            </summary>
            <div className="mt-3 space-y-3">
              {project.trendSources && project.trendSources.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {project.trendSources.map((s, i) => (
                    <a
                      key={i}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-accent hover:underline line-clamp-1 max-w-xs"
                    >
                      {i + 1}. {s.title}
                    </a>
                  ))}
                </div>
              )}
              {project.trendBrief && (
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap max-h-72 overflow-y-auto font-sans leading-relaxed">
                  {project.trendBrief}
                </pre>
              )}
            </div>
          </details>
        )}

        <div>
          <h3 className="text-sm font-semibold mb-3">Chủ đề trong plan</h3>
          <ProjectTopics
            projectId={project.id}
            profileId={project.profileId}
            topics={project.topics}
            doneByTopic={doneByTopic}
          />
        </div>

        {scripts.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-3">Scripts trong project này</h3>
            <div className="space-y-2">
              {scripts.map((s) => (
                <Link key={s.id} href={`/scripts/${s.id}`}>
                  <Card className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4 flex items-center gap-3">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium flex-1 truncate">{s.topic}</span>
                      {typeof s.audit?.score === "number" && (
                        <Badge variant={s.audit.score >= 80 ? "success" : "outline"}>Audit {s.audit.score}</Badge>
                      )}
                      {s.reviewState && <Badge variant="outline">{reviewLabel[s.reviewState] || s.reviewState}</Badge>}
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {scripts.length > 0 && (
          <div className="rounded-md border border-border bg-muted/30 p-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Tiếp theo: mở <span className="font-medium text-foreground">Scripts</span> để tạo Voice & Render.
            </p>
            <Link href="/scripts" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
              Sang Scripts <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
