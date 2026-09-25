-- Retire legacy appointments table (calendar/admin now use sessions + client_requests).
-- Safe if the table was already removed.

DROP TABLE IF EXISTS public.appointments CASCADE;
