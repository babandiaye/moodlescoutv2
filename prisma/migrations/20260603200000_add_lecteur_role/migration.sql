-- Migration : ajout du rôle 'lecteur' à l'enum UserRole.
-- 'lecteur' = lecture seule globale : voit tous les audits, peut exporter,
-- mais ne peut PAS lancer / annuler d'audit, ni gérer utilisateurs/plateformes.
-- Cas d'usage : direction ou manager qui consulte les rapports sans
-- consommer des slots LLM.

-- ALTER TYPE ADD VALUE doit être hors transaction. Prisma exécute chaque
-- statement séparément, donc OK ici.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'lecteur';
