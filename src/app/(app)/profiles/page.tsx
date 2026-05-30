import { Topbar } from "@/components/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { store } from "@/lib/integration-hub/storage";
import { CreateProfileDialog } from "@/components/profiles/create-profile-dialog";
import { GenerateSampleButton, DeleteProfileButton } from "@/components/profiles/profile-actions";
import { UserCircle2, Briefcase, Target, Mic, Award, Users } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function ProfilesPage() {
  const profiles = await store.listProfiles();

  return (
    <>
      <Topbar title="Profiles" subtitle="Quản lý profile chuyên môn của bạn" />
      <div className="p-8 space-y-6">
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">{profiles.length} profile đang hoạt động</p>
          <CreateProfileDialog />
        </div>

        {profiles.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <UserCircle2 className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Chưa có profile nào</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Click "Tạo demo" để có ngay 1 profile Personal Banker mẫu, hoặc "Tạo profile mới"
                </p>
              </div>
              <CreateProfileDialog />
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {profiles.map((p) => (
              <Card key={p.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-lg font-semibold shrink-0">
                      {p.name.split(" ").pop()?.charAt(0) || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold">{p.name}</h3>
                      <p className="text-sm text-muted-foreground">{p.role}</p>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <Badge variant="accent">{p.industry.replace("_", " ")}</Badge>
                        {p.expertise?.yearsExp && <Badge variant="outline">{p.expertise.yearsExp} năm KN</Badge>}
                        {p.voiceSampleUrl && <Badge variant="success">Voice clone</Badge>}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    {p.audience?.segment && (
                      <div className="flex items-start gap-2">
                        <Users className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <span className="text-muted-foreground shrink-0">Audience:</span>
                        <span className="line-clamp-2">{p.audience.segment}</span>
                      </div>
                    )}
                    {p.expertise?.products && p.expertise.products.length > 0 && (
                      <div className="flex items-start gap-2">
                        <Briefcase className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <span className="text-muted-foreground shrink-0">Sản phẩm:</span>
                        <span className="line-clamp-1">{p.expertise.products.join(", ")}</span>
                      </div>
                    )}
                    {p.audience?.painPoints && p.audience.painPoints.length > 0 && (
                      <div className="flex items-start gap-2">
                        <Target className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <span className="text-muted-foreground shrink-0">Pain:</span>
                        <span className="line-clamp-2">{p.audience.painPoints.slice(0, 2).join("; ")}</span>
                      </div>
                    )}
                    {p.tone?.voice && (
                      <div className="flex items-start gap-2">
                        <Mic className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <span className="text-muted-foreground shrink-0">Tone:</span>
                        <span className="line-clamp-1">{p.tone.voice}</span>
                      </div>
                    )}
                    {p.usp && (
                      <div className="flex items-start gap-2">
                        <Award className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <span className="text-muted-foreground shrink-0">USP:</span>
                        <span className="line-clamp-2">{p.usp}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 pt-2 border-t border-border">
                    <DeleteProfileButton profileId={p.id} name={p.name} />
                    <GenerateSampleButton profileId={p.id} />
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
