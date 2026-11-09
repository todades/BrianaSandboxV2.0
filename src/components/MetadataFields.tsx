"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Wand2, ChevronDown, ChevronUp, Tags } from "lucide-react";
import {
  DEFAULT_TRAYECTO,
  LINEAS_INVESTIGACION,
  PLACEHOLDERS,
  PNFS,
  SELECT_PLACEHOLDERS,
  TIPOS_RECURSO,
  TRAYECTOS,
  TUTOR_CUENTA_NOTA,
  slugify,
} from "@/lib/constants";
import type { MetadataForm } from "@/lib/types";
import { Field } from "./ui";

export interface TutorOption {
  id: number;
  name: string;
  email: string;
  role?: string;
  isActive: boolean;
}

export function emptyMetadata(defaults?: Partial<MetadataForm>): MetadataForm {
  return {
    title: "",
    codigo: "",
    slug: "",
    tipoRecurso: "",
    pnf: PNFS[0],
    lineaInvestigacion: "",
    autores: "",
    tutorNombre: "",
    tutorId: "",
    anio: "",
    trayecto: DEFAULT_TRAYECTO,
    palabrasClave: "",
    resumen: "",
    ...defaults,
  };
}

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h3 className="section-title">{title}</h3>
      {children}
    </section>
  );
}

