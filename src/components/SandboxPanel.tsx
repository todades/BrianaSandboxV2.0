"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  CloudUpload,
  FileText,
  FileUp,
  Sparkles,
  Upload,
  X,
  FileCheck2,
  FileBadge,
  Bot,
  Cpu,
  Lock,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { api, formatBytes, postForm } from "@/lib/api-client";
import { MAX_PDF_BYTES, MAX_PLANILLA_BYTES } from "@/lib/constants";
import type { AiExtraction, MetadataForm, ProjectDTO, UserDTO } from "@/lib/types";
import { Alert, PrimaryButton, SecondaryButton } from "./ui";
import { MetadataFields, emptyMetadata, type TutorOption } from "./MetadataFields";
import { useToast } from "./toast";

/* ------------------------------------------------------------------ */
/* Validación de archivos                                              */
/* ------------------------------------------------------------------ */
type AcceptKind = "pdf" | "pdf-image";

export function validateFile(f: File, kind: AcceptKind, maxBytes: number): string | null {
  const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
  const isImg = f.type.startsWith("image/");
  if (kind === "pdf" && !isPdf) return "Solo se permiten archivos PDF.";
  if (kind === "pdf-image" && !isPdf && !isImg) return "Solo se permiten archivos PDF o imágenes.";
  if (f.size > maxBytes) return `El archivo supera el máximo de ${formatBytes(maxBytes)}.`;
  return null;
}

