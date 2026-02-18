import express from "express";
import dotenv from "dotenv";
import routes from "./routes/index.js";

dotenv.config();

const app = express();

app.use(express.json());

// CORS configurável via .env (ALLOWED_ORIGINS=dominio1.com,dominio2.com)
app.use((req, res, next) => {
  const allowed = (process.env.ALLOWED_ORIGINS || "*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = req.headers.origin;
  if (allowed.includes("*")) {
    res.header("Access-Control-Allow-Origin", "*");
  } else if (origin && allowed.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
  }
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Logs claros de requisição
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(`[req] ${req.method} ${req.originalUrl} -> ${res.statusCode} ${ms}ms`);
  });
  next();
});

app.get("/", (req, res) => {
  res.json({
    name: "Clínica Luz API",
    status: "online",
    health: "/api/health",
  });
});

app.use("/api", routes);

// 404 handler consistente
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    path: req.originalUrl,
  });
});

// Error handler consistente
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const code = err.code || "INTERNAL_ERROR";
  console.error(`[err] ${req.method} ${req.originalUrl} -> ${status} ${code}`, err.stack || err.message);
  res.status(status).json({
    error: code,
    message: err.message || "Erro interno do servidor",
  });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  const publicBase = process.env.PUBLIC_BASE_URL ? `${process.env.PUBLIC_BASE_URL.replace(/\/+$/, "")}/api` : null;
  const baseInfo = publicBase ? `Base pública: ${publicBase}` : "Defina PUBLIC_BASE_URL para log de URL pública";
  console.log(`Servidor iniciado: porta ${PORT} | Base: /api | ${baseInfo}`);
});

