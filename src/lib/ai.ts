import { inflateSync } from "zlib";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import {
  LINEAS_INVESTIGACION,
  TIPOS_RECURSO,
  TRAYECTOS,
  slugify,
} from "./constants";
import type { AiExtraction, MetadataForm } from "./types";

export const GEMINI_SETTING_KEY = "gemini_api_key";
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const FALLBACK_MODELS = ["gemini-2.0-flash", "gemini-1.5-flash"];

/* ------------------------------------------------------------------ */
/* Clave de Gemini: .env tiene prioridad, luego la guardada en BD      */
/* ------------------------------------------------------------------ */
export async function getGeminiKey(): Promise<{ key: string | null; source: "env" | "servidor" | null }> {
  const envKey = process.env.GEMINI_API_KEY?.trim();
  if (envKey) return { key: envKey, source: "env" };
  try {
    const row = await db.select().from(settings).where(eq(settings.key, GEMINI_SETTING_KEY)).limit(1);
    const v = row[0]?.value?.trim();
    if (v) return { key: v, source: "servidor" };
  } catch {
    /* tabla aún no creada */
  }
  return { key: null, source: null };
}

export function maskKey(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

export async function saveGeminiKey(key: string | null): Promise<void> {
  await db
    .insert(settings)
    .values({ key: GEMINI_SETTING_KEY, value: key, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: key, updatedAt: new Date() },
    });
}

export function getModelName(): string {
  return DEFAULT_MODEL;
}

/* ------------------------------------------------------------------ */
/* Verificación de la clave                                            */
/* ------------------------------------------------------------------ */
export async function verifyGeminiKey(key: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}?key=${encodeURIComponent(key)}`,
      { method: "GET", signal: AbortSignal.timeout(10_000) }
    );
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return { ok: false, error: body?.error?.message || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sin conexión con Gemini" };
  }
}

/* ------------------------------------------------------------------ */
/* Normalización de resultados                                         */
/* ------------------------------------------------------------------ */
function closest<T extends readonly string[]>(value: unknown, options: T, fallback: T[number]): T[number] {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const v = value.toLowerCase();
  const exact = options.find((o) => o.toLowerCase() === v);
  if (exact) return exact;
  const partial = options.find((o) => o.toLowerCase().includes(v) || v.includes(o.toLowerCase()));
  if (partial) return partial;
  // coincidencia por palabras
  const words = v.split(/\W+/).filter((w) => w.length > 3);
  let best: { opt: T[number]; score: number } | null = null;
  for (const opt of options) {
    const ol = opt.toLowerCase();
    const score = words.reduce((acc, w) => acc + (ol.includes(w) ? 1 : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { opt, score };
  }
  return best?.opt ?? fallback;
}

function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string") return v.split(/[;,\n]/).map((x) => x.trim()).filter(Boolean);
  return [];
}

function normalizeTrayecto(v: unknown): string {
  if (typeof v !== "string") return "";
  const m = v.match(/(IV|III|II|I|[1-4])/i);
  if (!m) return "";
  const map: Record<string, string> = { "1": "I", "2": "II", "3": "III", "4": "IV" };
  const roman = (map[m[1]] ?? m[1]).toUpperCase();
  const found = TRAYECTOS.find((t) => t.endsWith(` ${roman}`));
  return found ?? "";
}

export function normalizeMetadata(raw: Record<string, unknown>): Partial<MetadataForm> {
  const title = String(raw.title ?? raw.title ?? "").trim();
  const anioRaw = String(raw.anio ?? raw.year ?? "").match(/(19|20)\d{2}/)?.[0] ?? "";
  const out: Partial<MetadataForm> = {
    title,
    codigo: String(raw.codigo ?? "").trim(),
    slug: String(raw.slug ?? "").trim() || (title ? slugify(title) : ""),
    tipoRecurso: closest(raw.tipo_recurso ?? raw.tipoRecurso, TIPOS_RECURSO, TIPOS_RECURSO[0]),
    pnf: "Informática",
    lineaInvestigacion: closest(
      raw.linea_investigacion ?? raw.lineaInvestigacion,
      LINEAS_INVESTIGACION,
      LINEAS_INVESTIGACION[2]
    ),
    autores: asList(raw.autores ?? raw.authors).join("; "),
    tutorNombre: String(raw.tutor ?? raw.tutorNombre ?? raw.director ?? "").trim(),
    anio: anioRaw,
    trayecto: normalizeTrayecto(raw.trayecto),
    palabrasClave: asList(raw.palabras_clave ?? raw.palabrasClave ?? raw.keywords).join("; "),
    resumen: String(raw.resumen ?? raw.abstract ?? "").trim(),
  };
  return out;
}

/* ------------------------------------------------------------------ */
/* Gemini                                                              */
/* ------------------------------------------------------------------ */
const PROMPT = `Eres un bibliotecólogo experto de una universidad politécnica venezolana (PNF Informática).
Analiza el documento académico adjunto (tesis, proyecto socio-tecnológico, trabajo especial de grado, pasantía, artículo o servicio comunitario) y extrae sus metadatos.
Responde ÚNICAMENTE con un objeto JSON válido con exactamente estas claves:
{
  "title": "título completo del trabajo",
  "codigo": "código del proyecto si aparece, si no cadena vacía",
  "tipo_recurso": "una de: ${TIPOS_RECURSO.join(" | ")}",
  "linea_investigacion": "una de: ${LINEAS_INVESTIGACION.join(" | ")}",
  "autores": ["nombre completo de cada autor"],
  "tutor": "nombre del tutor o director académico",
  "anio": "año de publicación (4 dígitos)",
  "trayecto": "Trayecto I | Trayecto II | Trayecto III | Trayecto IV | cadena vacía",
  "palabras_clave": ["palabra clave 1", "palabra clave 2"],
  "resumen": "resumen del trabajo en español (máximo 180 palabras)"
}
No inventes datos: si un dato no aparece en el documento usa cadena vacía o lista vacía.`;

async function callGemini(model: string, key: string, base64: string, mimeType: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    contents: [
      {
        role: "user",
        parts: [{ inline_data: { mime_type: mimeType, data: base64 } }, { text: PROMPT }],
      },
    ],
    generationConfig: { response_mime_type: "application/json", temperature: 0.1 },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  return res;
}

export async function extractWithGemini(
  key: string,
  buffer: Buffer,
  mimeType = "application/pdf"
): Promise<{ metadata: Partial<MetadataForm>; model: string }> {
  const base64 = buffer.toString("base64");
  const models = [DEFAULT_MODEL, ...FALLBACK_MODELS.filter((m) => m !== DEFAULT_MODEL)];
  let lastError = "Gemini no respondió";

  for (const model of models) {
    const res = await callGemini(model, key, base64, mimeType);
    if (res.status === 404) {
      lastError = `Modelo ${model} no disponible`;
      continue;
    }
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(err?.error?.message || `Gemini HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const jsonText = text.replace(/^```(?:json)?/m, "").replace(/```$/m, "").trim();
    const start = jsonText.indexOf("{");
    const end = jsonText.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("Gemini devolvió una respuesta sin JSON");
    const parsed = JSON.parse(jsonText.slice(start, end + 1)) as Record<string, unknown>;
    return { metadata: normalizeMetadata(parsed), model };
  }
  throw new Error(lastError);
}

