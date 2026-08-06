-- Ajoute la valeur 'openai' à l'enum LlmProvider (aucune ligne à backfill —
-- nouvelle option pour les configs perso à venir).
ALTER TYPE "LlmProvider" ADD VALUE 'openai';
