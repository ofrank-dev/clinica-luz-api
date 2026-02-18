import supabase from "../database/supabase.js";

// Listar disponibilidades por médico
export const listarDisponibilidades = async (req, res) => {
  const { medico_id } = req.params;

  if (!medico_id) {
    return res.status(400).json({ error: "medico_id é obrigatório" });
  }

  const { data, error } = await supabase
    .from("disponibilidades")
    .select("*")
    .eq("medico_id", medico_id)
    .eq("disponivel", true)
    .order("data", { ascending: true })
    .order("horario", { ascending: true });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
};