/* ------------------------------------------------------------------ */
/* Extracción heurística (sin IA): lee el texto del PDF                 */
/* ------------------------------------------------------------------ */
function decodePdfString(s: string): string {
  return s
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\n/g, " ")
    .replace(/\\r/g, "")
    .replace(/\\t/g, " ")
    .replace(/\\\\/g, "\\")
    .replace(/\\(\d{3})/g, (_, oct: string) => String.fromCharCode(parseInt(oct, 8)));
}

export function extractPdfText(buffer: Buffer, maxChars = 40_000): string {
  const slice = buffer.subarray(0, Math.min(buffer.length, 4 * 1024 * 1024));
  const latin = slice.toString("latin1");
  const pieces: string[] = [];
  let total = 0;
  const streamRe = /stream\r?\n/g;
  let m: RegExpExecArray | null;

  while ((m = streamRe.exec(latin)) && total < maxChars) {
    const start = m.index + m[0].length;
    const end = latin.indexOf("endstream", start);
    if (end === -1) break;
    streamRe.lastIndex = end;
    const raw = Buffer.from(latin.slice(start, end), "latin1");
    let content: string;
    try {
      content = inflateSync(raw).toString("latin1");
    } catch {
      content = latin.slice(start, end);
    }
    if (!/T[Jj]/.test(content)) continue;

    const lines: string[] = [];
    const opRe = /\((?:\\.|[^\\)])*\)\s*Tj|\[((?:\\.|[^\]])*)\]\s*TJ|T\*|Td|TD|ET/g;
    let line = "";
    let op: RegExpExecArray | null;
    while ((op = opRe.exec(content))) {
      const tok = op[0];
      if (tok === "T*" || tok.endsWith("Td") || tok.endsWith("TD") || tok === "ET") {
        if (line.trim()) lines.push(line.trim());
        line = "";
        continue;
      }
      if (tok.endsWith("Tj")) {
        const inner = tok.slice(1, tok.lastIndexOf(")"));
        line += decodePdfString(inner);
      } else {
        const arr = op[1] ?? "";
        const partRe = /\(((?:\\.|[^\\)])*)\)|(-?\d+(?:\.\d+)?)/g;
        let p: RegExpExecArray | null;
        while ((p = partRe.exec(arr))) {
          if (p[1] !== undefined) line += decodePdfString(p[1]);
          else if (p[2] !== undefined && parseFloat(p[2]) < -180) line += " ";
        }
      }
    }
    if (line.trim()) lines.push(line.trim());
    const chunk = lines.join("\n");
    if (chunk.trim()) {
      pieces.push(chunk);
      total += chunk.length;
    }
  }
  return pieces.join("\n").replace(/[ \t]{2,}/g, " ").slice(0, maxChars);
}

