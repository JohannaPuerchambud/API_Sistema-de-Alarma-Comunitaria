-- ═══════════════════════════════════════════════════════════════════════
-- MIGRACIÓN: Agregar lat y lng a la tabla upcs
-- Tipo: float8 (double precision) — igual que home_lat y home_lng en users
-- Ejecutar manualmente en Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE upcs
  ADD COLUMN IF NOT EXISTS lat float8,
  ADD COLUMN IF NOT EXISTS lng float8;

-- Comentario en columnas (opcional, para documentación)
COMMENT ON COLUMN upcs.lat IS 'Latitud de la ubicación exacta de la UPC';
COMMENT ON COLUMN upcs.lng IS 'Longitud de la ubicación exacta de la UPC';

-- Verificar resultado:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'upcs'
  AND column_name IN ('lat', 'lng', 'address');
