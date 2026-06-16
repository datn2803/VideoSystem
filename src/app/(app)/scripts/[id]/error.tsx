"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Error boundary trang script (Next.js). Lỗi render (vd action tốn tiền ném ra mà chưa bắt) → hiện
 * message + nút "Thử lại" thay vì màn "Server Components render" cryptic làm tưởng hỏng nặng.
 * ⚠ Ở production, message lỗi SERVER bị Next redact (chỉ còn digest) → các action voice/render đã
 * chuyển sang return {error} để giữ message; boundary này là lưới an toàn cho lỗi render còn sót.
 */
export default function ScriptError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[scripts/[id]] render error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-red-500">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Có lỗi khi tải / xử lý trang script</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {error?.message || "Lỗi không xác định (message bị ẩn ở production). Thử lại; nếu lặp lại, kiểm tra quota/credit provider hoặc trần chi phí/ngày."}
        </p>
        {error?.digest ? <p className="text-xs text-muted-foreground/70">Mã lỗi: {error.digest}</p> : null}
      </div>
      <button
        onClick={() => reset()}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        <RotateCcw className="h-4 w-4" /> Thử lại
      </button>
    </div>
  );
}
