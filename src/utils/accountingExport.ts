import * as XLSX from 'xlsx-js-style';
import { buildStyledWorksheet } from './excelExport';
import { Engagement, Payment, Grant } from '../types';

/**
 * Export comptable — génère :
 *  - un FEC (Fichier des Écritures Comptables) au format réglementaire (.txt, 18 colonnes, tabulé)
 *  - un classeur Excel coloré : Journal, Grand livre, Balance
 *
 * Écritures produites (comptabilité d'engagement) :
 *  - Engagement approuvé/payé → charge : Débit 60x / Crédit Fournisseur 401
 *  - Paiement décaissé (ou paiements partiels) → règlement : Débit Fournisseur 401 / Crédit Banque 512
 *
 * Les entités ne portant pas de numéro de compte comptable, on utilise un
 * PLAN COMPTABLE PAR DÉFAUT (modifiable ci-dessous) — fonctionne directement
 * avec les données déjà enregistrées, sans migration.
 */

/* ------------------------------------------------------------------ */
/*  Plan comptable par défaut (paramétrable)                          */
/* ------------------------------------------------------------------ */
export const DEFAULT_ACCOUNTS = {
  charge: { num: '601000', lib: 'Achats / Charges' },
  supplier: { num: '401000', lib: 'Fournisseurs' },
  bank: { num: '512000', lib: 'Banque' },
};

const JOURNALS = {
  purchase: { code: 'ACH', lib: 'Journal des achats (engagements)' },
  bank: { code: 'BQ', lib: 'Journal de banque (règlements)' },
};

