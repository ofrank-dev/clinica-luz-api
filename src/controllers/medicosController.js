import { getMedicos } from "../services/medicosService.js";
import { supabase } from "../config/supabase.js";

export const listarMedicos = async (req, res) => {
  try {
    const medicos = await getMedicos();
    res.json(medicos);
  } catch (err) {
    res.status(500).json({ error: "Falha ao listar médicos" });
  }
};

export const listarPorEspecialidade = async (req, res) => {
  const { especialidade } = req.query;

  const { data, error } = await supabase
    .from("medicos")
    .select("*")
    .eq("especialidade", especialidade);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
};
