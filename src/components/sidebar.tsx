"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  UserCircle2,
  Film,
  FolderKanban,
  ClipboardCheck,
  Download,
  Settings,
  Sparkles,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/profiles", label: "Profiles", icon: UserCircle2 },
  { href: "/footage", label: "Footage Library", icon: Film },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/scripts", label: "Scripts", icon: FileText },
  { href: "/review", label: "Review", icon: ClipboardCheck },
  { href: "/export", label: "Export", icon: Download },
];

const bottom = [{ href: "/settings/integrations", label: "Integrations", icon: Settings }];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-card">
      <div className="flex items-center gap-2 px-6 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight">VideoSystem</div>
          <div className="text-xs text-muted-foreground leading-tight">Content Automation</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-muted"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border px-3 py-3 space-y-1">
        {bottom.map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-muted"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
        <div className="flex items-center gap-3 rounded-md px-3 py-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold">PB</div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">Personal Banker</div>
            <div className="text-[10px] text-muted-foreground truncate">demo@videosystem.app</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
