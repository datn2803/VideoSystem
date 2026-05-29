import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VideoSystem — Content Automation",
  description: "Hệ thống dây chuyền sản xuất nội dung video tự động hóa",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
