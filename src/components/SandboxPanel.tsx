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
  Presentation,
  FolderArchive,
  Save,
} from "lucide-react";
import { api, formatBytes, postForm } from "@/lib/api-client";
import {
  MAX_PDF_BYTES,
  MAX_PLANILLA_BYTES,
  fullProjectSchema,
  projectSubmissionSchema,
} from "@/lib/constants";
import type { AiExtraction, MetadataForm, ProjectDTO, UserDTO } from "@/lib/types";
import { Alert, PrimaryButton, SecondaryButton } from "./ui";
import { MetadataFields, emptyMetadata, type TutorOption } from "./MetadataFields";
import { useToast } from "./toast";

const MAX_DELIVERABLE_BYTES = 15 * 1024 * 1024; // 15 MB

/* ------------------------------------------------------------------ */
/* Validación de archivos                                              */
/* ------------------------------------------------------------------ */
type AcceptKind = "doc" | "pdf-image" | "slides" | "zip";

const WORD_MIME_TYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export function validateFile(f: File, kind: AcceptKind, maxBytes: number): string | null {
  const lower = f.name.toLowerCase();
  const isPdf = f.type === "application/pdf" || lower.endsWith(".pdf");
  const isWord = WORD_MIME_TYPES.has(f.type) || lower.endsWith(".doc") || lower.endsWith(".docx");
  const isImg = f.type.startsWith("image/");
  const isPptx =
    f.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    lower.endsWith(".pptx");
  const isZip =
    f.type === "application/zip" ||
    f.type === "application/x-zip-compressed" ||
    lower.endsWith(".zip");

  if (kind === "doc" && !isPdf && !isWord) {
    return "Solo se permiten documentos en formato PDF o Word (.doc, .docx).";
  }
  if (kind === "pdf-image" && !isPdf && !isImg) {
    return "Solo se permiten archivos PDF o imágenes.";
  }
  if (kind === "slides" && !isPdf && !isPptx) {
    return "Solo se permiten diapositivas en formato PDF o PPTX.";
  }
  if (kind === "zip" && !isZip) {
    return "Solo se permite el código fuente comprimido en formato .ZIP.";
  }
  if (f.size > maxBytes) return `El archivo supera el máximo de ${formatBytes(maxBytes)}.`;
  return null;
}

