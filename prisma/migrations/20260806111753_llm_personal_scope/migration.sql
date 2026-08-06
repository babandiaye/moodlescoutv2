-- Isolation par utilisateur des configs LLM.
-- Motivation : chaque enseignant apporte sa propre clé Claude/OpenAI/Mistral,
-- invisible pour les autres. Ollama-UNCHK reste partagée (défaut de tous).

-- 1) Nouvel enum LlmScope
CREATE TYPE "LlmScope" AS ENUM ('shared', 'personal');

-- 2) Colonnes ajoutées à llm_configs (defaults compatibles rétro)
ALTER TABLE "llm_configs"
  ADD COLUMN "scope"   "LlmScope" NOT NULL DEFAULT 'shared',
  ADD COLUMN "user_id" TEXT;

ALTER TABLE "llm_configs"
  ADD CONSTRAINT "llm_configs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "llm_configs_user_id_idx" ON "llm_configs"("user_id");
CREATE INDEX "llm_configs_scope_idx"   ON "llm_configs"("scope");

-- 3) Bascule "Claude" (config créée à titre perso par papaamadoubaba)
--    en personal + rattachement à son userId. Elle disparaît du catalogue
--    partagé et n'est plus visible que par lui.
UPDATE "llm_configs"
SET scope = 'personal',
    user_id = 'f0a34ec9-e623-41b3-87b2-98fa392a7800'
WHERE name = 'Claude';

-- 4) Colonne default_llm_config_id sur users + FK avec SetNull
ALTER TABLE "users"
  ADD COLUMN "default_llm_config_id" TEXT;

ALTER TABLE "users"
  ADD CONSTRAINT "users_default_llm_config_id_fkey"
    FOREIGN KEY ("default_llm_config_id") REFERENCES "llm_configs"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 5) Backfill : chaque user existant reçoit comme défaut la config shared
--    qui a isDefault=true (soit Ollama-UNCHK aujourd'hui).
UPDATE "users"
SET default_llm_config_id = (
  SELECT id FROM "llm_configs"
  WHERE scope = 'shared' AND is_default = true AND is_active = true
  ORDER BY created_at ASC
  LIMIT 1
);

-- 6) Contrainte de cohérence :
--    - shared   ⇒ user_id NULL
--    - personal ⇒ user_id NON NULL
-- CHECK plutôt qu'une triggers cascade pour rester lisible côté PSQL.
ALTER TABLE "llm_configs"
  ADD CONSTRAINT "llm_configs_scope_user_coherence"
    CHECK (
      (scope = 'shared'   AND user_id IS NULL) OR
      (scope = 'personal' AND user_id IS NOT NULL)
    );
