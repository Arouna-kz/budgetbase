import React, { useState, useEffect, useRef } from 'react';
import { 
  BarChart3, PieChart, TrendingUp, Download, Calendar, Filter, FileText, Users, CreditCard, 
  Eye, X, Menu, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Search, CheckSquare, 
  Square, User, AlertCircle, CheckCircle, Clock, ArrowUpDown, Plus, Minus
} from 'lucide-react';
import { Grant, BudgetLine, Engagement, Payment, EmployeeLoan, Prefinancing, DEFAULT_BUDGET_LINES, PAYMENT_STATUS, ENGAGEMENT_STATUS } from '../types';
import { usePermissions } from '../hooks/usePermissions';
import { showSuccess, showError, showWarning } from '../utils/alerts';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx-js-style';
import { EXCEL_STYLES, dataCellStyle, EXCEL_COLORS } from '../utils/excelExport';
import { exportAccounting, countAccountingEntries } from '../utils/accountingExport';

interface ReportsProps {
  grants: Grant[];
  budgetLines: BudgetLine[];
  subBudgetLines: any[];
  expenses: Engagement[];
  payments?: Payment[];
  employeeLoans?: EmployeeLoan[];
  prefinancings?: Prefinancing[];
}

type SortField = 'date' | 'description' | 'amount' | 'status' | 'supplier' | 'engagementsCount' | 'totalEngaged' | 'totalPaid' | 'totalPending' | 'totalRejected';
type SortDirection = 'asc' | 'desc';

interface SupplierData {
  name: string;
  engagements: Engagement[];
  payments: Payment[];
  totalEngaged: number;
  totalPaid: number;
  totalPending: number;
  totalRejected: number;
  totalApproved: number;
  totalRemaining: number; // Nouveau : montant restant pour les paiements échelonnés
  totalPartials: number;  // Nouveau : nombre de paiements partiels
}

interface BeneficiaryData {
  name: string;
  employeeId: string;
  totalObtained: number;
  totalRepaid: number;
  balance: number;
  observations: string;
}

// Fonction de normalisation des noms de fournisseurs
const normalizeSupplierName = (name: string): string => {
  if (!name) return '';
  let normalized = name.trim().replace(/\s+/g, ' ');
  normalized = normalized.toUpperCase();
  return normalized;
};

// Fonction pour obtenir le montant total payé d'un paiement (incluant les paiements partiels)
const getTotalPaidForPayment = (payment: Payment): number => {
  if (!payment.partialPayments || payment.partialPayments.length === 0) {
    return payment.status === 'paid' ? payment.amount : 0;
  }
  return payment.partialPayments.reduce((sum, pp) => sum + pp.amount, 0);
};

// Fonction pour obtenir le montant restant d'un paiement
const getRemainingAmountForPayment = (payment: Payment): number => {
  const totalPaid = getTotalPaidForPayment(payment);
  return payment.amount - totalPaid;
};

// Fonction pour vérifier si un paiement a des paiements partiels
const hasPartialPayments = (payment: Payment): boolean => {
  // Un paiement est "échelonné" s'il a des versements partiels OU s'il est marqué échelonné dès le départ.
  return !!payment.isScheduled || !!(payment.partialPayments && payment.partialPayments.length > 0);
};

// Fonction pour obtenir le statut d'un paiement (avec prise en compte des paiements partiels)
const getPaymentStatus = (payment: Payment): string => {
  if (payment.status === 'paid') return 'paid';
  if (payment.status === 'approved' && hasPartialPayments(payment)) {
    const remaining = getRemainingAmountForPayment(payment);
    if (remaining <= 0) return 'paid';
    return 'in_progress';
  }
  return payment.status;
};

// Fonction pour obtenir le libellé du statut
const getStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    pending: 'En attente',
    approved: 'Approuvé',
    rejected: 'Rejeté',
    paid: 'Payé',
    in_progress: 'En cours',
    cashed: 'Encaissé'
  };
  return labels[status] || status;
};

// Ajoutez ces deux fonctions après getStatusLabel :
const getEngagementStatusColor = (status: string): string => {
  const colors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-blue-100 text-blue-800',
    rejected: 'bg-red-100 text-red-800',
    paid: 'bg-green-100 text-green-800'
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
};

const getPaymentStatusColor = (status: string): string => {
  const colors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-blue-100 text-blue-800',
    rejected: 'bg-red-100 text-red-800',
    paid: 'bg-green-100 text-green-800',
    in_progress: 'bg-purple-100 text-purple-800',
    cashed: 'bg-indigo-100 text-indigo-800'
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
};

