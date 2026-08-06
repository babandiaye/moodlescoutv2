-- Renomme la valeur d'enum 'auditeur' → 'enseignant' sans perte de données.
-- Toutes les colonnes qui référencent UserRole voient leurs valeurs migrées
-- automatiquement par Postgres (ALTER TYPE ... RENAME VALUE gère ça en O(1),
-- sans réécriture de table).
--
-- Motivation métier : le rôle initialement nommé 'auditeur' correspond en
-- pratique à un enseignant Moodle qui audite SES propres cours. On aligne
-- le nom sur l'usage réel.

ALTER TYPE "UserRole" RENAME VALUE 'auditeur' TO 'enseignant';
