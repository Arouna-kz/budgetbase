import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  TrendingUp, AlertTriangle, CheckCircle, Eye, FileText, Download, ChevronUp, ChevronDown, 
  ChevronLeft, ChevronRight, Search, Filter, Menu, X, ChevronRight as ExpandIcon, 
  ChevronDown as CollapseIcon, FileSpreadsheet, DollarSign, Clock
} from 'lucide-react';
import { BudgetLine, SubBudgetLine, Grant, Engagement, Payment } from '../types';
import jsPDF from 'jspdf';
import { exportStyledExcel } from '../utils/excelExport';
import { showSuccess, showError, showValidationError, confirmDelete, showWarning } from '../utils/alerts';
import { usePermissions } from '../hooks/usePermissions';

interface BudgetTrackingProps {
  budgetLines: BudgetLine[];
  subBudgetLines: SubBudgetLine[];
  grants: Grant[];
  engagements: Engagement[];
  payments: Payment[];
  selectedGrantId: string;
  onViewEngagements: (subBudgetLineId: string) => void;
  onNavigate?: (tab: string) => void;
}

type SortField = 'name' | 'code' | 'notifiedAmount' | 'engagedAmount' | 'spentAmount' | 'availableAmount' | 'engagementRate' | 'spentRate' | 'inProgressAmount' | 'remainingToPay' | 'progressRate';
type SortDirection = 'asc' | 'desc';

// Interface pour les statistiques de paiement
interface PaymentStats {
  totalPaid: number;
  totalInProgress: number;
  remainingToPay: number;
  progressRate: number;
  partialPaymentsCount: number;
  fullPaymentsCount: number;
  totalEngaged: number;
}

