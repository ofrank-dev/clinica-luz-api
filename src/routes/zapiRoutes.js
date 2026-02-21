import { Router } from "express";
import { zapiHealth, zapiWebhook, zapiStatus, zapiRunReminders } from "../controllers/zapiController.js";

const router = Router();

router.get("/health", zapiHealth);
router.get("/status", zapiStatus);
router.post("/webhook", zapiWebhook);
router.get("/reminders/run", zapiRunReminders);

export default router;
