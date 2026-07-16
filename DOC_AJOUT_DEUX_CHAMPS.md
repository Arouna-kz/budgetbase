Requêtes SQL pour ajouter les colonnes
sql
-- 1. Ajouter la colonne partial_payments (JSONB pour stocker l'historique des paiements partiels)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS partial_payments JSONB DEFAULT '[]';

-- 2. Ajouter la colonne remaining_amount (pour suivre le montant restant)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS remaining_amount DECIMAL(10,2);
Requêtes pour initialiser les données existantes
sql
-- 3. Initialiser partial_payments avec un tableau vide pour les paiements existants
UPDATE payments 
SET partial_payments = '[]'::jsonb 
WHERE partial_payments IS NULL;

-- 4. Initialiser remaining_amount avec le montant total pour les paiements existants
UPDATE payments 
SET remaining_amount = amount 
WHERE remaining_amount IS NULL;
Requêtes optionnelles pour la maintenance
sql
-- 5. Ajouter des index pour améliorer les performances (optionnel mais recommandé)
CREATE INDEX IF NOT EXISTS idx_payments_engagement_id ON payments(engagement_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- 6. Vérifier que les colonnes ont été ajoutées
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'payments' 
AND column_name IN ('partial_payments', 'remaining_amount');