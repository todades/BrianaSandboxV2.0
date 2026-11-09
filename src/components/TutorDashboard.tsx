"use client";

import { useEffect, useMemo, useState } from "react";
import { Inbox, History, RefreshCw, UserCog } from "lucide-react";
import type { UserDTO } from "@/lib/types";
import { useProjectList } from "./useProjectList";
import { TopNav } from "./TopNav";
import { ProjectCard, ProjectDetailModal } from "./ProjectViews";
import { Alert, EmptyState, PillTabs, SecondaryButton, Spinner } from "./ui";
import { ProjectFilters } from "./ProjectFilters";
import { ALL_PROJECTS_FILTER, isProjectFilterActive, matchesProjectFilter, matchesProjectSearch, type ProjectFilter } from "@/lib/project-filters";

type Tab = "bandeja" | "historial";

export function TutorDashboard({ user, onLogout }: { user: UserDTO; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("bandeja");
  const { projects, error, loading, load, applyUpdated } = useProjectList();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ProjectFilter>(ALL_PROJECTS_FILTER);
  const selected = useMemo(() => projects?.find((p) => p.id === selectedId) ?? null, [projects, selectedId]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const bandeja = useMemo(
    () => (projects ?? []).filter((p) => p.status === "enviado_tutor" || p.status === "devuelto_tutor"),
    [projects]
  );
  const historial = useMemo(
    () => (projects ?? []).filter((p) => p.status !== "enviado_tutor" && p.status !== "devuelto_tutor"),
    [projects]
  );
  const activeList = tab === "bandeja" ? bandeja : historial;
  const list = useMemo(
    () => activeList.filter((p) => matchesProjectFilter(p, filter) && matchesProjectSearch(p, search)),
    [activeList, filter, search]
  );
  const filtersActive = isProjectFilterActive(filter) || search.trim().length > 0;

  return (
    <div className="min-h-screen bg-app">
      <TopNav user={user} onLogout={onLogout} />
      <main className="max-w-7xl mx-auto px-5 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-ink flex items-center gap-2">
            <UserCog size={22} className="text-amber-500" />
            Panel del Tutor
          </h1>
          <p className="text-sm text-muted mt-1">
            Revisa los proyectos asignados, atiende correcciones y reenvía los validados al Administrador.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <PillTabs<Tab>
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "bandeja", label: "Bandeja de Proyectos Asignados", icon: <Inbox size={14} />, count: bandeja.length },
              { id: "historial", label: "Historial", icon: <History size={14} />, count: historial.length },
            ]}
          />
          <SecondaryButton size="sm" icon={<RefreshCw size={13} />} onClick={load} loading={loading}>
            Actualizar
          </SecondaryButton>
        </div>

        <div className="mb-4">
          <ProjectFilters
            idPrefix="tutor-project"
            projects={activeList}
            filter={filter}
            onFilterChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            resultCount={list.length}
            showTutorFilter={false}
          />
        </div>

        <div className="fade-in space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          {projects === null ? (
            <Spinner />
          ) : list.length === 0 ? (
            <div className="card p-8 md:p-10">
              <EmptyState
                icon={tab === "bandeja" ? <Inbox size={38} /> : <History size={38} />}
                titulo={filtersActive ? "No hay coincidencias" : tab === "bandeja" ? "Tu bandeja está vacía" : "Sin historial todavía"}
              >
                {filtersActive
                  ? "Prueba con otra categoría, título, código o nombre de estudiante."
                  : tab === "bandeja"
                    ? "Los proyectos nuevos y los devueltos por el Administrador aparecerán aquí para revisión o corrección."
                    : "Aquí verás los proyectos que ya validaste, devolviste o que fueron publicados."}
              </EmptyState>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {list.map((p) => (
                <ProjectCard key={p.id} project={p} role={user.role} onOpen={(project) => setSelectedId(project.id)} />
              ))}
            </div>
          )}
        </div>
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