const Reports: React.FC<ReportsProps> = ({ 
  grants, 
  budgetLines, 
  subBudgetLines,
  expenses, 
  payments = [], 
  employeeLoans = [], 
  prefinancings = [] 
}) => {
  // === HOOKS DE BASE ===
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [reportType, setReportType] = useState<'summary' | 'detailed' | 'beneficiaries' | 'supplier-detail'>('summary');
  const [isMobileView, setIsMobileView] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  
  // États pour le tri et la pagination - Détail
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  
  // États pour le tri et la pagination - Fournisseurs
  const [supplierCurrentPage, setSupplierCurrentPage] = useState(1);
  const [supplierItemsPerPage, setSupplierItemsPerPage] = useState(10);
  const [supplierSearchTerm, setSupplierSearchTerm] = useState('');
  const [supplierSortField, setSupplierSortField] = useState<SortField>('supplier');
  const [supplierSortDirection, setSupplierSortDirection] = useState<SortDirection>('asc');
  // Filtre Mission pour le rapport fournisseurs : 'all' | 'mission' | 'non_mission'
  const [supplierMissionFilter, setSupplierMissionFilter] = useState<'all' | 'mission' | 'non_mission'>('all');
  
  // États pour l'expansion des fournisseurs
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());
  
  // États pour le tri et la pagination - Bénéficiaires
  const [beneficiaryCurrentPage, setBeneficiaryCurrentPage] = useState(1);
  const [beneficiaryItemsPerPage, setBeneficiaryItemsPerPage] = useState(10);
  const [beneficiarySearchTerm, setBeneficiarySearchTerm] = useState('');
  const [beneficiarySortField, setBeneficiarySortField] = useState<string>('name');
  const [beneficiarySortDirection, setBeneficiarySortDirection] = useState<SortDirection>('asc');
  
  // États pour la vue fournisseur
  const [selectedSupplier, setSelectedSupplier] = useState<string>('');
  const [showSupplierDetail, setShowSupplierDetail] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [exportDataType, setExportDataType] = useState<'all' | 'engagements' | 'payments'>('all');

  // === SYSTÈME DE PERMISSIONS ===
  const { hasPermission, hasModuleAccess, loading: permissionsLoading } = usePermissions();

  const canView = hasPermission('reports', 'view');
  const canExport = hasPermission('reports', 'export');
  const canViewDetails = hasPermission('reports', 'view_details');

  // === DÉTECTION RESPONSIVE ===
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

  // === VÉRIFICATION DES PERMISSIONS ===
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

  if (!hasModuleAccess('reports')) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Accès non autorisé</h2>
          <p className="text-gray-500">Vous n'avez pas les permissions nécessaires pour accéder aux rapports.</p>
        </div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Permission refusée</h2>
          <p className="text-gray-500">Vous n'avez pas la permission de visualiser les rapports.</p>
        </div>
      </div>
    );
  }

  // === DONNÉES ET CALCULS ===
  const selectedGrant = grants.length > 0 ? grants[0] : null;

  const formatCurrency = (amount: number) => {
    if (!selectedGrant) return amount.toLocaleString('fr-FR');
    return amount.toLocaleString('fr-FR', { 
      style: 'currency', 
      currency: selectedGrant.currency === 'XOF' ? 'XOF' : selectedGrant.currency,
      minimumFractionDigits: selectedGrant.currency === 'XOF' ? 0 : 2
    });
  };

  const getCurrencySymbol = () => {
    if (!selectedGrant) return '€';
    switch (selectedGrant.currency) {
      case 'EUR': return '€';
      case 'USD': return '$';
      case 'XOF': return 'FCFA';
      default: return '€';
    }
  };

  const formatAmount = (amount: number) => {
    return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  };

  // Filtrage par date
  const filterByDate = (date: Date) => {
    if (selectedPeriod === 'all') return true;
    if (selectedPeriod === 'custom' && customStartDate && customEndDate) {
      const startDate = new Date(customStartDate);
      const endDate = new Date(customEndDate);
      endDate.setHours(23, 59, 59, 999);
      return date >= startDate && date <= endDate;
    }
    
    const now = new Date();
    switch (selectedPeriod) {
      case 'current-month':
        return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      case 'last-month':
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return date.getMonth() === lastMonth.getMonth() && date.getFullYear() === lastMonth.getFullYear();
      case 'current-year':
        return date.getFullYear() === now.getFullYear();
      case 'last-year':
        return date.getFullYear() === now.getFullYear() - 1;
      case 'last-3-months':
        const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        return date >= threeMonthsAgo && date <= now;
      case 'last-6-months':
        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
        return date >= sixMonthsAgo && date <= now;
      default:
        return true;
    }
  };

  // Filtrer les données
  const filteredExpenses = expenses.filter(expense => {
    const expenseDate = new Date(expense.date);
    return filterByDate(expenseDate);
  });

  const filteredPayments = payments.filter(payment => {
    const paymentDate = new Date(payment.date);
    return filterByDate(paymentDate);
  });

  const filteredEmployeeLoans = employeeLoans.filter(loan => {
    const loanDate = new Date(loan.date);
    return filterByDate(loanDate);
  });

  const filteredPrefinancings = prefinancings.filter(prefinancing => {
    const prefinancingDate = new Date(prefinancing.date);
    return filterByDate(prefinancingDate);
  });

  // === AGRÉGATION DES DONNÉES PAR FOURNISSEUR AVEC NORMALISATION ===
  const getSupplierData = (): SupplierData[] => {
    const supplierMap = new Map<string, SupplierData>();

    const getOrCreateSupplier = (name: string): SupplierData => {
      const normalizedName = normalizeSupplierName(name);
      if (!supplierMap.has(normalizedName)) {
        supplierMap.set(normalizedName, {
          name: normalizedName,
          engagements: [],
          payments: [],
          totalEngaged: 0,
          totalPaid: 0,
          totalPending: 0,
          totalRejected: 0,
          totalApproved: 0,
          totalRemaining: 0,
          totalPartials: 0
        });
      }
      return supplierMap.get(normalizedName)!;
    };

    // Filtre Mission : IDs des engagements "mission" et test réutilisable
    const missionEngagementIds = new Set(filteredExpenses.filter(e => e.isMission).map(e => e.id));
    const passesMission = (isMission: boolean) =>
      supplierMissionFilter === 'all' || (supplierMissionFilter === 'mission' ? isMission : !isMission);

    filteredExpenses.forEach(engagement => {
      if (!engagement.supplier) return;
      if (!passesMission(!!engagement.isMission)) return;
      const data = getOrCreateSupplier(engagement.supplier);
      data.engagements.push(engagement);
      data.totalEngaged += engagement.amount;

      if (engagement.status === 'pending') data.totalPending += engagement.amount;
      else if (engagement.status === 'approved') data.totalApproved += engagement.amount;
      else if (engagement.status === 'rejected') data.totalRejected += engagement.amount;
    });

    filteredPayments.forEach(payment => {
      if (!payment.supplier) return;
      if (!passesMission(missionEngagementIds.has(payment.engagementId))) return;
      const data = getOrCreateSupplier(payment.supplier);
      data.payments.push(payment);
      
      // Utiliser la nouvelle fonction pour calculer le total payé
      const totalPaid = getTotalPaidForPayment(payment);
      data.totalPaid += totalPaid;
      
      // Calculer le montant restant
      const remaining = getRemainingAmountForPayment(payment);
      data.totalRemaining += remaining;
      
      // Compter les paiements partiels
      if (hasPartialPayments(payment)) {
        data.totalPartials += payment.partialPayments?.length || 0;
      }
    });

    return Array.from(supplierMap.values());
  };

  const supplierData = getSupplierData();

  // === BÉNÉFICIAIRES ===
  const getBeneficiariesState = (): BeneficiaryData[] => {
    const beneficiaries = new Map<string, BeneficiaryData>();
    
    filteredEmployeeLoans.forEach(loan => {
      const totalRepaid = loan.repayments.reduce((sum, rep) => sum + rep.amount, 0);
      const remaining = loan.amount - totalRepaid;
      
      if (beneficiaries.has(loan.employee.name)) {
        const existing = beneficiaries.get(loan.employee.name)!;
        beneficiaries.set(loan.employee.name, {
          ...existing,
          totalObtained: existing.totalObtained + loan.amount,
          totalRepaid: existing.totalRepaid + totalRepaid,
          balance: existing.balance + remaining
        });
      } else {
        beneficiaries.set(loan.employee.name, {
          name: loan.employee.name,
          employeeId: loan.employee.employeeId,
          totalObtained: loan.amount,
          totalRepaid: totalRepaid,
          balance: remaining,
          observations: loan.status === 'completed' ? 'Remboursé' : 'En cours'
        });
      }
    });

    return Array.from(beneficiaries.values());
  };

  const beneficiaryData = getBeneficiariesState();

  // === FILTRAGE ET TRI DES FOURNISSEURS ===
  const filteredSuppliers = supplierData.filter(supplier => 
    supplier.name.toLowerCase().includes(supplierSearchTerm.toLowerCase())
  );

  const sortedSuppliers = [...filteredSuppliers].sort((a, b) => {
    let aValue: any, bValue: any;
    
    switch (supplierSortField) {
      case 'supplier':
        aValue = a.name.toLowerCase();
        bValue = b.name.toLowerCase();
        break;
      case 'engagementsCount':
        aValue = a.engagements.length;
        bValue = b.engagements.length;
        break;
      case 'totalEngaged':
        aValue = a.totalEngaged;
        bValue = b.totalEngaged;
        break;
      case 'totalPaid':
        aValue = a.totalPaid;
        bValue = b.totalPaid;
        break;
      case 'totalPending':
        aValue = a.totalPending;
        bValue = b.totalPending;
        break;
      case 'totalRejected':
        aValue = a.totalRejected;
        bValue = b.totalRejected;
        break;
      default:
        aValue = a.name.toLowerCase();
        bValue = b.name.toLowerCase();
    }

    if (aValue < bValue) return supplierSortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return supplierSortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const supplierTotalPages = Math.ceil(sortedSuppliers.length / supplierItemsPerPage);
  const supplierStartIndex = (supplierCurrentPage - 1) * supplierItemsPerPage;
  const paginatedSuppliers = sortedSuppliers.slice(supplierStartIndex, supplierStartIndex + supplierItemsPerPage);

  // === FILTRAGE ET TRI DES BÉNÉFICIAIRES ===
  const filteredBeneficiaries = beneficiaryData.filter(b => 
    b.name.toLowerCase().includes(beneficiarySearchTerm.toLowerCase()) ||
    b.employeeId.toLowerCase().includes(beneficiarySearchTerm.toLowerCase())
  );

  const sortedBeneficiaries = [...filteredBeneficiaries].sort((a, b) => {
    let aValue: any, bValue: any;
    
    switch (beneficiarySortField) {
      case 'name':
        aValue = a.name.toLowerCase();
        bValue = b.name.toLowerCase();
        break;
      case 'employeeId':
        aValue = a.employeeId.toLowerCase();
        bValue = b.employeeId.toLowerCase();
        break;
      case 'totalObtained':
        aValue = a.totalObtained;
        bValue = b.totalObtained;
        break;
      case 'totalRepaid':
        aValue = a.totalRepaid;
        bValue = b.totalRepaid;
        break;
      case 'balance':
        aValue = a.balance;
        bValue = b.balance;
        break;
      default:
        aValue = a.name.toLowerCase();
        bValue = b.name.toLowerCase();
    }

    if (aValue < bValue) return beneficiarySortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return beneficiarySortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const beneficiaryTotalPages = Math.ceil(sortedBeneficiaries.length / beneficiaryItemsPerPage);
  const beneficiaryStartIndex = (beneficiaryCurrentPage - 1) * beneficiaryItemsPerPage;
  const paginatedBeneficiaries = sortedBeneficiaries.slice(beneficiaryStartIndex, beneficiaryStartIndex + beneficiaryItemsPerPage);

  // === FILTRAGE ET TRI DES ENGAGEMENTS (Détail) ===
  const sortedExpenses = [...filteredExpenses].sort((a, b) => {
    let aValue: any, bValue: any;
    
    switch (sortField) {
      case 'date':
        aValue = new Date(a.date).getTime();
        bValue = new Date(b.date).getTime();
        break;
      case 'description':
        aValue = a.description.toLowerCase();
        bValue = b.description.toLowerCase();
        break;
      case 'amount':
        aValue = a.amount;
        bValue = b.amount;
        break;
      case 'status':
        aValue = a.status;
        bValue = b.status;
        break;
      default:
        aValue = new Date(a.date).getTime();
        bValue = new Date(b.date).getTime();
    }

    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const detailTotalPages = Math.ceil(sortedExpenses.length / itemsPerPage);
  const detailStartIndex = (currentPage - 1) * itemsPerPage;
  const paginatedExpenses = sortedExpenses.slice(detailStartIndex, detailStartIndex + itemsPerPage);

  // === FONCTIONS DE TRI ===
  const handleSupplierSort = (field: SortField) => {
    if (supplierSortField === field) {
      setSupplierSortDirection(supplierSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSupplierSortField(field);
      setSupplierSortDirection('asc');
    }
    setSupplierCurrentPage(1);
  };

  const handleBeneficiarySort = (field: string) => {
    if (beneficiarySortField === field) {
      setBeneficiarySortDirection(beneficiarySortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setBeneficiarySortField(field);
      setBeneficiarySortDirection('asc');
    }
    setBeneficiaryCurrentPage(1);
  };

  const handleDetailSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const SupplierSortIcon = ({ field }: { field: SortField }) => {
    if (supplierSortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return supplierSortDirection === 'asc' ? 
      <ChevronUp className="w-3 h-3" /> : 
      <ChevronDown className="w-3 h-3" />;
  };

  const BeneficiarySortIcon = ({ field }: { field: string }) => {
    if (beneficiarySortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return beneficiarySortDirection === 'asc' ? 
      <ChevronUp className="w-3 h-3" /> : 
      <ChevronDown className="w-3 h-3" />;
  };

  const DetailSortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return sortDirection === 'asc' ? 
      <ChevronUp className="w-3 h-3" /> : 
      <ChevronDown className="w-3 h-3" />;
  };

  // === FONCTIONS D'EXPANSION DES FOURNISSEURS ===
  const toggleSupplierExpand = (supplierName: string) => {
    const newExpanded = new Set(expandedSuppliers);
    if (newExpanded.has(supplierName)) {
      newExpanded.delete(supplierName);
    } else {
      newExpanded.add(supplierName);
    }
    setExpandedSuppliers(newExpanded);
  };

  const expandAll = () => {
    const allNames = paginatedSuppliers.map(s => s.name);
    setExpandedSuppliers(new Set(allNames));
  };

  const collapseAll = () => {
    setExpandedSuppliers(new Set());
  };

  // === FONCTIONS DE SÉLECTION - TOUS LES FOURNISSEURS ===
  const toggleSelectItem = (id: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
    setSelectAll(newSelected.size === sortedSuppliers.length && sortedSuppliers.length > 0);
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedItems(new Set());
    } else {
      const allIds = sortedSuppliers.map(s => s.name);
      setSelectedItems(new Set(allIds));
    }
    setSelectAll(!selectAll);
  };

  const getPeriodDisplayText = () => {
    if (selectedPeriod === 'custom' && customStartDate && customEndDate) {
      const start = new Date(customStartDate).toLocaleDateString('fr-FR');
      const end = new Date(customEndDate).toLocaleDateString('fr-FR');
      return `Période personnalisée: ${start} - ${end}`;
    }
    const periodLabels: Record<string, string> = {
      'all': 'Toute la période',
      'current-month': 'Mois en cours',
      'last-month': 'Mois dernier',
      'current-year': 'Année en cours',
      'last-year': 'Année dernière',
      'last-3-months': '3 derniers mois',
      'last-6-months': '6 derniers mois'
    };
    return periodLabels[selectedPeriod] || 'Période non spécifiée';
  };

  // === FONCTIONS D'EXPORTATION ===

  const loadImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  };

  const splitTextToLines = (text: string, maxWidth: number, pdf: jsPDF): string[] => {
    if (!text) return [''];
    const lines: string[] = [];
    let currentLine = '';
    const words = text.split(' ');
    
    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      if (pdf.getTextWidth(testLine) <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  };

  // === EXPORT EXCEL AVEC COULEURS ===
  const exportToExcel = async (suppliers: SupplierData[], exportType: 'all' | 'engagements' | 'payments' = 'all') => {
    if (!canExport) {
      showError('Permission refusée', 'Vous n\'avez pas la permission d\'exporter des données');
      return;
    }

    try {
      const workbook = XLSX.utils.book_new();
      const data: any[] = [];

      // En-têtes avec style
      const headers = ['Fournisseur', 'Date', 'N°', 'Description', 'Montant', 'Statut', 'Type', 'Payé', 'Reste'];
      data.push(headers);

      let totalEngagements = 0;
      let totalPayments = 0;
      let totalAmountEngaged = 0;
      let totalAmountPaid = 0;
      let totalRemaining = 0;
      let supplierIndex = 0;

      const statusLabels: Record<string, string> = {
        pending: 'En attente',
        approved: 'Approuvé',
        rejected: 'Rejeté',
        paid: 'Payé',
        in_progress: 'En cours',
        cashed: 'Encaissé'
      };

      suppliers.forEach((supplier) => {
        supplierIndex++;
        const hasEngagements = supplier.engagements.length > 0;
        const hasPayments = supplier.payments.length > 0;
        
        data.push([`${supplierIndex}. ${supplier.name}`, '', '', '', '', '', '', '', '']);
        
        if (exportType === 'all' || exportType === 'engagements') {
          if (hasEngagements) {
            data.push(['', '--- ENGAGEMENTS ---', '', '', '', '', '', '', '']);
            supplier.engagements.forEach(eng => {
              data.push([
                '',
                new Date(eng.date).toLocaleDateString('fr-FR'),
                eng.engagementNumber,
                eng.description,
                formatAmount(eng.amount),
                statusLabels[eng.status] || eng.status,
                'Engagement',
                '',
                ''
              ]);
              totalEngagements++;
              totalAmountEngaged += eng.amount;
            });
          } else if (exportType === 'all') {
            data.push(['', 'Aucun engagement', '', '', '', '', '', '', '']);
          }
        }

        if (exportType === 'all' || exportType === 'payments') {
          if (hasPayments) {
            data.push(['', '--- PAIEMENTS ---', '', '', '', '', '', '', '']);
            supplier.payments.forEach(payment => {
              const totalPaid = getTotalPaidForPayment(payment);
              const remaining = getRemainingAmountForPayment(payment);
              const status = getPaymentStatus(payment);
              
              data.push([
                '',
                new Date(payment.date).toLocaleDateString('fr-FR'),
                payment.paymentNumber,
                payment.description || '',
                formatAmount(payment.amount),
                statusLabels[status] || status,
                'Paiement',
                formatAmount(totalPaid),
                formatAmount(remaining)
              ]);
              totalPayments++;
              totalAmountPaid += totalPaid;
              totalRemaining += remaining;
            });
          } else if (exportType === 'all') {
            data.push(['', 'Aucun paiement', '', '', '', '', '', '', '']);
          }
        }

        // Ligne de total pour le fournisseur
        if (exportType === 'all') {
          data.push(['', 'TOTAL FOURNISSEUR', '', '', formatAmount(supplier.totalEngaged), '', '', formatAmount(supplier.totalPaid), formatAmount(supplier.totalRemaining)]);
        } else if (exportType === 'engagements') {
          data.push(['', 'TOTAL FOURNISSEUR', '', '', formatAmount(supplier.totalEngaged), '', '', '', '']);
        } else {
          data.push(['', 'TOTAL FOURNISSEUR', '', '', '', '', '', formatAmount(supplier.totalPaid), formatAmount(supplier.totalRemaining)]);
        }
        data.push([]);
      });

      // Totaux généraux
      data.push(['=== TOTAUX GÉNÉRAUX ===', '', '', '', '', '', '', '', '']);
      data.push([
        `Nombre total d'engagements: ${totalEngagements}`,
        `Montant total engagé: ${formatAmount(totalAmountEngaged)} ${getCurrencySymbol()}`,
        '',
        '',
        '',
        '',
        '',
        '',
        ''
      ]);
      data.push([
        `Nombre total de paiements: ${totalPayments}`,
        `Montant total payé: ${formatAmount(totalAmountPaid)} ${getCurrencySymbol()}`,
        `Montant restant: ${formatAmount(totalRemaining)} ${getCurrencySymbol()}`,
        '',
        '',
        '',
        '',
        '',
        ''
      ]);

      const ws = XLSX.utils.aoa_to_sheet(data);

      ws['!cols'] = [
        { wch: 35 },
        { wch: 15 },
        { wch: 20 },
        { wch: 50 },
        { wch: 18 },
        { wch: 15 },
        { wch: 15 },
        { wch: 18 },
        { wch: 18 }
      ];

      XLSX.utils.book_append_sheet(workbook, ws, 'Rapport Fournisseurs');

      const suffix = exportType === 'engagements' ? 'engagements' : exportType === 'payments' ? 'paiements' : 'complet';
      const fileName = `rapport-fournisseurs-${suffix}-${new Date().toISOString().split('T')[0]}.xlsx`;
      
      XLSX.writeFile(workbook, fileName);
      showSuccess('Export réussi', `Le fichier Excel (${suffix}) a été généré avec succès`);
    } catch (error) {
      console.error('Erreur lors de l\'export Excel:', error);
      showError('Erreur', 'Impossible de générer le fichier Excel');
    }
  };

  // === EXPORT EXCEL AVEC MISE EN FORME AVANCÉE ===
  const exportToExcelAdvanced = async (suppliers: SupplierData[], exportType: 'all' | 'engagements' | 'payments' = 'all') => {
    if (!canExport) {
      showError('Permission refusée', 'Vous n\'avez pas la permission d\'exporter des données');
      return;
    }

    try {
      const COLS = 9;
      const wb = XLSX.utils.book_new();
      const rows: any[] = [];
      // Type de chaque ligne pour appliquer le style adéquat
      const rowTypes: string[] = [];
      const pushRow = (row: any[], type: string) => {
        const padded = [...row];
        while (padded.length < COLS) padded.push('');
        rows.push(padded);
        rowTypes.push(type);
      };

      pushRow(['RAPPORT DÉTAILLÉ PAR FOURNISSEUR'], 'title');
      pushRow([`Subvention : ${selectedGrant?.name || 'N/A'}`], 'info');
      pushRow([`Période : ${getPeriodDisplayText()}`], 'info');
      pushRow([`Généré le : ${new Date().toLocaleDateString('fr-FR')}`], 'info');
      pushRow([''], 'empty');
      pushRow(['Fournisseur', 'Date', 'N°', 'Description', 'Montant', 'Statut', 'Type', 'Payé', 'Reste'], 'header');

      let totalEngagements = 0, totalPayments = 0, totalAmountEngaged = 0, totalAmountPaid = 0, totalRemaining = 0;
      let supplierIndex = 0;
      let dataRowCounter = 0;

      suppliers.forEach((supplier) => {
        supplierIndex++;
        pushRow([`${supplierIndex}. ${supplier.name}`], 'supplier');

        // ✅ PARTIE ENGAGEMENTS
        if (exportType === 'all' || exportType === 'engagements') {
          if (supplier.engagements.length > 0) {
            pushRow(['', 'ENGAGEMENTS'], 'subheader');
            supplier.engagements.forEach(eng => {
              pushRow([
                '', new Date(eng.date).toLocaleDateString('fr-FR'), eng.engagementNumber,
                eng.description, formatAmount(eng.amount), getStatusLabel(eng.status), 'Engagement', '', ''
              ], dataRowCounter++ % 2 === 0 ? 'data0' : 'data1');
              totalEngagements++;
              totalAmountEngaged += eng.amount;
            });
          } else if (exportType === 'all') {
            pushRow(['', 'Aucun engagement'], 'muted');
          }
        }

        // ✅ PARTIE PAIEMENTS
        if (exportType === 'all' || exportType === 'payments') {
          if (supplier.payments.length > 0) {
            pushRow(['', 'PAIEMENTS'], 'subheader');
            supplier.payments.forEach(payment => {
              const totalPaid = getTotalPaidForPayment(payment);
              const remaining = getRemainingAmountForPayment(payment);
              pushRow([
                '', new Date(payment.date).toLocaleDateString('fr-FR'), payment.paymentNumber,
                payment.description || '', formatAmount(payment.amount), getStatusLabel(getPaymentStatus(payment)),
                'Paiement', formatAmount(totalPaid), formatAmount(remaining)
              ], dataRowCounter++ % 2 === 0 ? 'data0' : 'data1');
              totalPayments++;
              totalAmountPaid += totalPaid;
              totalRemaining += remaining;
            });
          } else if (exportType === 'all') {
            pushRow(['', 'Aucun paiement'], 'muted');
          }
        }

        // Total fournisseur
        if (exportType === 'all') pushRow(['', 'TOTAL FOURNISSEUR', '', '', formatAmount(supplier.totalEngaged), '', '', formatAmount(supplier.totalPaid), formatAmount(supplier.totalRemaining)], 'suppliertotal');
        else if (exportType === 'engagements') pushRow(['', 'TOTAL FOURNISSEUR', '', '', formatAmount(supplier.totalEngaged), '', '', '', ''], 'suppliertotal');
        else pushRow(['', 'TOTAL FOURNISSEUR', '', '', '', '', '', formatAmount(supplier.totalPaid), formatAmount(supplier.totalRemaining)], 'suppliertotal');
        pushRow([''], 'empty');
      });

      // Totaux généraux
      pushRow(['TOTAUX GÉNÉRAUX'], 'grandtitle');
      pushRow([`Total engagements : ${totalEngagements}`, `Montant engagé : ${formatAmount(totalAmountEngaged)} ${getCurrencySymbol()}`], 'grandline');
      pushRow([`Total paiements : ${totalPayments}`, `Montant payé : ${formatAmount(totalAmountPaid)} ${getCurrencySymbol()}`, `Reste : ${formatAmount(totalRemaining)} ${getCurrencySymbol()}`], 'grandline');

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 35 }, { wch: 15 }, { wch: 20 }, { wch: 50 }, { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 18 }];

      // Fusions : titre, lignes d'info, en-têtes de section
      const merges: XLSX.Range[] = [];
      rowTypes.forEach((type, r) => {
        if (type === 'title' || type === 'info' || type === 'supplier' || type === 'grandtitle') {
          merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
        }
      });
      ws['!merges'] = merges;

      const amountCols = new Set([4, 7, 8]); // Montant, Payé, Reste
      const supplierFill = { fill: { fgColor: { rgb: EXCEL_COLORS.title } }, font: { bold: true, sz: 12, color: { rgb: EXCEL_COLORS.white } }, alignment: { horizontal: 'left', vertical: 'center' } };
      const subHeaderFill = { fill: { fgColor: { rgb: EXCEL_COLORS.sectionHeader } }, font: { bold: true, sz: 10, color: { rgb: EXCEL_COLORS.title } }, alignment: { horizontal: 'left', vertical: 'center' } };

      // Application des styles
      for (let r = 0; r < rows.length; r++) {
        const type = rowTypes[r];
        for (let c = 0; c < COLS; c++) {
          const ref = XLSX.utils.encode_cell({ r, c });
          if (!ws[ref]) ws[ref] = { t: 's', v: '' };
          const align = amountCols.has(c) ? 'right' : 'left';
          switch (type) {
            case 'title': ws[ref].s = EXCEL_STYLES.title; break;
            case 'info': ws[ref].s = EXCEL_STYLES.info; break;
            case 'header': ws[ref].s = EXCEL_STYLES.header; break;
            case 'supplier': ws[ref].s = supplierFill; break;
            case 'subheader': ws[ref].s = subHeaderFill; break;
            case 'suppliertotal': ws[ref].s = { ...EXCEL_STYLES.total, alignment: { horizontal: align, vertical: 'center' } }; break;
            case 'grandtitle': ws[ref].s = { ...EXCEL_STYLES.sectionHeader, font: { bold: true, sz: 12, color: { rgb: EXCEL_COLORS.title } }, alignment: { horizontal: 'center', vertical: 'center' } }; break;
            case 'grandline': ws[ref].s = { font: { bold: true, sz: 10, color: { rgb: EXCEL_COLORS.text } } }; break;
            case 'muted': ws[ref].s = { font: { italic: true, sz: 9, color: { rgb: EXCEL_COLORS.infoText } } }; break;
            case 'data0': ws[ref].s = dataCellStyle(0, align); break;
            case 'data1': ws[ref].s = dataCellStyle(1, align); break;
            default: break;
          }
        }
      }

      // Hauteurs de lignes titre + en-tête
      const rowsMeta: XLSX.RowInfo[] = [];
      rowsMeta[0] = { hpt: 26 };
      rowsMeta[5] = { hpt: 22 };
      ws['!rows'] = rowsMeta;

      XLSX.utils.book_append_sheet(wb, ws, 'Rapport Fournisseurs');

      const suffix = exportType === 'engagements' ? 'engagements' : exportType === 'payments' ? 'paiements' : 'complet';
      XLSX.writeFile(wb, `rapport-fournisseurs-${suffix}-${new Date().toISOString().split('T')[0]}.xlsx`);
      showSuccess('Export réussi', `Le fichier Excel (${suffix}) a été généré avec succès`);
    } catch (error) {
      console.error('Erreur lors de l\'export Excel:', error);
      showError('Erreur', 'Impossible de générer le fichier Excel');
    }
  };

  // Export PDF Synthèse
  const exportSummaryToPDF = async () => {
    if (!canExport) {
      showError('Permission refusée', 'Vous n\'avez pas la permission d\'exporter des données');
      return;
    }

    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      let yPosition = margin;

      let logo: HTMLImageElement | null = null;
      try {
        logo = await loadImage('/budgetbase/logo.png');
      } catch (error) {
        console.warn('Logo non chargé');
      }

      if (logo) {
        const logoWidth = 25;
        const logoHeight = (logo.height * logoWidth) / logo.width;
        pdf.addImage(logo, 'PNG', margin, yPosition, logoWidth, logoHeight);
        yPosition += logoHeight + 5;
      }

      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.text('RAPPORT DE SYNTHÈSE BUDGÉTAIRE', pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 10;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Subvention: ${selectedGrant?.name || 'N/A'}`, margin, yPosition);
      yPosition += 5;
      pdf.text(`Référence: ${selectedGrant?.reference || 'N/A'}`, margin, yPosition);
      yPosition += 5;
      pdf.text(`Période: ${getPeriodDisplayText()}`, margin, yPosition);
      yPosition += 5;
      pdf.text(`Généré le: ${new Date().toLocaleDateString('fr-FR')}`, margin, yPosition);
      yPosition += 10;

      pdf.line(margin, yPosition, pageWidth - margin, yPosition);
      yPosition += 10;

      const filteredBudgetLines = budgetLines;
      const totalBudget = filteredBudgetLines.reduce((sum, line) => sum + line.notifiedAmount, 0);
      const totalEngaged = filteredBudgetLines.reduce((sum, line) => sum + line.engagedAmount, 0);
      const totalAvailable = filteredBudgetLines.reduce((sum, line) => sum + line.availableAmount, 0);
      
      // Calcul du total payé avec les paiements partiels
      const totalPaid = filteredPayments.reduce((sum, payment) => sum + getTotalPaidForPayment(payment), 0);
      const totalRemaining = filteredPayments.reduce((sum, payment) => sum + getRemainingAmountForPayment(payment), 0);
      
      const executionRate = totalBudget > 0 ? (totalEngaged / totalBudget) * 100 : 0;

      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('INDICATEURS CLÉS', margin, yPosition);
      yPosition += 8;

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');

      const stats = [
        [`Budget Total: ${formatAmount(totalBudget)} ${getCurrencySymbol()}`],
        [`Montant Engagé: ${formatAmount(totalEngaged)} ${getCurrencySymbol()} (${executionRate.toFixed(1)}%)`],
        [`Montant Payé: ${formatAmount(totalPaid)} ${getCurrencySymbol()}`],
        [`Solde Disponible: ${formatAmount(totalAvailable)} ${getCurrencySymbol()}`],
        [`Reste à payer: ${formatAmount(totalRemaining)} ${getCurrencySymbol()}`],
        [`Nombre d'engagements: ${filteredExpenses.length}`],
        [`Nombre de paiements: ${filteredPayments.length}`]
      ];

      stats.forEach(([text], index) => {
        const x = margin + (index % 2) * 85;
        const y = yPosition + Math.floor(index / 2) * 8;
        pdf.text(text, x, y);
      });
      yPosition += 30;

      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('PERFORMANCE PAR SUBVENTION', margin, yPosition);
      yPosition += 8;

      const grantStats = grants.map(grant => {
        const grantExpenses = expenses.filter(exp => exp.grantId === grant.id);
        const totalExpenses = grantExpenses.reduce((sum, exp) => sum + exp.amount, 0);
        const grantPayments = payments.filter(p => p.grantId === grant.id);
        const paidExpenses = grantPayments.reduce((sum, p) => sum + getTotalPaidForPayment(p), 0);
        return {
          ...grant,
          totalExpenses,
          paidExpenses,
          utilizationRate: grant.totalAmount > 0 ? (paidExpenses / grant.totalAmount) * 100 : 0
        };
      });

      grantStats.forEach((grant) => {
        if (yPosition + 20 > pageHeight - margin) {
          pdf.addPage();
          yPosition = margin + 20;
        }

        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`${grant.name}`, margin, yPosition);
        pdf.text(`${grant.utilizationRate.toFixed(1)}%`, pageWidth - margin, yPosition, { align: 'right' });
        yPosition += 3;

        const barWidth = pageWidth - (margin * 2);
        const barHeight = 4;
        pdf.setFillColor(200, 200, 200);
        pdf.rect(margin, yPosition, barWidth, barHeight, 'F');
        pdf.setFillColor(59, 130, 246);
        const progressWidth = Math.min(grant.utilizationRate, 100) / 100 * barWidth;
        pdf.rect(margin, yPosition, progressWidth, barHeight, 'F');
        yPosition += 8;

        pdf.setFontSize(7);
        pdf.setTextColor(100, 100, 100);
        pdf.text(`Payé: ${formatAmount(grant.paidExpenses)} ${getCurrencySymbol()} / Total: ${formatAmount(grant.totalAmount)} ${getCurrencySymbol()}`, margin, yPosition);
        yPosition += 8;
        pdf.setTextColor(0, 0, 0);
      });

      const pageCount = pdf.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 100, 100);
        pdf.text(`Page ${i} sur ${pageCount}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
        pdf.text(`© ${new Date().getFullYear()} BudgetBase`, pageWidth / 2, pageHeight - 5, { align: 'center' });
      }

      pdf.save(`rapport-synthese-${selectedGrant?.reference || 'global'}-${new Date().toISOString().split('T')[0]}.pdf`);
      showSuccess('Export réussi', 'Le rapport de synthèse a été exporté avec succès');
    } catch (error) {
      console.error('Erreur lors de la génération du PDF:', error);
      showError('Erreur', 'Impossible de générer le PDF');
    }
  };

  // Export PDF Détaillé
  const exportDetailedToPDF = async () => {
    if (!canExport) {
      showError('Permission refusée', 'Vous n\'avez pas la permission d\'exporter des données');
      return;
    }

    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      let yPosition = margin;

      let logo: HTMLImageElement | null = null;
      try {
        logo = await loadImage('/budgetbase/logo.png');
      } catch (error) {}

      if (logo) {
        const logoWidth = 25;
        const logoHeight = (logo.height * logoWidth) / logo.width;
        pdf.addImage(logo, 'PNG', margin, yPosition, logoWidth, logoHeight);
        yPosition += logoHeight + 5;
      }

      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.text('RAPPORT DÉTAILLÉ DES ENGAGEMENTS', pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 10;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Subvention: ${selectedGrant?.name || 'N/A'}`, margin, yPosition);
      yPosition += 5;
      pdf.text(`Référence: ${selectedGrant?.reference || 'N/A'}`, margin, yPosition);
      yPosition += 5;
      pdf.text(`Période: ${getPeriodDisplayText()}`, margin, yPosition);
      yPosition += 5;
      pdf.text(`Généré le: ${new Date().toLocaleDateString('fr-FR')}`, margin, yPosition);
      yPosition += 10;

      pdf.line(margin, yPosition, pageWidth - margin, yPosition);
      yPosition += 10;

      const headers = ['Date', 'N°', 'Description', 'Montant', 'Statut'];
      const columnWidths = [25, 30, 60, 30, 25];
      let xPos = margin;

      pdf.setFillColor(59, 130, 246);
      pdf.rect(margin, yPosition, pageWidth - (margin * 2), 10, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');

      headers.forEach((header, index) => {
        pdf.text(header, xPos + 2, yPosition + 6);
        xPos += columnWidths[index];
      });

      yPosition += 10;
      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'normal');

      const statusLabels: Record<string, string> = {
        pending: 'En attente',
        approved: 'Approuvé',
        rejected: 'Rejeté',
        paid: 'Payé',
        in_progress: 'En cours'
      };

      filteredExpenses.forEach((expense, index) => {
        const rowHeight = 12;
        if (yPosition + rowHeight > pageHeight - margin) {
          pdf.addPage();
          yPosition = margin + 20;
          pdf.setFillColor(59, 130, 246);
          pdf.rect(margin, yPosition, pageWidth - (margin * 2), 10, 'F');
          pdf.setTextColor(255, 255, 255);
          pdf.setFontSize(8);
          pdf.setFont('helvetica', 'bold');
          xPos = margin;
          headers.forEach((header, idx) => {
            pdf.text(header, xPos + 2, yPosition + 6);
            xPos += columnWidths[idx];
          });
          yPosition += 10;
          pdf.setTextColor(0, 0, 0);
          pdf.setFont('helvetica', 'normal');
        }

        if (index % 2 === 0) {
          pdf.setFillColor(249, 250, 251);
          pdf.rect(margin, yPosition, pageWidth - (margin * 2), rowHeight, 'F');
        }

        pdf.setFontSize(8);
        xPos = margin;

        pdf.text(new Date(expense.date).toLocaleDateString('fr-FR'), xPos + 2, yPosition + 5);
        xPos += columnWidths[0];

        pdf.text(expense.engagementNumber, xPos + 2, yPosition + 5);
        xPos += columnWidths[1];

        const descLines = splitTextToLines(expense.description, columnWidths[2] - 4, pdf);
        descLines.forEach((line, lineIndex) => {
          pdf.text(line, xPos + 2, yPosition + 5 + (lineIndex * 4));
        });
        const descHeight = descLines.length * 4;
        xPos += columnWidths[2];

        pdf.text(`${formatAmount(expense.amount)} ${getCurrencySymbol()}`, xPos + 2, yPosition + 5);
        xPos += columnWidths[3];

        pdf.text(statusLabels[expense.status] || expense.status, xPos + 2, yPosition + 5);

        yPosition += Math.max(rowHeight, descHeight + 4);
      });

      const pageCount = pdf.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 100, 100);
        pdf.text(`Page ${i} sur ${pageCount}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
        pdf.text(`© ${new Date().getFullYear()} BudgetBase`, pageWidth / 2, pageHeight - 5, { align: 'center' });
      }

      pdf.save(`rapport-detaillé-${selectedGrant?.reference || 'global'}-${new Date().toISOString().split('T')[0]}.pdf`);
      showSuccess('Export réussi', 'Le rapport détaillé a été exporté avec succès');
    } catch (error) {
      console.error('Erreur lors de la génération du PDF:', error);
      showError('Erreur', 'Impossible de générer le PDF');
    }
  };

  // Export PDF Bénéficiaires
  const exportBeneficiariesToPDF = async () => {
    if (!canExport) {
      showError('Permission refusée', 'Vous n\'avez pas la permission d\'exporter des données');
      return;
    }

    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      let yPosition = margin;

      let logo: HTMLImageElement | null = null;
      try {
        logo = await loadImage('/budgetbase/logo.png');
      } catch (error) {}

      if (logo) {
        const logoWidth = 25;
        const logoHeight = (logo.height * logoWidth) / logo.width;
        pdf.addImage(logo, 'PNG', margin, yPosition, logoWidth, logoHeight);
        yPosition += logoHeight + 5;
      }

      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.text('ÉTAT DES BÉNÉFICIAIRES AVANCES/PRÊT', pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 10;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Subvention: ${selectedGrant?.name || 'N/A'}`, margin, yPosition);
      yPosition += 5;
      pdf.text(`Référence: ${selectedGrant?.reference || 'N/A'}`, margin, yPosition);
      yPosition += 5;
      pdf.text(`Période: ${getPeriodDisplayText()}`, margin, yPosition);
      yPosition += 5;
      pdf.text(`Généré le: ${new Date().toLocaleDateString('fr-FR')}`, margin, yPosition);
      yPosition += 10;

      pdf.line(margin, yPosition, pageWidth - margin, yPosition);
      yPosition += 10;

      if (sortedBeneficiaries.length === 0) {
        pdf.setFontSize(12);
        pdf.text('Aucun bénéficiaire trouvé', pageWidth / 2, yPosition, { align: 'center' });
        pdf.save(`rapport-beneficiaires-${selectedGrant?.reference || 'global'}-${new Date().toISOString().split('T')[0]}.pdf`);
        showSuccess('Export réussi', 'Le rapport des bénéficiaires a été exporté avec succès');
        return;
      }

      const headers = ['Agent', 'Matricule', 'Montant obtenu', 'Montant remboursé', 'Solde', 'Observations'];
      const columnWidths = [35, 25, 30, 30, 30, 25];
      let xPos = margin;

      pdf.setFillColor(59, 130, 246);
      pdf.rect(margin, yPosition, pageWidth - (margin * 2), 10, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');

      headers.forEach((header, index) => {
        pdf.text(header, xPos + 2, yPosition + 6);
        xPos += columnWidths[index];
      });

      yPosition += 10;
      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'normal');

      sortedBeneficiaries.forEach((beneficiary, index) => {
        const rowHeight = 10;
        if (yPosition + rowHeight > pageHeight - margin) {
          pdf.addPage();
          yPosition = margin + 20;
          pdf.setFillColor(59, 130, 246);
          pdf.rect(margin, yPosition, pageWidth - (margin * 2), 10, 'F');
          pdf.setTextColor(255, 255, 255);
          pdf.setFontSize(8);
          pdf.setFont('helvetica', 'bold');
          xPos = margin;
          headers.forEach((header, idx) => {
            pdf.text(header, xPos + 2, yPosition + 6);
            xPos += columnWidths[idx];
          });
          yPosition += 10;
          pdf.setTextColor(0, 0, 0);
          pdf.setFont('helvetica', 'normal');
        }

        if (index % 2 === 0) {
          pdf.setFillColor(249, 250, 251);
          pdf.rect(margin, yPosition, pageWidth - (margin * 2), rowHeight, 'F');
        }

        pdf.setFontSize(8);
        xPos = margin;

        const nameLines = splitTextToLines(beneficiary.name, columnWidths[0] - 4, pdf);
        nameLines.forEach((line, lineIndex) => {
          pdf.text(line, xPos + 2, yPosition + 5 + (lineIndex * 4));
        });
        const nameHeight = nameLines.length * 4;
        xPos += columnWidths[0];

        pdf.text(beneficiary.employeeId, xPos + 2, yPosition + 5);
        xPos += columnWidths[1];

        pdf.text(`${formatAmount(beneficiary.totalObtained)} ${getCurrencySymbol()}`, xPos + 2, yPosition + 5);
        xPos += columnWidths[2];

        pdf.text(`${formatAmount(beneficiary.totalRepaid)} ${getCurrencySymbol()}`, xPos + 2, yPosition + 5);
        xPos += columnWidths[3];

        pdf.text(`${formatAmount(beneficiary.balance)} ${getCurrencySymbol()}`, xPos + 2, yPosition + 5);
        xPos += columnWidths[4];

        pdf.text(beneficiary.observations, xPos + 2, yPosition + 5);

        yPosition += Math.max(rowHeight, nameHeight + 4);
      });

      const totalRowHeight = 10;
      if (yPosition + totalRowHeight > pageHeight - margin) {
        pdf.addPage();
        yPosition = margin + 20;
      }

      pdf.setFillColor(243, 244, 246);
      pdf.rect(margin, yPosition, pageWidth - (margin * 2), totalRowHeight, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);

      const totals = sortedBeneficiaries.reduce((acc, b) => ({
        totalObtained: acc.totalObtained + b.totalObtained,
        totalRepaid: acc.totalRepaid + b.totalRepaid,
        totalBalance: acc.totalBalance + b.balance
      }), { totalObtained: 0, totalRepaid: 0, totalBalance: 0 });

      xPos = margin + columnWidths[0] + columnWidths[1];
      pdf.text('TOTAUX', xPos + 2, yPosition + 5);
      xPos += columnWidths[2];
      pdf.text(`${formatAmount(totals.totalObtained)} ${getCurrencySymbol()}`, xPos + 2, yPosition + 5);
      xPos += columnWidths[3];
      pdf.text(`${formatAmount(totals.totalRepaid)} ${getCurrencySymbol()}`, xPos + 2, yPosition + 5);
      xPos += columnWidths[4];
      pdf.text(`${formatAmount(totals.totalBalance)} ${getCurrencySymbol()}`, xPos + 2, yPosition + 5);

      const pageCount = pdf.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 100, 100);
        pdf.text(`Page ${i} sur ${pageCount}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
        pdf.text(`© ${new Date().getFullYear()} BudgetBase`, pageWidth / 2, pageHeight - 5, { align: 'center' });
      }

      pdf.save(`rapport-beneficiaires-${selectedGrant?.reference || 'global'}-${new Date().toISOString().split('T')[0]}.pdf`);
      showSuccess('Export réussi', 'Le rapport des bénéficiaires a été exporté avec succès');
    } catch (error) {
      console.error('Erreur lors de la génération du PDF:', error);
      showError('Erreur', 'Impossible de générer le PDF');
    }
  };

  // Export PDF du détail d'un fournisseur
  const exportSupplierDetailToPDF = async (supplier: SupplierData, exportType: 'all' | 'engagements' | 'payments' = 'all') => {
    if (!canExport) {
      showError('Permission refusée', 'Vous n\'avez pas la permission d\'exporter des données');
      return;
    }

    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      let yPosition = margin;

      let logo: HTMLImageElement | null = null;
      try {
        logo = await loadImage('/budgetbase/logo.png');
      } catch (error) {}

      if (logo) {
        const logoWidth = 25;
        const logoHeight = (logo.height * logoWidth) / logo.width;
        pdf.addImage(logo, 'PNG', margin, yPosition, logoWidth, logoHeight);
        yPosition += logoHeight + 5;
      }

      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`DÉTAIL FOURNISSEUR: ${supplier.name}`, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 10;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Subvention: ${selectedGrant?.name || 'N/A'}`, margin, yPosition);
      yPosition += 5;
      pdf.text(`Référence: ${selectedGrant?.reference || 'N/A'}`, margin, yPosition);
      yPosition += 5;
      pdf.text(`Période: ${getPeriodDisplayText()}`, margin, yPosition);
      yPosition += 5;
      pdf.text(`Généré le: ${new Date().toLocaleDateString('fr-FR')}`, margin, yPosition);
      yPosition += 10;

      pdf.line(margin, yPosition, pageWidth - margin, yPosition);
      yPosition += 10;

      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('RÉSUMÉ', margin, yPosition);
      yPosition += 8;

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      const summaryData = [
        `Total engagé: ${formatAmount(supplier.totalEngaged)} ${getCurrencySymbol()}`,
        `Total payé: ${formatAmount(supplier.totalPaid)} ${getCurrencySymbol()}`,
        `En attente: ${formatAmount(supplier.totalPending)} ${getCurrencySymbol()}`,
        `Rejeté: ${formatAmount(supplier.totalRejected)} ${getCurrencySymbol()}`,
        `Reste à payer: ${formatAmount(supplier.totalRemaining)} ${getCurrencySymbol()}`,
        `Nombre d'engagements: ${supplier.engagements.length}`,
        `Nombre de paiements: ${supplier.payments.length}`,
        `Paiements partiels: ${supplier.totalPartials}`
      ];

      summaryData.forEach((text, index) => {
        const x = margin + (index % 2) * 80;
        const y = yPosition + Math.floor(index / 2) * 8;
        pdf.text(text, x, y);
      });
      yPosition += 30;

      const statusLabels: Record<string, string> = {
        pending: 'En attente',
        approved: 'Approuvé',
        rejected: 'Rejeté',
        paid: 'Payé',
        in_progress: 'En cours',
        cashed: 'Encaissé'
      };

      if (exportType === 'all' || exportType === 'engagements') {
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.text('ENGAGEMENTS', margin, yPosition);
        yPosition += 8;

        const engHeaders = ['Date', 'N°', 'Description', 'Montant', 'Statut'];
        const engWidths = [25, 30, 55, 30, 25];
        let xPos = margin;

        pdf.setFillColor(59, 130, 246);
        pdf.rect(margin, yPosition, pageWidth - (margin * 2), 10, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');

        engHeaders.forEach((header, index) => {
          pdf.text(header, xPos + 2, yPosition + 6);
          xPos += engWidths[index];
        });

        yPosition += 10;
        pdf.setTextColor(0, 0, 0);
        pdf.setFont('helvetica', 'normal');

        supplier.engagements.forEach((engagement, index) => {
          const rowHeight = 12;
          if (yPosition + rowHeight > pageHeight - margin) {
            pdf.addPage();
            yPosition = margin + 20;
            pdf.setFillColor(59, 130, 246);
            pdf.rect(margin, yPosition, pageWidth - (margin * 2), 10, 'F');
            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'bold');
            xPos = margin;
            engHeaders.forEach((header, idx) => {
              pdf.text(header, xPos + 2, yPosition + 6);
              xPos += engWidths[idx];
            });
            yPosition += 10;
            pdf.setTextColor(0, 0, 0);
            pdf.setFont('helvetica', 'normal');
          }

          if (index % 2 === 0) {
            pdf.setFillColor(249, 250, 251);
            pdf.rect(margin, yPosition, pageWidth - (margin * 2), rowHeight, 'F');
          }

          pdf.setFontSize(8);
          xPos = margin;

          pdf.text(new Date(engagement.date).toLocaleDateString('fr-FR'), xPos + 2, yPosition + 5);
          xPos += engWidths[0];

          pdf.text(engagement.engagementNumber, xPos + 2, yPosition + 5);
          xPos += engWidths[1];

          const descLines = splitTextToLines(engagement.description, engWidths[2] - 4, pdf);
          descLines.forEach((line, lineIndex) => {
            pdf.text(line, xPos + 2, yPosition + 5 + (lineIndex * 4));
          });
          const descHeight = descLines.length * 4;
          xPos += engWidths[2];

          pdf.text(`${formatAmount(engagement.amount)} ${getCurrencySymbol()}`, xPos + 2, yPosition + 5);
          xPos += engWidths[3];

          pdf.text(statusLabels[engagement.status] || engagement.status, xPos + 2, yPosition + 5);

          yPosition += Math.max(rowHeight, descHeight + 4);
        });

        yPosition += 10;
      }

      if ((exportType === 'all' || exportType === 'payments') && supplier.payments.length > 0) {
        if (exportType === 'all') {
          pdf.addPage();
          yPosition = margin + 20;
        }

        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.text('PAIEMENTS', margin, yPosition);
        yPosition += 8;

        const payHeaders = ['Date', 'N° Paiement', 'Référence', 'Montant', 'Payé', 'Reste', 'Statut'];
        const payWidths = [25, 30, 30, 22, 22, 22, 25];
        let xPos = margin;

        pdf.setFillColor(59, 130, 246);
        pdf.rect(margin, yPosition, pageWidth - (margin * 2), 10, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');

        payHeaders.forEach((header, index) => {
          pdf.text(header, xPos + 2, yPosition + 6);
          xPos += payWidths[index];
        });

        yPosition += 10;
        pdf.setTextColor(0, 0, 0);
        pdf.setFont('helvetica', 'normal');

        supplier.payments.forEach((payment, index) => {
          const totalPaid = getTotalPaidForPayment(payment);
          const remaining = getRemainingAmountForPayment(payment);
          const status = getPaymentStatus(payment);
          const rowHeight = 10;
          
          if (yPosition + rowHeight > pageHeight - margin) {
            pdf.addPage();
            yPosition = margin + 20;
            pdf.setFillColor(59, 130, 246);
            pdf.rect(margin, yPosition, pageWidth - (margin * 2), 10, 'F');
            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'bold');
            xPos = margin;
            payHeaders.forEach((header, idx) => {
              pdf.text(header, xPos + 2, yPosition + 6);
              xPos += payWidths[idx];
            });
            yPosition += 10;
            pdf.setTextColor(0, 0, 0);
            pdf.setFont('helvetica', 'normal');
          }

          if (index % 2 === 0) {
            pdf.setFillColor(249, 250, 251);
            pdf.rect(margin, yPosition, pageWidth - (margin * 2), rowHeight, 'F');
          }

          pdf.setFontSize(8);
          xPos = margin;

          pdf.text(new Date(payment.date).toLocaleDateString('fr-FR'), xPos + 2, yPosition + 5);
          xPos += payWidths[0];

          pdf.text(payment.paymentNumber, xPos + 2, yPosition + 5);
          xPos += payWidths[1];

          pdf.text(payment.checkNumber || payment.bankReference || '-', xPos + 2, yPosition + 5);
          xPos += payWidths[2];

          pdf.text(`${formatAmount(payment.amount)} ${getCurrencySymbol()}`, xPos + 2, yPosition + 5);
          xPos += payWidths[3];

          pdf.text(`${formatAmount(totalPaid)} ${getCurrencySymbol()}`, xPos + 2, yPosition + 5);
          xPos += payWidths[4];

          pdf.text(`${formatAmount(remaining)} ${getCurrencySymbol()}`, xPos + 2, yPosition + 5);
          xPos += payWidths[5];

          pdf.text(statusLabels[status] || status, xPos + 2, yPosition + 5);

          yPosition += rowHeight;
        });
      }

      const pageCount = pdf.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 100, 100);
        pdf.text(`Page ${i} sur ${pageCount}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
        pdf.text(`© ${new Date().getFullYear()} BudgetBase`, pageWidth / 2, pageHeight - 5, { align: 'center' });
      }

      const suffix = exportType === 'engagements' ? 'engagements' : exportType === 'payments' ? 'paiements' : 'complet';
      pdf.save(`detail-fournisseur-${supplier.name}-${suffix}-${new Date().toISOString().split('T')[0]}.pdf`);
      showSuccess('Export réussi', `Le détail du fournisseur (${suffix}) a été exporté avec succès`);
    } catch (error) {
      console.error('Erreur lors de la génération du PDF:', error);
      showError('Erreur', 'Impossible de générer le PDF');
    }
  };

  // Export PDF des fournisseurs sélectionnés
  const exportSelectedSuppliersToPDF = async (exportType: 'all' | 'engagements' | 'payments' = 'all') => {
    if (!canExport) {
      showError('Permission refusée', 'Vous n\'avez pas la permission d\'exporter des données');
      return;
    }

    if (selectedItems.size === 0) {
      showError('Aucune sélection', 'Veuillez sélectionner au moins un fournisseur à exporter');
      return;
    }

    const suppliersToExport = sortedSuppliers.filter(s => selectedItems.has(s.name));

    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      let yPosition = margin;

      // Chargement du logo (optionnel)
      let logo: HTMLImageElement | null = null;
      try {
        logo = await loadImage('/budgetbase/logo.png');
      } catch (e) {
        console.warn('Logo non chargé');
      }

      let isFirstPage = true;

      // Fonction d'en-tête : exécutée UNIQUEMENT sur la première page
      const addHeader = () => {
        if (!isFirstPage) return; // Ne rien faire sur les pages suivantes
        isFirstPage = false;

        // ---- Titre centré ----
        pdf.setFontSize(16);
        pdf.setFont('helvetica', 'bold');
        const title = exportType === 'engagements' ? 'RAPPORT DES ENGAGEMENTS PAR FOURNISSEUR' :
                      exportType === 'payments' ? 'RAPPORT DES PAIEMENTS PAR FOURNISSEUR' :
                      'RAPPORT DÉTAILLÉ PAR FOURNISSEUR';
        pdf.text(title, pageWidth / 2, yPosition, { align: 'center' });
        yPosition += 10;

        // ---- Informations à gauche, logo à droite ----
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        const infoLines = [
          `Subvention: ${selectedGrant?.name || 'N/A'}`,
          `Période: ${getPeriodDisplayText()}`,
          `Généré le: ${new Date().toLocaleDateString('fr-FR')}`
        ];
        const lineHeight = 5;
        const infoStartY = yPosition;

        // Affichage des informations (alignées à gauche)
        infoLines.forEach((line, idx) => {
          pdf.text(line, margin, infoStartY + idx * lineHeight);
        });

        // Hauteur totale des informations
        const infoHeight = infoLines.length * lineHeight;

        // Ajout du logo (aligné à droite, centré verticalement par rapport aux infos)
        if (logo) {
          const logoWidth = 25;
          const logoHeight = (logo.height * logoWidth) / logo.width;
          const logoX = pageWidth - margin - logoWidth;
          const logoY = infoStartY + (infoHeight / 2) - (logoHeight / 2);
          pdf.addImage(logo, 'PNG', logoX, logoY, logoWidth, logoHeight);
        }

        // Mise à jour de yPosition après l'en-tête
        yPosition += infoHeight + 10;

        // Ligne de séparation
        pdf.line(margin, yPosition, pageWidth - margin, yPosition);
        yPosition += 10;
      };

      // Appel initial (première page)
      addHeader();

      // Fonction pour ajouter une section fournisseur
      const addSupplierSection = (supplier: SupplierData) => {
        // Vérification de l'espace avant d'ajouter un fournisseur
        if (yPosition > pageHeight - 60) {
          pdf.addPage();
          yPosition = margin + 20;
          // ⚠️ On n'appelle PAS addHeader() ici => pas de logo/titre/infos sur les pages suivantes
        }

        // ---- Nom du fournisseur ----
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`Fournisseur : ${supplier.name}`, margin, yPosition);
        yPosition += 8;

        // ---- Résumé (avec ou sans engagements/paiements selon exportType) ----
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');
        const summary = [];
        if (exportType === 'all' || exportType === 'engagements') {
          summary.push(`Nb engagements: ${supplier.engagements.length}`, `Total engagé: ${formatAmount(supplier.totalEngaged)} ${getCurrencySymbol()}`);
          summary.push(`En attente: ${formatAmount(supplier.totalPending)} ${getCurrencySymbol()}`, `Rejeté: ${formatAmount(supplier.totalRejected)} ${getCurrencySymbol()}`);
        }
        if (exportType === 'all' || exportType === 'payments') {
          summary.push(`Nb paiements: ${supplier.payments.length}`, `Total payé: ${formatAmount(supplier.totalPaid)} ${getCurrencySymbol()}`);
          summary.push(`Reste: ${formatAmount(supplier.totalRemaining)} ${getCurrencySymbol()}`, `Paiements partiels: ${supplier.totalPartials}`);
        }
        summary.forEach((text, idx) => {
          pdf.text(text, margin + (idx % 2) * 90, yPosition + Math.floor(idx / 2) * 7);
        });
        yPosition += Math.ceil(summary.length / 2) * 7 + 8;

        // ---- TABLEAU DES ENGAGEMENTS ----
        if ((exportType === 'all' || exportType === 'engagements') && supplier.engagements.length > 0) {
          pdf.setFontSize(10);
          pdf.setFont('helvetica', 'bold');
          pdf.text('ENGAGEMENTS', margin, yPosition);
          yPosition += 6;

          const headers = ['Date', 'N°', 'Description', 'Montant', 'Statut'];
          const colWidths = [25, 30, 55, 30, 25];
          let xPos = margin;

          // En-tête du tableau
          pdf.setFillColor(59, 130, 246);
          pdf.rect(margin, yPosition, pageWidth - (margin * 2), 8, 'F');
          pdf.setTextColor(255, 255, 255);
          pdf.setFontSize(7);
          pdf.setFont('helvetica', 'bold');
          headers.forEach((h, i) => {
            pdf.text(h, xPos + 2, yPosition + 5);
            xPos += colWidths[i];
          });
          yPosition += 8;
          pdf.setTextColor(0, 0, 0);
          pdf.setFont('helvetica', 'normal');

          // Lignes des engagements
          supplier.engagements.forEach((eng, idx) => {
            // Gestion du saut de page pour le tableau
            if (yPosition + 10 > pageHeight - margin) {
              pdf.addPage();
              yPosition = margin + 20;
              // Réafficher l'en-tête du tableau sur la nouvelle page
              pdf.setFillColor(59, 130, 246);
              pdf.rect(margin, yPosition, pageWidth - (margin * 2), 8, 'F');
              pdf.setTextColor(255, 255, 255);
              pdf.setFontSize(7);
              pdf.setFont('helvetica', 'bold');
              xPos = margin;
              headers.forEach((h, i) => {
                pdf.text(h, xPos + 2, yPosition + 5);
                xPos += colWidths[i];
              });
              yPosition += 8;
              pdf.setTextColor(0, 0, 0);
              pdf.setFont('helvetica', 'normal');
            }

            // Alternance des couleurs
            if (idx % 2 === 0) {
              pdf.setFillColor(249, 250, 251);
              pdf.rect(margin, yPosition, pageWidth - (margin * 2), 10, 'F');
            }
            pdf.setFontSize(7);
            xPos = margin;

            // Date
            pdf.text(new Date(eng.date).toLocaleDateString('fr-FR'), xPos + 2, yPosition + 5);
            xPos += colWidths[0];

            // N° engagement
            pdf.text(eng.engagementNumber, xPos + 2, yPosition + 5);
            xPos += colWidths[1];

            // Description (avec retour à la ligne si nécessaire)
            const descLines = splitTextToLines(eng.description, colWidths[2] - 4, pdf);
            descLines.forEach((line, li) => {
              pdf.text(line, xPos + 2, yPosition + 5 + (li * 4));
            });
            const descHeight = descLines.length * 4;
            xPos += colWidths[2];

            // Montant
            pdf.text(`${formatAmount(eng.amount)} ${getCurrencySymbol()}`, xPos + 2, yPosition + 5);
            xPos += colWidths[3];

            // Statut
            pdf.text(getStatusLabel(eng.status), xPos + 2, yPosition + 5);

            // Ajustement de la hauteur de ligne
            yPosition += Math.max(10, descHeight + 4);
          });
          yPosition += 6;
        }

        // ---- TABLEAU DES PAIEMENTS ----
        if ((exportType === 'all' || exportType === 'payments') && supplier.payments.length > 0) {
          pdf.setFontSize(10);
          pdf.setFont('helvetica', 'bold');
          pdf.text('PAIEMENTS', margin, yPosition);
          yPosition += 6;

          const headers = ['Date', 'N° Paiement', 'Référence', 'Montant', 'Payé', 'Reste', 'Statut'];
          const colWidths = [25, 30, 25, 22, 22, 22, 25];
          let xPos = margin;

          // En-tête du tableau
          pdf.setFillColor(59, 130, 246);
          pdf.rect(margin, yPosition, pageWidth - (margin * 2), 8, 'F');
          pdf.setTextColor(255, 255, 255);
          pdf.setFontSize(7);
          pdf.setFont('helvetica', 'bold');
          headers.forEach((h, i) => {
            pdf.text(h, xPos + 2, yPosition + 5);
            xPos += colWidths[i];
          });
          yPosition += 8;
          pdf.setTextColor(0, 0, 0);
          pdf.setFont('helvetica', 'normal');

          // Lignes des paiements
          supplier.payments.forEach((pay, idx) => {
            const totalPaid = getTotalPaidForPayment(pay);
            const remaining = getRemainingAmountForPayment(pay);
            const status = getPaymentStatus(pay);

            // Gestion du saut de page pour le tableau
            if (yPosition + 10 > pageHeight - margin) {
              pdf.addPage();
              yPosition = margin + 20;
              pdf.setFillColor(59, 130, 246);
              pdf.rect(margin, yPosition, pageWidth - (margin * 2), 8, 'F');
              pdf.setTextColor(255, 255, 255);
              pdf.setFontSize(7);
              pdf.setFont('helvetica', 'bold');
              xPos = margin;
              headers.forEach((h, i) => {
                pdf.text(h, xPos + 2, yPosition + 5);
                xPos += colWidths[i];
              });
              yPosition += 8;
              pdf.setTextColor(0, 0, 0);
              pdf.setFont('helvetica', 'normal');
            }

            if (idx % 2 === 0) {
              pdf.setFillColor(249, 250, 251);
              pdf.rect(margin, yPosition, pageWidth - (margin * 2), 10, 'F');
            }
            pdf.setFontSize(7);
            xPos = margin;

            pdf.text(new Date(pay.date).toLocaleDateString('fr-FR'), xPos + 2, yPosition + 5);
            xPos += colWidths[0];

            pdf.text(pay.paymentNumber, xPos + 2, yPosition + 5);
            xPos += colWidths[1];

            pdf.text(pay.checkNumber || pay.bankReference || '-', xPos + 2, yPosition + 5);
            xPos += colWidths[2];

            pdf.text(`${formatAmount(pay.amount)} ${getCurrencySymbol()}`, xPos + 2, yPosition + 5);
            xPos += colWidths[3];

            pdf.text(`${formatAmount(totalPaid)} ${getCurrencySymbol()}`, xPos + 2, yPosition + 5);
            xPos += colWidths[4];

            pdf.text(`${formatAmount(remaining)} ${getCurrencySymbol()}`, xPos + 2, yPosition + 5);
            xPos += colWidths[5];

            pdf.text(getStatusLabel(status), xPos + 2, yPosition + 5);

            yPosition += 10;
          });
          yPosition += 6;
        }

        // Séparateur entre fournisseurs
        yPosition += 4;
        pdf.setDrawColor(200);
        pdf.line(margin, yPosition, pageWidth - margin, yPosition);
        yPosition += 6;
      };

      // --- Parcours des fournisseurs sélectionnés ---
      suppliersToExport.forEach(supplier => addSupplierSection(supplier));

      // --- Totaux généraux ---
      if (yPosition > pageHeight - 40) {
        pdf.addPage();
        yPosition = margin + 20;
      }
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text('TOTAUX GÉNÉRAUX', margin, yPosition);
      yPosition += 8;

      const totals = suppliersToExport.reduce((acc, s) => ({
        totalEngaged: acc.totalEngaged + s.totalEngaged,
        totalPaid: acc.totalPaid + s.totalPaid,
        totalRemaining: acc.totalRemaining + s.totalRemaining,
        totalEngagements: acc.totalEngagements + s.engagements.length,
        totalPayments: acc.totalPayments + s.payments.length,
      }), { totalEngaged: 0, totalPaid: 0, totalRemaining: 0, totalEngagements: 0, totalPayments: 0 });

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      let totalText = `Nb fournisseurs: ${suppliersToExport.length}`;
      if (exportType === 'all' || exportType === 'engagements') {
        totalText += ` | Engagements: ${totals.totalEngagements} | Montant: ${formatAmount(totals.totalEngaged)} ${getCurrencySymbol()}`;
      }
      if (exportType === 'all' || exportType === 'payments') {
        totalText += ` | Paiements: ${totals.totalPayments} | Payé: ${formatAmount(totals.totalPaid)} ${getCurrencySymbol()} | Reste: ${formatAmount(totals.totalRemaining)} ${getCurrencySymbol()}`;
      }
      pdf.text(totalText, margin, yPosition);

      // --- Numéros de page ---
      const pageCount = pdf.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 100, 100);
        pdf.text(`Page ${i} sur ${pageCount}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
        pdf.text(`© ${new Date().getFullYear()} BudgetBase`, pageWidth / 2, pageHeight - 5, { align: 'center' });
      }

      // --- Sauvegarde ---
      const suffix = exportType === 'engagements' ? 'engagements' : exportType === 'payments' ? 'paiements' : 'complet';
      pdf.save(`rapport-fournisseurs-${suffix}-${selectedGrant?.reference || 'global'}-${new Date().toISOString().split('T')[0]}.pdf`);
      showSuccess('Export réussi', `Le rapport PDF (${suffix}) a été exporté avec succès`);

    } catch (error) {
      console.error('Erreur lors de la génération du PDF:', error);
      showError('Erreur', 'Impossible de générer le PDF');
    }
  };

  // === COMPOSANTS DE PAGINATION RÉUTILISABLES ===
  const DetailPagination = () => (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 border-t border-gray-200 pt-4">
      <div className="text-xs sm:text-sm text-gray-700">
        Lignes {detailStartIndex + 1}-{Math.min(detailStartIndex + itemsPerPage, sortedExpenses.length)} sur {sortedExpenses.length}
      </div>
      <div className="flex items-center space-x-2">
        <select
          value={itemsPerPage}
          onChange={(e) => {
            setItemsPerPage(Number(e.target.value));
            setCurrentPage(1);
          }}
          className="px-2 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="5">5</option>
          <option value="10">10</option>
          <option value="20">20</option>
          <option value="50">50</option>
          <option value="100">100</option>
        </select>
        <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="p-2 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex space-x-1">
          {Array.from({ length: Math.min(5, detailTotalPages) }, (_, i) => {
            let pageNum;
            if (detailTotalPages <= 5) pageNum = i + 1;
            else if (currentPage <= 3) pageNum = i + 1;
            else if (currentPage >= detailTotalPages - 2) pageNum = detailTotalPages - 4 + i;
            else pageNum = currentPage - 2 + i;
            return (
              <button key={pageNum} onClick={() => setCurrentPage(pageNum)} className={`px-3 py-1 rounded text-xs ${currentPage === pageNum ? 'bg-blue-600 text-white' : 'border border-gray-300'}`}>
                {pageNum}
              </button>
            );
          })}
        </div>
        <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, detailTotalPages))} disabled={currentPage === detailTotalPages} className="p-2 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  const SupplierPagination = () => (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 border-t border-gray-200 pt-4">
      <div className="text-xs sm:text-sm text-gray-700">
        Lignes {supplierStartIndex + 1}-{Math.min(supplierStartIndex + supplierItemsPerPage, sortedSuppliers.length)} sur {sortedSuppliers.length}
      </div>
      <div className="flex items-center space-x-2">
        <select
          value={supplierItemsPerPage}
          onChange={(e) => {
            setSupplierItemsPerPage(Number(e.target.value));
            setSupplierCurrentPage(1);
          }}
          className="px-2 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="5">5</option>
          <option value="10">10</option>
          <option value="20">20</option>
          <option value="50">50</option>
          <option value="100">100</option>
        </select>
        <button onClick={() => setSupplierCurrentPage(prev => Math.max(prev - 1, 1))} disabled={supplierCurrentPage === 1} className="p-2 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex space-x-1">
          {Array.from({ length: Math.min(5, supplierTotalPages) }, (_, i) => {
            let pageNum;
            if (supplierTotalPages <= 5) pageNum = i + 1;
            else if (supplierCurrentPage <= 3) pageNum = i + 1;
            else if (supplierCurrentPage >= supplierTotalPages - 2) pageNum = supplierTotalPages - 4 + i;
            else pageNum = supplierCurrentPage - 2 + i;
            return (
              <button key={pageNum} onClick={() => setSupplierCurrentPage(pageNum)} className={`px-3 py-1 rounded text-xs ${supplierCurrentPage === pageNum ? 'bg-blue-600 text-white' : 'border border-gray-300'}`}>
                {pageNum}
              </button>
            );
          })}
        </div>
        <button onClick={() => setSupplierCurrentPage(prev => Math.min(prev + 1, supplierTotalPages))} disabled={supplierCurrentPage === supplierTotalPages} className="p-2 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  const BeneficiaryPagination = () => (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 border-t border-gray-200 pt-4">
      <div className="text-xs sm:text-sm text-gray-700">
        Lignes {beneficiaryStartIndex + 1}-{Math.min(beneficiaryStartIndex + beneficiaryItemsPerPage, sortedBeneficiaries.length)} sur {sortedBeneficiaries.length}
      </div>
      <div className="flex items-center space-x-2">
        <select
          value={beneficiaryItemsPerPage}
          onChange={(e) => {
            setBeneficiaryItemsPerPage(Number(e.target.value));
            setBeneficiaryCurrentPage(1);
          }}
          className="px-2 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="5">5</option>
          <option value="10">10</option>
          <option value="20">20</option>
          <option value="50">50</option>
          <option value="100">100</option>
        </select>
        <button onClick={() => setBeneficiaryCurrentPage(prev => Math.max(prev - 1, 1))} disabled={beneficiaryCurrentPage === 1} className="p-2 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex space-x-1">
          {Array.from({ length: Math.min(5, beneficiaryTotalPages) }, (_, i) => {
            let pageNum;
            if (beneficiaryTotalPages <= 5) pageNum = i + 1;
            else if (beneficiaryCurrentPage <= 3) pageNum = i + 1;
            else if (beneficiaryCurrentPage >= beneficiaryTotalPages - 2) pageNum = beneficiaryTotalPages - 4 + i;
            else pageNum = beneficiaryCurrentPage - 2 + i;
            return (
              <button key={pageNum} onClick={() => setBeneficiaryCurrentPage(pageNum)} className={`px-3 py-1 rounded text-xs ${beneficiaryCurrentPage === pageNum ? 'bg-blue-600 text-white' : 'border border-gray-300'}`}>
                {pageNum}
              </button>
            );
          })}
        </div>
        <button onClick={() => setBeneficiaryCurrentPage(prev => Math.min(prev + 1, beneficiaryTotalPages))} disabled={beneficiaryCurrentPage === beneficiaryTotalPages} className="p-2 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  // === STATISTIQUES POUR LA SYNTHÈSE ===
  const filteredBudgetLines = budgetLines;
  const totalBudget = filteredBudgetLines.reduce((sum, line) => sum + line.notifiedAmount, 0);
  const totalEngaged = filteredBudgetLines.reduce((sum, line) => sum + line.engagedAmount, 0);
  const totalAvailable = filteredBudgetLines.reduce((sum, line) => sum + line.availableAmount, 0);
  const executionRate = totalBudget > 0 ? (totalEngaged / totalBudget) * 100 : 0;

  const totalPaid = filteredPayments.reduce((sum, payment) => sum + getTotalPaidForPayment(payment), 0);
  const totalRemaining = filteredPayments.reduce((sum, payment) => sum + getRemainingAmountForPayment(payment), 0);

  const grantStats = grants.map(grant => {
    const grantExpenses = expenses.filter(exp => exp.grantId === grant.id);
    const totalExpenses = grantExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    const grantPayments = payments.filter(p => p.grantId === grant.id);
    const paidExpenses = grantPayments.reduce((sum, p) => sum + getTotalPaidForPayment(p), 0);
    return {
      ...grant,
      totalExpenses,
      paidExpenses,
      utilizationRate: grant.totalAmount > 0 ? (paidExpenses / grant.totalAmount) * 100 : 0
    };
  });

  // === COMPOSANTS ===
  const StatCard = ({ title, value, subtitle, icon: Icon, color }: any) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">{title}</p>
          <p className={`text-lg sm:text-xl font-bold ${color} truncate`}>{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1 truncate">{subtitle}</p>}
        </div>
        <div className={`p-2 ${color.replace('text-', 'bg-').replace('-600', '-100')} rounded-full flex-shrink-0 ml-2`}>
          <Icon className="w-3 h-3 sm:w-4 sm:h-4" />
        </div>
      </div>
    </div>
  );

  // === EXPORT COMPTABLE (FEC + Journal + Grand livre + Balance) ===
  const handleAccountingExport = () => {
    if (!canExport) {
      showError('Permission refusée', 'Vous n\'avez pas la permission d\'exporter des données');
      return;
    }
    const count = countAccountingEntries(expenses, payments);
    if (count === 0) {
      showWarning('Aucune écriture', 'Aucun engagement approuvé ni paiement décaissé à exporter en comptabilité.');
      return;
    }
    try {
      exportAccounting({
        engagements: expenses,
        payments,
        grant: selectedGrant,
        generatedAt: new Date().toLocaleDateString('fr-FR'),
        fileSuffix: selectedGrant?.reference || 'global',
        includeFec: true,
        includeExcel: true,
      });
      showSuccess(
        'Export comptable réussi',
        `${count} écriture(s) générée(s) : FEC (.txt) + Journal, Grand livre et Balance (Excel).`
      );
    } catch (error) {
      console.error('Erreur export comptable:', error);
      showError('Erreur', 'Impossible de générer l\'export comptable.');
    }
  };

  // === RENDU PRINCIPAL ===
  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Rapports Budgétaires</h2>
          <p className="text-gray-600 mt-1">Analyses détaillées et statistiques financières</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canExport && (
            <button
              onClick={handleAccountingExport}
              className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-emerald-700 flex items-center space-x-2 text-sm"
              title="Export comptable : FEC (.txt) + Journal, Grand livre et Balance (Excel)"
            >
              <FileText className="w-4 h-4" />
              <span>Export comptable</span>
            </button>
          )}
          {canExport && reportType === 'summary' && (
            <button onClick={exportSummaryToPDF} className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2 rounded-xl font-medium hover:shadow-lg flex items-center space-x-2 text-sm">
              <Download className="w-4 h-4" />
              <span>Exporter PDF</span>
            </button>
          )}
          {canExport && reportType === 'detailed' && (
            <button onClick={exportDetailedToPDF} className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2 rounded-xl font-medium hover:shadow-lg flex items-center space-x-2 text-sm">
              <Download className="w-4 h-4" />
              <span>Exporter PDF</span>
            </button>
          )}
          {canExport && reportType === 'beneficiaries' && (
            <button onClick={exportBeneficiariesToPDF} className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2 rounded-xl font-medium hover:shadow-lg flex items-center space-x-2 text-sm">
              <Download className="w-4 h-4" />
              <span>Exporter PDF</span>
            </button>
          )}
          {canExport && selectedItems.size > 0 && reportType === 'supplier-detail' && (
            <button onClick={exportSelectedSuppliersToPDF} className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2 rounded-xl font-medium hover:shadow-lg flex items-center space-x-2 text-sm">
              <Download className="w-4 h-4" />
              <span>Exporter sélection ({selectedItems.size})</span>
            </button>
          )}
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6">
        <div className="flex items-center space-x-2 mb-4">
          <Filter className="w-5 h-5 text-gray-600" />
          <span className="font-medium text-gray-900">Filtres</span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Type de rapport</label>
            <select
              value={reportType}
              onChange={(e) => {
                setReportType(e.target.value as any);
                setSelectedItems(new Set());
                setSelectAll(false);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value="summary">Synthèse</option>
              <option value="detailed">Détaillé</option>
              <option value="beneficiaries">Bénéficiaires</option>
              <option value="supplier-detail">Détail par Fournisseur</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Période</label>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value="all">Toute la période</option>
              <option value="current-month">Mois en cours</option>
              <option value="last-month">Mois dernier</option>
              <option value="current-year">Année en cours</option>
              <option value="last-year">Année dernière</option>
              <option value="last-3-months">3 derniers mois</option>
              <option value="last-6-months">6 derniers mois</option>
              <option value="custom">Période personnalisée</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Recherche</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher un fournisseur..."
                value={supplierSearchTerm}
                onChange={(e) => setSupplierSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
          </div>
        </div>

        {selectedPeriod === 'custom' && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Période personnalisée</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Date de début</label>
                <input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Date de fin</label>
                <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Grant Information */}
      {selectedGrant && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-4 sm:p-6 border border-blue-200">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900">{selectedGrant.name}</h3>
              <p className="text-gray-600 text-sm">{selectedGrant.reference} - {selectedGrant.grantingOrganization}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Devise</p>
              <p className="text-lg font-bold text-blue-600">{selectedGrant.currency} ({getCurrencySymbol()})</p>
            </div>
          </div>
        </div>
      )}

      {/* === CONTENU DES RAPPORTS === */}

      {/* Rapport de synthèse */}
      {reportType === 'summary' && (
        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard title="Budget Total" value={formatCurrency(totalBudget)} icon={BarChart3} color="text-blue-600" />
            <StatCard title="Montant Engagé" value={formatCurrency(totalEngaged)} subtitle={`${executionRate.toFixed(1)}% du budget`} icon={TrendingUp} color="text-green-600" />
            <StatCard title="Montant Payé" value={formatCurrency(totalPaid)} subtitle={`${totalBudget > 0 ? ((totalPaid / totalBudget) * 100).toFixed(1) : 0}% du budget`} icon={CreditCard} color="text-purple-600" />
            <StatCard title="Disponible" value={formatCurrency(totalAvailable)} icon={PieChart} color="text-orange-600" />
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance par Subvention</h3>
            <div className="space-y-4">
              {grantStats.map(grant => (
                <div key={grant.id} className="p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-gray-900">{grant.name}</h4>
                    <span className="text-sm font-semibold text-blue-600">{grant.utilizationRate.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                    <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${Math.min(grant.utilizationRate, 100)}%` }} />
                  </div>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Payé: {formatCurrency(grant.paidExpenses)}</span>
                    <span>Total: {formatCurrency(grant.totalAmount)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Rapport détaillé */}
      {reportType === 'detailed' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Rapport Détaillé des Engagements</h3>
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Lignes par page:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleDetailSort('date')}>
                    <div className="flex items-center space-x-1">
                      <span>Date</span>
                      <DetailSortIcon field="date" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">N°</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleDetailSort('description')}>
                    <div className="flex items-center space-x-1">
                      <span>Description</span>
                      <DetailSortIcon field="description" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ligne</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleDetailSort('amount')}>
                    <div className="flex items-center justify-end space-x-1">
                      <span>Montant</span>
                      <DetailSortIcon field="amount" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleDetailSort('status')}>
                    <div className="flex items-center justify-center space-x-1">
                      <span>Statut</span>
                      <DetailSortIcon field="status" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedExpenses
                  .filter(exp => 
                    exp.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    exp.engagementNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (exp.supplier && exp.supplier.toLowerCase().includes(searchTerm.toLowerCase()))
                  )
                  .map(expense => {
                  const budgetLine = budgetLines.find(line => line.id === expense.budgetLineId);
                  return (
                    <tr key={expense.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-sm text-gray-900">{new Date(expense.date).toLocaleDateString('fr-FR')}</td>
                      <td className="px-3 py-2 text-sm font-medium text-gray-900">{expense.engagementNumber}</td>
                      <td className="px-3 py-2 text-sm text-gray-900 max-w-[200px]" title={expense.description}>{expense.description}</td>
                      <td className="px-3 py-2 text-sm text-gray-600">{budgetLine?.name || '-'}</td>
                      <td className="px-3 py-2 text-sm font-medium text-gray-900 text-right">{formatCurrency(expense.amount)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getEngagementStatusColor(expense.status)}`}>
                          {getStatusLabel(expense.status)}
                        </span>
                        {/* <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          expense.status === 'paid' ? 'bg-green-100 text-green-800' : 
                          expense.status === 'approved' ? 'bg-blue-100 text-blue-800' : 
                          expense.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
                          expense.status === 'in_progress' ? 'bg-purple-100 text-purple-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {getStatusLabel(expense.status)}
                        </span> */}
                      </td>
                    </tr>
                  );
                })}
                {paginatedExpenses.filter(exp => 
                  exp.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  exp.engagementNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  (exp.supplier && exp.supplier.toLowerCase().includes(searchTerm.toLowerCase()))
                ).length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">Aucun engagement trouvé</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <DetailPagination />
        </div>
      )}

      {/* Rapport bénéficiaires */}
      {reportType === 'beneficiaries' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Users className="w-5 h-5 mr-2" />
            État des bénéficiaires avances/prêt
          </h3>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher un bénéficiaire..."
                value={beneficiarySearchTerm}
                onChange={(e) => setBeneficiarySearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Lignes par page:</span>
              <select
                value={beneficiaryItemsPerPage}
                onChange={(e) => {
                  setBeneficiaryItemsPerPage(Number(e.target.value));
                  setBeneficiaryCurrentPage(1);
                }}
                className="px-2 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300">
              <thead className="bg-gray-50">
                <tr>
                  <th className="border border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleBeneficiarySort('name')}>
                    <div className="flex items-center space-x-1">
                      <span>Agent</span>
                      <BeneficiarySortIcon field="name" />
                    </div>
                  </th>
                  <th className="border border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleBeneficiarySort('employeeId')}>
                    <div className="flex items-center space-x-1">
                      <span>Matricule</span>
                      <BeneficiarySortIcon field="employeeId" />
                    </div>
                  </th>
                  <th className="border border-gray-300 px-3 py-2 text-right text-xs font-medium text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleBeneficiarySort('totalObtained')}>
                    <div className="flex items-center justify-end space-x-1">
                      <span>Montant obtenu</span>
                      <BeneficiarySortIcon field="totalObtained" />
                    </div>
                  </th>
                  <th className="border border-gray-300 px-3 py-2 text-right text-xs font-medium text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleBeneficiarySort('totalRepaid')}>
                    <div className="flex items-center justify-end space-x-1">
                      <span>Montant remboursé</span>
                      <BeneficiarySortIcon field="totalRepaid" />
                    </div>
                  </th>
                  <th className="border border-gray-300 px-3 py-2 text-right text-xs font-medium text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleBeneficiarySort('balance')}>
                    <div className="flex items-center justify-end space-x-1">
                      <span>Solde</span>
                      <BeneficiarySortIcon field="balance" />
                    </div>
                  </th>
                  <th className="border border-gray-300 px-3 py-2 text-center text-xs font-medium text-gray-700">Observations</th>
                </tr>
              </thead>
              <tbody>
                {paginatedBeneficiaries.map((beneficiary, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="border border-gray-300 px-3 py-2 text-sm text-gray-900">{beneficiary.name}</td>
                    <td className="border border-gray-300 px-3 py-2 text-sm text-gray-500">{beneficiary.employeeId}</td>
                    <td className="border border-gray-300 px-3 py-2 text-sm text-gray-900 text-right">{formatCurrency(beneficiary.totalObtained)}</td>
                    <td className="border border-gray-300 px-3 py-2 text-sm text-gray-900 text-right">{formatCurrency(beneficiary.totalRepaid)}</td>
                    <td className={`border border-gray-300 px-3 py-2 text-sm font-medium text-right ${beneficiary.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(beneficiary.balance)}
                    </td>
                    <td className="border border-gray-300 px-3 py-2 text-sm text-gray-600 text-center">{beneficiary.observations}</td>
                  </tr>
                ))}
                {paginatedBeneficiaries.length === 0 && (
                  <tr>
                    <td colSpan={6} className="border border-gray-300 px-4 py-8 text-center text-gray-500">Aucun bénéficiaire trouvé</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <BeneficiaryPagination />
        </div>
      )}

      {/* Rapport détaillé par fournisseur avec sous-lignes */}
      {reportType === 'supplier-detail' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <Users className="w-5 h-5 mr-2" />
              Détail par Fournisseur
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500">{sortedSuppliers.length} fournisseurs</span>
              <button onClick={toggleSelectAll} className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center space-x-1">
                {selectAll ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-gray-400" />}
                <span>{selectAll ? 'Tout désélectionner' : 'Tout sélectionner'}</span>
              </button>
              <button onClick={expandAll} className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 flex items-center space-x-1">
                <Plus className="w-3 h-3" />
                <span>Tout développer</span>
              </button>
              <button onClick={collapseAll} className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center space-x-1">
                <Minus className="w-3 h-3" />
                <span>Tout réduire</span>
              </button>
              {canExport && selectedItems.size > 0 && (
                <>
                  {/* 🔽 NOUVEAU SELECTEUR */}
                  <select
                    value={exportDataType}
                    onChange={(e) => setExportDataType(e.target.value as 'all' | 'engagements' | 'payments')}
                    className="px-2 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="all">📄 Tout (Eng. + Paiements)</option>
                    <option value="engagements">📋 Engagements uniquement</option>
                    <option value="payments">💰 Paiements uniquement</option>
                  </select>

                  {/* BOUTON EXCEL (utilise déjà exportDataType) */}
                  <button
                    onClick={() => {
                      const suppliers = sortedSuppliers.filter(s => selectedItems.has(s.name));
                      exportToExcelAdvanced(suppliers, exportDataType);
                    }}
                    className="bg-green-600 text-white px-3 py-1 rounded-lg text-sm font-medium flex items-center space-x-1 hover:bg-green-700"
                  >
                    <Download className="w-4 h-4" />
                    <span>Excel ({selectedItems.size})</span>
                  </button>

                  {/* BOUTON PDF (appelle la nouvelle version avec paramètre) */}
                  <button
                    onClick={() => exportSelectedSuppliersToPDF(exportDataType)}
                    className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-3 py-1 rounded-lg text-sm font-medium flex items-center space-x-1 hover:shadow-lg"
                  >
                    <FileText className="w-4 h-4" />
                    <span>PDF ({selectedItems.size})</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Recherche et sélecteur de lignes */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Rechercher un fournisseur..."
                  value={supplierSearchTerm}
                  onChange={(e) => setSupplierSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
              <select
                value={supplierMissionFilter}
                onChange={(e) => { setSupplierMissionFilter(e.target.value as 'all' | 'mission' | 'non_mission'); setSupplierCurrentPage(1); }}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                title="Filtrer par mission"
              >
                <option value="all">Missions et hors-mission</option>
                <option value="mission">Missions uniquement</option>
                <option value="non_mission">Hors-mission uniquement</option>
              </select>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Lignes par page:</span>
              <select
                value={supplierItemsPerPage}
                onChange={(e) => {
                  setSupplierItemsPerPage(Number(e.target.value));
                  setSupplierCurrentPage(1);
                }}
                className="px-2 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSupplierSort('supplier')}>
                    <div className="flex items-center space-x-1">
                      <span>Fournisseur</span>
                      <SupplierSortIcon field="supplier" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSupplierSort('engagementsCount')}>
                    <div className="flex items-center justify-center space-x-1">
                      <span>Engagements</span>
                      <SupplierSortIcon field="engagementsCount" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSupplierSort('totalEngaged')}>
                    <div className="flex items-center justify-end space-x-1">
                      <span>Montant Engagé</span>
                      <SupplierSortIcon field="totalEngaged" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSupplierSort('totalPaid')}>
                    <div className="flex items-center justify-end space-x-1">
                      <span>Payé</span>
                      <SupplierSortIcon field="totalPaid" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSupplierSort('totalRemaining')}>
                    <div className="flex items-center justify-end space-x-1">
                      <span>Reste</span>
                      <SupplierSortIcon field="totalRemaining" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSupplierSort('totalPending')}>
                    <div className="flex items-center justify-end space-x-1">
                      <span>En Attente</span>
                      <SupplierSortIcon field="totalPending" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSupplierSort('totalRejected')}>
                    <div className="flex items-center justify-end space-x-1">
                      <span>Rejeté</span>
                      <SupplierSortIcon field="totalRejected" />
                    </div>
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedSuppliers.map(supplier => {
                  const isSelected = selectedItems.has(supplier.name);
                  const isExpanded = expandedSuppliers.has(supplier.name);
                  const statusLabels: Record<string, string> = {
                    pending: 'En attente',
                    approved: 'Approuvé',
                    rejected: 'Rejeté',
                    paid: 'Payé',
                    in_progress: 'En cours'
                  };
                  
                  return (
                    <React.Fragment key={supplier.name}>
                      <tr className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => toggleSelectItem(supplier.name)} className="flex items-center justify-center">
                            {isSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-gray-400" />}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button 
                            onClick={() => toggleSupplierExpand(supplier.name)} 
                            className="p-1 rounded hover:bg-gray-200 transition-colors"
                          >
                            {isExpanded ? 
                              <ChevronDown className="w-4 h-4 text-gray-600" /> : 
                              <ChevronRight className="w-4 h-4 text-gray-600" />
                            }
                          </button>
                        </td>
                        <td className="px-3 py-2 font-medium text-gray-900">{supplier.name}</td>
                        <td className="px-3 py-2 text-center text-sm text-gray-900">{supplier.engagements.length}</td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">{formatCurrency(supplier.totalEngaged)}</td>
                        <td className="px-3 py-2 text-right text-green-600 font-medium">{formatCurrency(supplier.totalPaid)}</td>
                        <td className="px-3 py-2 text-right text-orange-600 font-medium">{formatCurrency(supplier.totalRemaining)}</td>
                        <td className="px-3 py-2 text-right text-yellow-600">{formatCurrency(supplier.totalPending)}</td>
                        <td className="px-3 py-2 text-right text-red-600">{formatCurrency(supplier.totalRejected)}</td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => { setSelectedSupplier(supplier.name); setShowSupplierDetail(true); }} className="inline-flex items-center px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 transition-colors">
                            <Eye className="w-3 h-3 mr-1" /> Détail
                          </button>
                        </td>
                      </tr>
                      
                      {/* Sous-lignes pour les engagements et paiements */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={10} className="px-3 py-2 bg-gray-50">
                            <div className="ml-8 space-y-4">
                              {/* Engagements */}
                              {supplier.engagements.length > 0 && (
                                <div>
                                  <h5 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
                                    <FileText className="w-4 h-4 mr-1 text-blue-600" />
                                    Engagements ({supplier.engagements.length})
                                  </h5>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                      <thead className="bg-gray-100">
                                        <tr>
                                          <th className="px-3 py-1 text-left text-xs font-medium text-gray-600">Date</th>
                                          <th className="px-3 py-1 text-left text-xs font-medium text-gray-600">N°</th>
                                          <th className="px-3 py-1 text-left text-xs font-medium text-gray-600">Description</th>
                                          <th className="px-3 py-1 text-right text-xs font-medium text-gray-600">Montant</th>
                                          <th className="px-3 py-1 text-center text-xs font-medium text-gray-600">Statut</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-200">
                                        {supplier.engagements.map(eng => (
                                          <tr key={eng.id} className="hover:bg-gray-50">
                                            <td className="px-3 py-1 text-xs text-gray-900">{new Date(eng.date).toLocaleDateString('fr-FR')}</td>
                                            <td className="px-3 py-1 text-xs font-medium text-gray-900">{eng.engagementNumber}</td>
                                            <td className="px-3 py-1 text-xs text-gray-700 max-w-[200px] truncate" title={eng.description}>{eng.description}</td>
                                            <td className="px-3 py-1 text-xs text-right font-medium text-gray-900">{formatCurrency(eng.amount)}</td>
                                            <td className="px-3 py-1 text-center">
                                              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getEngagementStatusColor(eng.status)}`}>
                                                {getStatusLabel(eng.status)}
                                              </span>
                                              {/* <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                                eng.status === 'paid' ? 'bg-green-100 text-green-800' : 
                                                eng.status === 'approved' ? 'bg-blue-100 text-blue-800' : 
                                                eng.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
                                                eng.status === 'in_progress' ? 'bg-purple-100 text-purple-800' :
                                                'bg-red-100 text-red-800'
                                              }`}>
                                                {getStatusLabel(eng.status)}
                                              </span> */}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                              
                              {/* Paiements */}
                              {supplier.payments.length > 0 && (
                                <div>
                                  <h5 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
                                    <CreditCard className="w-4 h-4 mr-1 text-green-600" />
                                    Paiements ({supplier.payments.length})
                                  </h5>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                      <thead className="bg-gray-100">
                                        <tr>
                                          <th className="px-3 py-1 text-left text-xs font-medium text-gray-600">Date</th>
                                          <th className="px-3 py-1 text-left text-xs font-medium text-gray-600">N° Paiement</th>
                                          <th className="px-3 py-1 text-left text-xs font-medium text-gray-600">Référence</th>
                                          <th className="px-3 py-1 text-right text-xs font-medium text-gray-600">Montant</th>
                                          <th className="px-3 py-1 text-right text-xs font-medium text-gray-600">Payé</th>
                                          <th className="px-3 py-1 text-right text-xs font-medium text-gray-600">Reste</th>
                                          <th className="px-3 py-1 text-center text-xs font-medium text-gray-600">Statut</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-200">
                                        {supplier.payments.map(payment => {
                                          const totalPaid = getTotalPaidForPayment(payment);
                                          const remaining = getRemainingAmountForPayment(payment);
                                          const status = getPaymentStatus(payment);
                                          return (
                                            <tr key={payment.id} className="hover:bg-gray-50">
                                              <td className="px-3 py-1 text-xs text-gray-900">{new Date(payment.date).toLocaleDateString('fr-FR')}</td>
                                              <td className="px-3 py-1 text-xs font-medium text-gray-900">{payment.paymentNumber}</td>
                                              <td className="px-3 py-1 text-xs text-gray-700">{payment.checkNumber || payment.bankReference || '-'}</td>
                                              <td className="px-3 py-1 text-xs text-right font-medium text-gray-900">{formatCurrency(payment.amount)}</td>
                                              <td className="px-3 py-1 text-xs text-right font-medium text-green-600">{formatCurrency(totalPaid)}</td>
                                              <td className="px-3 py-1 text-xs text-right font-medium text-orange-600">{formatCurrency(remaining)}</td>
                                              <td className="px-3 py-1 text-center">
                                                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                                  status === 'paid' ? 'bg-green-100 text-green-800' : 
                                                  status === 'approved' ? 'bg-blue-100 text-blue-800' : 
                                                  status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
                                                  status === 'in_progress' ? 'bg-purple-100 text-purple-800' :
                                                  'bg-red-100 text-red-800'
                                                }`}>
                                                  {getStatusLabel(status)}
                                                </span>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                              
                              {supplier.engagements.length === 0 && supplier.payments.length === 0 && (
                                <p className="text-sm text-gray-500 italic">Aucun détail disponible pour ce fournisseur</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {paginatedSuppliers.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-gray-500">Aucun fournisseur trouvé</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <SupplierPagination />
        </div>
      )}

      {/* === MODAL DÉTAIL FOURNISSEUR === */}
      {showSupplierDetail && selectedSupplier && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 sm:p-6 border-b">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Détail du fournisseur</h3>
                <p className="text-gray-600">{selectedSupplier}</p>
              </div>
              <div className="flex items-center space-x-2">
                {canExport && (
                  <div className="flex items-center space-x-2 relative">
                    <button 
                      onClick={() => { 
                        const supplier = supplierData.find(s => s.name === selectedSupplier); 
                        if (supplier) exportSupplierDetailToPDF(supplier, 'all');
                      }} 
                      className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center space-x-1 hover:bg-blue-700"
                    >
                      <Download className="w-4 h-4" />
                      <span>Exporter PDF</span>
                    </button>
                    <button 
                      onClick={() => {
                        const supplier = supplierData.find(s => s.name === selectedSupplier);
                        if (supplier) exportToExcelAdvanced([supplier], exportDataType);
                      }} 
                      className="bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center space-x-1 hover:bg-green-700"
                    >
                      <FileText className="w-4 h-4" />
                      <span>Exporter Excel</span>
                    </button>
                    <button 
                      onClick={() => setShowExportOptions(!showExportOptions)} 
                      className="bg-gray-200 text-gray-700 px-2 py-2 rounded-lg hover:bg-gray-300"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    {showExportOptions && (
                      <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[220px]">
                        <button 
                          onClick={() => { 
                            setExportDataType('all');
                            setShowExportOptions(false);
                          }} 
                          className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 border-b ${exportDataType === 'all' ? 'bg-blue-50 text-blue-700' : ''}`}
                        >
                          📄 Tout exporter
                        </button>
                        <button 
                          onClick={() => { 
                            setExportDataType('engagements');
                            setShowExportOptions(false);
                          }} 
                          className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 border-b ${exportDataType === 'engagements' ? 'bg-blue-50 text-blue-700' : ''}`}
                        >
                          📋 Uniquement les engagements
                        </button>
                        <button 
                          onClick={() => { 
                            setExportDataType('payments');
                            setShowExportOptions(false);
                          }} 
                          className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${exportDataType === 'payments' ? 'bg-blue-50 text-blue-700' : ''}`}
                        >
                          💰 Uniquement les paiements
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <button onClick={() => { setShowSupplierDetail(false); setSelectedSupplier(''); setShowExportOptions(false); }} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(90vh-100px)]">
              {(() => {
                const supplier = supplierData.find(s => s.name === selectedSupplier);
                if (!supplier) return <p className="text-gray-500">Fournisseur non trouvé</p>;

                return (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                      <div className="bg-blue-50 rounded-lg p-3 text-center"><p className="text-xs text-blue-600">Engagements</p><p className="text-xl font-bold text-blue-900">{supplier.engagements.length}</p></div>
                      <div className="bg-green-50 rounded-lg p-3 text-center"><p className="text-xs text-green-600">Payé</p><p className="text-xl font-bold text-green-900">{formatCurrency(supplier.totalPaid)}</p></div>
                      <div className="bg-orange-50 rounded-lg p-3 text-center"><p className="text-xs text-orange-600">Reste</p><p className="text-xl font-bold text-orange-900">{formatCurrency(supplier.totalRemaining)}</p></div>
                      <div className="bg-yellow-50 rounded-lg p-3 text-center"><p className="text-xs text-yellow-600">En Attente</p><p className="text-xl font-bold text-yellow-900">{formatCurrency(supplier.totalPending)}</p></div>
                      <div className="bg-red-50 rounded-lg p-3 text-center"><p className="text-xs text-red-600">Rejeté</p><p className="text-xl font-bold text-red-900">{formatCurrency(supplier.totalRejected)}</p></div>
                      <div className="bg-purple-50 rounded-lg p-3 text-center"><p className="text-xs text-purple-600">Total Engagé</p><p className="text-xl font-bold text-purple-900">{formatCurrency(supplier.totalEngaged)}</p></div>
                    </div>

                    <div>
                      <h4 className="font-semibold text-gray-900 mb-3">Engagements</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Date</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">N°</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Description</th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Montant</th>
                              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Statut</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {supplier.engagements.map(engagement => (
                              <tr key={engagement.id} className="hover:bg-gray-50">
                                <td className="px-3 py-2">{new Date(engagement.date).toLocaleDateString('fr-FR')}</td>
                                <td className="px-3 py-2 font-medium">{engagement.engagementNumber}</td>
                                <td className="px-3 py-2 max-w-[200px]" title={engagement.description}>{engagement.description}</td>
                                <td className="px-3 py-2 text-right font-medium">{formatCurrency(engagement.amount)}</td>
                                <td className="px-3 py-2 text-center">
                                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${engagement.status === 'paid' ? 'bg-green-100 text-green-800' : engagement.status === 'approved' ? 'bg-blue-100 text-blue-800' : engagement.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : engagement.status === 'in_progress' ? 'bg-purple-100 text-purple-800' : 'bg-red-100 text-red-800'}`}>
                                    {getStatusLabel(engagement.status)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {supplier.payments.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-3">Paiements</h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Date</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">N° Paiement</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Référence</th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Montant</th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Payé</th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Reste</th>
                                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Statut</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {supplier.payments.map(payment => {
                                const totalPaid = getTotalPaidForPayment(payment);
                                const remaining = getRemainingAmountForPayment(payment);
                                const status = getPaymentStatus(payment);
                                return (
                                  <tr key={payment.id} className="hover:bg-gray-50">
                                    <td className="px-3 py-2">{new Date(payment.date).toLocaleDateString('fr-FR')}</td>
                                    <td className="px-3 py-2 font-medium">{payment.paymentNumber}</td>
                                    <td className="px-3 py-2">{payment.checkNumber || payment.bankReference || '-'}</td>
                                    <td className="px-3 py-2 text-right font-medium">{formatCurrency(payment.amount)}</td>
                                    <td className="px-3 py-2 text-right font-medium text-green-600">{formatCurrency(totalPaid)}</td>
                                    <td className="px-3 py-2 text-right font-medium text-orange-600">{formatCurrency(remaining)}</td>
                                    <td className="px-3 py-2 text-center">
                                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${status === 'paid' ? 'bg-green-100 text-green-800' : status === 'approved' ? 'bg-blue-100 text-blue-800' : status === 'pending' ? 'bg-yellow-100 text-yellow-800' : status === 'in_progress' ? 'bg-purple-100 text-purple-800' : 'bg-red-100 text-red-800'}`}>
                                        {getStatusLabel(status)}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
 
export default Reports;


