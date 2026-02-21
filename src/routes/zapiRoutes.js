import { Router } from "express";
import { zapiHealth, zapiWebhook, zapiStatus } from "../controllers/zapiController.js";

const router = Router();

router.get("/health", zapiHealth);
router.get("/status", zapiStatus);
router.post("/webhook", zapiWebhook);

export default router;
