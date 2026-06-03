import { Topbar } from "@/components/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { listProvidersWithStatus } from "@/lib/integration-hub/actions";
import { AddProviderDialog } from "@/components/integrations/add-provider-dialog";
import { ImagePreviewDialog } from "@/components/integrations/image-preview-dialog";
import { ProviderRow } from "@/components/integrations/provider-row";
import { Sparkles, KeyRound, Activity } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function IntegrationsPage() {
  const providers = await listProvidersWithStatus();
  const totalCost = providers.reduce((s, p) => s + p.totalCost, 0);
  const totalRequests = providers.reduce((s, p) => s + p.totalRequests, 0);
  const connected = providers.filter((p) => p.hasKey).length;

  return (
    <>
      <Topbar title="Integrations" subtitle="Quản lý kết nối API tập trung — M0 Integration Hub" />
      <div className="p-8 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Tổng cost</p>
                  <p className="mt-2 text-2xl font-bold">${totalCost.toFixed(2)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Tích lũy từ tất cả provider</p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-100 text-emerald-600">
                  <Sparkles className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Provider đang kết nối</p>
                  <p className="mt-2 text-2xl font-bold">
                    {connected}/{providers.length || 0}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{providers.length - connected} chưa có key</p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-indigo-100 text-indigo-600">
                  <KeyRound className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Tổng API calls</p>
                  <p className="mt-2 text-2xl font-bold">{totalRequests}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Tất cả thời gian</p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-amber-100 text-amber-600">
                  <Activity className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Providers</h2>
            <p className="text-xs text-muted-foreground">
              Thêm API key cho từng dịch vụ. Key được mã hóa AES-256-GCM trước khi lưu.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ImagePreviewDialog />
            <AddProviderDialog />
          </div>
        </div>

        {providers.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <KeyRound className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Chưa có provider nào</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Thêm Claude/Gemini cho LLM, ElevenLabs cho TTS, HeyGen cho avatar...
                </p>
              </div>
              <div className="pt-2">
                <AddProviderDialog />
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {providers.map((p) => (
              <ProviderRow key={p.id} provider={p} />
            ))}
          </div>
        )}

        <Card className="bg-indigo-50/50 border-indigo-100">
          <CardContent className="p-4 text-sm space-y-1">
            <p className="font-semibold text-indigo-900">💡 Mẹo cho MVP free</p>
            <ul className="text-xs text-indigo-800 space-y-1 ml-4 list-disc">
              <li>Bắt đầu với <strong>Gemini 2.0 Flash</strong> (free 15 req/min) cho LLM trước khi mua Claude</li>
              <li><strong>ElevenLabs free tier</strong> cho 10k chars/tháng đủ test (dùng Voice ID giọng Việt cho tự nhiên)</li>
              <li><strong>Creatomate free tier</strong> 50 credits đủ cho 50 video render</li>
              <li><strong>HeyGen</strong> bắt buộc trả phí cho API ($99/tháng) — có thể skip nếu dùng footage thật cho C1</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
