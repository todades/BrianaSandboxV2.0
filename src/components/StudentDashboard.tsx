"use client";

import { useCallback, useEffect, useState } from "react";
import { BookMarked, FolderOpen, Sparkles, FileText, ChevronRight, RefreshCw } from "lucide-react";
import { api } from "@/lib/api-client";
import type { ProjectDTO, UserDTO } from "@/lib/types";
import { TopNav } from "./TopNav";
import { SandboxPanel } from "./SandboxPanel";
import { ProjectCard, ProjectDetailModal } from "./ProjectViews";
import { EmptyState, PillTabs, PrimaryButton, SecondaryButton, Spinner, Alert } from "./ui";

type Tab = "sandbox" | "projects";

export function StudentDashboard({ user, onLogout }: { user: UserDTO; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("sandbox");
  const [projects, setProjects] = useState<ProjectDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ProjectDTO | null>(null);

  const load = useCallback(async () => {
    try {
      const { projects } = await api<{ projects: ProjectDTO[] }>("/api/projects");
      setProjects(projects);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los proyectos.");
    }
  }, []);

  useEffect(() => {
    // Carga diferida: evita setState síncrono dentro del efecto.
    queueMicrotask(() => void load());
  }, [load]);

  const count = projects?.length ?? 0;

  return (
    <div className="min-h-screen bg-app">
      <TopNav user={user} onLogout={onLogout} />
      <main className="max-w-7xl mx-auto px-5 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-ink flex items-center gap-2">
            <BookMarked size={22} className="text-cyan-500" />
            Panel del Estudiante
          </h1>
          <p className="text-sm text-muted mt-1">
            Gestiona tus proyectos académicos y envía nuevos trabajos al repositorio a través de tu tutor.
          </p>
        </div>

        <div className="mb-6">
          <PillTabs<Tab>
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "sandbox", label: "Sandbox", icon: <Sparkles size={14} /> },
              { id: "projects", label: "Mis Proyectos Enviados", icon: <FolderOpen size={14} />, count },
            ]}
          />
        </div>

        {tab === "sandbox" ? (
          <SandboxPanel
            user={user}
            onSubmitted={(p) => {
              setProjects((prev) => [p, ...(prev ?? [])]);
            }}
          />
        ) : (
          <div className="fade-in space-y-4">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-card2 border border-line text-ink-soft text-sm">
                <FileText size={14} />
                <span>
                  {count} {count === 1 ? "proyecto" : "proyectos"}
                </span>
              </div>
              <SecondaryButton size="sm" icon={<RefreshCw size={13} />} onClick={load}>
                Actualizar
              </SecondaryButton>
            </div>

            {error && <Alert tone="error">{error}</Alert>}
            {projects === null ? (
              <Spinner />
            ) : projects.length === 0 ? (
              <div className="card p-10">
                <EmptyState
                  icon={<FolderOpen size={38} />}
                  title="No has enviado proyectos todavía"
                  action={
                    <PrimaryButton onClick={() => setTab("sandbox")} icon={<ChevronRight size={16} />}>
                      Ir al Sandbox
                    </PrimaryButton>
                  }
                >
                  Ve a la pestaña <span className="text-cyan-500 font-semibold">Sandbox</span> y envía tu primer
                  proyecto. Tu tutor lo revisará y lo remitirá al Administrador para su publicación.
                </EmptyState>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {projects.map((p) => (
                  <ProjectCard key={p.id} project={p} role={user.role} onOpen={setSelected} />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <ProjectDetailModal
        project={selected}
        user={user}
        onClose={() => setSelected(null)}
        onUpdated={(p) => {
          setProjects((prev) => (prev ?? []).map((x) => (x.id === p.id ? p : x)));
          setSelected(p);
        }}
      />
    </div>
  );
}
