-- Cache utilisateurs plateforme (rafraîchi par cron nocturne).
-- Motivation : getUsersTotalCount() coûte 30-75s sur les grosses plateformes.
-- Le snapshot en BD permet un affichage instant partout (rapport d'audit, dashboard, /plateformes).

ALTER TABLE "moodle_platforms"
  ADD COLUMN "nb_users"             INTEGER,
  ADD COLUMN "nb_users_updated_at"  TIMESTAMP(3),
  ADD COLUMN "users_method"         TEXT;
