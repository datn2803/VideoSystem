import { Topbar } from "@/components/topbar";
import { store } from "@/lib/integration-hub/storage";
import { PlannerRunner } from "@/components/projects/planner-runner";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const profiles = (await store.listProfiles()).map((p) => ({ id: p.id, name: p.name, role: p.role }));

  return (
    <>
      <Topbar title="Projects" subtitle="Content calendar sinh bởi AI Planner" />
      <div className="p-8">
        <PlannerRunner profiles={profiles} />
      </div>
    </>
  );
}
