import { Router } from "express";
import { zapiHealth, zapiWebhook } from "../controllers/zapiController.js";

const router = Router();

router.get("/zapi/health", zapiHealth);
router.post("/zapi/webhook", zapiWebhook);

export default router;
