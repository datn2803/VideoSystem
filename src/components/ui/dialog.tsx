"use client";
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type DialogContextType = { open: boolean; setOpen: (o: boolean) => void };
const Ctx = React.createContext<DialogContextType | null>(null);

export function Dialog({ open, onOpenChange, children }: { open: boolean; onOpenChange: (o: boolean) => void; children: React.ReactNode }) {
  return (
    <Ctx.Provider value={{ open, setOpen: onOpenChange }}>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
          <div className="relative">{children}</div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function DialogContent({ className, children }: { className?: string; children: React.ReactNode }) {
  const ctx = React.useContext(Ctx);
  return (
    <div className={cn("relative z-10 w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-lg", className)}>
      <button
        onClick={() => ctx?.setOpen(false)}
        className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>
      {children}
    </div>
  );
}

export function DialogHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("space-y-1.5 mb-4", className)}>{children}</div>;
}

export function DialogTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("text-lg font-semibold", className)}>{children}</h2>;
}

export function DialogDescription({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-sm text-muted-foreground", className)}>{children}</p>;
}
