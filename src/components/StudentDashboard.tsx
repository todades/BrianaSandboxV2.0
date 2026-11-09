"use client";

import { useEffect, useMemo, useState } from "react";
import { BookMarked, FolderOpen, Sparkles, FileText, ChevronRight, RefreshCw } from "lucide-react";
import type { UserDTO } from "@/lib/types";
import { TopNav } from "./TopNav";
import { SandboxPanel } from "./SandboxPanel";
import { ProjectCard, ProjectDetailModal } from "./ProjectViews";
import { EmptyState, PillTabs, PrimaryButton, SecondaryButton, Spinner, Alert } from "./ui";
import { useProjectList } from "./useProjectList";
import { ProjectFilters } from "./ProjectFilters";
import { ALL_PROJECTS_FILTER, isProjectFilterActive, matchesProjectFilter, matchesProjectSearch, type ProjectFilter } from "@/lib/project-filters";

type Tab = "sandbox" | "projects";

export function StudentDashboard({ user, onLogout }: { user: UserDTO; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("sandbox");
  const { projects, error, loading, load, applyUpdated } = useProjectList();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ProjectFilter>(ALL_PROJECTS_FILTER);
  const selected = useMemo(() => projects?.find((p) => p.id === selectedId) ?? null, [projects, selectedId]);
  const allProjects = useMemo(() => projects ?? [], [projects]);
  const visibleProjects = useMemo(
    () => allProjects.filter((p) => matchesProjectFilter(p, filter) && matchesProjectSearch(p, search)),
    [allProjects, filter, search]
  );
  const filtersActive = isProjectFilterActive(filter) || search.trim().length > 0;
  const returnedCount = allProjects.filter((p) => p.status === "devuelto").length;

  useEffect(() => {
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

        {returnedCount > 0 && tab === "sandbox" && (
          <div className="mb-4">
            <Alert tone="warning" titulo={`Tienes ${returnedCount} proyecto(s) devueltos para corrección`}>
              <button
                type="button"
                className="font-semibold underline underline-offset-2"
                onClick={() => {
                  setTab("projects");
                  setFilter({ field: "status", value: "devuelto" });
                  setSearch("");
                }}
              >
                Ver proyectos devueltos y reenviarlos al tutor
              </button>
            </Alert>
          </div>
        )}

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
          <SandboxPanel user={user} onSubmitted={applyUpdated} />
        ) : (
          <div className="fade-in space-y-4">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-card2 border border-line text-ink-soft text-sm">
                <FileText size={14} />
                <span>
                  {count} {count === 1 ? "proyecto" : "proyectos"}
                </span>
              </div>
              <SecondaryButton size="sm" icon={<RefreshCw size={13} />} onClick={load} loading={loading}>
                Actualizar
              </SecondaryButton>
            </div>

            <ProjectFilters
              idPrefix="student-project"
              projects={allProjects}
              filter={filter}
              onFilterChange={setFilter}
              search={search}
              onSearchChange={setSearch}
              resultCount={visibleProjects.length}
              showTutorFilter={false}
            />

            {error && <Alert tone="error">{error}</Alert>}
            {projects === null ? (
              <Spinner />
            ) : visibleProjects.length === 0 ? (
              <div className="card p-10">
                <EmptyState
                  icon={<FolderOpen size={38} />}
                  titulo={filtersActive ? "No hay proyectos con esos filtros" : "No has enviado proyectos todavía"}
                  action={
                    filtersActive ? (
                      <SecondaryButton size="sm" onClick={() => { setFilter(ALL_PROJECTS_FILTER); setSearch(""); }}>
                        Limpiar filtros
                      </SecondaryButton>
                    ) : (
                      <PrimaryButton size="sm" onClick={() => setTab("sandbox")} icon={<ChevronRight size={16} />}>
                        Ir al Sandbox
                      </PrimaryButton>
                    )
                  }
                >
                  {filtersActive
                    ? "Cambia la categoría o limpia los filtros para ver tus demás proyectos."
                    : <>Ve a la pestaña <span className="text-cyan-500 font-semibold">Sandbox</span> y envía tu primer proyecto. Tu tutor lo revisará y lo remitirá al Administrador para su publicación.</>}
                </EmptyState>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {visibleProjects.map((p) => (
                  <ProjectCard key={p.id} project={p} role={user.role} onOpen={(project) => setSelectedId(project.id)} />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <ProjectDetailModal
        project={selected}
        user={user}
        onClose={() => setSelectedId(null)}
        onUpdated={applyUpdated}
      />
    </div>
  );
}