export function MetadataFields({
  value,
  onChange,
  tutors,
  disabled = false,
  showTutorAccount = true,
  tutorAccountLocked = false,
  filesSection,
}: {
  value: MetadataForm;
  onChange: (next: MetadataForm) => void;
  tutors: TutorOption[];
  disabled?: boolean;
  showTutorAccount?: boolean;
  tutorAccountLocked?: boolean;
  /** Contenido de la sección "Archivos Adjuntos" (solo en el Sandbox). */
  filesSection?: ReactNode;
}) {
  const hasDescriptors = !!(value.palabrasClave || value.resumen);
  // Estado derivado: el panel se abre automáticamente cuando la IA devuelve descriptores.
  const [descOverride, setDescOverride] = useState<boolean | null>(null);
  const descOpen = descOverride ?? hasDescriptors;
  const [tutorSearch, setTutorSearch] = useState("");
  const [tutorOpen, setTutorOpen] = useState(false);

  function set<K extends keyof MetadataForm>(key: K, v: MetadataForm[K]) {
    onChange({ ...value, [key]: v });
  }

  const selectedTutor = useMemo(
    () => tutors.find((t) => String(t.id) === value.tutorId) ?? null,
    [tutors, value.tutorId]
  );
  const filteredTutors = useMemo(() => {
    const q = tutorSearch.trim().toLocaleLowerCase("es");
    return tutors
      .filter((t) => t.role !== "administrador")
      .filter((t) => !q || `${t.name} ${t.email}`.toLocaleLowerCase("es").includes(q))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
  }, [tutors, tutorSearch]);

  function onTutorAccount(t: TutorOption) {
    if (!t.isActive) return;
    onChange({ ...value, tutorId: String(t.id), tutorNombre: value.tutorNombre || t.name });
    setTutorSearch("");
    setTutorOpen(false);
  }

  const autoresList = value.autores
    .split(";")
    .map((a) => a.trim())
    .filter(Boolean);

  return (
    <div className="space-y-8">
      {/* ===================== TÍTULO DEL PROYECTO ===================== */}
      <FormSection title="Título del Proyecto">
        <Field label="Título del Proyecto (Obligatorio)" required>
          <textarea
            className="textarea-base"
            rows={3}
            placeholder={PLACEHOLDERS.title}
            value={value.title}
            onChange={(e) => set("title", e.target.value)}
            disabled={disabled}
          />
        </Field>
      </FormSection>

      {/* ===================== IDENTIFICACIÓN Y CLASIFICACIÓN ===================== */}
      <FormSection title="Identificación y Clasificación">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Código del Proyecto">
            <input
              className="input-base"
              placeholder={PLACEHOLDERS.codigo}
              value={value.codigo}
              onChange={(e) => set("codigo", e.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field label="Slug">
            <div className="flex gap-2">
              <div className="flex-1">
                <input
                  className="input-base font-mono text-xs"
                  placeholder={PLACEHOLDERS.slug}
                  value={value.slug}
                  onChange={(e) => set("slug", e.target.value)}
                  disabled={disabled}
                />
              </div>
              <button
                type="button"
                disabled={disabled || !value.title}
                onClick={() => set("slug", slugify(value.title))}
                title="Generar slug desde el título"
                className="px-3 rounded-lg border border-line text-muted hover:text-cyan-500 hover:border-cyan-500/50 disabled:opacity-50"
              >
                <Wand2 size={15} />
              </button>
            </div>
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Tipo de Recurso" required>
            <select
              className="select-base"
              value={value.tipoRecurso}
              onChange={(e) => set("tipoRecurso", e.target.value)}
              disabled={disabled}
            >
              <option value="">{SELECT_PLACEHOLDERS.tipo}</option>
              {TIPOS_RECURSO.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="PNF" required>
            <select className="select-base" value={value.pnf} onChange={(e) => set("pnf", e.target.value)} disabled={disabled}>
              {PNFS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Línea de Investigación" required>
            <select
              className="select-base"
              value={value.lineaInvestigacion}
              onChange={(e) => set("lineaInvestigacion", e.target.value)}
              disabled={disabled}
            >
              <option value="">{SELECT_PLACEHOLDERS.linea}</option>
              {LINEAS_INVESTIGACION.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </FormSection>

      {/* ===================== AUTORÍA Y TUTORÍA ===================== */}
      <FormSection title="Autoría y Tutoría">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Autores (Lista / Array)" required hint="Separados por punto y coma ( ; )">
            <input
              className="input-base"
              placeholder={PLACEHOLDERS.autores}
              value={value.autores}
              onChange={(e) => set("autores", e.target.value)}
              disabled={disabled}
            />
            {autoresList.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {autoresList.map((a, i) => (
                  <span
                    key={`${a}-${i}`}
                    className="badge bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border border-cyan-500/30 normal-case tracking-normal"
                  >
                    {a}
                  </span>
                ))}
              </div>
            )}
          </Field>
          <Field label="Tutor o Director" required>
            <input
              className="input-base"
              placeholder={PLACEHOLDERS.tutor}
              value={value.tutorNombre}
              onChange={(e) => set("tutorNombre", e.target.value)}
              disabled={disabled}
            />
          </Field>
        </div>
        {showTutorAccount && (
          <Field
            label="Cuenta del Tutor que recibirá el proyecto"
            required
            hint={tutorAccountLocked ? "Cuenta asignada por el estudiante. No puede modificarse durante la revisión o corrección." : TUTOR_CUENTA_NOTA}
          >
            <div className="relative">
              <input
                className="input-base"
                type="search"
                value={tutorOpen ? tutorSearch : selectedTutor ? `${selectedTutor.name} (${selectedTutor.email})${selectedTutor.isActive ? "" : " — No disponible"}` : value.tutorNombre || tutorSearch}
                placeholder={SELECT_PLACEHOLDERS.tutorCuenta}
                autoComplete="off"
                disabled={disabled || tutorAccountLocked}
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={tutorOpen}
                aria-controls="briana-tutor-options"
                onFocus={() => {
                  setTutorSearch("");
                  setTutorOpen(true);
                }}
                onBlur={() => window.setTimeout(() => setTutorOpen(false), 120)}
                onChange={(e) => {
                  setTutorSearch(e.target.value);
                  setTutorOpen(true);
                  if (value.tutorId) onChange({ ...value, tutorId: "" });
                }}
              />
              {tutorOpen && !disabled && !tutorAccountLocked && (
                <div
                  id="briana-tutor-options"
                  role="listbox"
                  className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-line bg-card shadow-xl"
                >
                  {filteredTutors.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-muted">No hay tutores que coincidan con la búsqueda.</p>
                  ) : (
                    filteredTutors.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        role="option"
                        aria-selected={value.tutorId === String(t.id)}
                        disabled={!t.isActive}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onTutorAccount(t)}
                        className="flex w-full items-center justify-between gap-3 border-b border-line/60 px-3 py-2.5 text-left text-sm last:border-0 hover:bg-card2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-ink">{t.name}</span>
                          <span className="block truncate text-xs text-muted">{t.email}</span>
                        </span>
                        <span className={`text-[0.65rem] font-semibold ${t.isActive ? "text-emerald-500" : "text-amber-500"}`}>
                          {t.isActive ? "Disponible" : "No disponible"}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </Field>
        )}
      </FormSection>

      {/* ===================== DETALLES ACADÉMICOS ===================== */}
      <FormSection title="Detalles Académicos">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Año de Publicación">
            <input
              className="input-base"
              placeholder={PLACEHOLDERS.anio}
                inputMode="numeric"
                pattern="[0-9]*"
              value={value.anio}
              onChange={(e) => set("anio", e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
              disabled={disabled}
            />
          </Field>
          <Field label="Trayecto">
            <select
              className="select-base"
              value={value.trayecto || DEFAULT_TRAYECTO}
              onChange={(e) => set("trayecto", e.target.value)}
              disabled={disabled}
            >
              {TRAYECTOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </FormSection>

      {/* ===================== ARCHIVOS ADJUNTOS ===================== */}
      {filesSection && <FormSection title="Archivos Adjuntos">{filesSection}</FormSection>}

      {/* ===================== DESCRIPTORES OPCIONALES (IA) ===================== */}
      <section className="rounded-xl border border-line bg-card2">
        <button
          type="button"
          onClick={() => setDescOverride(!descOpen)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted">
            <Tags size={14} className="text-cyan-500" />
            Descriptores opcionales (Palabras clave y Resumen extraídos por IA)
          </span>
          {descOpen ? <ChevronUp size={15} className="text-muted" /> : <ChevronDown size={15} className="text-muted" />}
        </button>
        {descOpen && (
          <div className="px-4 pb-4 grid grid-cols-1 gap-4 fade-in">
            <Field label="Palabras Clave" hint="Separadas por punto y coma ( ; )">
              <input
                className="input-base"
                placeholder="Ej: inteligencia artificial; metadatos; repositorio"
                value={value.palabrasClave}
                onChange={(e) => set("palabrasClave", e.target.value)}
                disabled={disabled}
              />
            </Field>
            <Field label="Resumen del Proyecto">
              <textarea
                className="textarea-base"
                rows={4}
                placeholder="Resumen o abstract del proyecto..."
                value={value.resumen}
                onChange={(e) => set("resumen", e.target.value)}
                disabled={disabled}
              />
            </Field>
          </div>
        )}
      </section>
    </div>
  );
}
