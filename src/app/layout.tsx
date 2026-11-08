import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "BRIANA — Repositorio Académico Institucional",
  description:
    "Sistema institucional de repositorio académico y extracción de metadatos con IA (PNF Informática).",
};

/* Aplica el tema guardado en localStorage antes del primer pintado (evita parpadeo). */
const themeScript = `(function(){try{var t=localStorage.getItem('briana-theme');var d=t?t==='dark':true;var c=document.documentElement.classList;d?c.add('dark'):c.remove('dark');}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-app text-ink antialiased selection:bg-cyan-500/30">
        {children}
      </body>
    </html>
  );
}
