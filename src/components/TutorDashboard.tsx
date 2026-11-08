"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox, History, RefreshCw, UserCog } from "lucide-react";
import { api } from "@/lib/api-client";
import type { ProjectDTO, UserDTO } from "@/lib/types";
import { TopNav } from "./TopNav";
import { ProjectCard, ProjectDetailModal } from "./ProjectViews";
import { Alert, EmptyState, PillTabs, SecondaryButton, Spinner } from "./ui";

type Tab = "bandeja" | "historial";

export function TutorDashboard({ user, onLogout }: { user: UserDTO; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("bandeja");
  const [projects, setProjects] = useState<ProjectDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ProjectDTO | null>(null);
  const [search, setSearch] = useState("");

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
  const list = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("es");
    if (!q) return activeList;
    return activeList.filter((p) =>
      [p.titulo, p.codigo ?? "", p.studentName ?? "", p.status, p.observaciones ?? ""]
        .join(" ")
        .toLocaleLowerCase("es")
        .includes(q)
    );
  }, [activeList, search]);

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
          <SecondaryButton size="sm" icon={<RefreshCw size={13} />} onClick={load}>
            Actualizar
          </SecondaryButton>
        </div>

        <div className="mb-4 max-w-md">
          <label className="sr-only" htmlFor="tutor-project-search">Buscar proyectos</label>
          <input
            id="tutor-project-search"
            className="input-base"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título, código o estudiante..."
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
                title={search ? "No hay coincidencias" : tab === "bandeja" ? "Tu bandeja está vacía" : "Sin historial todavía"}
              >
                {search
                  ? "Prueba con otro título, código, nombre de estudiante u observación."
                  : tab === "bandeja"
                    ? "Los proyectos nuevos y los devueltos por el Administrador aparecerán aquí para revisión o corrección."
                    : "Aquí verás los proyectos que ya validaste, devolviste o que fueron publicados."}
              </EmptyState>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {list.map((p) => (
                <ProjectCard key={p.id} project={p} role={user.role} onOpen={setSelected} />
              ))}
            </div>
          )}
        </div>
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
