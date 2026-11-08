import { handleError, HttpError, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { extractMetadata } from "@/lib/ai";
import { MAX_PDF_BYTES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Extracción de metadatos con IA. La clave de Gemini vive en el servidor
 * (.env o configuración del administrador) y nunca se expone al navegador.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const form = await req.formData();
    const pdf = form.get("pdf");
    if (!(pdf instanceof File) || pdf.size === 0) throw new HttpError(400, "Adjunta un PDF para analizar.");
    const isPdf = pdf.type === "application/pdf" || pdf.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) throw new HttpError(400, "Solo se analizan archivos PDF.");
    if (pdf.size > MAX_PDF_BYTES) throw new HttpError(400, "El PDF supera el máximo de 20 MB.");

    const buffer = Buffer.from(await pdf.arrayBuffer());
    const result = await extractMetadata(buffer, pdf.name, "application/pdf");

    await logAudit({
      user,
      action: "IA_EXTRACCION_METADATOS",
      entity: "archivo",
      details: { filename: pdf.name, size: pdf.size, source: result.source, model: result.model },
    });

    return Response.json(result);
  } catch (e) {
    return handleError(e);
  }
}
