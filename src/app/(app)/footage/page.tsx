import { Topbar } from "@/components/topbar";
import { store } from "@/lib/integration-hub/storage";
import { footageStore, getDefaultProfileId } from "@/lib/footage/storage";
import { FootageUploadForm } from "@/components/footage/upload-form";
import { FootageGrid } from "@/components/footage/footage-grid";

export const dynamic = "force-dynamic";

export default async function FootagePage() {
  const profiles = (await store.listProfiles()).map((p) => ({ id: p.id, name: `${p.name} — ${p.role}` }));
  const defaultProfileId = await getDefaultProfileId();
  const assets = defaultProfileId ? await footageStore.listByProfile(defaultProfileId) : [];

  return (
    <>
      <Topbar
        title="Footage Library"
        subtitle="Upload raw shot, gắn tag, sẵn sàng cho Video Assembler"
      />
      <div className="p-8 space-y-6">
        <FootageUploadForm profiles={profiles} defaultProfileId={defaultProfileId} />
        <FootageGrid assets={assets} />
      </div>
    </>
  );
}
