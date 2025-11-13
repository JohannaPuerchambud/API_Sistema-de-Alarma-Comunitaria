import { pool } from "../config/db.js";

export const getNeighborhoods = async (req, res) => {
  try {
    // Incluimos explícitamente las columnas y ordenamos
    const result = await pool.query(
      "SELECT neighborhood_id, name, description, boundary, created_at FROM neighborhoods ORDER BY name ASC"
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

export const getNeighborhoodById = async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM neighborhoods WHERE neighborhood_id = $1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Barrio no encontrado" });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

export const createNeighborhood = async (req, res) => {
  try {
    // Aceptamos name y description. Boundary se añade después.
    const { name, description } = req.body;
    const query = `INSERT INTO neighborhoods (name, description, created_at)
                   VALUES ($1, $2, NOW()) RETURNING *`;
    const result = await pool.query(query, [name, description]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

//
// 💡 --- SECCIÓN CORREGIDA --- 💡
//
export const updateNeighborhood = async (req, res) => {
  try {
    // 1. Extraemos los 3 campos del body (boundary puede ser null)
    const { name, description, boundary = null } = req.body;
    const { id } = req.params;

    // 2. La consulta SQL ahora incluye 'boundary'
    //    Usamos $1, $2, $3, $4 para los parámetros
    const query = `
      UPDATE neighborhoods 
      SET name = $1, 
          description = $2, 
          boundary = $3 
      WHERE neighborhood_id = $4 
      RETURNING *`;

    // 3. Pasamos los 4 parámetros a la consulta
    const result = await pool.query(query, [name, description, boundary, id]);

    if (result.rows.length === 0) return res.status(404).json({ message: "Barrio no encontrado" });
    res.json(result.rows[0]);
  } catch (err) { 
    // Capturamos un error común: si el JSON de boundary es inválido
    if (err.code === '22P02') {
      return res.status(400).json({ error: 'Formato de "boundary" (JSONB) inválido.' });
    }
    res.status(500).json({ error: err.message }); 
  }
};
// 💡 --- FIN DE LA SECCIÓN CORREGIDA --- 💡
//

export const deleteNeighborhood = async (req, res) => {
  try {
    // Primero, verificamos si existe para dar un buen mensaje
    const check = await pool.query("SELECT 1 FROM neighborhoods WHERE neighborhood_id=$1", [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ message: "Barrio no encontrado" });

    // (Opcional: en el futuro, deberías verificar si hay usuarios en este barrio antes de borrar)
    
    await pool.query("DELETE FROM neighborhoods WHERE neighborhood_id=$1", [req.params.id]);
    res.json({ message: "Barrio eliminado correctamente" });
  } catch (err) { 
    // Capturamos error si un usuario todavía depende de este barrio
    if (err.code === '23503') { // foreign_key_violation
      return res.status(400).json({ error: 'No se puede eliminar el barrio porque tiene usuarios asignados.' });
    }
    res.status(500).json({ error: err.message }); 
  }
};