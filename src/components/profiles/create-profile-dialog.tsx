"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { createProfileAction, seedDemoProfileAction } from "@/lib/profiles/actions";

export function CreateProfileDialog() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    name: "",
    role: "",
    yearsExp: "5",
    products: "",
    audienceSegment: "",
    painPoints: "",
    goals: "",
    toneVoice: "Chuyên nghiệp, đáng tin cậy, gần gũi",
    usp: "",
  });

  const handleSubmit = () => {
    startTransition(async () => {
      await createProfileAction({
        name: form.name,
        role: form.role,
        yearsExp: parseInt(form.yearsExp) || 0,
        products: form.products.split(",").map((s) => s.trim()).filter(Boolean),
        audienceSegment: form.audienceSegment,
        painPoints: form.painPoints.split("\n").map((s) => s.trim()).filter(Boolean),
        goals: form.goals.split("\n").map((s) => s.trim()).filter(Boolean),
        toneVoice: form.toneVoice,
        usp: form.usp,
      });
      setOpen(false);
    });
  };

  const handleSeedDemo = () => {
    startTransition(async () => {
      await seedDemoProfileAction();
      setOpen(false);
    });
  };

  return (
    <>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleSeedDemo} disabled={isPending}>
          <Sparkles className="h-4 w-4" /> Tạo demo
        </Button>
        <Button variant="accent" size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Tạo profile mới
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Tạo profile chuyên gia</DialogTitle>
            <DialogDescription>
              Profile này là input cho Content Planner Agent sinh content calendar
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Họ tên *</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nguyễn Hoàng Anh" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Vị trí / Ngân hàng *</label>
                <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Personal Banker — VPBank" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Năm kinh nghiệm</label>
                <Input type="number" value={form.yearsExp} onChange={(e) => setForm({ ...form, yearsExp: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Sản phẩm phụ trách</label>
                <Input value={form.products} onChange={(e) => setForm({ ...form, products: e.target.value })} placeholder="Tiết kiệm, Thẻ TD, Vay mua nhà" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Audience (mô tả khách hàng mục tiêu)</label>
              <Textarea
                value={form.audienceSegment}
                onChange={(e) => setForm({ ...form, audienceSegment: e.target.value })}
                placeholder="Khách hàng cá nhân 28-45 tuổi, thu nhập 15-50tr..."
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Pain points (mỗi dòng 1 ý)</label>
                <Textarea
                  value={form.painPoints}
                  onChange={(e) => setForm({ ...form, painPoints: e.target.value })}
                  placeholder="Không biết gửi tiết kiệm ở đâu&#10;Sợ bị lừa thẻ tín dụng"
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Goals của audience</label>
                <Textarea
                  value={form.goals}
                  onChange={(e) => setForm({ ...form, goals: e.target.value })}
                  placeholder="Tiết kiệm an toàn&#10;Mua nhà trong 3-5 năm"
                  rows={3}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Tone voice</label>
              <Input value={form.toneVoice} onChange={(e) => setForm({ ...form, toneVoice: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">USP (điểm khác biệt)</label>
              <Textarea
                value={form.usp}
                onChange={(e) => setForm({ ...form, usp: e.target.value })}
                placeholder="5 năm tư vấn cá nhân hóa, đã hỗ trợ 500+ khách hàng..."
                rows={2}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button variant="accent" onClick={handleSubmit} disabled={isPending || !form.name || !form.role}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isPending ? "Đang tạo..." : "Tạo profile"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