/* ------------------------------------------------------------------ */
/* Zona de arrastre (PDF del recurso)                                  */
/* ------------------------------------------------------------------ */
function DropZone({
  file,
  onFile,
  onPick,
  onClear,
  disabled = false,
}: {
  file: File | null;
  onFile: (f: File) => void;
  onPick: () => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const [active, setActive] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function handle(files: FileList | null) {
    setErr(null);
    const f = files?.[0];
    if (!f) return;
    const problem = validateFile(f, "pdf", MAX_PDF_BYTES);
    if (problem) {
      setErr(problem);
      return;
    }
    onFile(f);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setActive(false);
        if (!disabled) handle(e.dataTransfer.files);
      }}
      className={`card-flat border-dashed border-2 transition relative overflow-hidden rounded-2xl p-10 text-center ${
        active ? "dropzone-active" : "border-line"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <div className="absolute inset-0 bg-grid opacity-40 pointer-events-none" />
      <div className="relative flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600/20 to-cyan-500/20 border border-cyan-400/30 flex items-center justify-center text-cyan-500">
          <CloudUpload size={32} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-ink">Arrastra y suelta un PDF Académico aquí</h3>
          <p className="text-sm text-muted mt-1">
            Tesis, Proyecto Socio-Tecnológico o Trabajo de Grado · Máx. 20 MB
          </p>
        </div>
        <div className="flex flex-wrap gap-3 justify-center items-center mt-1">
          <PrimaryButton icon={<FileUp size={16} />} onClick={onPick} disabled={disabled}>
            Subir PDF del Recurso
          </PrimaryButton>
          {file && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted hover:text-red-500 transition"
            >
              <X size={14} /> Quitar
            </button>
          )}
        </div>
        {err && <p className="text-xs text-red-500 font-medium">{err}</p>}
        {file && (
          <div className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-400/30 text-cyan-600 dark:text-cyan-200 text-sm max-w-full">
            <FileText size={15} className="flex-shrink-0" />
            <span className="font-medium truncate">{file.name}</span>
            <span className="text-muted text-xs flex-shrink-0">({formatBytes(file.size)})</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ranura de archivo adjunto (sección "Archivos Adjuntos")             */
/* ------------------------------------------------------------------ */
function FileSlot({
  label,
  hint,
  file,
  buttonLabel,
  icon,
  onPick,
  onClear,
  disabled,
  required,
  error,
}: {
  label: string;
  hint: string;
  file: File | null;
  buttonLabel: string;
  icon: ReactNode;
  onPick: () => void;
  onClear: () => void;
  disabled?: boolean;
  required?: boolean;
  error?: string | null;
}) {
  return (
    <div className={`card-flat p-4 space-y-3 ${file ? "border-cyan-500/40" : ""}`}>
      <label className="block text-[0.7rem] font-bold uppercase tracking-wider text-muted">
        {label}
        {required && <span className="text-cyan-500 ml-1">*</span>}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <SecondaryButton icon={icon} onClick={onPick} disabled={disabled} active={!!file}>
          {buttonLabel}
        </SecondaryButton>
        {file ? (
          <span className="inline-flex items-center gap-2 text-xs text-ink min-w-0">
            <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
            <span className="truncate max-w-[220px]">{file.name}</span>
            <span className="text-muted2">({formatBytes(file.size)})</span>
            <button type="button" onClick={onClear} className="text-muted2 hover:text-red-500" aria-label="Quitar archivo">
              <X size={13} />
            </button>
          </span>
        ) : (
          <span className="text-xs text-muted2">Ningún archivo seleccionado</span>
        )}
      </div>
      <p className="text-[0.72rem] text-muted2">{hint}</p>
      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sandbox                                                             */
/* ------------------------------------------------------------------ */
export function SandboxPanel({
  user,
  onSubmitted,
}: {
  user: UserDTO;
  onSubmitted?: (p: ProjectDTO) => void;
}) {
  const toast = useToast();
  const isStudent = user.role === "estudiante";
  const [pdf, setPdf] = useState<File | null>(null);
  const [planilla, setPlanilla] = useState<File | null>(null);
  const [planillaErr, setPlanillaErr] = useState<string | null>(null);
  const [tutors, setTutors] = useState<TutorOption[]>([]);
  const [meta, setMeta] = useState<MetadataForm>(() => emptyMetadata({ trayecto: user.trayecto || undefined }));
  const [analyzing, setAnalyzing] = useState(false);
  const [extraction, setExtraction] = useState<AiExtraction | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ProjectDTO | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const planillaInputRef = useRef<HTMLInputElement>(null);

  const loadTutors = useCallback(async () => {
    try {
      const { tutors } = await api<{ tutors: TutorOption[] }>("/api/tutors");
      setTutors(tutors);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadTutors();
  }, [loadTutors]);

  /** Limpia por completo el formulario y los archivos. */
  function resetAll() {
    setPdf(null);
    setPlanilla(null);
    setPlanillaErr(null);
    setExtraction(null);
    setError(null);
    setMeta(emptyMetadata({ trayecto: user.trayecto || undefined }));
    if (pdfInputRef.current) pdfInputRef.current.value = "";
    if (planillaInputRef.current) planillaInputRef.current.value = "";
  }

  function pickPdf(f: File) {
    setPdf(f);
    setExtraction(null);
    setSuccess(null);
    setError(null);
  }

  function pickPlanilla(f: File) {
    const problem = validateFile(f, "pdf-image", MAX_PLANILLA_BYTES);
    setPlanillaErr(problem);
    if (!problem) setPlanilla(f);
  }

  async function runAI() {
    if (!pdf) {
      setError("Primero sube el PDF del recurso.");
      return;
    }
    setError(null);
    setSuccess(null);
    setAnalyzing(true);
    try {
      const fd = new FormData();
      fd.append("pdf", pdf);
      const result = await postForm<AiExtraction>("/api/ai/extract", fd);
      setExtraction(result);
      const m = result.metadata;
      setMeta((prev) => ({
        ...prev,
        titulo: m.titulo || prev.titulo,
        codigo: m.codigo || prev.codigo,
        slug: m.slug || prev.slug,
        tipoRecurso: m.tipoRecurso || prev.tipoRecurso,
        pnf: "Informática",
        lineaInvestigacion: m.lineaInvestigacion || prev.lineaInvestigacion,
        autores: m.autores || prev.autores,
        tutorNombre: m.tutorNombre || prev.tutorNombre,
        anio: m.anio || prev.anio,
        trayecto: m.trayecto || prev.trayecto,
        palabrasClave: m.palabrasClave || prev.palabrasClave,
        resumen: m.resumen || prev.resumen,
      }));
      toast.info(
        result.source === "gemini" ? "Metadatos extraídos con Gemini" : "Metadatos extraídos (modo heurístico)",
        "Revisa y corrige los campos antes de enviar."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo analizar el PDF.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function submit() {
    setError(null);
    setSuccess(null);
    if (!pdf) return setError("Sube el PDF del Recurso (documento original).");
    if (meta.titulo.trim().length < 8) return setError("El Título del Proyecto es obligatorio.");
    if (!meta.tipoRecurso) return setError("Seleccione el Tipo de Recurso.");
    if (!meta.lineaInvestigacion) return setError("Seleccione la Línea de Investigación.");
    if (!meta.autores.trim()) return setError("Indica al menos un autor (separados por ;).");
    if (!meta.tutorNombre.trim()) return setError("Indica el nombre del Tutor o Director.");
    if (!meta.tutorId) return setError("Selecciona al tutor destinatario que recibirá el proyecto.");
    if (meta.anio && !/^\d{4}$/.test(meta.anio)) return setError("El Año de Publicación debe tener 4 dígitos.");

    setSending(true);
    try {
      const fd = new FormData();
      Object.entries(meta).forEach(([k, v]) => fd.append(k, v));
      fd.append("aiSource", extraction?.source ?? "manual");
      fd.append("pdf", pdf);
      if (planilla) fd.append("planilla", planilla);
      const { project } = await postForm<{ project: ProjectDTO }>("/api/projects", fd);

      // Limpieza completa + alerta flotante de éxito.
      resetAll();
      setSuccess(project);
      toast.success(
        "¡Proyecto enviado exitosamente!",
        `«${project.titulo}» fue entregado a ${project.tutorCuenta ?? "tu tutor"}. Puedes seguirlo en «Mis Proyectos Enviados».`
      );
      onSubmitted?.(project);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo enviar el proyecto.";
      setError(msg);
      toast.error("No se pudo enviar el proyecto", msg);
    } finally {
      setSending(false);
    }
  }

  const filesSection = (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <FileSlot
        label="PDF del Recurso"
        hint="Documento original en PDF · Máx. 20 MB"
        file={pdf}
        buttonLabel="Subir PDF del Recurso"
        icon={<FileUp size={15} />}
        onPick={() => pdfInputRef.current?.click()}
        onClear={() => {
          setPdf(null);
          setExtraction(null);
        }}
        disabled={sending}
        required
      />
      <FileSlot
        label="Planilla Firmada"
        hint="PDF o imagen · Máx. 10 MB · El Administrador no podrá publicar sin ella"
        file={planilla}
        buttonLabel="Subir Planilla Firmada (Requerido para aprobar)"
        icon={<FileCheck2 size={15} />}
        onPick={() => planillaInputRef.current?.click()}
        onClear={() => setPlanilla(null)}
        disabled={sending}
        error={planillaErr}
      />
    </div>
  );

  return (
    <div className="space-y-6 fade-in">
      {/* Inputs ocultos compartidos */}
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            const problem = validateFile(f, "pdf", MAX_PDF_BYTES);
            if (problem) setError(problem);
            else pickPdf(f);
          }
          e.target.value = "";
        }}
      />
      <input
        ref={planillaInputRef}
        type="file"
        accept="application/pdf,.pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pickPlanilla(f);
          e.target.value = "";
        }}
      />

      {!isStudent && (
        <Alert tone="warning" title="Sandbox en modo de pruebas">
          Solo el rol <b>Estudiante</b> puede enviar proyectos al flujo institucional. Como {user.role} puedes
          probar la extracción de metadatos con IA sin generar envíos.
        </Alert>
      )}

      {success && (
        <Alert tone="success" title="¡Proyecto enviado exitosamente al tutor!" onClose={() => setSuccess(null)}>
          «{success.titulo}» fue entregado a <b>{success.tutorCuenta}</b>. El formulario se ha limpiado para un nuevo
          envío.
        </Alert>
      )}

      {/* Zona de arrastre + IA */}
      <DropZone
        file={pdf}
        onFile={pickPdf}
        onPick={() => pdfInputRef.current?.click()}
        onClear={() => {
          setPdf(null);
          setExtraction(null);
        }}
        disabled={sending}
      />

      {/* Formulario */}
      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h2 className="text-lg font-bold text-ink flex items-center gap-2">
              <Sparkles size={18} className="text-cyan-500" />
              Validación y Edición de Metadatos
            </h2>
            <p className="text-xs text-muted mt-1">
              Extrae los metadatos con IA (Gemini) y verifícalos antes de enviarlos al tutor.
            </p>
          </div>
          <SecondaryButton
            onClick={runAI}
            loading={analyzing}
            disabled={!pdf || sending}
            icon={<Bot size={15} />}
            active={!!extraction}
          >
            {analyzing ? "Analizando con IA..." : extraction ? "Re-analizar con IA" : "Analizar con IA (Gemini)"}
          </SecondaryButton>
        </div>

        <div className="space-y-3 mb-6 empty:hidden">
          {error && <Alert tone="error" onClose={() => setError(null)}>{error}</Alert>}
          {extraction && (
            <Alert
              tone={extraction.source === "gemini" ? "success" : "info"}
              title={
                extraction.source === "gemini"
                  ? `Metadatos extraídos con Gemini (${extraction.model ?? "IA"})`
                  : "Metadatos extraídos con el analizador heurístico local"
              }
              onClose={() => setExtraction(null)}
            >
              <span className="inline-flex items-center gap-1.5">
                {extraction.source === "gemini" ? <Bot size={13} /> : <Cpu size={13} />}
                {extraction.message || "Revisa y corrige los campos antes de enviar."}
              </span>
            </Alert>
          )}
        </div>

        <MetadataFields value={meta} onChange={setMeta} tutors={tutors} disabled={sending} canChangeTutorAccount filesSection={filesSection} />

        <div className="mt-8 pt-5 border-t border-line flex flex-wrap gap-3 justify-between items-center">
          <div className="text-xs text-muted flex flex-wrap items-center gap-2">
            <FileBadge size={14} />
            Los campos marcados con <span className="text-cyan-500">*</span> son obligatorios.
            {planilla ? (
              <span className="text-emerald-500 font-medium inline-flex items-center gap-1">
                <CheckCircle2 size={12} /> Planilla adjunta
              </span>
            ) : (
              <span className="text-amber-500 font-medium inline-flex items-center gap-1">
                <AlertTriangle size={12} /> Sin planilla firmada (podrás adjuntarla luego)
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <SecondaryButton onClick={resetAll} icon={<X size={14} />} disabled={sending}>
              Limpiar
            </SecondaryButton>
            {isStudent ? (
              <PrimaryButton onClick={submit} loading={sending} disabled={!pdf} icon={<Upload size={16} />}>
                {sending ? "Enviando..." : "ENVIAR AL TUTOR"}
              </PrimaryButton>
            ) : (
              <PrimaryButton disabled icon={<Lock size={16} />}>
                ENVÍO SOLO PARA ESTUDIANTES
              </PrimaryButton>
            )}
          </div>
        </div>
      </div>


    </div>
  );
}
