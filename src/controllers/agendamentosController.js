import { supabase } from "../config/supabase.js";

export const criarAgendamento = async (req, res) => {
  const { medico_id, paciente_id, data, hora, disponibilidade_id } = req.body;

  if (!medico_id || (!disponibilidade_id && (!data || !hora))) {
    return res.status(400).json({ error: "Campos obrigatórios ausentes" });
  }

  try {
    let disponibilidade = null;
    if (disponibilidade_id) {
      const { data: d, error: e1 } = await supabase
        .from("disponibilidades")
        .select("*")
        .eq("id", disponibilidade_id)
        .eq("disponivel", true)
        .single();
      if (e1) return res.status(400).json({ error: "Disponibilidade inválida" });
      disponibilidade = d;
    } else {
      const horaNorm = /^\d{2}:\d{2}$/.test(hora) ? `${hora}:00` : hora;
      const { data: d, error: e2 } = await supabase
        .from("disponibilidades")
        .select("*")
        .eq("medico_id", medico_id)
        .eq("data", data)
        .eq("horario", horaNorm)
        .eq("disponivel", true)
        .single();
      if (e2 || !d) {
        return res.status(400).json({ error: "Horário não disponível ou já agendado" });
      }
      disponibilidade = d;
    }

    const payload = {
      medico_id,
      disponibilidade_id: disponibilidade.id,
      status: "agendado",
    };
    if (paciente_id) payload.paciente_id = paciente_id;

    const { data: novoAgendamento, error: erroAgendamento } = await supabase
      .from("agendamentos")
      .insert([payload])
      .select()
      .single();

    if (erroAgendamento) {
      return res.status(500).json({ error: erroAgendamento.message });
    }

    const { error: erroUpdate } = await supabase
      .from("disponibilidades")
      .update({ disponivel: false })
      .eq("id", disponibilidade.id);

    if (erroUpdate) {
      return res.status(500).json({
        error: "Agendamento criado, mas erro ao atualizar disponibilidade"
      });
    }

    res.status(201).json({
      mensagem: "Agendamento realizado com sucesso",
      agendamento: novoAgendamento
    });

  } catch (e) {
    res.status(500).json({ error: "Erro ao criar agendamento" });
  }
};

export const listarAgendamentos = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("agendamentos")
      .select("*");

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data ?? []);
  } catch {
    res.status(500).json({ error: "Erro ao listar agendamentos" });
  }
};

export const obterAgendamento = async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "id é obrigatório" });
  try {
    const { data, error } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("id", id)
      .single();
    if (error) {
      return res.status(404).json({ error: "Agendamento não encontrado" });
    }
    res.json(data);
  } catch {
    res.status(500).json({ error: "Erro ao obter agendamento" });
  }
};

export const cancelarAgendamento = async (req, res) => {
  const { id } = req.params;

  try {
    // Buscar agendamento
    const { data: agendamento, error } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !agendamento) {
      return res.status(404).json({ error: "Agendamento não encontrado" });
    }

    // Reativar disponibilidade
    await supabase
      .from("disponibilidades")
      .update({ disponivel: true })
      .eq("medico_id", agendamento.medico_id)
      .eq("data", agendamento.data)
      .eq("horario", agendamento.hora);

    // Deletar agendamento
    await supabase
      .from("agendamentos")
      .delete()
      .eq("id", id);

    res.json({ mensagem: "Agendamento cancelado com sucesso" });

  } catch {
    res.status(500).json({ error: "Erro ao cancelar agendamento" });
  }
};
