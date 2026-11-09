"use client";

import { LogOut } from "lucide-react";
import type { UserDTO } from "@/lib/types";
import { Logo, RoleBadge } from "./ui";

export function TopNav({ user, onLogout }: { user: UserDTO; onLogout: () => void }) {
  const initials = user.name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .slice(0, 2)
    .join("");

  return (
    <header className="sticky top-0 z-30 backdrop-blur bg-app/80 border-b border-line">
      <div className="max-w-7xl mx-auto px-5 py-3 flex items-center justify-between gap-4">
        <Logo size="sm" />
        <div className="flex items-center gap-3">
          <div className="hidden md:flex flex-col items-end leading-tight">
            <span className="text-sm font-semibold text-ink">{user.name}</span>
            <div className="mt-0.5">
              <RoleBadge role={user.role} trayecto={user.trayecto} />
            </div>
          </div>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-cyan-400 flex items-center justify-center text-white font-bold text-sm shadow-lg">
            {initials || "U"}
          </div>
          <button
            onClick={onLogout}
            titulo="Cerrar sesión"
            aria-label="Cerrar sesión"
            className="w-10 h-10 rounded-lg bg-card2 border border-line flex items-center justify-center text-muted hover:text-red-500 hover:border-red-500/40 transition"
          >
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </header>
  );
}
