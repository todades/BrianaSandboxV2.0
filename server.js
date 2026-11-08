/**
 * BRIANA · Arranque de producción para Render.
 *
 * Render puede ejecutar `node server.js` o `npm start`.
 * Este archivo NO sustituye las rutas de Next.js: sirve la aplicación ya
 * compilada por `next build`, incluidas las rutas `/api/*`.
 */
const http = require("node:http");
const next = require("next");

const port = Number.parseInt(process.env.PORT || "3000", 10);
const hostname = process.env.HOST || "0.0.0.0";
const dev = process.env.NODE_ENV === "development";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("[BRIANA] PORT inválido:", process.env.PORT);
  process.exit(1);
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const server = http.createServer((req, res) => {
      handle(req, res).catch((error) => {
        console.error("[BRIANA] Error atendiendo la solicitud:", error);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
        }
        res.end(JSON.stringify({ error: "Error interno del servidor." }));
      });
    });

    server.on("error", (error) => {
      console.error("[BRIANA] No se pudo iniciar el servidor:", error);
      process.exit(1);
    });

    server.listen(port, hostname, () => {
      console.log(`[BRIANA] Servidor listo en http://${hostname}:${port}`);
    });

    const shutdown = () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 10000).unref();
    };

    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
  })
  .catch((error) => {
    console.error("[BRIANA] Falló el arranque de Next.js:", error);
    process.exit(1);
  });