export interface AccountingLine {
  journalCode: string;
  journalLib: string;
  ecritureNum: number;
  ecritureDate: string; // ISO (YYYY-MM-DD…)
  compteNum: string;
  compteLib: string;
  compAuxNum: string;
  compAuxLib: string;
  pieceRef: string;
  pieceDate: string;
  lib: string;
  debit: number;
  credit: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const supplierAux = (name?: string): { num: string; lib: string } => {
  if (!name || !name.trim()) return { num: '', lib: '' };
  const code = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'DIVERS';
  return { num: `F${code}`, lib: name.trim() };
};

const iso10 = (d: string): string => (d ? d.slice(0, 10) : '');
const fecDate = (d: string): string => iso10(d).replace(/-/g, ''); // YYYYMMDD
const frDate = (d: string): string => {
  const s = iso10(d);
  if (!s) return '';
  const [y, m, day] = s.split('-');
  return day && m && y ? `${day}/${m}/${y}` : s;
};
const fecAmount = (n: number): string => (n || 0).toFixed(2).replace('.', ',');
const money = (n: number): string =>
  (n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ------------------------------------------------------------------ */
/*  Construction des écritures                                         */
/* ------------------------------------------------------------------ */
export function buildAccountingEntries(engagements: Engagement[], payments: Payment[]): AccountingLine[] {
  const lines: AccountingLine[] = [];
  let num = 0;

  // 1) Engagements approuvés / payés → charges
  const engs = engagements
    .filter((e) => e.status === 'approved' || e.status === 'paid')
    .slice()
    .sort((a, b) => iso10(a.date).localeCompare(iso10(b.date)));

  engs.forEach((e) => {
    if (!e.amount || e.amount <= 0) return;
    num++;
    const aux = supplierAux(e.supplier);
    const lib = `Engagement ${e.engagementNumber}${e.supplier ? ' - ' + e.supplier : ''}`;
    const pieceRef = e.invoiceNumber || e.engagementNumber;
    const common = {
      journalCode: JOURNALS.purchase.code,
      journalLib: JOURNALS.purchase.lib,
      ecritureNum: num,
      ecritureDate: e.date,
      pieceRef,
      pieceDate: e.date,
      lib,
    };
    lines.push({
      ...common,
      compteNum: DEFAULT_ACCOUNTS.charge.num,
      compteLib: DEFAULT_ACCOUNTS.charge.lib,
      compAuxNum: '',
      compAuxLib: '',
      debit: e.amount,
      credit: 0,
    });
    lines.push({
      ...common,
      compteNum: DEFAULT_ACCOUNTS.supplier.num,
      compteLib: DEFAULT_ACCOUNTS.supplier.lib,
      compAuxNum: aux.num,
      compAuxLib: aux.lib,
      debit: 0,
      credit: e.amount,
    });
  });

  // 2) Paiements décaissés → règlements (banque)
  const pays = payments.slice().sort((a, b) => iso10(a.date).localeCompare(iso10(b.date)));
  pays.forEach((p) => {
    const parts =
      p.partialPayments && p.partialPayments.length > 0
        ? p.partialPayments.map((pp) => ({ amount: pp.amount, date: pp.date || p.date }))
        : p.status === 'paid'
        ? [{ amount: p.amount, date: p.date }]
        : [];

    parts.forEach((part) => {
      if (!part.amount || part.amount <= 0) return;
      num++;
      const aux = supplierAux(p.supplier);
      const lib = `Règlement ${p.paymentNumber}${p.supplier ? ' - ' + p.supplier : ''}`;
      const pieceRef = p.invoiceNumber || p.paymentNumber;
      const common = {
        journalCode: JOURNALS.bank.code,
        journalLib: JOURNALS.bank.lib,
        ecritureNum: num,
        ecritureDate: part.date,
        pieceRef,
        pieceDate: part.date,
        lib,
      };
      lines.push({
        ...common,
        compteNum: DEFAULT_ACCOUNTS.supplier.num,
        compteLib: DEFAULT_ACCOUNTS.supplier.lib,
        compAuxNum: aux.num,
        compAuxLib: aux.lib,
        debit: part.amount,
        credit: 0,
      });
      lines.push({
        ...common,
        compteNum: DEFAULT_ACCOUNTS.bank.num,
        compteLib: DEFAULT_ACCOUNTS.bank.lib,
        compAuxNum: '',
        compAuxLib: '',
        debit: 0,
        credit: part.amount,
      });
    });
  });

  return lines;
}

/* ------------------------------------------------------------------ */
/*  FEC (.txt)                                                         */
/* ------------------------------------------------------------------ */
const FEC_HEADERS = [
  'JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib',
  'CompAuxNum', 'CompAuxLib', 'PieceRef', 'PieceDate', 'EcritureLib', 'Debit', 'Credit',
  'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise',
];

function buildFecContent(lines: AccountingLine[]): string {
  const rows = lines.map((l) =>
    [
      l.journalCode,
      l.journalLib,
      String(l.ecritureNum),
      fecDate(l.ecritureDate),
      l.compteNum,
      l.compteLib,
      l.compAuxNum,
      l.compAuxLib,
      l.pieceRef,
      fecDate(l.pieceDate),
      l.lib,
      fecAmount(l.debit),
      fecAmount(l.credit),
      '', // EcritureLet
      '', // DateLet
      fecDate(l.ecritureDate), // ValidDate
      '', // Montantdevise
      '', // Idevise
    ].join('\t')
  );
  return [FEC_HEADERS.join('\t'), ...rows].join('\r\n');
}

function downloadText(content: string, fileName: string) {
  const blob = new Blob(['﻿' + content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/*  Classeur Excel : Journal + Grand livre + Balance                   */
/* ------------------------------------------------------------------ */
function buildAccountingWorkbook(
  lines: AccountingLine[],
  grant: Grant | null,
  generatedAt: string
): XLSX.WorkBook {
  const currency = grant?.currency || 'XOF';
  const infoLines = [
    grant ? `Subvention : ${grant.name}` : 'Toutes les subventions',
    grant ? `Référence : ${grant.reference}   •   Devise : ${currency}` : `Devise : ${currency}`,
    `Généré le : ${generatedAt}`,
  ];

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

  // ---- Journal ----
  const journalRows = lines.map((l) => [
    frDate(l.ecritureDate),
    l.journalCode,
    l.ecritureNum,
    l.compteNum,
    l.compteLib,
    l.compAuxLib || '-',
    l.pieceRef,
    l.lib,
    l.debit ? money(l.debit) : '',
    l.credit ? money(l.credit) : '',
  ]);
  const journalWs = buildStyledWorksheet({
    fileName: '',
    sheetName: 'Journal',
    title: 'JOURNAL DES ÉCRITURES COMPTABLES',
    infoLines,
    columns: [
      { header: 'Date', width: 12, align: 'center' },
      { header: 'Journal', width: 10, align: 'center' },
      { header: 'N° Écr.', width: 8, align: 'center' },
      { header: 'Compte', width: 12 },
      { header: 'Intitulé compte', width: 24 },
      { header: 'Tiers', width: 22 },
      { header: 'Pièce', width: 18 },
      { header: 'Libellé', width: 40 },
      { header: 'Débit', width: 16, align: 'right' },
      { header: 'Crédit', width: 16, align: 'right' },
    ],
    rows: journalRows,
    totalsRow: ['TOTAUX', '', '', '', '', '', '', '', money(totalDebit), money(totalCredit)],
  });

  // ---- Grand livre (trié par compte, puis par date, avec solde progressif) ----
  const sorted = lines.slice().sort((a, b) => {
    if (a.compteNum !== b.compteNum) return a.compteNum.localeCompare(b.compteNum);
    return iso10(a.ecritureDate).localeCompare(iso10(b.ecritureDate));
  });
  let cumul = 0;
  let currentAccount = '';
  const grandLivreRows = sorted.map((l) => {
    if (l.compteNum !== currentAccount) {
      currentAccount = l.compteNum;
      cumul = 0;
    }
    cumul += l.debit - l.credit;
    return [
      l.compteNum,
      l.compteLib,
      frDate(l.ecritureDate),
      l.journalCode,
      l.pieceRef,
      l.lib,
      l.debit ? money(l.debit) : '',
      l.credit ? money(l.credit) : '',
      money(cumul),
    ];
  });
  const grandLivreWs = buildStyledWorksheet({
    fileName: '',
    sheetName: 'Grand livre',
    title: 'GRAND LIVRE',
    infoLines,
    columns: [
      { header: 'Compte', width: 12 },
      { header: 'Intitulé', width: 24 },
      { header: 'Date', width: 12, align: 'center' },
      { header: 'Journal', width: 10, align: 'center' },
      { header: 'Pièce', width: 18 },
      { header: 'Libellé', width: 40 },
      { header: 'Débit', width: 16, align: 'right' },
      { header: 'Crédit', width: 16, align: 'right' },
      { header: 'Solde', width: 16, align: 'right' },
    ],
    rows: grandLivreRows,
    totalsRow: ['TOTAUX', '', '', '', '', '', money(totalDebit), money(totalCredit), ''],
  });

  // ---- Balance (par compte) ----
  const byAccount = new Map<string, { lib: string; debit: number; credit: number }>();
  lines.forEach((l) => {
    const acc = byAccount.get(l.compteNum) || { lib: l.compteLib, debit: 0, credit: 0 };
    acc.debit += l.debit;
    acc.credit += l.credit;
    byAccount.set(l.compteNum, acc);
  });
  const balanceRows = Array.from(byAccount.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([num, acc]) => {
      const solde = acc.debit - acc.credit;
      return [
        num,
        acc.lib,
        money(acc.debit),
        money(acc.credit),
        solde > 0 ? money(solde) : '',
        solde < 0 ? money(-solde) : '',
      ];
    });
  const totalSoldeD = lines.reduce((s, l) => s + l.debit, 0) - lines.reduce((s, l) => s + l.credit, 0);
  const balanceWs = buildStyledWorksheet({
    fileName: '',
    sheetName: 'Balance',
    title: 'BALANCE GÉNÉRALE',
    infoLines,
    columns: [
      { header: 'Compte', width: 14 },
      { header: 'Intitulé', width: 30 },
      { header: 'Débit', width: 18, align: 'right' },
      { header: 'Crédit', width: 18, align: 'right' },
      { header: 'Solde débiteur', width: 18, align: 'right' },
      { header: 'Solde créditeur', width: 18, align: 'right' },
    ],
    rows: balanceRows,
    totalsRow: [
      'TOTAUX',
      '',
      money(totalDebit),
      money(totalCredit),
      totalSoldeD > 0 ? money(totalSoldeD) : '',
      totalSoldeD < 0 ? money(-totalSoldeD) : '',
    ],
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, journalWs, 'Journal');
  XLSX.utils.book_append_sheet(wb, grandLivreWs, 'Grand livre');
  XLSX.utils.book_append_sheet(wb, balanceWs, 'Balance');
  return wb;
}

/* ------------------------------------------------------------------ */
/*  API publique                                                       */
/* ------------------------------------------------------------------ */
export interface AccountingExportOptions {
  engagements: Engagement[];
  payments: Payment[];
  grant: Grant | null;
  /** Date de génération (JJ/MM/AAAA) — passée par l'appelant (pas de Date() ici). */
  generatedAt: string;
  /** Suffixe de nom de fichier (référence subvention ou 'global'). */
  fileSuffix: string;
  /** true = produit le FEC .txt en plus du classeur Excel. */
  includeFec?: boolean;
  /** true = produit le classeur Excel (Journal/Grand livre/Balance). */
  includeExcel?: boolean;
}

/** Nombre d'écritures (transactions) qui seront générées — pour prévenir si vide. */
export function countAccountingEntries(engagements: Engagement[], payments: Payment[]): number {
  return buildAccountingEntries(engagements, payments).length / 2;
}

export function exportAccounting(options: AccountingExportOptions): number {
  const { engagements, payments, grant, generatedAt, fileSuffix, includeFec = true, includeExcel = true } = options;
  const lines = buildAccountingEntries(engagements, payments);
  const datePart = new Date().toISOString().split('T')[0];

  if (includeFec) {
    downloadText(buildFecContent(lines), `FEC-${fileSuffix}-${datePart}.txt`);
  }
  if (includeExcel) {
    const wb = buildAccountingWorkbook(lines, grant, generatedAt);
    XLSX.writeFile(wb, `comptabilite-${fileSuffix}-${datePart}.xlsx`);
  }

  return lines.length / 2;
}
