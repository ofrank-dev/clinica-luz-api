import { Router } from "express";
import { criarAgendamento, listarAgendamentos, obterAgendamento, cancelarAgendamento } from "../controllers/agendamentosController.js";

const router = Router();

router.get("/", listarAgendamentos);
router.get("/:id", obterAgendamento);
router.post("/", criarAgendamento);
router.delete("/:id", cancelarAgendamento);

export default router;
