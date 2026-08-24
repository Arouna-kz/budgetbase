import * as XLSX from 'xlsx-js-style';

/**
 * Utilitaire partagé pour générer des fichiers Excel STYLÉS (couleurs, en-têtes,
 * lignes alternées, totaux mis en évidence) via xlsx-js-style.
 *
 * xlsx-js-style est un remplaçant direct de la librairie `xlsx` (SheetJS) qui
 * ajoute la prise en charge du style des cellules (`cell.s`), non disponible dans
 * l'édition communautaire de `xlsx`.
 */

type CellValue = string | number | null | undefined;

export type Align = 'left' | 'right' | 'center';

export interface ExcelColumn {
  header: string;
  width?: number;
  align?: Align;
}

export interface StyledExcelOptions {
  fileName: string;
  sheetName: string;
  /** Titre principal (bandeau coloré, fusionné sur toute la largeur). */
  title: string;
  /** Lignes d'information (subvention, période, date de génération…). */
  infoLines?: string[];
  columns: ExcelColumn[];
  /** Données, alignées sur `columns`. */
  rows: CellValue[][];
  /** Ligne de totaux optionnelle (mise en évidence). */
  totalsRow?: CellValue[];
  /** Couleur de fond de l'en-tête (hex sans #). Défaut : bleu. */
  headerColor?: string;
  /**
   * Type de chaque ligne de `rows` (aligné sur `rows`), pour un rendu hiérarchique :
   * - `'group'` : ligne budgétaire (cumul) — fond bleu clair, gras.
   * - `'sub'`   : sous-ligne — fond blanc, 1ère colonne indentée.
   * - `undefined`/`'data'` : ligne normale avec alternance de couleur.
   */
  rowKinds?: Array<'group' | 'sub' | 'data'>;
}

/* ------------------------------------------------------------------ */
/*  Palette de couleurs (hex ARGB sans le préfixe #, alpha implicite)  */
/* ------------------------------------------------------------------ */
export const EXCEL_COLORS = {
  title: '1E3A8A', // bleu-900
  header: '2563EB', // bleu-600
  headerText: 'FFFFFF',
  zebra: 'EFF6FF', // bleu-50
  white: 'FFFFFF',
  total: 'FEF3C7', // ambre-100
  totalBorder: 'D97706', // ambre-600
  sectionHeader: 'DBEAFE', // bleu-100
  subRow: 'F3F4F6', // gris-100
  infoText: '6B7280', // gris-500
  border: 'D1D5DB', // gris-300
  text: '111827', // gris-900
};

const thinBorder = {
  top: { style: 'thin', color: { rgb: EXCEL_COLORS.border } },
  bottom: { style: 'thin', color: { rgb: EXCEL_COLORS.border } },
  left: { style: 'thin', color: { rgb: EXCEL_COLORS.border } },
  right: { style: 'thin', color: { rgb: EXCEL_COLORS.border } },
};