/* ------------------------------------------------------------------ */
/* Zona de arrastre (Informe en PDF o Word)                          */
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
    const problem = validateFile(f, "doc", MAX_PDF_BYTES);
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
          <h3 className="text-lg font-bold text-ink">
            Arrastra y suelta un Informe Académico (PDF o Word) aquí
          </h3>
          <p className="text-sm text-muted mt-1">
            Tesis, Proyecto Socio-Tecnológico o Trabajo de Grado (.PDF, .DOC, .DOCX) · Máx. 20 MB
          </p>
        </div>
        <div className="flex flex-wrap gap-3 justify-center items-center mt-1">
          <PrimaryButton icon={<FileUp size={16} />} onClick={onPick} disabled={disabled}>
            Subir Informe (PDF o Word)
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
    <div
      className={`card-flat p-4 space-y-3 ${
        error ? "border-red-500/60" : file ? "border-cyan-500/40" : ""
      }`}
    >
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
            <button
              type="button"
              onClick={onClear}
              className="text-muted2 hover:text-red-500"
              aria-label="Quitar archivo"
            >
              <X size={13} />
            </button>
          </span>
        ) : (
          <span className="text-xs text-muted2">Ningún archivo seleccionado</span>
        )}
      </div>
      <p className="text-[0.72rem] text-muted2">{hint}</p>
      {error && (
        <p className="text-xs text-red-500 font-medium flex items-start gap-1">
          <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </p>
      )}
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

  // Archivos y entregables
  const [pdf, setPdf] = useState<File | null>(null);
  const [diapositivas, setDiapositivas] = useState<File | null>(null);
  const [sistemaZip, setSistemaZip] = useState<File | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [planilla, setPlanilla] = useState<File | null>(null);

  const [tutors, setTutors] = useState<TutorOption[]>([]);
  const [meta, setMeta] = useState<MetadataForm>(() =>
    emptyMetadata({ trayecto: user.trayecto || undefined })
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [extraction, setExtraction] = useState<AiExtraction | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<ProjectDTO | null>(null);

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const slidesInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
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

  function clearFieldError(key: string) {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function resetAll() {
    setPdf(null);
    setDiapositivas(null);
    setSistemaZip(null);
    setRepoUrl("");
    setPlanilla(null);
    setErrors({});
    setExtraction(null);
    setError(null);
    setSuccess(null);
    setMeta(emptyMetadata({ trayecto: user.trayecto || undefined }));
    if (pdfInputRef.current) pdfInputRef.current.value = "";
    if (slidesInputRef.current) slidesInputRef.current.value = "";
    if (zipInputRef.current) zipInputRef.current.value = "";
    if (planillaInputRef.current) planillaInputRef.current.value = "";
  }

  function pickPdf(f: File) {
    setPdf(f);
    setExtraction(null);
    setSuccess(null);
    setError(null);
    clearFieldError("informe");
  }

  function pickSlides(f: File) {
    const problem = validateFile(f, "slides", MAX_DELIVERABLE_BYTES);
    if (problem) {
      setErrors((prev) => ({ ...prev, diapositivas: problem }));
      return;
    }
    setDiapositivas(f);
    clearFieldError("diapositivas");
  }

  function pickZip(f: File) {
    const problem = validateFile(f, "zip", MAX_DELIVERABLE_BYTES);
    if (problem) {
      setErrors((prev) => ({ ...prev, sistemaZip: problem, repoUrl: problem }));
      return;
    }
    setSistemaZip(f);
    clearFieldError("sistemaZip");
    clearFieldError("repoUrl");
  }

  function pickPlanilla(f: File) {
    const problem = validateFile(f, "pdf-image", MAX_PLANILLA_BYTES);
    if (problem) {
      setErrors((prev) => ({ ...prev, planillas: problem }));
      return;
    }
    setPlanilla(f);
    clearFieldError("planillas");
  }

  async function runAI() {
    if (!pdf) {
      setError("Primero sube el informe o documento del proyecto para poder analizarlo con IA.");
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
        title: m.title || prev.title,
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
        "Revisa y corrige los campos antes de guardar o enviar."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo analizar el documento.");
    } finally {
      setAnalyzing(false);
    }
  }

  /**
   * Guardado validado en dos modos:
   * - "borrador": valida datos básicos mínimos y persiste avance sin exigir todos los entregables finales.
   * - "enviado_tutor": exige validación estricta completa con Zod antes de enviar al tutor.
   */
  async function handleSave(mode: "borrador" | "enviado_tutor") {
    setError(null);
    setSuccess(null);
    setErrors({});

    const zodPayload = {
      titulo: meta.title.trim(),
      trayecto: meta.trayecto as "Trayecto I" | "Trayecto II" | "Trayecto III" | "Trayecto IV",
      resumen: (meta.resumen ?? "").trim(),
      repoUrl: repoUrl.trim(),
      informe: pdf,
      diapositivas,
      planillas: planilla,
      sistemaZip,
    };

    if (mode === "borrador") {
      if (meta.title.trim().length < 5) {
        const msg = "Para guardar un borrador debes escribir al menos un título provisional (mín. 5 caracteres).";
        setErrors({ titulo: msg });
        setError(msg);
        return;
      }
      const partial = projectSubmissionSchema.partial().safeParse(zodPayload);
      if (!partial.success) {
        const errs: Record<string, string> = {};
        partial.error.issues.forEach((issue) => {
          const key = String(issue.path[0] ?? "general");
          if (!errs[key]) errs[key] = issue.message;
        });
        setErrors(errs);
        setError("Hay archivos o campos con formato inválido en tu borrador. Revisa los mensajes en rojo.");
        return;
      }
    } else {
      const parsed = fullProjectSchema.safeParse(zodPayload);
      const errs: Record<string, string> = {};

      if (!parsed.success) {
        parsed.error.issues.forEach((issue) => {
          const key = String(issue.path[0] ?? "general");
          if (!errs[key]) errs[key] = issue.message;
        });
      }

      if (!meta.tipoRecurso) errs.tipoRecurso = "Debes seleccionar el Tipo de Recurso.";
      if (!meta.lineaInvestigacion) errs.lineaInvestigacion = "Debes seleccionar la Línea de Investigación.";
      if (!meta.autores.trim()) errs.autores = "Debes indicar al menos un autor (separados por ;).";
      if (!meta.tutorNombre.trim()) errs.tutorNombre = "Debes indicar el nombre del Tutor o Director.";
      if (!meta.tutorId) errs.tutorId = "Debes seleccionar la cuenta del tutor destinatario.";
      if (meta.anio && !/^\d{4}$/.test(meta.anio)) {
        errs.anio = "El año debe tener exactamente 4 dígitos (ej. 2026).";
      }

      if (Object.keys(errs).length > 0) {
        setErrors(errs);
        const reasons = Object.values(errs);
        setError(
          `No se puede enviar el proyecto porque faltan o fallan estos requisitos: ${reasons.join(" · ")}`
        );
        toast.error("Validación incompleta", reasons[0]);
        return;
      }
    }

    setSending(true);
    try {
      const fd = new FormData();
      Object.entries(meta).forEach(([k, v]) => fd.append(k, v));
      fd.append("mode", mode);
      fd.append("status", mode);
      fd.append("repoUrl", repoUrl.trim());
      fd.append("aiSource", extraction?.source ?? "manual");
      if (pdf) fd.append("pdf", pdf);
      if (diapositivas) fd.append("diapositivas", diapositivas);
      if (sistemaZip) fd.append("sistemaZip", sistemaZip);
      if (planilla) fd.append("planilla", planilla);

      const { project } = await postForm<{ project: ProjectDTO }>("/api/projects", fd);

      if (mode === "enviado_tutor") {
        resetAll();
        setSuccess(project);
        toast.success(
          "¡Proyecto enviado exitosamente!",
          `«${project.title}» fue entregado a ${project.tutorCuenta ?? "tu tutor"}.`
        );
      } else {
        toast.success(
          "Borrador guardado",
          `«${project.title}» se guardó correctamente con tus avances.`
        );
      }

      onSubmitted?.(project);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo guardar el proyecto.";
      setError(msg);
      toast.error("Error al guardar", msg);
    } finally {
      setSending(false);
    }
  }

  const filesSection = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FileSlot
          label="1. Informe del Proyecto (PDF o Word)"
          hint="Documento formal en PDF o Word (.pdf, .doc, .docx) · Máx. 15 MB"
          file={pdf}
          buttonLabel="Subir Informe (PDF / Word)"
          icon={<FileUp size={15} />}
          onPick={() => pdfInputRef.current?.click()}
          onClear={() => {
            setPdf(null);
            setExtraction(null);
          }}
          disabled={sending}
          required
          error={errors.informe}
        />
        <FileSlot
          label="2. Diapositivas de Defensa"
          hint="Presentación en PDF o PPTX · Máx. 15 MB"
          file={diapositivas}
          buttonLabel="Subir Diapositivas"
          icon={<Presentation size={15} />}
          onPick={() => slidesInputRef.current?.click()}
          onClear={() => setDiapositivas(null)}
          disabled={sending}
          required
          error={errors.diapositivas}
        />
        <FileSlot
          label="3. Sistema / Código Fuente (.ZIP)"
          hint="Archivo comprimido .ZIP · Máx. 15 MB (opcional si ingresas enlace del sistema/repo)"
          file={sistemaZip}
          buttonLabel="Subir Sistema (.ZIP)"
          icon={<FolderArchive size={15} />}
          onPick={() => zipInputRef.current?.click()}
          onClear={() => setSistemaZip(null)}
          disabled={sending}
          error={errors.sistemaZip}
        />
        <FileSlot
          label="4. Planillas Firmadas"
          hint="PDF o imagen · Máx. 15 MB · Requerida para validación y aprobación"
          file={planilla}
          buttonLabel="Subir Planilla Firmada"
          icon={<FileCheck2 size={15} />}
          onPick={() => planillaInputRef.current?.click()}
          onClear={() => setPlanilla(null)}
          disabled={sending}
          required
          error={errors.planillas}
        />
      </div>

      {/* Enlace alternativo o complementario del sistema / repositorio */}
      <div className="card-flat p-4 space-y-2">
        <label className="block text-[0.7rem] font-bold uppercase tracking-wider text-muted">
          Enlace del Sistema o Repositorio (Alternativa o complemento al .ZIP)
        </label>
        <input
          type="url"
          className="input-base"
          placeholder="https://github.com/usuario/proyecto-briana"
          value={repoUrl}
          disabled={sending}
          onChange={(e) => {
            setRepoUrl(e.target.value);
            clearFieldError("repoUrl");
          }}
        />
        <p className="text-[0.72rem] text-muted2">
          Debes adjuntar el archivo <b>.ZIP</b> del sistema o indicar una URL válida iniciando con{" "}
          <code>https://</code>.
        </p>
        {errors.repoUrl && (
          <p className="text-xs text-red-500 font-medium flex items-start gap-1">
            <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
            <span>{errors.repoUrl}</span>
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 fade-in">
      {/* Inputs ocultos compartidos */}
      <input
        ref={pdfInputRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            const problem = validateFile(f, "doc", MAX_PDF_BYTES);
            if (problem) {
              setErrors((prev) => ({ ...prev, informe: problem }));
              setError(problem);
            } else {
              pickPdf(f);
            }
          }
          e.target.value = "";
        }}
      />
      <input
        ref={slidesInputRef}
        type="file"
        accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,.pptx"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pickSlides(f);
          e.target.value = "";
        }}
      />
      <input
        ref={zipInputRef}
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pickZip(f);
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
        <Alert tone="warning" titulo="Sandbox en modo de pruebas">
          Solo el rol <b>Estudiante</b> puede enviar proyectos al flujo institucional. Como {user.role}{" "}
          puedes probar la extracción de metadatos con IA sin generar envíos.
        </Alert>
      )}

      {success && (
        <Alert
          tone="success"
          titulo="¡Proyecto enviado exitosamente al tutor!"
          onClose={() => setSuccess(null)}
        >
          «{success.title}» fue entregado a <b>{success.tutorCuenta}</b>. El formulario se ha limpiado
          para un nuevo envío.
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
              Validación y Edición de Metadatos y Entregables
            </h2>
            <p className="text-xs text-muted mt-1">
              Extrae los metadatos con IA (Gemini), adjunta informe, diapositivas, sistema y planillas, y
              verifica los campos antes de guardar o enviar.
            </p>
          </div>
          <SecondaryButton
            onClick={runAI}
            loading={analyzing}
            disabled={!pdf || sending}
            icon={<Bot size={15} />}
            active={!!extraction}
          >
            {analyzing
              ? "Analizando con IA..."
              : extraction
              ? "Re-analizar con IA"
              : "Analizar con IA (Gemini)"}
          </SecondaryButton>
        </div>

        <div className="space-y-3 mb-6 empty:hidden">
          {error && (
            <Alert tone="error" titulo="Revisa los requisitos del formulario" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
          {extraction && (
            <Alert
              tone={extraction.source === "gemini" ? "success" : "info"}
              titulo={
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

        <MetadataFields
          value={meta}
          onChange={(next) => {
            setMeta(next);
            setErrors({});
          }}
          tutors={tutors}
          disabled={sending}
          filesSection={filesSection}
        />

        {/* Resumen de errores por campo si existen */}
        {Object.keys(errors).length > 0 && (
          <div className="mt-5 card-flat border-red-500/40 p-4 space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wider text-red-500">
              Detalle de problemas detectados:
            </p>
            <ul className="list-disc list-inside text-xs text-red-500 space-y-1">
              {Object.entries(errors).map(([key, msg]) => (
                <li key={key}>
                  <strong className="capitalize">{key}:</strong> {msg}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-8 pt-5 border-t border-line flex flex-wrap gap-3 justify-between items-center">
          <div className="text-xs text-muted flex flex-wrap items-center gap-2">
            <FileBadge size={14} />
            Los campos marcados con <span className="text-cyan-500">*</span> son obligatorios para el envío
            final.
            {planilla ? (
              <span className="text-emerald-500 font-medium inline-flex items-center gap-1">
                <CheckCircle2 size={12} /> Planilla adjunta
              </span>
            ) : (
              <span className="text-amber-500 font-medium inline-flex items-center gap-1">
                <AlertTriangle size={12} /> Sin planilla firmada
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <SecondaryButton onClick={resetAll} icon={<X size={14} />} disabled={sending}>
              Limpiar
            </SecondaryButton>
            {isStudent ? (
              <>
                <SecondaryButton
                  onClick={() => void handleSave("borrador")}
                  loading={sending}
                  disabled={sending}
                  icon={<Save size={15} />}
                >
                  Guardar borrador validado
                </SecondaryButton>
                <PrimaryButton
                  onClick={() => void handleSave("enviado_tutor")}
                  loading={sending}
                  disabled={sending}
                  icon={<Upload size={16} />}
                >
                  {sending ? "Enviando..." : "ENVIAR AL TUTOR"}
                </PrimaryButton>
              </>
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
