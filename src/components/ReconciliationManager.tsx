import React, { useMemo, useState } from 'react';
import { Download, CheckCircle, Clock, Landmark, Upload, X, FileSpreadsheet, Eye } from 'lucide-react';
import * as XLSX from 'xlsx-js-style';
import { Payment, Grant, PartialPayment } from '../types';
import { usePermissions } from '../hooks/usePermissions';
import { exportStyledExcel } from '../utils/excelExport';
import { showSuccess, showWarning, showError } from '../utils/alerts';

interface ReconciliationManagerProps {
  payments: Payment[];
  selectedGrant?: Grant;
  onUpdatePayment?: (id: string, updates: Partial<Payment>) => void;
}

const ReconciliationManager: React.FC<ReconciliationManagerProps> = ({
  payments,
  selectedGrant,
  onUpdatePayment,
}) => {
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission('reconciliation', 'edit');
  const canExport = hasPermission('reconciliation', 'export');

  const [recStatusFilter, setRecStatusFilter] = useState<'all' | 'reconciled' | 'not_reconciled'>('all');
  const [recDateFrom, setRecDateFrom] = useState('');
  const [recDateTo, setRecDateTo] = useState('');
  // Pagination
  const [recPage, setRecPage] = useState(1);
  const [recPerPage, setRecPerPage] = useState(25);

  // Import d'un relevé bancaire (brut) + mapping des colonnes, rapprochement assisté
  type BankLine = { date: string; amount: number; ref: string; raw: any[] };
  type Proposal = {
    ppId: string;
    paymentId: string;
    versementLabel: string;
    versementDate: string;
    amount: number;
    bankRef: string;
    bankDate: string;
    confidence: 'high' | 'medium';
  };
  const [showImport, setShowImport] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'map' | 'review'>('upload');
  const [importFileName, setImportFileName] = useState('');
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importRows, setImportRows] = useState<any[][]>([]);
  const [mapDate, setMapDate] = useState<number>(-1);
  const [mapAmount, setMapAmount] = useState<number>(-1);
  const [mapRef, setMapRef] = useState<number>(-1);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [checkedProposals, setCheckedProposals] = useState<Record<string, boolean>>({});
  const [unmatchedBank, setUnmatchedBank] = useState<number>(0);
  // Détail d'un versement (icône œil)
  const [detailItem, setDetailItem] = useState<{ payment: Payment; pp: PartialPayment } | null>(null);

  // Référence bancaire réelle d'un versement selon son mode (n° chèque / réf. virement)
  const realRef = (pp: PartialPayment): string =>
    (pp.paymentMethod === 'check' ? pp.checkNumber : pp.paymentMethod === 'transfer' ? pp.bankReference : pp.reference) || '';

  const formatCurrency = (amount: number) => {
    if (!selectedGrant) return amount.toLocaleString('fr-FR');
    return amount.toLocaleString('fr-FR', {
      style: 'currency',
      currency: selectedGrant.currency === 'XOF' ? 'XOF' : selectedGrant.currency,
      minimumFractionDigits: selectedGrant.currency === 'XOF' ? 0 : 2,
    });
  };

  // Tous les décaissements (versements) attendant un rapprochement, pour la subvention
  const reconciliationItems = useMemo(() => {
    const items: Array<{ payment: Payment; pp: PartialPayment }> = [];
    payments
      .filter((p) => !selectedGrant || p.grantId === selectedGrant.id)
      .forEach((p) => {
        (p.partialPayments || []).forEach((pp) => {
          if (pp.needsReconciliation) items.push({ payment: p, pp });
        });
      });
    return items
      .filter(({ pp }) => {
        if (recStatusFilter === 'reconciled' && !pp.reconciled) return false;
        if (recStatusFilter === 'not_reconciled' && pp.reconciled) return false;
        if (recDateFrom && (pp.date || '') < recDateFrom) return false;
        if (recDateTo && (pp.date || '') > recDateTo) return false;
        return true;
      })
      .sort((a, b) => (a.pp.date || '').localeCompare(b.pp.date || ''));
  }, [payments, selectedGrant, recStatusFilter, recDateFrom, recDateTo]);

  const reconciledCount = reconciliationItems.filter((i) => i.pp.reconciled).length;
  const notReconciledCount = reconciliationItems.length - reconciledCount;
  const totalAmount = reconciliationItems.reduce((s, i) => s + i.pp.amount, 0);
  const notReconciledAmount = reconciliationItems
    .filter((i) => !i.pp.reconciled)
    .reduce((s, i) => s + i.pp.amount, 0);

  // Pagination
  const recTotalPages = Math.max(1, Math.ceil(reconciliationItems.length / recPerPage));
  const recSafePage = Math.min(recPage, recTotalPages);
  const recStartIndex = (recSafePage - 1) * recPerPage;
  const pagedItems = reconciliationItems.slice(recStartIndex, recStartIndex + recPerPage);

  const toggleReconciled = (payment: Payment, ppId: string, value: boolean) => {
    if (!onUpdatePayment) return;
    if (!canEdit) {
      showError('Permission refusée', "Vous n'avez pas la permission d'effectuer un rapprochement.");
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    const updated = (payment.partialPayments || []).map((pp) =>
      pp.id === ppId ? { ...pp, reconciled: value, reconciledDate: value ? today : undefined } : pp
    );
    // L'état de rapprochement est stocké DANS chaque versement (partial_payments, colonne JSON existante).
    // On n'écrit pas de colonnes de niveau paiement pour éviter toute dépendance de schéma.
    onUpdatePayment(payment.id, { partialPayments: updated });
    showSuccess('Rapprochement', value ? 'Versement marqué comme rapproché.' : 'Rapprochement annulé.');
  };

  const exportReconciliationExcel = () => {
    if (reconciliationItems.length === 0) {
      showWarning('Aucune donnée', 'Aucun versement à exporter.');
      return;
    }
    const infoLines: string[] = [];
    if (selectedGrant) {
      infoLines.push(`Subvention : ${selectedGrant.name}`);
      infoLines.push(`Référence : ${selectedGrant.reference}   •   Devise : ${selectedGrant.currency}`);
    }
    if (recDateFrom || recDateTo) infoLines.push(`Période : ${recDateFrom || '—'} au ${recDateTo || '—'}`);
    infoLines.push(`Généré le : ${new Date().toLocaleDateString('fr-FR')}`);

    const rows = reconciliationItems.map(({ payment, pp }) => [
      pp.date ? new Date(pp.date).toLocaleDateString('fr-FR') : '-',
      payment.paymentNumber,
      payment.supplier || '-',
      pp.paymentMethod === 'check' ? 'Chèque' : pp.paymentMethod === 'transfer' ? 'Virement' : 'Espèces',
      realRef(pp) || '-',
      formatCurrency(pp.amount),
      pp.reconciled ? 'Rapproché' : 'Non rapproché',
      pp.reconciled && pp.reconciledDate ? new Date(pp.reconciledDate).toLocaleDateString('fr-FR') : '-',
    ]);
    exportStyledExcel({
      fileName: `rapprochement-${selectedGrant?.reference || 'global'}-${new Date().toISOString().split('T')[0]}.xlsx`,
      sheetName: 'Rapprochement',
      title: 'RAPPROCHEMENT BANCAIRE',
      infoLines,
      columns: [
        { header: 'Date', width: 14, align: 'center' },
        { header: 'N° Paiement', width: 20 },
        { header: 'Fournisseur', width: 26 },
        { header: 'Mode', width: 12, align: 'center' },
        { header: 'Référence', width: 22 },
        { header: 'Montant', width: 18, align: 'right' },
        { header: 'État', width: 16, align: 'center' },
        { header: 'Date rappr.', width: 14, align: 'center' },
      ],
      rows,
      totalsRow: ['TOTAL', '', '', '', '', formatCurrency(totalAmount), '', ''],
    });
    showSuccess('Export réussi', 'La liste de rapprochement a été exportée.');
  };

  /* ---------------- Import d'un relevé bancaire (assisté) ---------------- */

  // Convertit une valeur de montant (nombre, "1 234,56", "1234.56"…) en nombre positif
  const parseImportAmount = (v: any): number => {
    if (typeof v === 'number') return Math.abs(v);
    let s = String(v ?? '').trim();
    if (!s) return NaN;
    s = s.replace(/[^\d.,-]/g, '');
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.'); // virgule décimale
    else s = s.replace(/,/g, ''); // point décimal
    const n = parseFloat(s);
    return isNaN(n) ? NaN : Math.abs(n);
  };

  // Convertit une valeur de date (Date, série Excel, "jj/mm/aaaa", ISO…) en "YYYY-MM-DD"
  const parseImportDate = (v: any): string => {
    if (v == null || v === '') return '';
    if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
    if (typeof v === 'number') {
      const d = new Date((v - 25569) * 86400 * 1000);
      return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
    }
    const s = String(v).trim();
    const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (m) {
      let [, d, mo, y] = m;
      if (y.length === 2) y = '20' + y;
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    const iso = s.match(/^\d{4}-\d{2}-\d{2}/);
    return iso ? iso[0] : '';
  };

  const daysBetween = (a: string, b: string): number => {
    if (!a || !b) return 9999;
    const da = new Date(a).getTime();
    const db = new Date(b).getTime();
    if (isNaN(da) || isNaN(db)) return 9999;
    return Math.abs(Math.round((da - db) / 86400000));
  };

  const resetImport = () => {
    setImportStep('upload');
    setImportFileName('');
    setImportHeaders([]);
    setImportRows([]);
    setMapDate(-1);
    setMapAmount(-1);
    setMapRef(-1);
    setProposals([]);
    setCheckedProposals({});
    setUnmatchedBank(0);
  };

  const handleImportFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) as any[][];
      const firstNonEmpty = rows.findIndex(r => r.some(c => String(c ?? '').trim() !== ''));
      if (firstNonEmpty < 0) {
        showWarning('Fichier vide', 'Aucune donnée détectée dans le fichier.');
        return;
      }
      const headers = (rows[firstNonEmpty] || []).map((h, i) => String(h ?? '').trim() || `Colonne ${i + 1}`);
      const dataRows = rows.slice(firstNonEmpty + 1).filter(r => r.some(c => String(c ?? '').trim() !== ''));
      setImportFileName(file.name);
      setImportHeaders(headers);
      setImportRows(dataRows);
      // Devinettes de mapping à partir des en-têtes
      const findCol = (keys: string[]) =>
        headers.findIndex(h => keys.some(k => h.toLowerCase().includes(k)));
      setMapDate(findCol(['date']));
      setMapAmount(findCol(['montant', 'amount', 'débit', 'debit', 'valeur', 'sortie']));
      setMapRef(findCol(['référence', 'reference', 'libellé', 'libelle', 'motif', 'chèque', 'cheque', 'pièce', 'piece']));
      setImportStep('map');
    } catch (e) {
      console.error('Import relevé échoué:', e);
      showError('Import impossible', "Le fichier n'a pas pu être lu. Vérifiez qu'il s'agit d'un Excel (.xlsx/.xls) ou CSV.");
    }
  };

  // Rapprochement assisté : propose une correspondance par versement non rapproché
  const runMatching = () => {
    if (mapAmount < 0) {
      showWarning('Colonne manquante', 'Veuillez indiquer la colonne du montant.');
      return;
    }
    const bankLines: BankLine[] = importRows
      .map(r => ({
        date: mapDate >= 0 ? parseImportDate(r[mapDate]) : '',
        amount: parseImportAmount(r[mapAmount]),
        ref: mapRef >= 0 ? String(r[mapRef] ?? '').trim() : '',
        raw: r,
      }))
      .filter(bl => !isNaN(bl.amount) && bl.amount > 0);

    // Versements bancaires en attente de rapprochement (non rapprochés)
    const pending: Array<{ payment: Payment; pp: PartialPayment }> = [];
    payments
      .filter(p => !selectedGrant || p.grantId === selectedGrant.id)
      .forEach(p => (p.partialPayments || []).forEach(pp => {
        if (pp.needsReconciliation && !pp.reconciled) pending.push({ payment: p, pp });
      }));

    const used = new Set<number>();
    const newProposals: Proposal[] = [];
    pending.forEach(({ payment, pp }) => {
      let bestIdx = -1;
      let bestScore = -1;
      bankLines.forEach((bl, i) => {
        if (used.has(i)) return;
        if (Math.abs(bl.amount - pp.amount) > 0.01) return; // le montant doit correspondre
        let score = 1;
        const vref = (realRef(pp) || pp.reference || '').toLowerCase().trim();
        if (vref && bl.ref) {
          const blr = bl.ref.toLowerCase();
          if (blr.includes(vref) || vref.includes(blr)) score += 2;
        }
        if (bl.date && pp.date && daysBetween(bl.date, pp.date) <= 5) score += 1;
        if (score > bestScore) { bestScore = score; bestIdx = i; }
      });
      if (bestIdx >= 0) {
        used.add(bestIdx);
        const bl = bankLines[bestIdx];
        newProposals.push({
          ppId: pp.id,
          paymentId: payment.id,
          versementLabel: `${payment.paymentNumber} — ${payment.supplier || '-'}`,
          versementDate: pp.date || '',
          amount: pp.amount,
          bankRef: bl.ref,
          bankDate: bl.date,
          confidence: bestScore >= 3 ? 'high' : 'medium',
        });
      }
    });

    const preChecked: Record<string, boolean> = {};
    newProposals.forEach(p => { preChecked[p.ppId] = p.confidence === 'high'; });
    setProposals(newProposals);
    setCheckedProposals(preChecked);
    setUnmatchedBank(bankLines.length - used.size);
    setImportStep('review');
  };

  const applyImport = () => {
    if (!canEdit || !onUpdatePayment) return;
    const toApply = proposals.filter(p => checkedProposals[p.ppId]);
    if (toApply.length === 0) {
      showWarning('Aucune sélection', 'Cochez au moins une correspondance à appliquer.');
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    const byPayment = new Map<string, Set<string>>();
    toApply.forEach(p => {
      const set = byPayment.get(p.paymentId) || new Set<string>();
      set.add(p.ppId);
      byPayment.set(p.paymentId, set);
    });
    byPayment.forEach((ppIds, paymentId) => {
      const payment = payments.find(p => p.id === paymentId);
      if (!payment) return;
      const updated = (payment.partialPayments || []).map(pp =>
        ppIds.has(pp.id) ? { ...pp, reconciled: true, reconciledDate: today } : pp
      );
      onUpdatePayment(paymentId, { partialPayments: updated });
    });
    showSuccess('Rapprochement importé', `${toApply.length} versement(s) rapproché(s) depuis le relevé.`);
    setShowImport(false);
    resetImport();
  };

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
            <Landmark className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Rapprochement bancaire</h2>
            <p className="text-gray-600 text-sm">
              Pointage des décaissements (virement / chèque) avec le relevé bancaire
              {selectedGrant ? ` — ${selectedGrant.name}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              onClick={() => { resetImport(); setShowImport(true); }}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 flex items-center gap-2 justify-center"
            >
              <Upload className="w-4 h-4" /> Importer un relevé
            </button>
          )}
          {canExport && (
            <button
              onClick={exportReconciliationExcel}
              className="bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-emerald-800 flex items-center gap-2 justify-center"
            >
              <Download className="w-4 h-4" /> Exporter Excel
            </button>
          )}
        </div>
      </div>

      {/* Cartes récapitulatives */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-semibold">Non rapprochés</span>
          </div>
          <p className="text-2xl font-bold text-amber-900 dark:text-amber-200 mt-1">{notReconciledCount}</p>
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mt-0.5">{formatCurrency(notReconciledAmount)}</p>
        </div>
        <div className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-green-800 dark:text-green-300">
            <CheckCircle className="w-4 h-4" />
            <span className="text-xs font-semibold">Rapprochés</span>
          </div>
          <p className="text-2xl font-bold text-green-900 dark:text-green-200 mt-1">{reconciledCount}</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-blue-800 dark:text-blue-300">
            <Landmark className="w-4 h-4" />
            <span className="text-xs font-semibold">Total versements</span>
          </div>
          <p className="text-2xl font-bold text-blue-900 dark:text-blue-200 mt-1">{reconciliationItems.length}</p>
          <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mt-0.5">{formatCurrency(totalAmount)}</p>
        </div>
      </div>

      {/* Filtres + tableau */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Versements ({reconciledCount}/{reconciliationItems.length} rapprochés)
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={recStatusFilter}
              onChange={(e) => { setRecStatusFilter(e.target.value as 'all' | 'reconciled' | 'not_reconciled'); setRecPage(1); }}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Tous</option>
              <option value="not_reconciled">Non rapprochés</option>
              <option value="reconciled">Rapprochés</option>
            </select>
            <input type="date" value={recDateFrom} onChange={(e) => { setRecDateFrom(e.target.value); setRecPage(1); }} title="Du" className="px-2 py-2 text-sm border border-gray-300 rounded-lg" />
            <span className="text-gray-400 text-xs">→</span>
            <input type="date" value={recDateTo} onChange={(e) => { setRecDateTo(e.target.value); setRecPage(1); }} title="Au" className="px-2 py-2 text-sm border border-gray-300 rounded-lg" />
            <select
              value={recPerPage}
              onChange={(e) => { setRecPerPage(Number(e.target.value)); setRecPage(1); }}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              title="Lignes par page"
            >
              <option value={10}>10 / page</option>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
              <option value={200}>200 / page</option>
              <option value={500}>500 / page</option>
            </select>
          </div>
        </div>

        {reconciliationItems.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">Aucun versement en attente de rapprochement.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">N° Paiement</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fournisseur</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Mode</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Référence</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Montant</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">État</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Détail</th>
                  {canEdit && <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {pagedItems.map(({ payment, pp }) => (
                  <tr key={pp.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-sm text-gray-900 whitespace-nowrap">{pp.date ? new Date(pp.date).toLocaleDateString('fr-FR') : '-'}</td>
                    <td className="px-3 py-2 text-sm font-medium text-gray-900 whitespace-nowrap">{payment.paymentNumber}</td>
                    <td className="px-3 py-2 text-sm text-gray-700">{payment.supplier || '-'}</td>
                    <td className="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">{pp.paymentMethod === 'check' ? 'Chèque' : pp.paymentMethod === 'transfer' ? 'Virement' : 'Espèces'}</td>
                    <td className="px-3 py-2 text-sm text-gray-700">{realRef(pp) || '-'}</td>
                    <td className="px-3 py-2 text-sm text-right font-medium text-gray-900 whitespace-nowrap">{formatCurrency(pp.amount)}</td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      {pp.reconciled ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Rapproché</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Non rapproché</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      <button
                        onClick={() => setDetailItem({ payment, pp })}
                        className="inline-flex items-center justify-center p-1.5 rounded-lg text-blue-600 hover:bg-blue-50"
                        title="Voir le détail"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                    {canEdit && (
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        <button
                          onClick={() => toggleReconciled(payment, pp.id, !pp.reconciled)}
                          className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${pp.reconciled ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-green-600 text-white hover:bg-green-700'}`}
                        >
                          {pp.reconciled ? 'Annuler' : 'Rapprocher'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {recTotalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4">
                <p className="text-xs sm:text-sm text-gray-600">
                  {recStartIndex + 1}–{Math.min(recStartIndex + recPerPage, reconciliationItems.length)} sur {reconciliationItems.length}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setRecPage(Math.max(1, recSafePage - 1))}
                    disabled={recSafePage === 1}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Précédent
                  </button>
                  <span className="px-3 py-1.5 text-sm text-gray-600">Page {recSafePage} / {recTotalPages}</span>
                  <button
                    onClick={() => setRecPage(Math.min(recTotalPages, recSafePage + 1))}
                    disabled={recSafePage === recTotalPages}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Suivant
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---------------- Modale d'import de relevé bancaire ---------------- */}
      {showImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white z-10 p-5 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                Importer un relevé bancaire
              </h3>
              <button onClick={() => { setShowImport(false); resetImport(); }} className="p-2 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5">
              {/* Étape 1 : chargement du fichier */}
              {importStep === 'upload' && (
                <div className="text-center py-6">
                  <p className="text-sm text-gray-600 mb-4">
                    Sélectionnez le fichier de votre relevé bancaire (Excel <b>.xlsx/.xls</b> ou <b>.csv</b>).
                    Vous associerez ensuite les colonnes (date, montant, référence).
                  </p>
                  <label className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 cursor-pointer">
                    <Upload className="w-4 h-4" /> Choisir un fichier
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.currentTarget.value = ''; }}
                    />
                  </label>
                </div>
              )}

              {/* Étape 2 : mapping des colonnes */}
              {importStep === 'map' && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Fichier : <b>{importFileName}</b> — {importRows.length} ligne(s). Associez les colonnes :
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { label: 'Date', val: mapDate, set: setMapDate, required: false },
                      { label: 'Montant *', val: mapAmount, set: setMapAmount, required: true },
                      { label: 'Référence / Libellé', val: mapRef, set: setMapRef, required: false },
                    ].map(({ label, val, set }) => (
                      <div key={label}>
                        <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                        <select
                          value={val}
                          onChange={(e) => set(Number(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          <option value={-1}>— Ignorer —</option>
                          {importHeaders.map((h, i) => (
                            <option key={i} value={i}>{h}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>

                  {/* Aperçu des premières lignes */}
                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>{importHeaders.map((h, i) => <th key={i} className="px-2 py-1 text-left font-medium text-gray-500 whitespace-nowrap">{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {importRows.slice(0, 4).map((r, ri) => (
                          <tr key={ri} className="border-t border-gray-100">
                            {importHeaders.map((_, ci) => <td key={ci} className="px-2 py-1 text-gray-700 whitespace-nowrap">{String(r[ci] ?? '')}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-between gap-2 pt-2">
                    <button onClick={() => setImportStep('upload')} className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">Retour</button>
                    <button onClick={runMatching} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700">Analyser les correspondances</button>
                  </div>
                </div>
              )}

              {/* Étape 3 : aperçu et validation */}
              {importStep === 'review' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-3 text-sm">
                    <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">{proposals.length} correspondance(s) proposée(s)</span>
                    <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-700 font-medium">{unmatchedBank} ligne(s) du relevé sans correspondance</span>
                  </div>
                  {proposals.length === 0 ? (
                    <p className="text-sm text-gray-500 py-6 text-center">Aucune correspondance trouvée entre le relevé et les versements en attente.</p>
                  ) : (
                    <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-[45vh] overflow-y-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={proposals.length > 0 && proposals.every(p => checkedProposals[p.ppId])}
                                onChange={(e) => {
                                  const all: Record<string, boolean> = {};
                                  proposals.forEach(p => { all[p.ppId] = e.target.checked; });
                                  setCheckedProposals(all);
                                }}
                              />
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Versement</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Montant</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Réf. relevé</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Confiance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {proposals.map(p => (
                            <tr key={p.ppId} className="hover:bg-gray-50">
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={!!checkedProposals[p.ppId]}
                                  onChange={(e) => setCheckedProposals(prev => ({ ...prev, [p.ppId]: e.target.checked }))}
                                />
                              </td>
                              <td className="px-3 py-2 text-gray-800">
                                {p.versementLabel}
                                <span className="block text-xs text-gray-400">{p.versementDate}{p.bankDate && p.bankDate !== p.versementDate ? ` · relevé ${p.bankDate}` : ''}</span>
                              </td>
                              <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{formatCurrency(p.amount)}</td>
                              <td className="px-3 py-2 text-gray-600">{p.bankRef || '-'}</td>
                              <td className="px-3 py-2 text-center">
                                {p.confidence === 'high' ? (
                                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Fiable</span>
                                ) : (
                                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">À vérifier</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="flex justify-between gap-2 pt-2">
                    <button onClick={() => setImportStep('map')} className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">Retour</button>
                    <button
                      onClick={applyImport}
                      disabled={proposals.length === 0}
                      className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50"
                    >
                      Appliquer la sélection
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Modale de détail d'un versement ---------------- */}
      {detailItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white z-10 p-5 border-b flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Détail du versement</h3>
                <p className="text-sm text-gray-500">{detailItem.payment.paymentNumber}</p>
              </div>
              <button onClick={() => setDetailItem(null)} className="p-2 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-5 text-sm">
              {/* Paiement / facture */}
              <div>
                <h4 className="font-semibold text-gray-800 mb-2">Paiement</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-gray-500 text-xs">Fournisseur</p><p className="text-gray-900 font-medium">{detailItem.payment.supplier || '-'}</p></div>
                  <div><p className="text-gray-500 text-xs">N° Facture</p><p className="text-gray-900 font-medium">{detailItem.payment.invoiceNumber || '-'}</p></div>
                  <div className="col-span-2"><p className="text-gray-500 text-xs">Description</p><p className="text-gray-900">{detailItem.payment.description || '-'}</p></div>
                  <div><p className="text-gray-500 text-xs">Montant total du paiement</p><p className="text-gray-900 font-medium">{formatCurrency(detailItem.payment.amount)}</p></div>
                  <div><p className="text-gray-500 text-xs">Date du paiement</p><p className="text-gray-900">{detailItem.payment.date ? new Date(detailItem.payment.date).toLocaleDateString('fr-FR') : '-'}</p></div>
                </div>
              </div>
              {/* Versement (échéance) */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h4 className="font-semibold text-gray-800 mb-2">Versement (échéance)</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-gray-500 text-xs">Date</p><p className="text-gray-900">{detailItem.pp.date ? new Date(detailItem.pp.date).toLocaleDateString('fr-FR') : '-'}</p></div>
                  <div><p className="text-gray-500 text-xs">Montant</p><p className="text-gray-900 font-medium">{formatCurrency(detailItem.pp.amount)}</p></div>
                  <div><p className="text-gray-500 text-xs">Mode de règlement</p><p className="text-gray-900">{detailItem.pp.paymentMethod === 'check' ? 'Chèque' : detailItem.pp.paymentMethod === 'transfer' ? 'Virement' : 'Espèces'}</p></div>
                  <div><p className="text-gray-500 text-xs">{detailItem.pp.paymentMethod === 'check' ? 'N° Chèque' : detailItem.pp.paymentMethod === 'transfer' ? 'Réf. virement' : 'Référence'}</p><p className="text-gray-900 font-medium">{realRef(detailItem.pp) || '-'}</p></div>
                  <div className="col-span-2">
                    <p className="text-gray-500 text-xs">État du rapprochement</p>
                    {detailItem.pp.reconciled ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                        Rapproché{detailItem.pp.reconciledDate ? ` le ${new Date(detailItem.pp.reconciledDate).toLocaleDateString('fr-FR')}` : ''}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Non rapproché</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReconciliationManager;
