import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Mail } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Sparkles className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold">VideoSystem</h1>
          <p className="text-sm text-muted-foreground">Đăng nhập để bắt đầu sản xuất nội dung</p>
        </div>

        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input type="email" placeholder="banker@example.com" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Mật khẩu</label>
              <Input type="password" placeholder="••••••••" />
            </div>
            <Link href="/dashboard" className="block">
              <Button variant="accent" className="w-full">
                Đăng nhập
              </Button>
            </Link>
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">hoặc</span>
              </div>
            </div>
            <Button variant="outline" className="w-full">
              <Mail className="h-4 w-4" /> Magic link qua email
            </Button>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          MVP demo — auth thật sẽ kết nối Supabase khi có API keys
        </p>
      </div>
    </div>
  );
}
