import { Router } from "express";
import medicosRoutes from "./medicosRoutes.js";
import agendamentosRoutes from "./agendamentosRoutes.js";
import { listarDisponibilidades } from "../controllers/disponibilidadeController.js";
import chatRoutes from "./chatRoutes.js";
import zapiRoutes from "./zapiRoutes.js";

const router = Router();

router.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

router.use("/medicos", medicosRoutes);

router.use("/agendamentos", agendamentosRoutes);

router.get("/disponibilidades/:medico_id", listarDisponibilidades);

router.use("/chat", chatRoutes);

router.use(
  "/chat-structured",
  (req, _res, next) => {
    req.query = req.query || {};
    req.query.format = "structured";
    next();
  },
  chatRoutes
);

router.post("/webhook-test", (req, res) => {
  console.log("🔥 WEBHOOK RECEBIDO:");
  console.log(JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

router.use("/zapi", zapiRoutes);

export default router;

