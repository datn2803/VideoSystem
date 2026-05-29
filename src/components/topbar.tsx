"use client";
import { Search, Bell, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-border bg-card px-8 py-4">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            placeholder="Tìm kiếm..."
            className="h-9 w-64 rounded-md border border-input bg-background pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </div>
        <Button variant="ghost" size="icon">
          <Bell className="h-4 w-4" />
        </Button>
        <Button variant="accent" size="sm">
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>
    </header>
  );
}