function titleFromFilename(filename: string): string {
  return filename
    .replace(/\.pdf$/i, "")
    .replace(/[_\-]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function heuristicExtract(buffer: Buffer, filename: string): Partial<MetadataForm> {
  const text = extractPdfText(buffer);
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 2);

  // --- Título: bloque de líneas en mayúsculas al inicio del documento
  let title = "";
  const head = lines.slice(0, 80);
  const isUpper = (l: string) => l.length >= 15 && l === l.toUpperCase() && /[A-ZÁÉÍÓÚÑ]{3,}/.test(l);
  const skip =
    /UNIVERSIDAD|REP[UÚ]BLICA|MINISTERIO|PROGRAMA NACIONAL|INSTITUTO|VICERRECTOR|DEPARTAMENTO|PNF|FACULTAD|N[UÚ]CLEO|EXTENSI[OÓ]N|ESTADO|VENEZUELA|TRAYECTO|AUTOR|TUTOR|PROFESOR/i;
  let bestBlock: string[] = [];
  let cur: string[] = [];
  for (const l of head) {
    if (isUpper(l) && !skip.test(l)) cur.push(l);
    else {
      if (cur.join(" ").length > bestBlock.join(" ").length) bestBlock = cur;
      cur = [];
    }
  }
  if (cur.join(" ").length > bestBlock.join(" ").length) bestBlock = cur;
  if (bestBlock.length) title = bestBlock.slice(0, 5).join(" ");
  if (!title) {
    const longest = head.filter((l) => !skip.test(l)).sort((a, b) => b.length - a.length)[0];
    title = longest && longest.length > 20 ? longest : titleFromFilename(filename);
  }
  title = title.replace(/\s{2,}/g, " ").trim();
  if (title === title.toUpperCase() && title.length > 0) {
    title = title.charAt(0) + title.slice(1).toLowerCase();
  }

  // --- Año
  const current = new Date().getFullYear();
  const years = (text.match(/\b(19[89]\d|20[0-4]\d)\b/g) ?? [])
    .map(Number)
    .filter((y) => y >= 1990 && y <= current + 1);
  const anio = years.length ? String(Math.max(...years)) : "";

  // --- Autores / Tutor
  const autoresMatch = text.match(
    /(?:Autor(?:es|a|as)?|Elaborado por|Presentado por|Realizado por|Participantes?)\s*[:\-–]?\s*([^\n]{5,160})/i
  );
  const autores = autoresMatch
    ? autoresMatch[1]
        .split(/[;,]|\s+y\s+|\s{2,}/)
        .map((a) => a.replace(/C\.?I\.?:?.*$/i, "").trim())
        .filter((a) => a.length > 4 && /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(a))
        .slice(0, 5)
        .join("; ")
    : "";

  const tutorMatch = text.match(
    /(?:Tutor(?:a)?(?:\s+Acad[eé]mic[oa])?|Director(?:a)?|Asesor(?:a)?)\s*[:\-–]?\s*((?:Prof\.?|Dr[a]?\.?|Ing\.?|Lic\.?|MSc\.?|Msc\.?)?\s*[^\n]{4,80})/i
  );
  const tutorNombre = tutorMatch ? tutorMatch[1].replace(/C\.?I\.?:?.*$/i, "").trim() : "";

  // --- Palabras clave
  const kwMatch = text.match(/Palabras?\s+claves?\s*[:\-–]?\s*([^\n]{5,250})/i);
  const palabrasClave = kwMatch
    ? kwMatch[1]
        .split(/[;,.]/)
        .map((k) => k.trim())
        .filter((k) => k.length > 2)
        .slice(0, 8)
        .join("; ")
    : "";

  // --- Resumen
  const resMatch = text.match(/RESUMEN\s*\n([\s\S]{80,1600}?)(?:\n\s*Palabras|\n\s*ABSTRACT|\n\s*\n\s*\n)/i);
  const resumen = resMatch ? resMatch[1].replace(/\s+/g, " ").trim() : "";

  // --- Trayecto
  const trayecto = normalizeTrayecto(text.match(/Trayecto\s+(IV|III|II|I|[1-4])\b/i)?.[1] ?? "");

  // --- Tipo de recurso
  const lower = text.toLowerCase();
  let tipoRecurso: string = TIPOS_RECURSO[0];
  if (/trabajo especial de grado|tesis/.test(lower)) tipoRecurso = TIPOS_RECURSO[1];
  else if (/pasant[ií]a/.test(lower)) tipoRecurso = TIPOS_RECURSO[2];
  else if (/art[ií]culo/.test(lower) && /revista|investigaci[oó]n/.test(lower)) tipoRecurso = TIPOS_RECURSO[3];
  else if (/servicio comunitario/.test(lower)) tipoRecurso = TIPOS_RECURSO[4];
  else if (/socio\s*-?\s*tecnol/.test(lower)) tipoRecurso = TIPOS_RECURSO[0];

  // --- Línea de investigación (por puntuación de términos)
  const scoring: [string, RegExp][] = [
    ["Seguridad en Redes de Computadoras", /seguridad.{0,30}red|firewall|intrusi[oó]n/g],
    ["Seguridad Informática.", /seguridad inform|cifrad|criptograf|vulnerabilidad/g],
    ["Software Educativo", /software educativo|aprendizaje|did[aá]ctic|estudiantes de|docente/g],
    ["Inteligencia Artificial.", /inteligencia artificial|aprendizaje autom|machine learning|red neuronal|modelo predictivo|chatbot/g],
    ["Redes Informáticas", /red(?:es)? inform|cableado|infraestructura de red|topolog[ií]a/g],
    ["Soporte Técnico (LRI, LST)", /soporte t[eé]cnico|mantenimiento (?:preventivo|correctivo)|mesa de ayuda|help ?desk/g],
    ["Administración y Minería de Datos", /miner[ií]a de datos|big data|an[aá]lisis de datos|data warehouse/g],
    ["Gestión de Información (LGI)", /gesti[oó]n de (?:la )?informaci[oó]n|documental|repositorio/g],
    ["Plataforma Tecnológica en Educación", /plataforma|moodle|aula virtual|e-learning/g],
    ["Software Libre", /software libre|gnu|linux|canaima|c[oó]digo abierto/g],
    ["Calidad en el Desarrollo de Sistemas Informáticos", /calidad|pruebas de software|iso\s?\d{4}|m[eé]tricas/g],
    ["Programación Avanzada", /algoritmo|programaci[oó]n avanzada|compilador|concurren/g],
    ["Desarrollo de Sistemas de Información y Modelo de Datos (LSD, LAW, LTE)", /sistema de informaci[oó]n|aplicaci[oó]n web|base de datos|sistema automatizado|m[oó]dulo/g],
  ];
  let lineaInvestigacion: string = LINEAS_INVESTIGACION[2];
  let bestScore = 0;
  for (const [linea, re] of scoring) {
    const score = (lower.match(re) ?? []).length;
    if (score > bestScore) {
      bestScore = score;
      lineaInvestigacion = linea;
    }
  }

  // --- Código
  const codigo = text.match(/C[oó]digo\s*(?:del\s+proyecto)?\s*[:\-–]?\s*([A-Z0-9][A-Z0-9\-\/]{3,20})/i)?.[1] ?? "";

  return {
    title,
    codigo,
    slug: slugify(title),
    tipoRecurso,
    pnf: "Informática",
    lineaInvestigacion,
    autores,
    tutorNombre,
    anio,
    trayecto,
    palabrasClave,
    resumen,
  };
}

/* ------------------------------------------------------------------ */
/* Orquestador                                                         */
/* ------------------------------------------------------------------ */
export async function extractMetadata(buffer: Buffer, filename: string, mimeType: string): Promise<AiExtraction> {
  const { key } = await getGeminiKey();
  if (key) {
    try {
      const { metadata, model } = await extractWithGemini(key, buffer, mimeType);
      return { source: "gemini", model, metadata };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error de Gemini";
      const metadata = heuristicExtract(buffer, filename);
      return {
        source: "heuristico",
        message: `Gemini no disponible (${msg}). Se aplicó extracción heurística local.`,
        metadata,
      };
    }
  }
  return {
    source: "heuristico",
    message:
      "No hay clave de Gemini configurada. Se aplicó extracción heurística local del texto del PDF; configura la IA desde Administrador → Servidor.",
    metadata: heuristicExtract(buffer, filename),
  };
}
