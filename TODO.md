# MoodleScout v2 — TO-DO priorisée

_Date d'analyse : 2026-07-09 · Basée sur audit global de cohérence du code._

---

## 🚨 P0 — Sécurité + cohérence critique ✅ FAIT (2026-07-09)

- [x] **1. Filtre plateforme désactivée sur toutes les sous-routes `/api/audits/[id]/**`** — helper commun [`src/lib/audit-access.ts`](src/lib/audit-access.ts), câblé sur GET/DELETE, export, stream, cancel.
- [x] **2. Élargir `requireAuth({ role })` au type `UserRole` complet** — accepte maintenant admin/auditeur/lecteur.
- [x] **3. Câbler `LlmConfig.isActive` de bout en bout** — PATCH accepte isActive, GET retourne isActive, filtre sur `/audits/new`, `/audits/course`, blocage POST `/api/audits`, `/api/audits/course`, preflight ; badge + bouton Activer/Désactiver dans /configuration.
- [x] **4. Bouton « Vider le cache WS Moodle »** — route `DELETE /api/moodle-platforms/[id]/cache` (SCAN + DEL par lots), bouton "Vider cache" dans PlatformsSection.

---

## 🔥 P1 — UX qui fait mal ✅ (partiel, 2026-07-09)

- [x] **5. Bouton « Relancer cet audit »** — route `POST /api/audits/[id]/relaunch` (mêmes params, préfixe `relaunch-`) + `<RelaunchAuditButton>` sur audits terminés
- [x] **6. Badge quota dans TopBar** — `<QuotaBadge>` polling 30s, 3 états (vert/orange/rouge), masqué si aucun usage
- [x] **7. Search + filtres dans `/audits`** — `<AuditsFilters>` : sessionKey / plateforme / statut / période, préserve la pagination
- [x] **8. Notification browser** — Notification API sur `status = completed|failed|cancelled`, silencieuse si onglet actif ; bouton "Activer les notifications"
- [x] **9. Audit ciblé performant** — `listCoursesForAudit({courseIds})` court-circuite le scan complet via `getCoursesByField('ids', ...)`
- [x] **10. Navigation catégorielle hiérarchique (drill-down filière/semestre/UE/EC)** ⭐ _voir section ci-dessous — livrée_
- [x] **11. Nettoyer** `resolveCourseInput.includeInactive` supprimé + `MoodlePlatform.lastCheckAt/siteName/release` écrits depuis `/test` route

---

## 🌳 P1 — Navigation catégorielle hiérarchique (drill-down) ✅ (2026-07-09)

**Livré** :
- `src/lib/category-stats.ts` — agrégation via `$queryRaw` DISTINCT ON (n'extrait que `score_global + category_id`, évite de charger tout `resultJson`)
- `GET /api/moodle-platforms/[id]/categories` — arbre enrichi (stats propagées à tous les ancêtres) + cache Moodle 30 min
- `<CategoryTreeBrowser>` — expand/collapse, filtre live avec auto-open des ancêtres, 2 modes : `dashboard` (bouton Auditer) et `select` (checkboxes)
- `/plateformes` (index) + `/plateformes/[id]` (explorateur) — accessible à tous, `isActive` respecté pour non-admin
- `<CategoryPickerPanel>` intégré dans `/audits/new` — bouton « Parcourir l'arbre », checkboxes synchronisées avec le champ texte
- Onglet **Plateformes** dans TopBar, bouton **Explorer** dans PlatformsSection admin
- « Auditer cette catégorie » depuis `/plateformes/[id]` → redirige vers `/audits/new?platform=X&categories=NOM` avec le champ pré-rempli et le picker ouvert

**Reste à faire (backlog)** :
- [ ] Heatmap 2D catégorie × période (P2)
- [ ] Dénormaliser `category_id` sur `CourseAudit` avec index — P4 optim si la table grossit
- [ ] Comparaison croisée entre 2 catégories (« ANG vs SEG ») — P2

---

## 💡 P2 — Pédagogique / valeur métier ✅ (2026-07-09)

- [x] **12. Vue « par cours »** — `/audits/[id]/cours/[cid]` avec scores hybride/IA/conformité, points forts/faibles, recommandations, composition (sections/quiz), animateurs, checks conformité, métadonnées + navigation prev/next
- [x] **13. Comparateur d'audits** — `/audits/compare?from=X&to=Y` avec sélecteur restreint à la même plateforme, synthèse (avg + Δ + hausse/baisse/stable), détail cours-par-cours trié par Δ absolu, blocs "uniquement dans A / B"
- [x] **14. Export CSV** — `exportToCsv()` RFC 4180 + BOM UTF-8, colonnes étendues (scores IA + conformité + points forts/faibles/recos), bouton dans `/audits/[id]`
- [x] **15. Dashboard `/` enrichi** — sparkline SVG 30 jours (avec zone remplie + points), top 5 plateformes par score moyen agrégé (DISTINCT ON par cours), stats retouchées
- [x] **16. Historique par cours** — `/plateformes/[id]/cours/[cid]` avec timeline de tous les audits + Δ score inter-audits + liens vers détail dans chaque audit

---

## 🧠 P3 — LLM / infra

- [ ] **17. Routage LLM dual** : modèle texte rapide par défaut + modèle vision uniquement si image détectée (cf. stratégie B du comparatif Ollama). _2 h_
- [ ] **18. `AUDIT_PROMPT` déplacé dans `LlmConfig.promptTemplate`** (BD) + éditeur admin. A/B test sans redéploiement. _3 h_
- [ ] **19. `callAnthropic`** : agréger tous les blocs `type === 'text'` (fix silent data loss si Claude renvoie plusieurs blocs). _5 min_
- [ ] **20. `isFallbackResult`** via un flag `_fallback: true` dans `FALLBACK` au lieu du string match `description_courte === 'Analyse indisponible'`. _15 min_
- [ ] **21. Constante commune `MAX_IMAGES_PER_LLM = 5`** partagée `callOllama` (4) / `callAnthropic` (5). _5 min_

---

## 🧹 P4 — Dette / qualité

- [ ] **22. Découper `src/lib/audit.ts`** (627 lignes) en `audit-teachers.ts`, `audit-quiz.ts`, `audit-scoring.ts`, `audit-orchestrator.ts`. _2 h_
- [ ] **23. Typer les `any[]`** de `lib/audit.ts` (Enseignant, Tuteur, QuizStat, Animateur). _1 h_
- [ ] **24. Tests d'intégration minimaux** : `POST /api/audits` avec plateforme désactivée → 403 (mock Prisma). Non-régression sur les filtres qu'on vient d'ajouter. _3 h_
- [ ] **25. `stripHtml` via regex** pour les cas simples au lieu de cheerio.load (perf). _1 h_

---

## 📊 P5 — Nice to have

- Alertes email/Slack sur audit critique (webhook configurable par admin)
- Onboarding première visite (page d'accueil différenciée)
- Tooltips explicatifs sur les scores (formule 0.7·IA + 0.3·conformité — déjà en commentaire dans audit.ts:498-514)
- Rapports agrégés par catégorie / département
- README utilisateur + doc API interne

---

## Ordre d'attaque recommandé

1. **P0 items 1-2-3-4** (~2 h) → consolide la sécurité
2. **P1 items 5-6-9** (~2 h 30) → gros gain UX visible
3. **P1 item 10 (navigation catégorielle)** → feature structurante métier
4. **P2 item 12 (vue par cours)** → indispensable dès 20+ cours
5. **P3 items 19-20-21** (~30 min) → nettoyages LLM triviaux
