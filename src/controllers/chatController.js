import supabase from "../database/supabase.js";
const sessoes = {};

export const chat = async (req, res) => {
  const { mensagem, paciente_nome } = req.body;
  const pacienteTelefone = req.body?.paciente_telefone || null;
  const structured =
    String(req?.query?.format || "").toLowerCase() === "structured" ||
    String(req?.body?.format || "").toLowerCase() === "structured" ||
    String(req?.headers?.["x-chat-format"] || "").toLowerCase() === "structured";
  const send = (action, params, reply, options) => {
    if (structured) {
      const out = { action, params: params || {}, reply };
      if (options && Array.isArray(options) && options.length) out.options = options;
      return res.json(out);
    }
    return res.json({ resposta: reply });
  };

  if (!mensagem) {
    return send(
      "FALLBACK",
      {},
      "Envie a mensagem. Ex.: /api/chat?mensagem=consulta&paciente_nome=SeuNome"
    );
  }
  const pacienteNome = paciente_nome || "Visitante";

  if (structured) {
    const { especialidade, medico_id, disponibilidade_id } = req.body || {};
    try {
      if (disponibilidade_id) {
        const { data: disp, error: eDisp } = await supabase
          .from("disponibilidades")
          .select("*")
          .eq("id", disponibilidade_id)
          .eq("disponivel", true)
          .single();
        if (eDisp || !disp) {
          return send("LISTAR_HORARIOS", { medico_id }, "Horário indisponível. Escolha outro.");
        }
        const mid = medico_id || disp.medico_id;
        let pId = null;
        try {
          if (pacienteTelefone) {
            const { data: pByTel } = await supabase
              .from("pacientes")
              .select("id")
              .eq("telefone", pacienteTelefone)
              .limit(1);
            pId = pByTel?.[0]?.id || null;
            if (!pId && pacienteNome && pacienteNome !== "Visitante") {
              const { data: pNovoTel } = await supabase
                .from("pacientes")
                .insert([{ nome: pacienteNome, telefone: pacienteTelefone }])
                .select("id")
                .single();
              pId = pNovoTel?.id || null;
            }
          } else {
            const { data: pSel } = await supabase
              .from("pacientes")
              .select("id")
              .ilike("nome", `%${pacienteNome}%`)
              .limit(1);
            pId = pSel?.[0]?.id || null;
            if (!pId && pacienteNome && pacienteNome !== "Visitante") {
              const { data: pNovo } = await supabase
                .from("pacientes")
                .insert([{ nome: pacienteNome }])
                .select("id")
                .single();
              pId = pNovo?.id || null;
            }
          }
        } catch {}
        const payload = {
          medico_id: mid,
          disponibilidade_id: disp.id,
          status: "agendado",
        };
        if (pId) payload.paciente_id = pId;
        const { data: novoAg, error: eAg } = await supabase
          .from("agendamentos")
          .insert([payload])
          .select()
          .single();
        if (eAg) return res.status(500).json({ error: eAg.message });
        await supabase.from("disponibilidades").update({ disponivel: false }).eq("id", disp.id);
        return send(
          "CRIAR_AGENDAMENTO",
          {
            medico_id: mid,
            disponibilidade_id: disp.id,
            data: disp.data,
            hora: disp.horario,
            paciente_nome: pacienteNome,
            paciente_telefone: pacienteTelefone || undefined,
            agendamento_id: novoAg?.id,
          },
          `Consulta agendada em ${disp.data} às ${disp.horario}.`
        );
      }
      if (medico_id) {
        const { data: horarios, error: eHor } = await supabase
          .from("disponibilidades")
          .select("*")
          .eq("medico_id", medico_id)
          .eq("disponivel", true)
          .order("data", { ascending: true })
          .order("horario", { ascending: true });
        if (eHor) return res.status(500).json({ error: eHor.message });
        if (!horarios || horarios.length === 0) {
          return send("LISTAR_HORARIOS", { medico_id }, "Não há horários disponíveis.");
        }
        const opts = horarios.slice(0, 10).map((h) => ({
          id: `disp_${h.id}`,
          label: `${h.data} ${h.horario}`,
          next_action: "CRIAR_AGENDAMENTO",
          params: { disponibilidade_id: h.id, medico_id },
        }));
        const lista = horarios.map((h) => `${h.data} às ${h.horario}`).join(", ");
        return send("LISTAR_HORARIOS", { medico_id }, `Horários disponíveis: ${lista}`, opts);
      }
      if (especialidade) {
        const esp = String(especialidade);
        const espNoAcc = esp.normalize("NFD").replace(/\p{Diacritic}/gu, "");
        const orFilter = `especialidade.ilike.%${esp}%,especialidade.ilike.%${espNoAcc}%`;
        const { data: medicos, error: eMed } = await supabase
          .from("medicos")
          .select("*")
          .or(orFilter)
          .eq("ativo", true);
        if (eMed) return res.status(500).json({ error: eMed.message });
        if (!medicos || medicos.length === 0) {
          return send("LISTAR_MEDICOS", { especialidade: esp }, `Não há médicos disponíveis para ${esp}`);
        }
        const opts = medicos.slice(0, 10).map((m) => ({
          id: `med_${m.id}`,
          label: m.nome,
          next_action: "LISTAR_HORARIOS",
          params: { medico_id: m.id, medico_nome: m.nome },
        }));
        const lista = medicos.map((m) => `${m.nome}`).join(", ");
        return send("LISTAR_MEDICOS", { especialidade: esp }, `Médicos disponíveis em ${esp}: ${lista}`, opts);
      }
    } catch (e) {
      // prossegue com a lógica padrão caso algo falhe
    }
  }

  let pacienteId = req.body?.paciente_id || null;
  if (!pacienteId && pacienteTelefone) {
    try {
      const { data: pByTel } = await supabase
        .from("pacientes")
        .select("id")
        .eq("telefone", pacienteTelefone)
        .limit(1);
      if (Array.isArray(pByTel) && pByTel[0]?.id) {
        pacienteId = pByTel[0].id;
      } else if (pacienteNome && pacienteNome !== "Visitante") {
        const { data: pNovoTel } = await supabase
          .from("pacientes")
          .insert([{ nome: pacienteNome, telefone: pacienteTelefone }])
          .select("id")
          .single();
        pacienteId = pNovoTel?.id ?? null;
      }
    } catch {}
  }
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
    if (structured && pacienteNome && pacienteNome !== "Visitante") {
      const opts = [
        { id: "marcar_consulta", label: "Marcar consulta", next_action: "LISTAR_ESPECIALIDADES" },
        { id: "ver_medicos", label: "Ver médicos", next_action: "LISTAR_ESPECIALIDADES" },
        { id: "atendente", label: "Falar com atendente", next_action: "ATENDENTE" },
      ];
      return send("SAUDACAO", {}, "Posso te ajudar com seu agendamento?", opts);
    } else {
      sessao.etapa = "aguardando_nome";
      return send("SAUDACAO", {}, "Qual é o seu nome completo?");
    }
  }
  if (sessao.etapa === "aguardando_nome") {
    sessao.nome = textoSessao;
    const opts = [
      { id: "marcar_consulta", label: "Marcar consulta", next_action: "LISTAR_ESPECIALIDADES" },
      { id: "ver_medicos", label: "Ver médicos", next_action: "LISTAR_ESPECIALIDADES" },
      { id: "atendente", label: "Falar com atendente", next_action: "ATENDENTE" },
    ];
    return send("SAUDACAO", {}, "Como posso ajudar você hoje?", opts);
  }
  if (sessao.etapa === "aguardando_medico") {
    sessao.medico = textoSessao;
    sessao.etapa = "aguardando_data";
    return send("LISTAR_HORARIOS", {}, "Informe a data no formato YYYY-MM-DD.");
  }
  if (sessao.etapa === "aguardando_data") {
    const m = textoSessao.match(/^\d{4}-\d{2}-\d{2}$/);
    if (!m) return send("FALLBACK", {}, "Data inválida. Use YYYY-MM-DD.");
    sessao.data = m[0];
    sessao.etapa = "aguardando_hora";
    return send(
      "LISTAR_HORARIOS",
      {},
      "Informe a hora no formato HH:MM ou HH:MM:SS."
    );
  }
  if (sessao.etapa === "aguardando_hora") {
    const hm = textoSessao.match(/^\d{2}:\d{2}(?::\d{2})?$/);
    if (!hm) return send("FALLBACK", {}, "Hora inválida. Use HH:MM ou HH:MM:SS.");
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
      return send(
        "LISTAR_MEDICOS",
        {},
        "Médico não encontrado. Informe o nome novamente."
      );
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
      return send(
        "LISTAR_HORARIOS",
        { medico_id: medicoParaAgendar.id, data, hora },
        `Horário ${data} às ${hora} indisponível. Informe outra hora.`
      );
    }
    let pid = pacienteId;
    if (typeof pid === "string" && pid.startsWith("anon:") && sessao.nome) {
      try {
        if (pacienteTelefone) {
          const { data: pByTel } = await supabase
            .from("pacientes")
            .select("id")
            .eq("telefone", pacienteTelefone)
            .limit(1);
          if (Array.isArray(pByTel) && pByTel[0]?.id) {
            pid = pByTel[0].id;
          } else {
            const { data: pNovoTel } = await supabase
              .from("pacientes")
              .insert([{ nome: sessao.nome, telefone: pacienteTelefone }])
              .select("id")
              .single();
            pid = pNovoTel?.id ?? pid;
          }
        } else {
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
    return send(
      "CRIAR_AGENDAMENTO",
      {
        medico_id: medicoParaAgendar.id,
        disponibilidade_id: disponibilidade.id,
        data,
        hora,
        paciente_nome: sessao.nome || pacienteNome,
      },
      `Consulta agendada em ${data} às ${hora}.`
    );
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
    const especialidadesOpts = ["Proctologia", "Dermatologia", "Clinico geral", "Nutrição", "Urologia", "Ginecologia"].map(
      (e) => ({ id: `esp_${e}`, label: e, next_action: "LISTAR_MEDICOS", params: { especialidade: e } })
    );
    return send("LISTAR_ESPECIALIDADES", {}, "Qual especialidade você deseja?", especialidadesOpts);
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
        return send(
          "LISTAR_MEDICOS",
          { especialidade: esp },
          `Não há médicos disponíveis para ${esp}`
        );

      // Resposta com lista de médicos
      const listaMedicos = medicos.map((m) => `${m.nome}`).join(", ");
      const opts = medicos.slice(0, 10).map((m) => ({
        id: `med_${m.id}`,
        label: m.nome,
        next_action: "LISTAR_HORARIOS",
        params: { medico_id: m.id, medico_nome: m.nome },
      }));
      return send("LISTAR_MEDICOS", { especialidade: esp }, `Médicos disponíveis em ${esp}: ${listaMedicos}`, opts);
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
        return send(
          "LISTAR_MEDICOS",
          {},
          "Não identifiquei o médico. Envie: Nome do médico + data às hora"
        );
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
        return send(
          "LISTAR_HORARIOS",
          { medico_id: medicoParaAgendar.id, data, hora },
          `Horário ${data} às ${hora} não disponível para ${medicoParaAgendar.nome}.`
        );
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
      return send(
        "CRIAR_AGENDAMENTO",
        {
          medico_id: medicoParaAgendar.id,
          disponibilidade_id: disponibilidade.id,
          data,
          hora,
          paciente_nome: pacienteNome,
        },
        `Consulta agendada com ${medicoParaAgendar.nome} em ${data} às ${hora}`
      );
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
      return send(
        "LISTAR_HORARIOS",
        { medico_id: medicoEscolhido.id },
        `Não há horários disponíveis para ${medicoEscolhido.nome}`
      );
    const listaHorarios = horarios.map((h) => `${h.data} às ${h.horario}`).join(", ");
    const opts = horarios.slice(0, 10).map((h) => ({
      id: `disp_${h.id}`,
      label: `${h.data} ${h.horario}`,
      next_action: "CRIAR_AGENDAMENTO",
      params: { disponibilidade_id: h.id, medico_id: medicoEscolhido.id, data: h.data, hora: h.horario },
    }));
    return send("LISTAR_HORARIOS", { medico_id: medicoEscolhido.id }, `Horários disponíveis para ${medicoEscolhido.nome}: ${listaHorarios}`, opts);
  }

  // removido: fluxo duplicado de agendamento

  // Mensagem default
  return send("FALLBACK", {}, "Desculpe, não entendi. Pode repetir?");
};
