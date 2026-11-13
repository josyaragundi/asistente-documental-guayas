-- Se elimina el límite de preguntas y cargas; el control se mantiene solo
-- para intentos fallidos de inicio de sesión en la interfaz de autenticación.
DROP FUNCTION IF EXISTS public.consume_rate_limit(UUID, TEXT, INTEGER, INTEGER);
DROP TABLE IF EXISTS public.rate_limit_events;
