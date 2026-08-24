// Diagnostic LECTURE SEULE : détecte les doublons de paiement (2 fiches pour un même engagement)
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
const get = k => (env.match(new RegExp(k + '=(.+)')) || [])[1]?.trim();
const supabase = createClient(get('VITE_SUPABASE_URL'), get('VITE_SUPABASE_ANON_KEY'));

const GRANT_NAME = process.argv[2] || 'SUBVENTION ETAT RCI 2026';

(async () => {
  // 1) Retrouver la subvention
  const { data: grants, error: ge } = await supabase.from('grants').select('id,name,reference');
  if (ge) return console.log('ERREUR grants:', ge.message);
  const grant = grants.find(g => (g.name || '').trim().toUpperCase() === GRANT_NAME.toUpperCase());
  if (!grant) return console.log('Subvention introuvable. Disponibles:', grants.map(g => g.name));
  console.log(`Subvention : ${grant.name} (${grant.reference}) — id=${grant.id}\n`);

  // 2) Engagements de la subvention
  const { data: engs } = await supabase
    .from('engagements')
    .select('id,engagement_number,status,amount,supplier')
    .eq('grant_id', grant.id);
  const byStatusE = {};
  engs.forEach(e => { byStatusE[e.status] = (byStatusE[e.status] || 0) + 1; });
  console.log(`ENGAGEMENTS : ${engs.length}  ->`, byStatusE);

  // 3) Paiements de la subvention
  const { data: pays } = await supabase
    .from('payments')
    .select('id,payment_number,engagement_id,status,amount,supplier,created_at')
    .eq('grant_id', grant.id);
  const byStatusP = {};
  pays.forEach(p => { byStatusP[p.status] = (byStatusP[p.status] || 0) + 1; });
  console.log(`PAIEMENTS   : ${pays.length}  ->`, byStatusP);

  // 4) Doublons = plusieurs paiements pour un même engagement_id
  const map = new Map();
  pays.forEach(p => {
    const list = map.get(p.engagement_id) || [];
    list.push(p);
    map.set(p.engagement_id, list);
  });
  const dups = [...map.entries()].filter(([, list]) => list.length > 1);
  const engById = new Map(engs.map(e => [e.id, e]));

  console.log(`\nEngagements distincts couverts par un paiement : ${map.size}`);
  console.log(`Paiements orphelins (engagement_id absent des engagements) : ${
    pays.filter(p => !engById.has(p.engagement_id)).length}`);

  if (dups.length === 0) {
    console.log('\n✅ AUCUN doublon de paiement (chaque engagement a au plus 1 fiche de paiement).');
  } else {
    console.log(`\n⚠️  ${dups.length} ENGAGEMENT(S) AVEC PLUSIEURS PAIEMENTS :\n`);
    dups.forEach(([engId, list]) => {
      const e = engById.get(engId);
      console.log(`• Engagement ${e ? e.engagement_number : '(supprimé)'} — ${e ? e.supplier : ''} — ${list.length} fiches :`);
      list.forEach(p => console.log(`     - ${p.payment_number} | statut=${p.status} | montant=${p.amount} | créé=${p.created_at}`));
    });
  }
})().catch(e => console.log('FATAL', e.message));
