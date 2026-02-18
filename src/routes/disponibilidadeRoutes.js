import { Router } from "express";
import { listarDisponibilidades } from "../controllers/disponibilidadeController.js";

const router = Router();

// GET /api/disponibilidades/:medico_id
router.get("/:medico_id", listarDisponibilidades);

export default router;