import { Router } from "express";
import { listarMedicos } from "../controllers/medicosController.js";

const router = Router();

router.get("/", listarMedicos);

export default router;