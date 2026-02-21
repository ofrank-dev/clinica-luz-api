import axios from "axios";
import { chat } from "./chatController.js";

const BASE = (process.env.ZAPI_BASE_URL || "https://api.z-api.io").trim();
const TOKEN = (process.env.ZAPI_TOKEN || "").trim();
const INSTANCE = (process.env.ZAPI_INSTANCE || "").trim();
const CLIENT_TOKEN = String(process.env.ZAPI_CLIENT_TOKEN || "").trim();

const optionMemory = new Map();

function basePath() {
  const b = BASE.replace(/\/+$/, "");
  return `${b}/instances/${INSTANCE}/token/${TOKEN}`;
}

export async function zapiStatus(req, res) {
  try {
    if (!BASE || !TOKEN || !INSTANCE || !CLIENT_TOKEN) {
      return res.status(400).json({ error: "missing_zapi_env" });
    }
    const url = `${basePath()}/status`;
    const r = await axios.get(url, { headers: { "Client-Token": CLIENT_TOKEN } });
    return res.json({ ok: true, data: r.data });
  } catch (e) {
    const st = e?.response?.status;
    const data = e?.response?.data || e.message;
    return res.status(st || 500).json({ ok: false, error: data });
  }
}

async function sendText(to, text) {
  if (!BASE || !TOKEN || !INSTANCE) {
    console.warn("Z-API envio ignorado: BASE/TOKEN/INSTANCE ausentes");
    return;
  }
  try {
    const baseUrl = basePath();
    const pacienteId = String(to || "").replace(/\D/g, "");
    const resposta = text;
    const url = `${baseUrl}/send-text`;
    const payload = { phone: pacienteId, message: resposta };

    const _t = CLIENT_TOKEN;
    const _mask = _t ? `${_t.slice(0, 4)}...${_t.slice(-4)}` : "undefined";
    console.log("TOKEN:", _mask);

    const resSendText = await axios.post(url, payload, { 
      headers: { "Client-Token": CLIENT_TOKEN, "Content-Type": "application/json" } 
    });
    console.log("zapi sendText ok:", resSendText?.status);

  } catch (e) {
    console.error("zapi sendText error:", e?.response?.data || e.message);
  }
}

function buildMenuText(title, options = []) {
  const lines = [title, ...options.map((o, i) => `${i + 1}. ${o.label}`), "Responda com o número da opção."];
  return lines.join("\n");
}

async function sendButtons(to, title, options = []) {
  const phoneKey = String(to || "").replace(/\D/g, "");
  optionMemory.set(phoneKey, { options });
  const menu = buildMenuText(title, options);
  return sendText(to, menu);
}

async function sendList(to, title, options = []) {
  const phoneKey = String(to || "").replace(/\D/g, "");
  optionMemory.set(phoneKey, options);
  const menu = buildMenuText(title, options);
  return sendText(to, menu);
}

function pickNextType(options = []) {
  return "text";
}

async function invokeChatStructured({ mensagem, paciente_nome, extra = {}, hint = null }) {
  return new Promise((resolve, reject) => {
    const body = { mensagem, paciente_nome, ...extra };
    if (hint) body.hint = hint;
    const fakeReq = { body, query: { format: "structured" }, headers: { "x-chat-format": "structured" } };
    const fakeRes = { json: (data) => resolve(data), status: () => fakeRes };
    Promise.resolve(chat(fakeReq, fakeRes)).catch(reject);
  });
}

function parseInbound(body = {}) {
  const data = body.data || body;
  const from = data?.from || data?.phone || body?.from || body?.phone || data?.contact || null;
  const buttonId =
    data?.buttonId ||
    data?.button?.id ||
    data?.selectedId ||
    data?.interactive?.button_reply?.id ||
    data?.list?.id ||
    null;
  let text =
    data?.text?.message ||
    data?.text ||
    data?.message?.text ||
    data?.message ||
    data?.body ||
    body?.text ||
    body?.message ||
    body?.body ||
    "";
  if (typeof text === "object") {
    text = text?.message || text?.body || "";
  }
  text = typeof text === "string" ? text : String(text || "");
  return { from, buttonId, text };
}

function mapSelectionToParams(id) {
  if (!id) return { extra: {}, hint: null };
  if (id === "marcar_consulta" || id === "ver_medicos") return { extra: {}, hint: "LISTAR_ESPECIALIDADES" };
  if (id === "atendente") return { extra: {}, hint: "ATENDENTE" };
  if (id.startsWith("esp_")) return { extra: { especialidade: id.slice(4) }, hint: "LISTAR_MEDICOS" };
  if (id.startsWith("med_")) return { extra: { medico_id: Number(id.slice(4)) }, hint: "LISTAR_HORARIOS" };
  if (id.startsWith("disp_")) return { extra: { disponibilidade_id: Number(id.slice(5)) }, hint: "CRIAR_AGENDAMENTO" };
  return { extra: {}, hint: null };
}

export async function zapiHealth(req, res) {
  const debug = String(req.query?.debug || "").toLowerCase() === "1";
  const out = { status: "ok", provider: "zapi" };
  if (debug) {
    out.config = {
      base: !!BASE,
      instance: !!INSTANCE,
      token: !!TOKEN,
      clientToken: !!CLIENT_TOKEN,
    };
  }
  res.json(out);
}

export async function zapiWebhook(req, res) {
  try {
    const { from, buttonId, text } = parseInbound(req.body || {});
    if (!from) return res.status(400).json({ error: "Missing sender (from)" });
    const fromKey = String(from || "").replace(/\D/g, "");
    let extra = {};
    let hint = null;
    let mappedButtonId = buttonId || null;
    const tnum = String(text || "").trim();
    if (!mappedButtonId) {
      const state = optionMemory.get(fromKey);
      if (state?.options && /^\d+$/.test(tnum)) {
        const idx = Number(tnum) - 1;
        const chosen = state.options[idx];
        if (chosen) {
          mappedButtonId = chosen.id || null;
          if (chosen.params && typeof chosen.params === "object") extra = { ...extra, ...chosen.params };
          if (chosen.next_action) hint = chosen.next_action;
        }
      }
      if (!mappedButtonId) {
        if (tnum === "1") mappedButtonId = "marcar_consulta";
        else if (tnum === "2") mappedButtonId = "ver_medicos";
        else if (tnum === "3") mappedButtonId = "atendente";
      }
    }
    if (mappedButtonId && !hint) {
      const mapped = mapSelectionToParams(mappedButtonId);
      extra = { ...extra, ...(mapped.extra || {}) };
      hint = hint || mapped.hint || null;
    }
    const paciente_nome = `WhatsApp:${from}`;
    const paciente_telefone = from;
    const mensagem = mappedButtonId ? "menu" : (text || "oi");
    const result = await invokeChatStructured({ mensagem, paciente_nome, extra: { ...extra, paciente_telefone }, hint });
    const reply = result?.reply || "Pronto.";
    const options = Array.isArray(result?.options) ? result.options : [];
    const type = pickNextType(options);
    console.log("zapi reply:", { to: from, type, reply });
    if (options && options.length) {
      await sendButtons(from, reply, options);
    } else {
      await sendText(from, reply);
    }
    return res.json({ delivered: true });
  } catch (e) {
    console.error("zapiWebhook error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
}
