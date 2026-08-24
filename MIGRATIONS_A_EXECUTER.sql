-- ============================================================
--  MIGRATIONS SUPABASE À EXÉCUTER
--  (SQL Editor du projet Supabase → coller → Run)
--  Chaque bloc est idempotent (IF NOT EXISTS) : ré-exécutable sans risque.
-- ============================================================

-- ------------------------------------------------------------
-- THÈME « MISSION » (engagements)
--  Ajoute un indicateur "mission" sur les engagements.
-- ------------------------------------------------------------
ALTER TABLE engagements
  ADD COLUMN IF NOT EXISTS is_mission boolean NOT NULL DEFAULT false;

-- ------------------------------------------------------------
-- THÈME « ÉCHELONNÉ » (payments)
--  Marque une fiche de paiement comme échelonnée dès sa création.
-- ------------------------------------------------------------
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS is_scheduled boolean NOT NULL DEFAULT false;

-- ------------------------------------------------------------
-- THÈME « RAPPROCHEMENT BANCAIRE » (payments)
--  Indique si un décaissement attend un rapprochement et son état.
--  (Les versements partiels portent ces mêmes indicateurs dans la
--   colonne JSON partial_payments — aucune migration nécessaire pour eux.)
-- ------------------------------------------------------------
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS needs_reconciliation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reconciled           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reconciled_date      date;
