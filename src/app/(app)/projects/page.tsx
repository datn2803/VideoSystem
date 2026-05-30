import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FolderKanban, FileText, ListChecks, Calendar, ArrowRight } from "lucide-react";
import { store } from "@/lib/integration-hub/storage";
import { projectStore } from "@/lib/projects/storage";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { DeleteProjectButton } from "@/components/projects/project-actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; profile?: string }>;
}) {
  const sp = await searchParams;
  const profilesRaw = await store.listProfiles();
  const profiles = profilesRaw.map((p) => ({ id: p.id, name: p.name, role: p.role }));
  const profileName = (id: string) => profilesRaw.find((p) => p.id === id)?.name || "Profile đã xóa";

  const projects = (await projectStore.list()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <>
      <Topbar title="Projects" subtitle="Content plan đã lưu — mỗi project gom 1 profile + topics + scripts" />
      <div className="p-8 space-y-6">
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">{projects.length} project</p>
          <CreateProjectDialog
            profiles={profiles}
            autoOpen={sp.new === "1"}
            initialProfileId={sp.profile}
          />
        </div>

        {projects.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <FolderKanban className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Chưa có project nào</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Tạo project để AI sinh content plan từ profile của bạn — plan sẽ được lưu lại.
                </p>
              </div>
              <CreateProjectDialog profiles={profiles} initialProfileId={sp.profile} triggerLabel="Tạo project" />
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {projects.map((p) => (
              <Card key={p.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-indigo-100 text-indigo-700 shrink-0">
                        <FolderKanban className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold leading-snug truncate">{p.name}</h3>
                        <p className="text-xs text-muted-foreground truncate">{profileName(p.profileId)}</p>
                      </div>
                    </div>
                    <DeleteProjectButton projectId={p.id} name={p.name} />
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline">
                      <ListChecks className="h-3 w-3 mr-1" /> {p.topics.length} chủ đề
                    </Badge>
                    <Badge variant="outline">
                      <FileText className="h-3 w-3 mr-1" /> {p.scriptIds.length} script
                    </Badge>
                    <Badge variant="outline">
                      <Calendar className="h-3 w-3 mr-1" /> {p.createdAt.slice(0, 10)}
                    </Badge>
                  </div>

                  <div className="pt-2 border-t border-border">
                    <Link
                      href={`/projects/${p.id}`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
                    >
                      Mở project <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
