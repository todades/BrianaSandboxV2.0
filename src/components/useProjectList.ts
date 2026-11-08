"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import type { ProjectDTO } from "@/lib/types";

/**
 * Actualizar solo vuelve a consultar el historial. Nunca elimina registros,
 * no vacía la lista al empezar y descarta respuestas antiguas si ya hubo una
 * actualización o una edición más reciente.
 */
export function useProjectList() {
  const [projects, setProjects] = useState<ProjectDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);
  const requestVersion = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestVersion.current += 1;
    };
  }, []);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const result = await api<{ projects: ProjectDTO[] }>("/api/projects");
      if (!mounted.current || version !== requestVersion.current) return;
      setProjects(result.projects);
      setError(null);
    } catch (e) {
      if (!mounted.current || version !== requestVersion.current) return;
      // Conservamos el historial ya cargado si falla una actualización.
      setError(e instanceof Error ? e.message : "No se pudieron cargar los proyectos.");
    } finally {
      if (mounted.current && version === requestVersion.current) setLoading(false);
    }
  }, []);

  const applyUpdated = useCallback((updated: ProjectDTO) => {
    requestVersion.current += 1;
    setProjects((previous) => {
      if (!previous) return [updated];
      const exists = previous.some((p) => p.id === updated.id);
      return exists ? previous.map((p) => (p.id === updated.id ? updated : p)) : [updated, ...previous];
    });
  }, []);

  const removeDeleted = useCallback((id: number) => {
    requestVersion.current += 1;
    setProjects((previous) => previous?.filter((p) => p.id !== id) ?? previous);
  }, []);

  return { projects, error, loading, load, applyUpdated, removeDeleted };
}