const BudgetTracking: React.FC<BudgetTrackingProps> = ({ 
  budgetLines, 
  subBudgetLines, 
  grants, 
  engagements, 
  payments = [],
  selectedGrantId,
  onViewEngagements,
  onNavigate
}) => {
  // États
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedBudgetLines, setSelectedBudgetLines] = useState<string[]>([]);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);
  const [expandedTexts, setExpandedTexts] = useState<{[key: string]: boolean}>({});
  
  const tableRef = useRef<HTMLTableElement>(null);

  // Permissions
  const { hasPermission, hasModuleAccess, loading: permissionsLoading } = usePermissions();
  const canView = hasPermission('tracking', 'view');
  const canExport = hasPermission('tracking', 'export');
  const canViewDetails = hasPermission('tracking', 'view_details');

  const filteredBudgetLines = budgetLines;
  const filteredSubBudgetLines = subBudgetLines;
  const selectedGrant = grants.length > 0 ? grants[0] : null;

  // Responsive
  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobileView(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setShowMobileMenu(false);
      }
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // ============================================
  // FONCTIONS DE CALCUL AVEC PAIEMENTS ÉCHELONNÉS
  // ============================================

  /**
   * Calcule le montant total payé pour une sous-ligne budgétaire
   * Prend en compte les paiements complets et les paiements partiels
   */
  const getTotalPaidForSubLine = (subBudgetLineId: string): number => {
    const linePayments = payments.filter(p => 
      p.subBudgetLineId === subBudgetLineId && 
      (p.status === 'paid' || p.status === 'in_progress')
    );
    
    return linePayments.reduce((sum, payment) => {
      // Si le paiement a des paiements partiels, sommer ceux-ci
      if (payment.partialPayments && payment.partialPayments.length > 0) {
        const totalPaid = payment.partialPayments.reduce((s, pp) => s + pp.amount, 0);
        return sum + totalPaid;
      }
      // Sinon, prendre le montant total du paiement
      return sum + payment.amount;
    }, 0);
  };

  /**
   * Calcule le montant total en cours de paiement pour une sous-ligne
   * (montants engagés mais pas encore payés)
   */
  const getInProgressAmountForSubLine = (subBudgetLineId: string): number => {
    const linePayments = payments.filter(p => 
      p.subBudgetLineId === subBudgetLineId && 
      p.status === 'in_progress' &&
      p.partialPayments && 
      p.partialPayments.length > 0
    );
    
    return linePayments.reduce((sum, payment) => {
      const totalPaid = payment.partialPayments?.reduce((s, pp) => s + pp.amount, 0) || 0;
      return sum + (payment.amount - totalPaid);
    }, 0);
  };

  /**
   * Calcule le montant restant à payer pour une sous-ligne
   */
  const getRemainingToPayForSubLine = (subBudgetLineId: string): number => {
    // ✅ Utiliser engagedAmount (engagements approuvés uniquement), comme la carte
    // "Montant Engagé" et la page Gestion des subventions. Les engagements rejetés
    // retournent au disponible et ne doivent donc pas gonfler le reste à payer.
    const line = subBudgetLines.find(l => l.id === subBudgetLineId);
    const totalEngaged = line ? line.engagedAmount : 0;
    const totalPaid = getTotalPaidForSubLine(subBudgetLineId);
    return Math.max(0, totalEngaged - totalPaid);
  };

  /**
   * Obtient les statistiques complètes de paiement pour une sous-ligne
   */
  const getPaymentStatsForSubLine = (subBudgetLineId: string): PaymentStats => {
    // ✅ Base engagée = engagedAmount (approuvés uniquement), cohérent avec le reste à payer
    const line = subBudgetLines.find(l => l.id === subBudgetLineId);
    const totalEngaged = line ? line.engagedAmount : 0;

    const linePayments = payments.filter(p =>
      p.subBudgetLineId === subBudgetLineId &&
      (p.status === 'paid' || p.status === 'in_progress')
    );
    
    let totalPaid = 0;
    let partialPaymentsCount = 0;
    let fullPaymentsCount = 0;
    let totalInProgress = 0;
    
    linePayments.forEach(payment => {
      if (payment.partialPayments && payment.partialPayments.length > 0) {
        const paid = payment.partialPayments.reduce((s, pp) => s + pp.amount, 0);
        totalPaid += paid;
        partialPaymentsCount++;
        
        // Calculer le montant en cours pour ce paiement
        if (payment.status === 'in_progress') {
          totalInProgress += (payment.amount - paid);
        }
        
        // Si le paiement partiel est complet, il compte aussi comme paiement complet
        if (paid >= payment.amount) {
          fullPaymentsCount++;
        }
      } else {
        totalPaid += payment.amount;
        fullPaymentsCount++;
      }
    });
    
    const remainingToPay = Math.max(0, totalEngaged - totalPaid);
    const progressRate = totalEngaged > 0 ? (totalPaid / totalEngaged) * 100 : 0;
    
    return {
      totalPaid,
      totalInProgress,
      remainingToPay,
      progressRate,
      partialPaymentsCount,
      fullPaymentsCount,
      totalEngaged
    };
  };

  /**
   * Calcule le montant décaissé pour une sous-ligne.
   * ✅ Cumule les décaissements réels : montants déjà payés de façon échelonnée
   * (paiements in_progress) + paiements directs complets (paid).
   */
  const getSpentAmount = (subBudgetLineId: string) => {
    const linePayments = payments.filter(p =>
      p.subBudgetLineId === subBudgetLineId &&
      (p.status === 'paid' || p.status === 'in_progress')
    );
    return linePayments.reduce((sum, payment) => {
      // Paiement échelonné : additionner ce qui a déjà été payé (partiels)
      if (payment.partialPayments && payment.partialPayments.length > 0) {
        const totalPaid = payment.partialPayments.reduce((s, pp) => s + pp.amount, 0);
        return sum + totalPaid;
      }
      // Paiement direct complet
      if (payment.status === 'paid') {
        return sum + payment.amount;
      }
      return sum;
    }, 0);
  };

  /**
   * Calcule le total décaissé pour toutes les sous-lignes
   */
  const getTotalDisbursedForAllSubBudgetLines = () => {
    return filteredSubBudgetLines.reduce((total, line) => total + getSpentAmount(line.id), 0);
  };

  /**
   * Calcule le total des paiements en cours pour toutes les sous-lignes
   */
  const getTotalInProgressForAllSubBudgetLines = () => {
    return filteredSubBudgetLines.reduce((total, line) => total + getInProgressAmountForSubLine(line.id), 0);
  };

  /**
   * Paiements en attente pour une sous-ligne = paiements approuvés (non décaissés)
   * + reste à payer des paiements échelonnés en cours.
   */
  const getPendingPaymentsForSubLine = (subBudgetLineId: string): number => {
    const approved = payments
      .filter(p => p.subBudgetLineId === subBudgetLineId && p.status === 'approved')
      .reduce((s, p) => s + p.amount, 0);
    return approved + getInProgressAmountForSubLine(subBudgetLineId);
  };

  /**
   * Montant des paiements rejetés pour une sous-ligne (affiché à part,
   * pour ne pas être confondu avec le « Reste à payer »).
   */
  const getRejectedPaymentsForSubLine = (subBudgetLineId: string): number => {
    return payments
      .filter(p => p.subBudgetLineId === subBudgetLineId && p.status === 'rejected')
      .reduce((s, p) => s + p.amount, 0);
  };

  /**
   * Paiements à créer pour une sous-ligne = engagements approuvés dont la fiche
   * de paiement n'a pas encore été créée.
   */
  const getPaymentsToCreateForSubLine = (subBudgetLineId: string): number => {
    return engagements
      .filter(e =>
        e.subBudgetLineId === subBudgetLineId &&
        e.status === 'approved' &&
        !payments.some(p => p.engagementId === e.id)
      )
      .reduce((s, e) => s + e.amount, 0);
  };

  /**
   * Calcule le total restant à payer pour toutes les sous-lignes
   */
  const getTotalRemainingToPayForAllSubBudgetLines = () => {
    return filteredSubBudgetLines.reduce((total, line) => total + getRemainingToPayForSubLine(line.id), 0);
  };

  /**
   * Compte le nombre de paiements échelonnés actifs
   */
  const getActivePartialPaymentsCount = (): number => {
    return payments.filter(p => 
      p.partialPayments && 
      p.partialPayments.length > 0 && 
      p.status !== 'paid'
    ).length;
  };

  /**
   * Récupère les sous-lignes filtrées par lignes budgétaires sélectionnées
   */
  const getFilteredSubBudgetLines = () => {
    if (selectedBudgetLines.length === 0) {
      return filteredSubBudgetLines;
    }
    return filteredSubBudgetLines.filter(line => 
      selectedBudgetLines.includes(line.budgetLineId)
    );
  };

  const filteredSubBudgetLinesData = getFilteredSubBudgetLines();

  // Mise à jour de la page lorsque les filtres changent
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filteredSubBudgetLinesData.length, selectedBudgetLines]);

  // ============================================
  // FONCTIONS D'EXPANSION DE TEXTE
  // ============================================

  const toggleTextExpansion = (lineId: string, field: string) => {
    const key = `${lineId}-${field}`;
    setExpandedTexts(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const isTextLong = (text: string, maxLength: number = 30) => {
    return text && text.length > maxLength;
  };

  const ExpandableText = ({ 
    text, 
    lineId, 
    field, 
    maxLength = 30,
    className = "",
    textClassName = ""
  }: {
    text: string;
    lineId: string;
    field: string;
    maxLength?: number;
    className?: string;
    textClassName?: string;
  }) => {
    const key = `${lineId}-${field}`;
    const isExpanded = expandedTexts[key] || false;
    const needsExpansion = isTextLong(text, maxLength);

    if (!text) {
      return <span className={`${className} ${textClassName}`}>N/A</span>;
    }

    if (!needsExpansion) {
      return <span className={`${className} ${textClassName}`}>{text}</span>;
    }

    const displayText = isExpanded ? text : `${text.substring(0, maxLength)}...`;

    return (
      <div className={`${className} group relative flex items-start`}>
        <span className={`${textClassName} flex-1`}>{displayText}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleTextExpansion(lineId, field);
          }}
          className="ml-1 text-blue-600 hover:text-blue-800 focus:outline-none flex-shrink-0 flex items-center mt-0.5"
          title={isExpanded ? "Réduire le texte" : "Afficher tout le texte"}
        >
          {isExpanded ? (
            <CollapseIcon className="w-3 h-3" />
          ) : (
            <ExpandIcon className="w-3 h-3" />
          )}
        </button>
        
        {!isExpanded && (
          <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-10">
            <div className="bg-gray-900 text-white text-xs rounded py-1 px-2 max-w-xs break-words whitespace-normal">
              {text}
              <div className="absolute top-full left-2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900"></div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ============================================
  // VÉRIFICATIONS DES PERMISSIONS
  // ============================================

  if (permissionsLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement des permissions...</p>
        </div>
      </div>
    );
  }

  if (!hasModuleAccess('tracking')) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <TrendingUp className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Accès non autorisé</h2>
          <p className="text-gray-500">Vous n'avez pas les permissions nécessaires pour accéder à ce module.</p>
        </div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <TrendingUp className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Accès non autorisé</h2>
          <p className="text-gray-500">Vous n'avez pas les permissions nécessaires pour visualiser le suivi budgétaire.</p>
        </div>
      </div>
    );
  }

  // ============================================
  // CALCULS PRINCIPAUX
  // ============================================

  const getEngagementRate = (line: SubBudgetLine) => {
    return line.notifiedAmount > 0 ? (line.engagedAmount / line.notifiedAmount) * 100 : 0;
  };

  const getSpentRate = (line: SubBudgetLine) => {
    const spentAmount = getSpentAmount(line.id);
    return line.notifiedAmount > 0 ? (spentAmount / line.notifiedAmount) * 100 : 0;
  };

  const getProgressRateForLine = (line: SubBudgetLine): number => {
    const stats = getPaymentStatsForSubLine(line.id);
    return stats.progressRate;
  };

  const getEngagementColor = (rate: number) => {
    if (rate >= 90) return 'text-red-600';
    if (rate >= 75) return 'text-orange-600';
    return 'text-green-600';
  };

  const getProgressColor = (rate: number) => {
    if (rate >= 90) return 'bg-green-600';
    if (rate >= 50) return 'bg-blue-600';
    if (rate >= 25) return 'bg-yellow-600';
    return 'bg-gray-400';
  };

  // Totaux
  const totalNotified = filteredSubBudgetLinesData.reduce((sum, line) => sum + line.notifiedAmount, 0);
  const totalEngaged = filteredSubBudgetLinesData.reduce((sum, line) => sum + line.engagedAmount, 0);
  const totalAvailable = filteredSubBudgetLinesData.reduce((sum, line) => sum + line.availableAmount, 0);
  const totalSpent = getTotalDisbursedForAllSubBudgetLines();
  const totalInProgress = getTotalInProgressForAllSubBudgetLines();
  const totalRemainingToPay = getTotalRemainingToPayForAllSubBudgetLines();
  const overallEngagementRate = totalNotified > 0 ? (totalEngaged / totalNotified) * 100 : 0;
  const overallSpentRate = totalNotified > 0 ? (totalSpent / totalNotified) * 100 : 0;
  const overallProgressRate = totalNotified > 0 ? ((totalSpent + totalInProgress) / totalNotified) * 100 : 0;
  const activePartialPayments = getActivePartialPaymentsCount();

  // ✅ Nouvelles mesures pour les cartes récapitulatives
  const filteredLineIds = new Set(filteredSubBudgetLinesData.map(l => l.id));
  // Montant non engagé = budget notifié encore disponible à engager
  const totalNonEngaged = Math.max(0, totalNotified - totalEngaged);
  // Engagements rejetés (montant) — retournent au disponible
  const rejectedEngagementsAmount = engagements
    .filter(e => e.status === 'rejected' && filteredLineIds.has(e.subBudgetLineId))
    .reduce((s, e) => s + e.amount, 0);
  // Paiements approuvés (non encore décaissés) — montant total
  const approvedPaymentsAmount = payments
    .filter(p => p.status === 'approved' && filteredLineIds.has(p.subBudgetLineId))
    .reduce((s, p) => s + p.amount, 0);
  // Paiements en attente = paiements approuvés + reste à payer des paiements échelonnés en cours
  const pendingPaymentsAmount = approvedPaymentsAmount + totalInProgress;
  // Paiements à créer = engagements approuvés dont la fiche de paiement n'existe pas encore
  const paymentsToCreateAmount = engagements
    .filter(e => e.status === 'approved'
      && filteredLineIds.has(e.subBudgetLineId)
      && !payments.some(p => p.engagementId === e.id))
    .reduce((s, e) => s + e.amount, 0);
  // Paiements rejetés (montant)
  const rejectedPaymentsAmount = payments
    .filter(p => p.status === 'rejected' && filteredLineIds.has(p.subBudgetLineId))
    .reduce((s, p) => s + p.amount, 0);
  const go = (tab: string) => onNavigate && onNavigate(tab);

  const alertLines = filteredSubBudgetLinesData.filter(line => {
    const engagementRate = getEngagementRate(line);
    return engagementRate > 90;
  });

  const formatCurrency = (amount: number, currency: Grant['currency']) => {
    return amount.toLocaleString('fr-FR', { 
      style: 'currency', 
      currency: currency === 'XOF' ? 'XOF' : currency,
      minimumFractionDigits: currency === 'XOF' ? 0 : 2
    });
  };

  // Statistiques par ligne budgétaire
  const budgetLineStats = filteredBudgetLines.map(budgetLine => {
    const subLines = filteredSubBudgetLinesData.filter(line => line.budgetLineId === budgetLine.id);
    const notified = subLines.reduce((sum, line) => sum + line.notifiedAmount, 0);
    const engaged = subLines.reduce((sum, line) => sum + line.engagedAmount, 0);
    const available = subLines.reduce((sum, line) => sum + line.availableAmount, 0);
    const spent = subLines.reduce((sum, line) => sum + getSpentAmount(line.id), 0);
    const inProgress = subLines.reduce((sum, line) => sum + getInProgressAmountForSubLine(line.id), 0);
    const remaining = subLines.reduce((sum, line) => sum + getRemainingToPayForSubLine(line.id), 0);
    const progress = subLines.reduce((sum, line) => sum + getPaymentStatsForSubLine(line.id).progressRate, 0) / (subLines.length || 1);
    
    return {
      ...budgetLine,
      notified,
      engaged,
      available,
      spent,
      inProgress,
      remaining,
      progress,
      engagementRate: notified > 0 ? (engaged / notified) * 100 : 0,
      spentRate: notified > 0 ? (spent / notified) * 100 : 0,
      progressRate: notified > 0 ? ((spent + inProgress) / notified) * 100 : 0
    };
  }).filter(line => line.notified > 0);

  // Données du tableau
  const tableData = filteredSubBudgetLinesData.map(line => {
    const spentAmount = getSpentAmount(line.id);
    const inProgressAmount = getInProgressAmountForSubLine(line.id);
    const remainingToPay = getRemainingToPayForSubLine(line.id);
    const paymentStats = getPaymentStatsForSubLine(line.id);
    const engagementRate = getEngagementRate(line);
    const spentRate = getSpentRate(line);
    const progressRate = paymentStats.progressRate;
    const budgetLine = budgetLines.find(bl => bl.id === line.budgetLineId);
    const lineGrant = grants.find(g => g.id === line.grantId);
    const lineEngagements = engagements.filter(eng => eng.subBudgetLineId === line.id);

    return {
      ...line,
      spentAmount,
      inProgressAmount,
      pendingPayments: getPendingPaymentsForSubLine(line.id),
      remainingToPay,
      paymentsToCreate: getPaymentsToCreateForSubLine(line.id),
      rejectedPayments: getRejectedPaymentsForSubLine(line.id),
      progressRate,
      engagementRate,
      spentRate,
      paymentStats,
      budgetLineName: budgetLine?.name || 'Ligne supprimée',
      budgetLineCode: budgetLine?.code || 'N/A',
      grantCurrency: lineGrant?.currency || 'EUR',
      engagementsCount: lineEngagements.length,
      hasPartialPayments: paymentStats.partialPaymentsCount > 0
    };
  });

  // Total des "Paiements en attente" (même colonne que le tableau UI)
  const totalPendingPayments = tableData.reduce((sum, line) => sum + (line.pendingPayments || 0), 0);

  // Filtrage et tri
  const filteredAndSortedData = tableData
    .filter(line => 
      line.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      line.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      line.budgetLineName.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      let aValue: any = a[sortField];
      let bValue: any = b[sortField];

      if (sortField === 'name' || sortField === 'code' || sortField === 'budgetLineName') {
        aValue = aValue?.toLowerCase() || '';
        bValue = bValue?.toLowerCase() || '';
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

  const totalPages = Math.ceil(filteredAndSortedData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedData = filteredAndSortedData.slice(startIndex, startIndex + itemsPerPage);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronUp className="w-3 h-3 sm:w-4 sm:h-4 opacity-30" />;
    return sortDirection === 'asc' ? 
      <ChevronUp className="w-3 h-3 sm:w-4 sm:h-4" /> : 
      <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4" />;
  };

  const toggleBudgetLineSelection = (budgetLineId: string) => {
    setSelectedBudgetLines(prev =>
      prev.includes(budgetLineId)
        ? prev.filter(id => id !== budgetLineId)
        : [...prev, budgetLineId]
    );
  };

  const selectAllBudgetLines = () => {
    setSelectedBudgetLines(filteredBudgetLines.map(bl => bl.id));
  };

  const clearBudgetLineSelection = () => {
    setSelectedBudgetLines([]);
  };

  // ============================================
  // FONCTIONS D'EXPORT
  // ============================================

  const loadImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  };

  // Export Excel amélioré avec paiements échelonnés
  const exportToExcelAdvanced = async (exportAllData: boolean = false) => {
    if (!canExport) {
      showError('Permission refusée', 'Vous n\'avez pas la permission d\'exporter des données');
      return;
    }

    setIsGeneratingExcel(true);
    
    try {
      const dataToExport = exportAllData ? filteredAndSortedData : paginatedData;
      
      if (dataToExport.length === 0) {
        showWarning('Aucune donnée', 'Aucune donnée à exporter');
        return;
      }

      const infoLines: string[] = [];
      if (selectedGrant) {
        infoLines.push(`Subvention : ${selectedGrant.name}`);
        infoLines.push(`Référence : ${selectedGrant.reference}   •   Devise : ${selectedGrant.currency}`);
        infoLines.push(`Paiements échelonnés actifs : ${activePartialPayments}`);
      }
      infoLines.push(`Généré le : ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`);

      const totalsCurrency = selectedGrant?.currency || dataToExport[0]?.grantCurrency || 'EUR';

      const dataRows = dataToExport.map((line) => {
        const cur = line.grantCurrency;
        return [
          line.name,
          line.code,
          line.budgetLineName,
          formatCurrency(line.notifiedAmount, cur),
          formatCurrency(line.engagedAmount, cur),
          formatCurrency(line.spentAmount, cur),
          line.pendingPayments > 0 ? formatCurrency(line.pendingPayments, cur) : '-',
          line.paymentsToCreate > 0 ? formatCurrency(line.paymentsToCreate, cur) : '-',
          line.rejectedPayments > 0 ? formatCurrency(line.rejectedPayments, cur) : '-',
          formatCurrency(line.availableAmount, cur),
          `${line.engagementRate.toFixed(2)}%`,
          `${line.spentRate.toFixed(2)}%`,
        ];
      });

      const totalsRow = [
        'TOTAUX',
        '',
        '',
        formatCurrency(totalNotified, totalsCurrency),
        formatCurrency(totalEngaged, totalsCurrency),
        formatCurrency(totalSpent, totalsCurrency),
        formatCurrency(totalPendingPayments, totalsCurrency),
        formatCurrency(paymentsToCreateAmount, totalsCurrency),
        formatCurrency(rejectedPaymentsAmount, totalsCurrency),
        formatCurrency(totalAvailable, totalsCurrency),
        `${overallEngagementRate.toFixed(2)}%`,
        `${overallSpentRate.toFixed(2)}%`,
      ];

      const suffix = exportAllData ? 'complet' : 'page';
      const fileName = `suivi-budgetaire-${suffix}-${selectedGrant?.reference || 'global'}-${new Date().toISOString().split('T')[0]}.xlsx`;

      exportStyledExcel({
        fileName,
        sheetName: exportAllData ? 'Suivi Budgétaire Complet' : 'Suivi Budgétaire Page',
        title: 'SUIVI BUDGÉTAIRE DÉTAILLÉ AVEC PAIEMENTS ÉCHELONNÉS',
        infoLines,
        columns: [
          { header: 'Sous-ligne', width: 35 },
          { header: 'Code', width: 15 },
          { header: 'Ligne budgétaire', width: 30 },
          { header: 'Notifié', width: 18, align: 'right' },
          { header: 'Engagé', width: 18, align: 'right' },
          { header: 'Décaissé', width: 18, align: 'right' },
          { header: 'Paiements en attente', width: 20, align: 'right' },
          { header: 'Paiement à créer', width: 18, align: 'right' },
          { header: 'Paiements rejetés', width: 18, align: 'right' },
          { header: 'Disponible', width: 18, align: 'right' },
          { header: 'Taux Eng.', width: 12, align: 'center' },
          { header: 'Taux Déc.', width: 12, align: 'center' },
        ],
        rows: dataRows,
        totalsRow,
      });

      showSuccess('Export réussi', `Le fichier Excel a été généré avec succès`);
    } catch (error) {
      console.error('Erreur lors de l\'export Excel:', error);
      showError('Erreur', 'Impossible de générer le fichier Excel');
    } finally {
      setIsGeneratingExcel(false);
    }
  };

  // Export PDF amélioré
  const exportTableToPDF = async (exportAllData: boolean = false) => {
    if (!canExport) {
      showError('Permission refusée', 'Vous n\'avez pas la permission d\'exporter des données');
      return;
    }

    setIsGeneratingPDF(true);
    
    try {
      const pdf = new jsPDF('l', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      
      let logo: HTMLImageElement | null = null;
      try {
        logo = await loadImage('/budgetbase/logo.png');
      } catch (error) {
        console.warn('Logo non chargé, continuation sans logo');
      }

      const dataToExport = exportAllData ? filteredAndSortedData : paginatedData;
      
      if (dataToExport.length === 0) {
        showWarning('Aucune donnée', 'Aucune donnée à exporter');
        return;
      }

      // Configuration des colonnes — identique au tableau "Détail par Sous-ligne"
      const columnConfig = [
        { key: 'name', label: 'Sous-ligne', width: 42, align: 'left' },
        { key: 'code', label: 'Code', width: 18, align: 'left' },
        { key: 'budgetLineName', label: 'Ligne budgétaire', width: 38, align: 'left' },
        { key: 'notifiedAmount', label: 'Notifié', width: 22, align: 'right' },
        { key: 'engagedAmount', label: 'Engagé', width: 22, align: 'right' },
        { key: 'spentAmount', label: 'Décaissé', width: 22, align: 'right' },
        { key: 'pendingPayments', label: 'P.En Attentes', width: 22, align: 'right' },
        { key: 'paymentsToCreate', label: 'P. à Créer', width: 20, align: 'right' },
        { key: 'rejectedPayments', label: 'P.Rejetés', width: 20, align: 'right' },
        { key: 'availableAmount', label: 'Disponible', width: 22, align: 'right' },
        { key: 'engagementRate', label: 'Taux Eng.', width: 18, align: 'center' },
        { key: 'spentRate', label: 'Taux Déc.', width: 18, align: 'center' }
      ];

      const totalWidth = columnConfig.reduce((sum, col) => sum + col.width, 0);
      const scaleFactor = (pageWidth - (margin * 2)) / totalWidth;
      columnConfig.forEach(col => { col.width *= scaleFactor; });

      const splitText = (text: string, maxWidth: number) => {
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';

        for (let i = 0; i < words.length; i++) {
          const word = words[i];
          const testLine = currentLine ? currentLine + ' ' + word : word;
          
          if (pdf.getTextWidth(testLine) <= maxWidth) {
            currentLine = testLine;
          } else {
            if (currentLine) {
              lines.push(currentLine);
            }
            currentLine = word;
          }
        }
        
        if (currentLine) {
          lines.push(currentLine);
        }
        
        return lines;
      };

      const formatNumberWithSpaces = (number: number, currency: string = 'XOF') => {
        if (currency === 'XOF') {
          return Math.round(number).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        }
        
        const parts = number.toFixed(2).split('.');
        const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        const decimalPart = parts[1];
        
        return decimalPart === '00' ? integerPart : `${integerPart}.${decimalPart}`;
      };

      // Dessine la bande d'en-tête des colonnes (barre bleue) à la position y et renvoie le y suivant.
      const drawColumnHeader = (y: number): number => {
        let x = margin;
        pdf.setFillColor(59, 130, 246);
        pdf.rect(x, y, pageWidth - (margin * 2), 10, 'F');
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(255, 255, 255);
        columnConfig.forEach((col) => {
          const textWidth = pdf.getTextWidth(col.label);
          let cx = x;
          if (col.align === 'center') cx = x + (col.width - textWidth) / 2;
          else if (col.align === 'right') cx = x + col.width - textWidth - 2;
          else cx = x + 2;
          pdf.text(col.label, Math.max(cx, x + 2), y + 7);
          x += col.width;
        });
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(0, 0, 0);
        return y + 16;
      };

      // En-tête de la 1ère page UNIQUEMENT : titre centré tout en haut, infos, date, puis logo sous la date.
      const drawFirstPageHeader = (): number => {
        let y = margin + 6;

        pdf.setFontSize(16);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(0, 0, 0);
        pdf.text('SUIVI BUDGÉTAIRE DÉTAILLÉ', pageWidth / 2, y, { align: 'center' });
        y += 7;

        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'normal');
        pdf.text('Détail par Sous-ligne Budgétaire avec Paiements Échelonnés', pageWidth / 2, y, { align: 'center' });
        y += 10;

        pdf.setFontSize(10);
        if (selectedGrant) {
          pdf.text(`Subvention: ${selectedGrant.name}`, margin, y); y += 5;
          pdf.text(`Référence: ${selectedGrant.reference}`, margin, y); y += 5;
          pdf.text(`Devise: ${selectedGrant.currency}`, margin, y); y += 5;
          pdf.text(`Paiements échelonnés actifs: ${activePartialPayments}`, margin, y); y += 5;
        }

        pdf.setFontSize(9);
        pdf.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, margin, y);
        y += 6;

        if (logo) {
          const logoWidth = 25;
          const logoHeight = (logo.height * logoWidth) / logo.width;
          pdf.addImage(logo, 'PNG', margin, y, logoWidth, logoHeight);
          y += logoHeight + 4;
        }

        return y + 2;
      };

      let currentY = drawFirstPageHeader();
      currentY = drawColumnHeader(currentY);

      let xPosition = margin;
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(0, 0, 0);

      dataToExport.forEach((line, rowIndex) => {
        if (currentY > pageHeight - 30) {
          // Page suivante : le tableau continue directement (pas de titre "(suite)"),
          // avec seulement l'en-tête des colonnes en haut de la page.
          pdf.addPage();
          currentY = drawColumnHeader(margin);
        }

        if (rowIndex % 2 === 0) {
          pdf.setFillColor(249, 250, 251);
          pdf.rect(margin, currentY - 4, pageWidth - (margin * 2), 12, 'F');
        }

        pdf.setFontSize(7);
        xPosition = margin;
        let maxLinesInRow = 1;

        columnConfig.forEach((col) => {
          let value: any = line[col.key as keyof typeof line];
          let displayValue = '';

          const amountKeys = ['notifiedAmount', 'engagedAmount', 'spentAmount', 'pendingPayments', 'paymentsToCreate', 'rejectedPayments', 'availableAmount'];
          if (col.key === 'engagementRate' || col.key === 'spentRate') {
            displayValue = typeof value === 'number' ? `${value.toFixed(1)}%` : '0%';
          } else if (amountKeys.includes(col.key)) {
            displayValue = typeof value === 'number' ? formatNumberWithSpaces(value) : '0';
          } else {
            displayValue = value?.toString() || '';
          }

          if (col.key === 'name' || col.key === 'budgetLineName') {
            const lines = splitText(displayValue, col.width - 4);
            
            lines.forEach((lineText, lineIndex) => {
              pdf.text(lineText, xPosition + 2, currentY + 2 + (lineIndex * 3.5));
            });
            
            maxLinesInRow = Math.max(maxLinesInRow, lines.length);
          } else {
            let x = xPosition;
            
            if (col.align === 'center') {
              const textWidth = pdf.getTextWidth(displayValue);
              x = xPosition + (col.width - textWidth) / 2;
            } else if (col.align === 'right') {
              const textWidth = pdf.getTextWidth(displayValue);
              x = xPosition + col.width - textWidth - 2;
            } else {
              x = xPosition + 2;
            }

            // Colorisation conditionnelle
            if (col.key === 'availableAmount' && value < 0) {
              pdf.setTextColor(220, 38, 38);
            } else if (col.key === 'pendingPayments' && value > 0) {
              pdf.setTextColor(234, 88, 12);
            } else if (col.key === 'paymentsToCreate' && value > 0) {
              pdf.setTextColor(234, 88, 12);
            } else if (col.key === 'rejectedPayments' && value > 0) {
              pdf.setTextColor(220, 38, 38);
            } else if (col.key === 'engagementRate' || col.key === 'spentRate') {
              if (value > 90) pdf.setTextColor(220, 38, 38);
              else if (value > 75) pdf.setTextColor(234, 88, 12);
              else pdf.setTextColor(5, 150, 105);
            }

            pdf.text(displayValue, x, currentY + 2);
            pdf.setTextColor(0, 0, 0);
          }

          xPosition += col.width;
        });

        currentY += 5 + (maxLinesInRow * 3.5);
      });

      // ---- Ligne de TOTAUX — toujours affichée en bas du tableau (valeurs par colonne) ----
      if (currentY + 12 > pageHeight - 20) {
        pdf.addPage();
        currentY = drawColumnHeader(margin);
      }

      pdf.setFillColor(229, 231, 235);
      pdf.rect(margin, currentY, pageWidth - (margin * 2), 9, 'F');
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0, 0, 0);

      const totalsByKey: Record<string, string> = {
        name: 'TOTAUX',
        notifiedAmount: formatNumberWithSpaces(totalNotified),
        engagedAmount: formatNumberWithSpaces(totalEngaged),
        spentAmount: formatNumberWithSpaces(totalSpent),
        pendingPayments: formatNumberWithSpaces(totalPendingPayments),
        paymentsToCreate: formatNumberWithSpaces(paymentsToCreateAmount),
        rejectedPayments: formatNumberWithSpaces(rejectedPaymentsAmount),
        availableAmount: formatNumberWithSpaces(totalAvailable),
        engagementRate: `${overallEngagementRate.toFixed(1)}%`,
        spentRate: `${overallSpentRate.toFixed(1)}%`,
      };

      xPosition = margin;
      columnConfig.forEach((col) => {
        const displayText = totalsByKey[col.key] || '';
        const tw = pdf.getTextWidth(displayText);
        let x = xPosition;
        if (col.align === 'center') x = xPosition + (col.width - tw) / 2;
        else if (col.align === 'right') x = xPosition + col.width - tw - 2;
        else x = xPosition + 2;
        pdf.text(displayText, Math.max(x, xPosition + 2), currentY + 6);
        xPosition += col.width;
      });
      currentY += 12;
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(0, 0, 0);

      // Numéros de page
      const totalPages = pdf.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 100, 100);
        
        pdf.text(
          `Page ${i} sur ${totalPages}`,
          pageWidth / 2,
          pageHeight - 10,
          { align: 'center' }
        );
        
        pdf.text(
          `© ${new Date().getFullYear()} BudgetBase - Document généré automatiquement`,
          pageWidth / 2,
          pageHeight - 5,
          { align: 'center' }
        );
      }

      const suffix = exportAllData ? 'complet' : 'page';
      const fileName = `suivi-budgetaire-${suffix}-${selectedGrant?.reference || 'global'}-${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
      
      showSuccess('Export réussi', 'Le fichier PDF a été généré avec succès');
      
    } catch (error) {
      console.error('Erreur lors de la génération du PDF:', error);
      showError('Erreur', 'Erreur lors de la génération du PDF. Veuillez réessayer.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // ============================================
  // COMPOSANT STAT CARD
  // ============================================

  const StatCard = ({ title, value, subtitle, description, icon: Icon, color, badge, onClick }: any) => (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      title={onClick ? 'Cliquez pour ouvrir la page concernée' : undefined}
      className={`bg-white rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4 relative flex flex-col h-full ${onClick ? 'cursor-pointer hover:shadow-md hover:border-purple-300 hover:-translate-y-0.5 transition-all duration-200' : ''}`}
    >
      {badge && (
        <div className="absolute -top-1 -right-1 bg-purple-600 text-white text-xs px-2 py-0.5 rounded-full">
          {badge}
        </div>
      )}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm font-semibold text-gray-700 leading-tight">{title}</p>
          <p className={`text-lg sm:text-xl font-bold ${color} mt-1`}>{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`p-2 ${color.replace('text-', 'bg-').replace('-600', '-100')} rounded-full flex-shrink-0 ml-2`}>
          <Icon className="w-3 h-3 sm:w-4 sm:h-4" />
        </div>
      </div>
      {description && <p className="text-[11px] text-gray-400 mt-2 leading-snug">{description}</p>}
      {onClick && <p className="text-[10px] text-purple-500 mt-auto pt-1 font-medium">Cliquer pour voir →</p>}
    </div>
  );

  // ============================================
  // RENDU
  // ============================================

  return (
    <div className="flex flex-col space-y-4 sm:space-y-6 p-3 sm:p-4">
      {/* Header Mobile */}
      <div className="lg:hidden">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Suivi Budgétaire</h2>
            <p className="text-sm text-gray-600 mt-1">Suivi en temps réel</p>
            {activePartialPayments > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 mt-1">
                <DollarSign className="w-3 h-3 mr-1" />
                {activePartialPayments} paiement(s) échelonné(s)
              </span>
            )}
          </div>
          <button
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="p-2 bg-gray-100 rounded-lg"
          >
            {showMobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {showMobileMenu && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 mb-4">
            <div className="space-y-3">
              <button
                onClick={() => setShowFilterModal(true)}
                className={`w-full px-3 py-2 rounded-lg font-medium flex items-center justify-center space-x-2 ${
                  selectedBudgetLines.length > 0 
                    ? 'bg-orange-100 text-orange-700 border border-orange-300' 
                    : 'bg-gray-100 text-gray-700 border border-gray-300'
                }`}
              >
                <Filter className="w-4 h-4" />
                <span>Filtrer ({selectedBudgetLines.length})</span>
              </button>

              {canExport && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => exportTableToPDF(false)}
                    disabled={isGeneratingPDF}
                    className="bg-blue-600 text-white px-3 py-2 rounded-lg font-medium text-xs flex items-center justify-center space-x-1 disabled:opacity-50"
                  >
                    <FileText className="w-3 h-3" />
                    <span>PDF Page</span>
                  </button>
                  
                  <button
                    onClick={() => exportTableToPDF(true)}
                    disabled={isGeneratingPDF}
                    className="bg-blue-800 text-white px-3 py-2 rounded-lg font-medium text-xs flex items-center justify-center space-x-1 disabled:opacity-50"
                  >
                    <FileText className="w-3 h-3" />
                    <span>PDF Complet</span>
                  </button>
                  
                  <button
                    onClick={() => exportToExcelAdvanced(false)}
                    disabled={isGeneratingExcel}
                    className="bg-green-600 text-white px-3 py-2 rounded-lg font-medium text-xs flex items-center justify-center space-x-1 disabled:opacity-50"
                  >
                    <FileSpreadsheet className="w-3 h-3" />
                    <span>Excel Page</span>
                  </button>
                  
                  <button
                    onClick={() => exportToExcelAdvanced(true)}
                    disabled={isGeneratingExcel}
                    className="bg-green-800 text-white px-3 py-2 rounded-lg font-medium text-xs flex items-center justify-center space-x-1 disabled:opacity-50"
                  >
                    <FileSpreadsheet className="w-3 h-3" />
                    <span>Excel Complet</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Header Desktop */}
      <div className="hidden lg:flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Suivi Budgétaire</h2>
          <p className="text-gray-600 mt-1">Suivi en temps réel de l'exécution budgétaire</p>
          {selectedBudgetLines.length > 0 && (
            <p className="text-sm text-blue-600 mt-1">
              Filtrage actif: {selectedBudgetLines.length} ligne(s) budgétaire(s) sélectionnée(s)
            </p>
          )}
          {activePartialPayments > 0 && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 mt-1">
              <DollarSign className="w-3 h-3 mr-1" />
              {activePartialPayments} paiement(s) échelonné(s) en cours
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2 flex-wrap gap-2">
          <button
            onClick={() => setShowFilterModal(true)}
            className={`px-4 py-2 rounded-xl font-medium hover:shadow-lg transition-all duration-200 flex items-center space-x-2 ${
              selectedBudgetLines.length > 0 
                ? 'bg-orange-100 text-orange-700 border border-orange-300' 
                : 'bg-gray-100 text-gray-700 border border-gray-300'
            }`}
          >
            <Filter className="w-4 h-4" />
            <span>Filtrer ({selectedBudgetLines.length})</span>
          </button>

          {canExport && (
            <>
              <div className="flex space-x-1">
                <button
                  onClick={() => exportTableToPDF(false)}
                  disabled={isGeneratingPDF}
                  className="bg-blue-600 text-white px-3 py-2 rounded-lg font-medium hover:bg-blue-700 transition-all duration-200 flex items-center space-x-1 disabled:opacity-50 text-xs"
                >
                  <FileText className="w-3 h-3" />
                  <span>{isGeneratingPDF ? '...' : 'PDF Page'}</span>
                </button>
                
                <button
                  onClick={() => exportTableToPDF(true)}
                  disabled={isGeneratingPDF}
                  className="bg-blue-800 text-white px-3 py-2 rounded-lg font-medium hover:bg-blue-900 transition-all duration-200 flex items-center space-x-1 disabled:opacity-50 text-xs"
                >
                  <FileText className="w-3 h-3" />
                  <span>{isGeneratingPDF ? '...' : 'PDF Complet'}</span>
                </button>
              </div>
              
              <div className="flex space-x-1">
                <button
                  onClick={() => exportToExcelAdvanced(false)}
                  disabled={isGeneratingExcel}
                  className="bg-green-600 text-white px-3 py-2 rounded-lg font-medium hover:bg-green-700 transition-all duration-200 flex items-center space-x-1 disabled:opacity-50 text-xs"
                >
                  <FileSpreadsheet className="w-3 h-3" />
                  <span>{isGeneratingExcel ? '...' : 'Excel Page'}</span>
                </button>
                
                <button
                  onClick={() => exportToExcelAdvanced(true)}
                  disabled={isGeneratingExcel}
                  className="bg-green-800 text-white px-3 py-2 rounded-lg font-medium hover:bg-green-900 transition-all duration-200 flex items-center space-x-1 disabled:opacity-50 text-xs"
                >
                  <FileSpreadsheet className="w-3 h-3" />
                  <span>{isGeneratingExcel ? '...' : 'Excel Complet'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Cartes récapitulatives — Ligne 1 : engagement */}
      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <StatCard
          title="Budget Notifié"
          value={selectedGrant ? formatCurrency(totalNotified, selectedGrant.currency) : totalNotified.toLocaleString('fr-FR')}
          description="Budget total alloué et notifié pour cette subvention."
          icon={TrendingUp}
          color="text-blue-600"
          onClick={() => go('budget_planning')}
        />
        <StatCard
          title="Montant Engagé"
          value={selectedGrant ? formatCurrency(totalEngaged, selectedGrant.currency) : totalEngaged.toLocaleString('fr-FR')}
          description="Total des engagements approuvés (dépenses réservées)."
          icon={CheckCircle}
          color="text-green-600"
          onClick={() => go('engagements')}
        />
        <StatCard
          title="Montant Non Engagé"
          value={selectedGrant ? formatCurrency(totalNonEngaged, selectedGrant.currency) : totalNonEngaged.toLocaleString('fr-FR')}
          description="Budget notifié encore disponible à engager (Notifié − Engagé)."
          icon={DollarSign}
          color="text-teal-600"
          onClick={() => go('engagements')}
        />
        <StatCard
          title="Engagements Rejetés"
          value={selectedGrant ? formatCurrency(rejectedEngagementsAmount, selectedGrant.currency) : rejectedEngagementsAmount.toLocaleString('fr-FR')}
          description="Montant des engagements refusés — réaffecté au disponible."
          icon={AlertTriangle}
          color="text-red-600"
          onClick={() => go('engagements')}
        />
      </div>

      {/* Cartes récapitulatives — Ligne 2 : paiement */}
      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <StatCard
          title="Montant Décaissé (échelonné + direct)"
          value={selectedGrant ? formatCurrency(totalSpent, selectedGrant.currency) : totalSpent.toLocaleString('fr-FR')}
          description="Argent réellement sorti : paiements directs + part déjà payée des échelonnés."
          icon={FileText}
          color="text-indigo-600"
          onClick={() => go('treasury')}
        />
        <StatCard
          title="Paiements en Attente"
          value={selectedGrant ? formatCurrency(pendingPaymentsAmount, selectedGrant.currency) : pendingPaymentsAmount.toLocaleString('fr-FR')}
          description="Paiements approuvés non décaissés + reste à payer des échelonnés en cours."
          icon={Clock}
          color="text-orange-600"
          onClick={() => go('payments')}
        />
        <StatCard
          title="Paiement à Créer"
          value={selectedGrant ? formatCurrency(paymentsToCreateAmount, selectedGrant.currency) : paymentsToCreateAmount.toLocaleString('fr-FR')}
          description="Engagements approuvés dont la fiche de paiement n'a pas encore été créée."
          icon={DollarSign}
          color="text-purple-600"
          onClick={() => go('payments')}
        />
        <StatCard
          title="Paiements Rejetés"
          value={selectedGrant ? formatCurrency(rejectedPaymentsAmount, selectedGrant.currency) : rejectedPaymentsAmount.toLocaleString('fr-FR')}
          description="Montant des paiements refusés."
          icon={AlertTriangle}
          color="text-red-600"
          onClick={() => go('payments')}
        />
      </div>

      {/* Cartes de taux — calcul explicité */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
        <StatCard
          title="Taux d'Engagement"
          value={`${overallEngagementRate.toFixed(2)}%`}
          subtitle="= Montant engagé ÷ Budget notifié"
          description="Part du budget notifié déjà engagée dans des dépenses approuvées."
          icon={CheckCircle}
          color="text-green-600"
          onClick={() => go('engagements')}
        />
        <StatCard
          title="Taux de Décaissement"
          value={`${overallSpentRate.toFixed(2)}%`}
          subtitle="= Montant décaissé ÷ Budget notifié"
          description="Part du budget notifié déjà décaissée (réellement payée)."
          icon={FileText}
          color="text-indigo-600"
          onClick={() => go('treasury')}
        />
      </div>

      {/* Section Paiements Échelonnés */}
      {activePartialPayments > 0 && (
        <div className="bg-purple-50 rounded-xl border border-purple-200 p-4">
          <h3 className="text-sm font-semibold text-purple-900 mb-3 flex items-center">
            <DollarSign className="w-4 h-4 mr-2 text-purple-700" />
            Paiements Échelonnés Actifs
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {payments
              .filter(p => p.partialPayments && p.partialPayments.length > 0 && p.status !== 'paid')
              .slice(0, 6)
              .map(payment => {
                const totalPaid = payment.partialPayments?.reduce((sum, pp) => sum + pp.amount, 0) || 0;
                const progress = payment.amount > 0 ? (totalPaid / payment.amount) * 100 : 0;
                const remaining = payment.amount - totalPaid;
                const lastPayment = payment.partialPayments?.[payment.partialPayments.length - 1];
                
                return (
                  <div key={payment.id} className="bg-white rounded-lg p-3 border border-purple-200 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm truncate">
                          {payment.paymentNumber}
                        </p>
                        <p className="text-xs text-gray-600 truncate">
                          {payment.supplier}
                        </p>
                      </div>
                      <span className="text-xs font-medium text-purple-600">
                        {payment.partialPayments?.length || 0} versements
                      </span>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-600">Progression</span>
                        <span className="font-medium text-purple-600">{progress.toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="h-2 rounded-full bg-purple-600 transition-all duration-300"
                          style={{ width: `${Math.min(progress, 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">
                          Payé: {formatCurrency(totalPaid, selectedGrant?.currency || 'EUR')}
                        </span>
                        <span className="text-orange-600 font-medium">
                          Reste: {formatCurrency(remaining, selectedGrant?.currency || 'EUR')}
                        </span>
                      </div>
                      {lastPayment && (
                        <div className="text-xs text-gray-400 border-t border-gray-100 pt-1 mt-1">
                          Dernier versement: {new Date(lastPayment.date).toLocaleDateString('fr-FR')}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
          {activePartialPayments > 6 && (
            <div className="text-center mt-3">
              <span className="text-xs text-purple-600">
                + {activePartialPayments - 6} autre(s) paiement(s) échelonné(s)
              </span>
            </div>
          )}
        </div>
      )}

      {/* Tableau — placé en bas (après Suivi par ligne et Alertes) via order-last */}
      <div className="order-last bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-3 sm:p-4 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900">
              Détail par Sous-ligne
              <span className="text-sm font-normal text-gray-600 ml-2">
                ({filteredAndSortedData.length})
              </span>
            </h3>
            
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <div className="relative">
                <Search className="w-3 h-3 sm:w-4 sm:h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Rechercher..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full text-sm"
                />
              </div>

              <select
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(Number(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              >
                <option value="5">5 lignes</option>
                <option value="10">10 lignes</option>
                <option value="20">20 lignes</option>
                <option value="50">50 lignes</option>
              </select>
            </div>
          </div>
        </div>
        
        {filteredSubBudgetLines.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-gray-400" />
            </div>
            <h3 className="text-base font-medium text-gray-900 mb-1">
              {selectedGrantId ? 'Aucune sous-ligne budgétaire' : 'Aucune sous-ligne'}
            </h3>
            <p className="text-gray-500 text-sm">
              {selectedGrantId ? 'Aucune sous-ligne n\'a été créée' : 'Sélectionnez une subvention'}
            </p>
          </div>
        ) : (
          <>
            {/* Version mobile */}
            {isMobileView ? (
              <div className="p-3 space-y-3">
                {paginatedData.map((line) => (
                  <div key={line.id} className="bg-gray-50 rounded-lg p-3 border">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900 text-sm">
                          <ExpandableText 
                            text={line.name} 
                            lineId={line.id} 
                            field="name"
                            maxLength={25}
                            textClassName="font-semibold text-gray-900"
                          />
                        </h4>
                        <p className="text-xs text-gray-600 flex items-center flex-wrap">
                          {line.code} • 
                          <ExpandableText 
                            text={line.budgetLineName} 
                            lineId={line.id} 
                            field="budgetLineName"
                            maxLength={20}
                            className="ml-1"
                            textClassName="text-gray-600"
                          />
                        </p>
                      </div>
                      {line.hasPartialPayments && (
                        <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full">
                          Échelonné
                        </span>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-600">Notifié:</span>
                        <p className="font-medium">{formatCurrency(line.notifiedAmount, line.grantCurrency)}</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Engagé:</span>
                        <p className="font-medium">{formatCurrency(line.engagedAmount, line.grantCurrency)}</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Décaissé:</span>
                        <p className="font-medium text-indigo-600">{formatCurrency(line.spentAmount, line.grantCurrency)}</p>
                      </div>
                      <div>
                        <span className="text-gray-600" title="Paiements approuvés non décaissés + reste à payer des échelonnés">Paiements en attente:</span>
                        <p className="font-medium text-orange-600">{formatCurrency(line.pendingPayments, line.grantCurrency)}</p>
                      </div>
                      <div>
                        <span className="text-gray-600" title="Engagements approuvés dont la fiche de paiement n'a pas encore été créée">Paiement à créer:</span>
                        <p className="font-medium text-orange-600">{formatCurrency(line.paymentsToCreate, line.grantCurrency)}</p>
                      </div>
                      <div>
                        <span className="text-gray-600" title="Montant des paiements rejetés">Paiements rejetés:</span>
                        <p className="font-medium text-red-600">{formatCurrency(line.rejectedPayments, line.grantCurrency)}</p>
                      </div>
                      <div>
                        <span className="text-gray-600" title="Budget notifié encore disponible">Disponible:</span>
                        <p className={`font-medium ${line.availableAmount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatCurrency(line.availableAmount, line.grantCurrency)}
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-between items-center mt-2">
                      <span className="text-xs text-gray-500">
                        {line.paymentStats.partialPaymentsCount > 0 
                          ? `${line.paymentStats.partialPaymentsCount} paiement(s) partiel(s)` 
                          : 'Paiement complet'}
                      </span>
                      {canViewDetails && (
                        <button
                          onClick={() => onViewEngagements(line.id)}
                          className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full"
                        >
                          Détails ({line.engagementsCount})
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Version desktop avec colonnes élargies */
              <div className="overflow-x-auto">
                <table ref={tableRef} className="w-full min-w-[1400px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 whitespace-nowrap" onClick={() => handleSort('name')}>
                        <div className="flex items-center space-x-1">
                          <span>Sous-ligne</span>
                          <SortIcon field="name" />
                        </div>
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 whitespace-nowrap" onClick={() => handleSort('code')}>
                        <div className="flex items-center space-x-1">
                          <span>Code</span>
                          <SortIcon field="code" />
                        </div>
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Ligne budgétaire</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 whitespace-nowrap" onClick={() => handleSort('notifiedAmount')}>
                        <div className="flex items-center justify-end space-x-1">
                          <span>Notifié</span>
                          <SortIcon field="notifiedAmount" />
                        </div>
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 whitespace-nowrap" onClick={() => handleSort('engagedAmount')}>
                        <div className="flex items-center justify-end space-x-1">
                          <span>Engagé</span>
                          <SortIcon field="engagedAmount" />
                        </div>
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 whitespace-nowrap" onClick={() => handleSort('spentAmount')}>
                        <div className="flex items-center justify-end space-x-1">
                          <span>Décaissé</span>
                          <SortIcon field="spentAmount" />
                        </div>
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" title="Paiements approuvés non décaissés + reste à payer des paiements échelonnés en cours">
                        <div className="flex items-center justify-end space-x-1">
                          <span className="text-orange-600">P.En Attentes</span>
                        </div>
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" title="Paiement à créer : engagements approuvés dont la fiche de paiement n'a pas encore été créée">
                        <div className="flex items-center justify-end space-x-1">
                          <span className="text-orange-600">P. à Créer</span>
                        </div>
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" title="Montant des paiements rejetés sur la sous-ligne">
                        <div className="flex items-center justify-end space-x-1">
                          <span className="text-red-600">P.Rejetés</span>
                        </div>
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 whitespace-nowrap" onClick={() => handleSort('availableAmount')} title="Budget notifié encore disponible sur la sous-ligne">
                        <div className="flex items-center justify-end space-x-1">
                          <span>Disponible</span>
                          <SortIcon field="availableAmount" />
                        </div>
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 whitespace-nowrap" onClick={() => handleSort('engagementRate')}>
                        <div className="flex items-center justify-center space-x-1">
                          <span>Taux Eng.</span>
                          <SortIcon field="engagementRate" />
                        </div>
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 whitespace-nowrap" onClick={() => handleSort('spentRate')} title="Décaissé ÷ Budget notifié">
                        <div className="flex items-center justify-center space-x-1">
                          <span>Taux Déc.</span>
                          <SortIcon field="spentRate" />
                        </div>
                      </th>
                      {canViewDetails && (
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {paginatedData.map(line => (
                      <tr key={line.id} className={`hover:bg-gray-50 ${line.hasPartialPayments ? 'bg-purple-50/30' : ''}`}>
                        <td className="px-3 py-2 max-w-[120px]">
                          <div className="text-sm font-medium text-gray-900">
                            <ExpandableText 
                              text={line.name} 
                              lineId={line.id} 
                              field="name"
                              maxLength={30}
                              textClassName="font-medium text-gray-900"
                            />
                            {line.hasPartialPayments && (
                              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                                <DollarSign className="w-2.5 h-2.5 mr-0.5" />
                                Échelonné
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-xs text-gray-500">{line.code}</div>
                        </td>
                        <td className="px-3 py-2 max-w-[100px]">
                          <div className="text-sm text-gray-900">
                            <ExpandableText 
                              text={line.budgetLineName} 
                              lineId={line.id} 
                              field="budgetLineName"
                              maxLength={25}
                              textClassName="text-gray-900"
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-medium text-gray-900 whitespace-nowrap">
                          {formatCurrency(line.notifiedAmount, line.grantCurrency)}
                        </td>
                        <td className="px-3 py-2 text-right text-sm text-gray-900 whitespace-nowrap">
                          {formatCurrency(line.engagedAmount, line.grantCurrency)}
                        </td>
                        <td className="px-3 py-2 text-right text-sm text-indigo-600 font-medium whitespace-nowrap">
                          {formatCurrency(line.spentAmount, line.grantCurrency)}
                        </td>
                        <td className="px-3 py-2 text-right text-sm text-orange-600 font-medium whitespace-nowrap">
                          {line.pendingPayments > 0 ? formatCurrency(line.pendingPayments, line.grantCurrency) : '-'}
                        </td>
                        <td className="px-3 py-2 text-right text-sm text-orange-600 font-medium whitespace-nowrap">
                          {line.paymentsToCreate > 0 ? formatCurrency(line.paymentsToCreate, line.grantCurrency) : '-'}
                        </td>
                        <td className="px-3 py-2 text-right text-sm text-red-600 font-medium whitespace-nowrap">
                          {line.rejectedPayments > 0 ? formatCurrency(line.rejectedPayments, line.grantCurrency) : '-'}
                        </td>
                        <td className={`px-3 py-2 text-right text-sm font-medium whitespace-nowrap ${line.availableAmount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatCurrency(line.availableAmount, line.grantCurrency)}
                        </td>
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          <span className={`text-xs font-medium ${getEngagementColor(line.engagementRate)}`}>
                            {line.engagementRate.toFixed(2)}%
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          <span className={`text-xs font-medium ${getEngagementColor(line.spentRate)}`}>
                            {line.spentRate.toFixed(2)}%
                          </span>
                        </td>
                        {canViewDetails && (
                          <td className="px-3 py-2 text-center whitespace-nowrap">
                            <button
                              onClick={() => onViewEngagements(line.id)}
                              className="inline-flex items-center px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 transition-colors"
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              Détails
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="p-3 sm:p-4 border-t border-gray-200">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-xs sm:text-sm text-gray-700">
                    Lignes {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredAndSortedData.length)} sur {filteredAndSortedData.length}
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="p-2 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    
                    <div className="flex space-x-1">
                      {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 3) pageNum = i + 1;
                        else if (currentPage === 1) pageNum = i + 1;
                        else if (currentPage === totalPages) pageNum = totalPages - 2 + i;
                        else pageNum = currentPage - 1 + i;

                        return (
                          <button
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`px-3 py-1 rounded text-xs ${
                              currentPage === pageNum
                                ? 'bg-blue-600 text-white'
                                : 'border border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="p-2 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Contenu principal */}
      <div className="flex flex-col lg:grid lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Suivi par Ligne Budgétaire avec progression */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">Suivi par Ligne Budgétaire</h3>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {budgetLineStats.map(budgetLine => (
              <div key={budgetLine.id} className="space-y-2 p-2 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 min-w-0 flex-1">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${budgetLine.color} flex-shrink-0`}>
                      {budgetLine.code}
                    </span>
                    <span className="text-sm font-medium text-gray-900 truncate">{budgetLine.name}</span>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <span className="text-xs text-gray-600 block">Engagé: {budgetLine.engagementRate.toFixed(2)}%</span>
                    <span className="text-xs text-gray-500">Décaissé: {budgetLine.spentRate.toFixed(2)}%</span>
                    <span className="text-xs text-purple-600 block">Progression: {budgetLine.progressRate.toFixed(2)}%</span>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div 
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      budgetLine.engagementRate > 90 ? 'bg-red-500' :
                      budgetLine.engagementRate > 75 ? 'bg-orange-500' :
                      'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(budgetLine.engagementRate, 100)}%` }}
                  />
                </div>
                {budgetLine.inProgress > 0 && (
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div 
                      className="h-1.5 rounded-full bg-purple-500 transition-all duration-300"
                      style={{ width: `${Math.min((budgetLine.inProgress / budgetLine.notified) * 100, 100)}%` }}
                    />
                  </div>
                )}
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Décaissé: {formatCurrency(budgetLine.spent, selectedGrant?.currency || 'EUR')}</span>
                  <span className="text-purple-600">En cours: {formatCurrency(budgetLine.inProgress, selectedGrant?.currency || 'EUR')}</span>
                  <span className="text-orange-600">Reste: {formatCurrency(budgetLine.remaining, selectedGrant?.currency || 'EUR')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Alertes */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 flex items-center">
            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-orange-500" />
            Alertes Budgétaires
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {alertLines.map(line => {
              const engagementRate = getEngagementRate(line);
              const spentRate = getSpentRate(line);
              const progressRate = getProgressRateForLine(line);
              return (
                <div key={line.id} className="p-2 bg-orange-50 border border-orange-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{line.name}</p>
                      <p className="text-xs text-gray-600 truncate">{line.code}</p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <p className="font-semibold text-orange-600 text-sm">{engagementRate.toFixed(2)}% engagé</p>
                      <p className="text-xs text-gray-600">Décaissé: {spentRate.toFixed(2)}%</p>
                      {progressRate > 0 && (
                        <p className="text-xs text-purple-600">Progression: {progressRate.toFixed(2)}%</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {alertLines.length === 0 && (
              <div className="text-center py-4">
                <CheckCircle className="w-6 h-6 text-green-500 mx-auto mb-2" />
                <p className="text-green-600 font-medium text-sm">Aucune alerte</p>
                <p className="text-xs text-gray-500">Tous les budgets sont sous contrôle</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de filtrage */}
      {showFilterModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Filtrer par Ligne Budgétaire</h3>
              <button onClick={() => setShowFilterModal(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 space-y-3">
              <div className="flex space-x-2">
                <button onClick={selectAllBudgetLines} className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors">
                  Tout sélectionner
                </button>
                <button onClick={clearBudgetLineSelection} className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors">
                  Tout désélectionner
                </button>
              </div>
              
              <div className="max-h-64 overflow-y-auto border rounded-lg">
                {filteredBudgetLines.map(budgetLine => (
                  <label key={budgetLine.id} className="flex items-center p-3 hover:bg-gray-50 border-b last:border-b-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedBudgetLines.includes(budgetLine.id)}
                      onChange={() => toggleBudgetLineSelection(budgetLine.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-3 text-sm truncate">
                      <span className="font-medium">{budgetLine.code}</span> - {budgetLine.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 p-4 border-t">
              <button onClick={() => setShowFilterModal(false)} className="px-4 py-2 text-gray-700 border rounded-lg hover:bg-gray-50 transition-colors">
                Annuler
              </button>
              <button onClick={() => setShowFilterModal(false)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                Appliquer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BudgetTracking;