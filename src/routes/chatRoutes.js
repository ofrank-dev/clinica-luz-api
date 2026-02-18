import { Router } from "express";
import { chat } from "../controllers/chatController.js";

const router = Router();

router.get("/", (req, res) => {
  const { mensagem, paciente_nome, q } = req.query;
  const msg = mensagem ?? q ?? "";
  req.body = { mensagem: msg, paciente_nome };
  return chat(req, res);
});

router.post("/", chat);

export default router;
