import supabase from "../database/supabase.js";
const sessoes = {};

export const chat = async (req, res) => {
  const { mensagem, paciente_nome } = req.body;

  if (!mensagem) {
    return res.json({
      resposta:
        "Envie a mensagem. Ex.: /api/chat?mensagem=consulta&paciente_nome=SeuNome",
    });
  }
  const pacienteNome = paciente_nome || "Visitante";

  let pacienteId = req.body?.paciente_id || null;
  if (!pacienteId && pacienteNome && pacienteNome !== "Visitante") {
    try {
      const { data: pSel } = await supabase
        .from("pacientes")
        .select("id")
        .ilike("nome", `%${pacienteNome}%`)
        .limit(1);
      if (Array.isArray(pSel) && pSel[0]?.id) {
        pacienteId = pSel[0].id;
      } else {
        const { data: pNovo } = await supabase
          .from("pacientes")
          .insert([{ nome: pacienteNome }])
          .select("id")
          .single();
        pacienteId = pNovo?.id ?? null;
      }
    } catch {}
  }
  if (!pacienteId) {
    pacienteId = `anon:${(pacienteNome || "visitante").toLowerCase()}`;
  }
  if (!sessoes[pacienteId]) {
    sessoes[pacienteId] = {
      etapa: "inicio",
      nome: null,
      medico: null,
      data: null,
      hora: null,
    };
  }
  const sessao = sessoes[pacienteId];
  const textoSessao = (mensagem || "").toLowerCase().trim();
  const toSeconds = (h) => (/^\d{2}:\d{2}$/.test(h) ? `${h}:00` : h);
  if (sessao.etapa === "inicio") {
    sessao.etapa = "aguardando_nome";
    return res.json({ resposta: "Qual é o seu nome completo?" });
  }
  if (sessao.etapa === "aguardando_nome") {
    sessao.nome = textoSessao;
    sessao.etapa = "aguardando_medico";
    return res.json({ resposta: "Qual médico você deseja consultar?" });
  }
  if (sessao.etapa === "aguardando_medico") {
    sessao.medico = textoSessao;
    sessao.etapa = "aguardando_data";
    return res.json({ resposta: "Informe a data no formato YYYY-MM-DD." });
  }
  if (sessao.etapa === "aguardando_data") {
    const m = textoSessao.match(/^\d{4}-\d{2}-\d{2}$/);
    if (!m) return res.json({ resposta: "Data inválida. Use YYYY-MM-DD." });
    sessao.data = m[0];
    sessao.etapa = "aguardando_hora";
    return res.json({ resposta: "Informe a hora no formato HH:MM ou HH:MM:SS." });
  }
  if (sessao.etapa === "aguardando_hora") {
    const hm = textoSessao.match(/^\d{2}:\d{2}(?::\d{2})?$/);
    if (!hm) return res.json({ resposta: "Hora inválida. Use HH:MM ou HH:MM:SS." });
    sessao.hora = toSeconds(hm[0]);
    let medicoParaAgendar = null;
    try {
      const { data: candidatos } = await supabase
        .from("medicos")
        .select("id,nome")
        .ilike("nome", `%${sessao.medico}%`)
        .eq("ativo", true)
        .limit(1);
      medicoParaAgendar = candidatos?.[0] ?? null;
    } catch {}
    if (!medicoParaAgendar) {
      sessao.etapa = "aguardando_medico";
      return res.json({ resposta: "Médico não encontrado. Informe o nome novamente." });
    }
    const data = sessao.data;
    const hora = sessao.hora;
    const { data: disponibilidade, error: errDisp } = await supabase
      .from("disponibilidades")
      .select("*")
      .eq("medico_id", medicoParaAgendar.id)
      .eq("data", data)
      .eq("horario", hora)
      .eq("disponivel", true)
      .single();
    if (errDisp) return res.status(500).json({ error: errDisp.message });
    if (!disponibilidade) {
      return res.json({ resposta: `Horário ${data} às ${hora} indisponível. Informe outra hora.` });
    }
    let pid = pacienteId;
    if (typeof pid === "string" && pid.startsWith("anon:") && sessao.nome) {
      try {
        const { data: pSel } = await supabase
          .from("pacientes")
          .select("id")
          .ilike("nome", `%${sessao.nome}%`)
          .limit(1);
        if (Array.isArray(pSel) && pSel[0]?.id) {
          pid = pSel[0].id;
        } else {
          const { data: pNovo } = await supabase
            .from("pacientes")
            .insert([{ nome: sessao.nome }])
            .select("id")
            .single();
          pid = pNovo?.id ?? pid;
        }
      } catch {}
    }
    const payload = {
      medico_id: medicoParaAgendar.id,
      disponibilidade_id: disponibilidade.id,
      status: "agendado",
    };
    if (pid && !String(pid).startsWith("anon:")) payload.paciente_id = pid;
    const { error: errAg } = await supabase
      .from("agendamentos")
      .insert([payload])
      .select()
      .single();
    if (errAg) return res.status(500).json({ error: errAg.message });
    const { error: errUpd } = await supabase
      .from("disponibilidades")
      .update({ disponivel: false })
      .eq("id", disponibilidade.id);
    if (errUpd) return res.status(500).json({ error: errUpd.message });
    sessoes[pacienteId] = { etapa: "inicio", nome: null, medico: null, data: null, hora: null };
    return res.json({ resposta: `Consulta agendada em ${data} às ${hora}.` });
  }

  const normalize = (s) =>
    s
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
  const texto = normalize(mensagem);
  const strip = (s) => normalize(s).replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  const textoStripped = strip(mensagem);

  // Etapa 1: Perguntar especialidade
  if (texto.includes("consulta")) {
    return res.json({ resposta: "Qual especialidade você deseja?" });
  }

  // Etapa 2: Escolher especialidade → listar médicos
  const especialidades = ["Proctologia", "Dermatologia", "Clinico geral", "Nutrição", "Urologia", "Ginecologia"];

  for (let esp of especialidades) {
    const espNorm = normalize(esp);
    if (texto.includes(espNorm)) {
      const espNoAcc = esp.normalize("NFD").replace(/\p{Diacritic}/gu, "");
      const orFilter = `especialidade.ilike.%${esp}%,especialidade.ilike.%${espNoAcc}%`;
      const { data: medicos, error } = await supabase
        .from("medicos")
        .select("*")
        .or(orFilter)
        .eq("ativo", true);

      if (error) return res.status(500).json({ error: error.message });

      if (medicos.length === 0)
        return res.json({ resposta: `Não há médicos disponíveis para ${esp}` });

      // Resposta com lista de médicos
      const listaMedicos = medicos.map((m) => `${m.nome}`).join(", ");
      return res.json({ resposta: `Médicos disponíveis em ${esp}: ${listaMedicos}` });
    }
  }

  // Etapa 3: Escolher médico → listar horários
  const { data: medicosAtivos } = await supabase
    .from("medicos")
    .select("id,nome")
    .eq("ativo", true);
  let medicoEscolhido = null;
  if (Array.isArray(medicosAtivos)) {
    for (const m of medicosAtivos) {
      if (textoStripped.includes(strip(m.nome))) {
        medicoEscolhido = m;
        break;
      }
    }
  }
  // Se a mensagem já contiver data e hora, prioriza tentar o agendamento diretamente
  {
    const dateTimeR = /(\d{4}-\d{2}-\d{2})\s*[^\d]{0,5}\s*(\d{2}:\d{2}(?::\d{2})?)/i;
    const dt = dateTimeR.exec(mensagem);
    const dataOnly = mensagem.match(/(\d{4}-\d{2}-\d{2})/);
    const horaOnly = mensagem.match(/(\d{2}:\d{2}(?::\d{2})?)/);
    if (dt || (dataOnly && horaOnly)) {
      const data = dt ? dt[1] : dataOnly[1];
      const baseHora = dt ? dt[2] : horaOnly[1];
      const hora = /^\d{2}:\d{2}$/.test(baseHora) ? `${baseHora}:00` : baseHora;
      let medicoParaAgendar = medicoEscolhido;
      if (!medicoParaAgendar) {
        const nomeBruto = dt ? mensagem.slice(0, dt.index) : mensagem.replace(`${data}`, "").replace(`${hora}`, "");
        const possivelNome = nomeBruto
          .replace(/["“”]/g, "")
          .replace(/\b(?:às|as)\b/gi, "")
          .trim();
        if (possivelNome.length > 0) {
          const { data: candidatos } = await supabase
            .from("medicos")
            .select("id,nome")
            .ilike("nome", `%${possivelNome}%`)
            .limit(1);
          medicoParaAgendar = candidatos?.[0] ?? null;
        }
        if (!medicoParaAgendar && Array.isArray(medicosAtivos)) {
          for (const m of medicosAtivos) {
            if (strip(possivelNome || mensagem).includes(strip(m.nome))) {
              medicoParaAgendar = m;
              break;
            }
          }
        }
      }
      if (!medicoParaAgendar) {
        return res.json({ resposta: "Não identifiquei o médico. Envie: Nome do médico + data às hora" });
      }
      const { data: disponibilidade, error: errDisp } = await supabase
        .from("disponibilidades")
        .select("*")
        .eq("medico_id", medicoParaAgendar.id)
        .eq("data", data)
        .eq("horario", hora)
        .eq("disponivel", true)
        .single();
      if (errDisp) return res.status(500).json({ error: errDisp.message });
      if (!disponibilidade) {
        return res.json({ resposta: `Horário ${data} às ${hora} não disponível para ${medicoParaAgendar.nome}.` });
      }
      let pacienteId = null;
      try {
        const { data: pSel } = await supabase
          .from("pacientes")
          .select("id")
          .ilike("nome", `%${pacienteNome}%`)
          .limit(1);
        if (Array.isArray(pSel) && pSel[0]?.id) {
          pacienteId = pSel[0].id;
        } else {
          const { data: pNovo } = await supabase
            .from("pacientes")
            .insert([{ nome: pacienteNome }])
            .select("id")
            .single();
          pacienteId = pNovo?.id ?? null;
        }
      } catch {}
      const payload = {
        medico_id: medicoParaAgendar.id,
        disponibilidade_id: disponibilidade.id,
        status: "agendado",
      };
      if (pacienteId) payload.paciente_id = pacienteId;
      const { data: novoAg, error: errAg } = await supabase
        .from("agendamentos")
        .insert([payload])
        .select()
        .single();
      if (errAg) return res.status(500).json({ error: errAg.message });
      const { error: errUpd } = await supabase
        .from("disponibilidades")
        .update({ disponivel: false })
        .eq("id", disponibilidade.id);
      if (errUpd) return res.status(500).json({ error: errUpd.message });
      return res.json({ resposta: `Consulta agendada com ${medicoParaAgendar.nome} em ${data} às ${hora}` });
    }
  }
  if (medicoEscolhido) {
    const { data: horarios, error } = await supabase
      .from("disponibilidades")
      .select("*")
      .eq("medico_id", medicoEscolhido.id)
      .eq("disponivel", true)
      .order("data", { ascending: true })
      .order("horario", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    if (horarios.length === 0)
      return res.json({ resposta: `Não há horários disponíveis para ${medicoEscolhido.nome}` });
    const listaHorarios = horarios.map((h) => `${h.data} às ${h.horario}`).join(", ");
    return res.json({ resposta: `Horários disponíveis para ${medicoEscolhido.nome}: ${listaHorarios}` });
  }

  // removido: fluxo duplicado de agendamento

  // Mensagem default
  return res.json({ resposta: "Desculpe, não entendi. Pode repetir?" });
};
