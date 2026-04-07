TraT1e_GestB


-- 1. Supprimer la contrainte étrangère vers bank_accounts
ALTER TABLE bank_transactions DROP CONSTRAINT IF EXISTS bank_transactions_account_id_fkey;

-- 2. Renommer account_id en grant_id
ALTER TABLE bank_transactions RENAME COLUMN account_id TO grant_id;

-- 3. Ajouter une contrainte étrangère vers grants
ALTER TABLE bank_transactions ADD CONSTRAINT bank_transactions_grant_id_fkey 
  FOREIGN KEY (grant_id) REFERENCES grants(id) ON DELETE CASCADE;

-- 4. Mettre à jour les transactions existantes (si nécessaire)
UPDATE bank_transactions 
SET grant_id = REPLACE(grant_id, 'grant-', '') 
WHERE grant_id LIKE 'grant-%';