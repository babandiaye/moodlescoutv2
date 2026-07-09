-- Ajoute course_ids_json à audit_sessions pour l'audit ciblé
-- (feature "Auditer mes cours" depuis /me/courses).
-- Null = comportement historique (tous les cours de la plateforme).
ALTER TABLE "audit_sessions" ADD COLUMN "course_ids_json" JSONB;
