import { useState, useCallback, useRef } from 'react';

// Si no tienes definido ProjectDTO globalmente, define su interfaz o impórtala
export interface ProjectDTO {
  id: number;
  [key: string]: any;
}

export function useProjectList() {
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const mounted = useRef<boolean>(true);
  const requestVersion = useRef<number>(0);

  const load = useCallback(async () => {
    // Lógica de carga de proyectos
  }, []);

  const applyUpdated = useCallback((updated: ProjectDTO) => {
    requestVersion.current += 1;
    setProjects((previous: ProjectDTO[]) => {
      if (!previous) return [updated];
      const exists = previous.some((p: ProjectDTO) => p.id === updated.id);
      return exists
        ? previous.map((p: ProjectDTO) => (p.id === updated.id ? updated : p))
        : [updated, ...previous];
    });
  }, []);

  const removeDeleted = useCallback((id: number) => {
    requestVersion.current += 1;
    setProjects((previous: ProjectDTO[]) => 
      previous ? previous.filter((p: ProjectDTO) => p.id !== id) : previous
    );
  }, []);

  return { projects, error, loading, load, applyUpdated, removeDeleted };
}
