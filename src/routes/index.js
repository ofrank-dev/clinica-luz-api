import { Router } from "express";
import medicosRoutes from "./medicosRoutes.js";
import agendamentosRoutes from "./agendamentosRoutes.js";
import { listarDisponibilidades } from "../controllers/disponibilidadeController.js";
import chatRoutes from "./chatRoutes.js";

const router = Router();

router.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

router.use("/medicos", medicosRoutes);

router.use("/agendamentos", agendamentosRoutes);

router.get("/disponibilidades/:medico_id", listarDisponibilidades);

router.use("/chat", chatRoutes);



export default router;
