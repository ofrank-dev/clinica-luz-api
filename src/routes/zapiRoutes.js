import { Router } from "express";
import { zapiHealth, zapiWebhook } from "../controllers/zapiController.js";

const router = Router();

router.get("/health", zapiHealth);
router.post("/webhook", zapiWebhook);

export default router;
