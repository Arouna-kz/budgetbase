// Suppression CIBLÉE du doublon de paiement (garde la 1ère fiche, supprime les suivantes)
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
const get = k => (env.match(new RegExp(k + '=(.+)')) || [])[1]?.trim();
const supabase = createClient(get('VITE_SUPABASE_URL'), get('VITE_SUPABASE_ANON_KEY'));

const ENG_NUMBER = 'ENG-2026-06-870698';

(async () => {
  // 1) Engagement concerné
  const { data: engs, error: ee } = await supabase
    .from('engagements')
    .select('id,engagement_number,grant_id')
    .eq('engagement_number', ENG_NUMBER);
  if (ee) return console.log('ERREUR engagements:', ee.message);
  if (!engs || engs.length === 0) return console.log('Engagement introuvable:', ENG_NUMBER);
  const eng = engs[0];
  console.log(`Engagement ${eng.engagement_number} — id=${eng.id}`);

  // 2) Paiements de cet engagement, triés par date de création
  const { data: pays, error: pe } = await supabase
    .from('payments')
    .select('id,payment_number,amount,status,created_at')
    .eq('engagement_id', eng.id)
    .order('created_at', { ascending: true });
  if (pe) return console.log('ERREUR payments:', pe.message);

  console.log(`\n${pays.length} fiche(s) trouvée(s) pour cet engagement :`);
  pays.forEach((p, i) => console.log(`  [${i}] ${p.payment_number} | ${p.amount} | ${p.status} | ${p.created_at} | id=${p.id}`));

  if (pays.length <= 1) return console.log('\n✅ Aucun doublon à supprimer (0 ou 1 fiche).');

  // 3) On garde la 1ère (index 0), on supprime les suivantes
  const toDelete = pays.slice(1);
  console.log(`\nConservée : [0] ${pays[0].payment_number} (${pays[0].created_at})`);
  for (const p of toDelete) {
    const { error: de } = await supabase.from('payments').delete().eq('id', p.id);
    if (de) console.log(`  ❌ Échec suppression ${p.id} : ${de.message}`);
    else console.log(`  🗑️  Supprimée : ${p.payment_number} | id=${p.id} | créée ${p.created_at}`);
  }

  // 4) Re-vérification globale pour la subvention
  const { data: allPays } = await supabase.from('payments').select('engagement_id').eq('grant_id', eng.grant_id);
  const seen = new Map();
  allPays.forEach(p => seen.set(p.engagement_id, (seen.get(p.engagement_id) || 0) + 1));
  const remainingDups = [...seen.values()].filter(n => n > 1).length;
  console.log(`\n=== APRÈS SUPPRESSION ===`);
  console.log(`Paiements de la subvention : ${allPays.length}`);
  console.log(`Engagements distincts avec paiement : ${seen.size}`);
  console.log(`Doublons restants : ${remainingDups}`);
  console.log(remainingDups === 0 ? '✅ Plus aucun doublon.' : '⚠️ Il reste des doublons.');
})().catch(e => console.log('FATAL', e.message));
