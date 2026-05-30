"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const STEPS = [
  { href: "/settings/integrations", label: "Integrations" },
  { href: "/profiles", label: "Profiles" },
  { href: "/footage", label: "Footage", optional: true },
  { href: "/projects", label: "Plan" },
  { href: "/scripts", label: "Scripts" },
  { href: "/review", label: "Review" },
  { href: "/export", label: "Export" },
];

export function WorkflowStepper() {
  const pathname = usePathname();
  const activeIdx = STEPS.reduce(
    (acc, s, i) => (pathname === s.href || pathname.startsWith(s.href + "/") ? i : acc),
    -1
  );

  return (
    <nav className="flex items-center gap-1 overflow-x-auto border-b border-border bg-card px-8 py-2 text-xs">
      {STEPS.map((s, i) => {
        const active = i === activeIdx;
        return (
          <div key={s.href} className="flex items-center gap-1 shrink-0">
            {i > 0 && <span className="text-muted-foreground/40">›</span>}
            <Link
              href={s.href}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors",
                active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-full text-[10px]",
                  active ? "bg-accent-foreground/20" : "bg-muted"
                )}
              >
                {i + 1}
              </span>
              {s.label}
              {s.optional && <span className="text-[9px] opacity-60">(tùy chọn)</span>}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
