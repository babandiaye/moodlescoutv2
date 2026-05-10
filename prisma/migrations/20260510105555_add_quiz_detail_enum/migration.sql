-- Migration : conversion de la colonne quiz_detail (TEXT) en enum Postgres "QuizDetail"
-- Préserve les valeurs existantes via USING <col>::text::"QuizDetail".
-- Les seules valeurs jamais insérées sont 'meta', 'detail', 'both' (validées par zod côté API).

-- 1) Création du type enum
CREATE TYPE "QuizDetail" AS ENUM ('meta', 'detail', 'both');

-- 2) Conversion de la colonne en enum (les lignes existantes sont préservées)
ALTER TABLE "audit_sessions"
  ALTER COLUMN "quiz_detail" DROP DEFAULT;

ALTER TABLE "audit_sessions"
  ALTER COLUMN "quiz_detail" TYPE "QuizDetail"
  USING "quiz_detail"::text::"QuizDetail";

-- 3) Restauration du default
ALTER TABLE "audit_sessions"
  ALTER COLUMN "quiz_detail" SET DEFAULT 'both';
