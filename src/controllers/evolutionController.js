import axios from "axios";
import { chat } from "./chatController.js";

const BASE = process.env.EVOLUTION_BASE_URL || "";
const API_KEY = process.env.EVOLUTION_API_KEY || "";
const INSTANCE = process.env.EVOLUTION_INSTANCE || "";

function authHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;
  return headers;
}

async function sendText(to, text) {
  if (!BASE || !INSTANCE) return;
  try {
    await axios.post(
      `${BASE.replace(/\/+$/, "")}/message/sendText`,
      { instanceId: INSTANCE, to, text },
      { headers: authHeaders() }
    );
  } catch (e) {
    console.error("Evolution sendText error:", e?.response?.data || e.message);
  }
}

async function sendButtons(to, title, options = []) {
  if (!BASE || !INSTANCE) return sendText(to, title);
  try {
    const buttons = options.slice(0, 3).map((o) => ({
      id: o.id,
      text: o.label,
    }));
    await axios.post(
      `${BASE.replace(/\/+$/, "")}/message/sendButtons`,
      { instanceId: INSTANCE, to, title, buttons },
      { headers: authHeaders() }
    );
  } catch (e) {
    console.error("Evolution sendButtons error:", e?.response?.data || e.message);
    await sendText(to, title);
  }
}

async function sendList(to, title, options = []) {
  if (!BASE || !INSTANCE) return sendText(to, title);
  try {
    const items = options.map((o) => ({ id: o.id, title: o.label }));
    await axios.post(
      `${BASE.replace(/\/+$/, "")}/message/sendList`,
      { instanceId: INSTANCE, to, title, items },
      { headers: authHeaders() }
    );
  } catch (e) {
    console.error("Evolution sendList error:", e?.response?.data || e.message);
    await sendButtons(to, title, options.slice(0, 3));
  }
}

function pickNextType(options = []) {
  if (!options || !options.length) return "text";
  return options.length <= 3 ? "buttons" : "list";
}

async function invokeChatStructured({ mensagem, paciente_nome, extra = {} }) {
  return new Promise((resolve, reject) => {
    const fakeReq = {
      body: { mensagem, paciente_nome, ...extra },
      query: { format: "structured" },
      headers: { "x-chat-format": "structured" },
    };
    const fakeRes = {
      json: (data) => resolve(data),
      status: () => fakeRes,
    };
    Promise.resolve(chat(fakeReq, fakeRes)).catch(reject);
  });
}

function parseInbound(body = {}) {
  const data = body.data || body;
  const from =
    data.from ||
    body.from ||
    data.remoteJid ||
    data.chatId ||
    data.contact ||
    null;
  const buttonId =
    data?.button?.id ||
    data?.buttonId ||
    data?.interactive?.button_reply?.id ||
    data?.selected?.id ||
    data?.list?.id ||
    null;
  const text =
    data?.text ||
    data?.message?.text ||
    data?.message?.text?.body ||
    body?.text ||
    "";
  return { from, buttonId, text };
}

function mapSelectionToParams(id) {
  if (!id) return { extra: {}, hint: null };
  if (id === "marcar_consulta" || id === "ver_medicos") {
    return { extra: {}, hint: "LISTAR_ESPECIALIDADES" };
  }
  if (id === "atendente") {
    return { extra: {}, hint: "ATENDENTE" };
  }
  if (id.startsWith("esp_")) {
    const especialidade = id.slice(4);
    return { extra: { especialidade }, hint: "LISTAR_MEDICOS" };
  }
  if (id.startsWith("med_")) {
    const medico_id = Number(id.slice(4));
    return { extra: { medico_id }, hint: "LISTAR_HORARIOS" };
  }
  if (id.startsWith("disp_")) {
    const disponibilidade_id = Number(id.slice(5));
    return { extra: { disponibilidade_id }, hint: "CRIAR_AGENDAMENTO" };
  }
  return { extra: {}, hint: null };
}

export async function evolutionHealth(req, res) {
  res.json({ status: "ok", provider: "evolution" });
}

export async function evolutionWebhook(req, res) {
  try {
    const { from, buttonId, text } = parseInbound(req.body || {});
    if (!from) {
      return res.status(400).json({ error: "Missing sender (from)" });
    }
    // Escolha do usuário (botão/lista) tem prioridade
    let extra = {};
    if (buttonId) {
      ({ extra } = mapSelectionToParams(buttonId));
    }
    const paciente_nome = `WhatsApp:${from}`;
    const paciente_telefone = from;
    const mensagem = buttonId ? "menu" : (text || "oi");
    const result = await invokeChatStructured({ mensagem, paciente_nome, extra: { ...extra, paciente_telefone } });

    const reply = result?.reply || "Pronto.";
    const options = Array.isArray(result?.options) ? result.options : [];
    const type = pickNextType(options);
    if (type === "buttons") {
      await sendButtons(from, reply, options);
    } else if (type === "list") {
      await sendList(from, reply, options);
    } else {
      await sendText(from, reply);
    }
    return res.json({ delivered: true });
  } catch (e) {
    console.error("evolutionWebhook error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
}
