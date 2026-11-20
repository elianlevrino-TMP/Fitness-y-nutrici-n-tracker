'use strict';
/* Conexión a Supabase.
   Estos dos valores son PÚBLICOS por diseño: identifican la app, no dan acceso a los datos.
   La protección real son las reglas de seguridad (RLS) de supabase/schema.sql.
   ⚠️ NUNCA pongas aquí la "secret key" ni la "service_role key". */
const SUPABASE_URL = 'https://vgmoufotbsftulnwxbyx.supabase.co';
const SUPABASE_KEY = 'sb_publishable__WyL0NnLgDO2LLRuI34UKg_2Qrg7D47';
