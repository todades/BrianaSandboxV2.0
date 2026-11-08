"use client";

import { useMemo } from "react";
import {
  ALL_PROJECTS_FILTER,
  PROJECT_FILTER_FIELDS,
  PROJECT_FILTER_LABELS,
  isProjectFilterActive,
  projectFilterLabel,
  projectFilterOptions,
  type ProjectFilter,
  type ProjectFilterField,
} from "@/lib/project-filters";
import type { ProjectDTO } from "@/lib/types";
import { Field, SecondaryButton } from "./ui";

export function ProjectFilters({
  projects,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  idPrefix,
  resultCount,
  showTutorFilter = true,
}: {
  projects: ProjectDTO[];
  filter: ProjectFilter;
  onFilterChange: (filter: ProjectFilter) => void;
  search: string;
  onSearchChange: (search: string) => void;
  idPrefix: string;
  resultCount: number;
  showTutorFilter?: boolean;
}) {
  const fields = useMemo(
    () => PROJECT_FILTER_FIELDS.filter((field) => showTutorFilter || field !== "tutorId"),
    [showTutorFilter]
  );
  const options = useMemo(() => projectFilterOptions(projects, filter.field), [projects, filter.field]);
  const active = isProjectFilterActive(filter) || search.trim().length > 0;

  return (
    <div className="card-flat p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_190px_minmax(0,1fr)_auto] gap-3 items-end">
        <Field label="Buscar">
          <input
            id={`${idPrefix}-search`}
            className="input-base"
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Título, código, estudiante o tutor..."
          />
        </Field>
        <Field label="Filtrar por tema">
          <select
            className="select-base"
            value={filter.field}
            onChange={(e) => onFilterChange({ field: e.target.value as ProjectFilterField, value: "" })}
          >
            {fields.map((field) => (
              <option key={field} value={field}>{PROJECT_FILTER_LABELS[field]}</option>
            ))}
          </select>
        </Field>
        <Field label="Categoría">
          <select
            className="select-base"
            value={filter.value}
            disabled={filter.field === "todos"}
            onChange={(e) => onFilterChange({ ...filter, value: e.target.value })}
          >
            <option value="">{filter.field === "todos" ? "Selecciona un tema" : "Todas las categorías"}</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <SecondaryButton
          size="sm"
          disabled={!active}
          onClick={() => {
            onFilterChange(ALL_PROJECTS_FILTER);
            onSearchChange("");
          }}
        >
          Limpiar filtros
        </SecondaryButton>
      </div>
      <p className="text-xs text-muted" aria-live="polite">
        {resultCount} de {projects.length} proyecto(s) · {isProjectFilterActive(filter)
          ? `${PROJECT_FILTER_LABELS[filter.field]}: ${projectFilterLabel(filter, projects)}`
          : "Sin filtro de categoría"}
        {search.trim() ? ` · Búsqueda: «${search.trim()}»` : ""}
      </p>
    </div>
  );
}