/* ------------------------------------------------------------------ */
/*  Styles réutilisables (pour les exports personnalisés)              */
/* ------------------------------------------------------------------ */
export const EXCEL_STYLES = {
  title: {
    font: { bold: true, sz: 16, color: { rgb: EXCEL_COLORS.white } },
    fill: { fgColor: { rgb: EXCEL_COLORS.title } },
    alignment: { horizontal: 'center', vertical: 'center' },
  },
  info: {
    font: { italic: true, sz: 10, color: { rgb: EXCEL_COLORS.infoText } },
    alignment: { horizontal: 'left', vertical: 'center' },
  },
  header: {
    font: { bold: true, sz: 11, color: { rgb: EXCEL_COLORS.headerText } },
    fill: { fgColor: { rgb: EXCEL_COLORS.header } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: thinBorder,
  },
  total: {
    font: { bold: true, sz: 11, color: { rgb: EXCEL_COLORS.text } },
    fill: { fgColor: { rgb: EXCEL_COLORS.total } },
    border: {
      ...thinBorder,
      top: { style: 'medium', color: { rgb: EXCEL_COLORS.totalBorder } },
    },
  },
  sectionHeader: {
    font: { bold: true, sz: 11, color: { rgb: EXCEL_COLORS.title } },
    fill: { fgColor: { rgb: EXCEL_COLORS.sectionHeader } },
    border: thinBorder,
  },
} as const;

/** Style d'une cellule de données (avec alternance de couleur). */
export function dataCellStyle(rowIndex: number, align: Align = 'left') {
  return {
    font: { sz: 10, color: { rgb: EXCEL_COLORS.text } },
    fill: { fgColor: { rgb: rowIndex % 2 === 0 ? EXCEL_COLORS.white : EXCEL_COLORS.zebra } },
    alignment: { horizontal: align, vertical: 'center', wrapText: true },
    border: thinBorder,
  };
}

/** Style d'une ligne "groupe" (ligne budgétaire cumulée) — fond bleu clair, gras. */
export function groupRowStyle(align: Align = 'left') {
  return {
    font: { bold: true, sz: 10, color: { rgb: EXCEL_COLORS.title } },
    fill: { fgColor: { rgb: EXCEL_COLORS.sectionHeader } },
    alignment: { horizontal: align, vertical: 'center', wrapText: true },
    border: thinBorder,
  };
}

/** Style d'une sous-ligne — fond blanc, 1ère colonne indentée. */
export function subRowStyle(align: Align = 'left', indent = false) {
  return {
    font: { sz: 10, color: { rgb: EXCEL_COLORS.text } },
    fill: { fgColor: { rgb: EXCEL_COLORS.white } },
    alignment: { horizontal: align, vertical: 'center', wrapText: true, ...(indent ? { indent: 1 } : {}) },
    border: thinBorder,
  };
}

/* ------------------------------------------------------------------ */
/*  Helper haut niveau : liste simple avec en-tête + totaux            */
/* ------------------------------------------------------------------ */
/** Construit uniquement la feuille stylée (sans classeur) — utile pour composer un classeur multi-feuilles. */
export function buildStyledWorksheet(options: StyledExcelOptions): XLSX.WorkSheet {
  const { title, infoLines = [], columns, rows, totalsRow, headerColor, rowKinds } = options;
  const colCount = columns.length;

  const aoa: CellValue[][] = [];
  const merges: XLSX.Range[] = [];

  // Ligne 0 : titre (fusionné)
  const titleRowIdx = aoa.length;
  aoa.push([title, ...Array(colCount - 1).fill('')]);
  merges.push({ s: { r: titleRowIdx, c: 0 }, e: { r: titleRowIdx, c: colCount - 1 } });

  // Lignes d'information (fusionnées chacune)
  const infoRowIdxs: number[] = [];
  infoLines.forEach((line) => {
    const idx = aoa.length;
    infoRowIdxs.push(idx);
    aoa.push([line, ...Array(colCount - 1).fill('')]);
    merges.push({ s: { r: idx, c: 0 }, e: { r: idx, c: colCount - 1 } });
  });

  // Ligne vide de séparation
  aoa.push(Array(colCount).fill(''));

  // Ligne d'en-tête
  const headerRowIdx = aoa.length;
  aoa.push(columns.map((c) => c.header));

  // Lignes de données
  const firstDataRowIdx = aoa.length;
  rows.forEach((r) => {
    const padded = [...r];
    while (padded.length < colCount) padded.push('');
    aoa.push(padded);
  });
  const lastDataRowIdx = aoa.length - 1;

  // Ligne de totaux
  let totalsRowIdx = -1;
  if (totalsRow) {
    totalsRowIdx = aoa.length;
    const padded = [...totalsRow];
    while (padded.length < colCount) padded.push('');
    aoa.push(padded);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Largeurs de colonnes
  ws['!cols'] = columns.map((c) => ({ wch: c.width ?? 18 }));
  ws['!merges'] = merges;

  // Hauteurs de lignes (titre + en-tête plus hautes)
  const rowsMeta: XLSX.RowInfo[] = [];
  rowsMeta[titleRowIdx] = { hpt: 26 };
  rowsMeta[headerRowIdx] = { hpt: 22 };
  ws['!rows'] = rowsMeta;

  const headerStyle = headerColor
    ? { ...EXCEL_STYLES.header, fill: { fgColor: { rgb: headerColor } } }
    : EXCEL_STYLES.header;

  // Appliquer les styles cellule par cellule
  for (let r = 0; r < aoa.length; r++) {
    for (let c = 0; c < colCount; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) ws[ref] = { t: 's', v: '' };

      if (r === titleRowIdx) {
        ws[ref].s = EXCEL_STYLES.title;
      } else if (infoRowIdxs.includes(r)) {
        ws[ref].s = EXCEL_STYLES.info;
      } else if (r === headerRowIdx) {
        ws[ref].s = headerStyle;
      } else if (r === totalsRowIdx) {
        ws[ref].s = {
          ...EXCEL_STYLES.total,
          alignment: { horizontal: columns[c]?.align ?? 'left', vertical: 'center' },
        };
      } else if (r >= firstDataRowIdx && r <= lastDataRowIdx) {
        const align = columns[c]?.align ?? 'left';
        const kind = rowKinds?.[r - firstDataRowIdx];
        if (kind === 'group') {
          ws[ref].s = groupRowStyle(align);
        } else if (kind === 'sub') {
          ws[ref].s = subRowStyle(align, c === 0);
        } else {
          ws[ref].s = dataCellStyle(r - firstDataRowIdx, align);
        }
      }
    }
  }

  // Auto-filtre sur l'en-tête + données
  ws['!autofilter'] = {
    ref: XLSX.utils.encode_range(
      { r: headerRowIdx, c: 0 },
      { r: Math.max(headerRowIdx, lastDataRowIdx), c: colCount - 1 }
    ),
  };

  return ws;
}

export function buildStyledSheet(options: StyledExcelOptions): {
  wb: XLSX.WorkBook;
  ws: XLSX.WorkSheet;
} {
  const ws = buildStyledWorksheet(options);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, options.sheetName);
  return { wb, ws };
}

/** Génère et télécharge directement un fichier Excel stylé (liste simple). */
export function exportStyledExcel(options: StyledExcelOptions): void {
  const { wb } = buildStyledSheet(options);
  XLSX.writeFile(wb, options.fileName);
}
