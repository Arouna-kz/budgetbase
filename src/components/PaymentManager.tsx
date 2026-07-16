import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Edit, CreditCard, CheckCircle, Clock, AlertCircle, Eye, Filter, FileText,
  TrendingUp, User, X, ChevronUp, ChevronDown, ChevronRight, ChevronLeft, 
  Search, Download, DollarSign, AlertTriangle, Calendar, FileSpreadsheet,
  ChevronsUpDown
} from 'lucide-react';
import { showWarning, showSuccess, showValidationError, showError } from '../utils/alerts';
import { Payment, Engagement, BudgetLine, SubBudgetLine, Grant, BankAccount, PAYMENT_STATUS, PartialPayment } from '../types';
import { usePermissions } from '../hooks/usePermissions';
import { useAuth } from '../hooks/useAuth';
import jsPDF from 'jspdf';
import { exportStyledExcel } from '../utils/excelExport';
import { usePaymentNotifications } from '../hooks/usePaymentNotifications';

interface PaymentManagerProps {
  payments: Payment[];
  engagements: Engagement[];
  budgetLines: BudgetLine[];
  subBudgetLines: SubBudgetLine[];
  grants: Grant[];
  bankAccounts: BankAccount[];
  selectedGrantId: string;
  onAddPayment: (payment: Omit<Payment, 'id'>) => void;
  onUpdatePayment: (id: string, updates: Partial<Payment>) => void;
  onViewPaymentDetails: (paymentId: string) => void;
  onEditPayment: (paymentId: string) => void;
  onCreatePaymentFromEngagement: (engagementId: string) => void;
  onAddPartialPayment?: (paymentId: string, partialPayment: Omit<PartialPayment, 'id'>) => void;
  onAddBankTransaction?: (transaction: any) => void;
}

const PaymentManager: React.FC<PaymentManagerProps> = ({
  payments,
  engagements,
  budgetLines,
  subBudgetLines,
  grants,
  bankAccounts,
  selectedGrantId,
  onAddPayment,
  onUpdatePayment,
  onViewPaymentDetails,
  onEditPayment,
  onCreatePaymentFromEngagement,
  onAddPartialPayment,
  onAddBankTransaction
}) => {
  // HOOKS D'AUTHENTIFICATION ET PERMISSIONS
  const { hasPermission, hasModuleAccess, loading: permissionsLoading } = usePermissions();
  const { user: currentUser, userProfile, userRole } = useAuth();

  // HOOK DE NOTIFICATIONS
  const { notificationCount, hasNotifications } = usePaymentNotifications(payments);

  // ÉTATS DU COMPOSANT
  const [showForm, setShowForm] = useState(false);
  const [showPartialPaymentForm, setShowPartialPaymentForm] = useState(false);
  const [selectedPaymentForPartial, setSelectedPaymentForPartial] = useState<Payment | null>(null);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [selectedEngagement, setSelectedEngagement] = useState<string>('');
  const [expandAll, setExpandAll] = useState(false);

  // États pour le tri et la pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sortField, setSortField] = useState<string>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showOnlyToSign, setShowOnlyToSign] = useState(false);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [supplierFilter, setSupplierFilter] = useState<string>('');
  const [budgetLineFilter, setBudgetLineFilter] = useState<string>('');
  const [subBudgetLineFilter, setSubBudgetLineFilter] = useState<string>('');
  const [showDateRange, setShowDateRange] = useState<boolean>(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);

  // État pour gérer l'expansion du contenu des cellules
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // ÉTATS DU FORMULAIRE PRINCIPAL
  const [formData, setFormData] = useState({
    engagementId: '',
    grantId: '',
    budgetLineId: '',
    subBudgetLineId: '',
    paymentNumber: '',
    amount: '',
    description: '',
    supplier: '',
    paymentMethod: 'transfer' as Payment['paymentMethod'],
    checkNumber: '',
    bankAccountId: '',
    date: new Date().toISOString().split('T')[0],
    status: 'pending' as Payment['status']
  });

  // ÉTATS DU FORMULAIRE DE PAIEMENT PARTIEL
  const [partialPaymentData, setPartialPaymentData] = useState({
    amount: '',
    date: new Date().toISOString().split('T')[0],
    paymentMethod: 'transfer' as 'transfer' | 'check' | 'cash',
    checkNumber: '',
    bankReference: '',
    reference: ''
  });

  const [approvals, setApprovals] = useState<any>({
    supervisor1: { name: '', signature: false, observation: '' },
    supervisor2: { name: '', signature: false, observation: '' },
    finalApproval: { name: '', signature: false, observation: '' }
  });

  const [showObservations, setShowObservations] = useState({
    supervisor1: false,
    supervisor2: false,
    finalApproval: false
  });

  // RÉFÉRENCES POUR PDF
  const mainContentRef = useRef<HTMLDivElement>(null);
  const signatureContentRef = useRef<HTMLDivElement>(null);

  // 🎯 FONCTIONS UTILITAIRES

  const getUserFullName = (): string => {
    if (!userProfile) return '';
    if (userProfile.firstName && userProfile.lastName) {
      return `${userProfile.firstName} ${userProfile.lastName}`.trim();
    }
    return userProfile?.email || '';
  };

  const getUserProfession = (): string => {
    return userProfile?.profession || '';
  };

  const canViewSignatureSection = (): boolean => {
    const signatureProfessions = ['Coordinateur de la Subvention', 'Comptable', 'Coordonnateur National'];
    return signatureProfessions.includes(getUserProfession());
  };

  const canModifyStatusComptable = (): boolean => {
    return getUserProfession() === 'Comptable';
  };

  const canModifyStatus = (): boolean => {
    return getUserProfession() === 'Coordonnateur National';
  };

  const canSignPayment = (payment: Payment | null, signatureType: string): boolean => {
    const currentApprovals = payment ? payment.approvals : approvals;
    
    if (!currentApprovals) {
      return false;
    }
    
    const userProfession = getUserProfession();
    
    const professionCanSign = 
      (signatureType === 'supervisor1' && userProfession === 'Coordinateur de la Subvention') ||
      (signatureType === 'supervisor2' && userProfession === 'Comptable') ||
      (signatureType === 'finalApproval' && userProfession === 'Coordonnateur National');

    if (!professionCanSign) return false;

    const existingApproval = currentApprovals[signatureType as keyof typeof currentApprovals];
    if (existingApproval?.signature) return false;

    if (signatureType === 'finalApproval') {
      const hasSupervisor1Signed = currentApprovals.supervisor1?.signature;
      const hasSupervisor2Signed = currentApprovals.supervisor2?.signature;
      
      if (!payment) return false;
      
      if (!hasSupervisor1Signed || !hasSupervisor2Signed) {
        return false;
      }
    }

    return true;
  };


  // L'icône Edit s'affiche pour TOUS ceux qui ont la permission de modifier,
  // quel que soit le statut du paiement (en attente, approuvé, rejeté...).
  // La restriction réelle est gérée dans le formulaire : le bouton d'enregistrement
  // n'est actif, pour un paiement qui n'est plus "en attente", que pour le comptable.
  const canEditPayment = (_payment: Payment): boolean => {
    return canEdit;
  };


  // Le paiement nécessite-t-il la signature de l'utilisateur courant ?
  const needsUserSignature = (payment: Payment): boolean => {
    const userProfession = getUserProfession();
    if (userProfession === 'Coordinateur de la Subvention') {
      return !payment.approvals?.supervisor1?.signature;
    } else if (userProfession === 'Comptable') {
      return !payment.approvals?.supervisor2?.signature;
    } else if (userProfession === 'Coordonnateur National') {
      const hasSupervisor1Signed = payment.approvals?.supervisor1?.signature;
      const hasSupervisor2Signed = payment.approvals?.supervisor2?.signature;
      const hasFinalSigned = payment.approvals?.finalApproval?.signature;
      // Le coordonnateur (signataire final) doit signer ET décider (approuver/rejeter).
      // L'élément reste dans la liste "À signer" tant qu'il n'a pas fait les DEUX :
      // il n'en disparaît qu'une fois signé ET son statut décidé (≠ 'pending'),
      // pour lui éviter d'avoir à rechercher l'élément plus tard pour changer le statut.
      const hasDecision = payment.status !== 'pending';
      return !!(hasSupervisor1Signed && hasSupervisor2Signed && !(hasFinalSigned && hasDecision));
    }
    return false;
  };

  const getPendingSignatures = (): Payment[] => {
    return payments.filter(payment => needsUserSignature(payment));
  };

  const toggleRowExpansion = (paymentId: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(paymentId)) {
        newSet.delete(paymentId);
      } else {
        newSet.add(paymentId);
      }
      return newSet;
    });
  };

  const toggleAllRows = () => {
    if (expandAll) {
      setExpandedRows(new Set());
    } else {
      const allIds = new Set(currentPayments.map(p => p.id));
      setExpandedRows(allIds);
    }
    setExpandAll(!expandAll);
  };

  const truncateText = (text: string, maxLength: number = 30): string => {
    if (!text) return '';
    return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
  };

  // PERMISSIONS
  const canCreate = hasPermission('payments', 'create');
  const canEdit = hasPermission('payments', 'edit');
  const canDelete = hasPermission('payments', 'delete');
  const canView = hasPermission('payments', 'view');
  const canExport = hasPermission('payments', 'export');

  const userProfession = getUserProfession();
  const userFullName = getUserFullName();
  const pendingSignatures = getPendingSignatures();
  // ✅ Un paiement reste "à signer" tant que l'utilisateur ne l'a pas signé, quel que soit le statut.
  // (Approuver/rejeter sans signer ne doit PAS retirer l'élément de la liste.)
  const toSignCount = payments.filter(p => needsUserSignature(p)).length;

  // Filtrer les engagements approuvés qui n'ont pas encore de paiement
  const availableEngagements = engagements.filter(engagement => 
    engagement.status === 'approved' && 
    !payments.some(payment => payment.engagementId === engagement.id)
  );

  // Filtrer les paiements par subvention
  const filteredPayments = selectedGrantId 
    ? payments.filter(payment => payment.grantId === selectedGrantId)
    : payments;

  const filteredAvailableEngagements = selectedGrantId
    ? availableEngagements.filter(engagement => engagement.grantId === selectedGrantId)
    : availableEngagements;

  const activeGrant = grants.find(grant => grant.id === selectedGrantId) || 
                     grants.find(grant => grant.status === 'active') || 
                     grants[0] || 
                     null;

  // Fonctions utilitaires
  const getEngagement = (engagementId: string) => {
    return engagements.find(eng => eng.id === engagementId);
  };

  const getBudgetLine = (budgetLineId: string) => {
    return budgetLines.find(line => line.id === budgetLineId);
  };

  const getSubBudgetLine = (subBudgetLineId: string) => {
    return subBudgetLines.find(line => line.id === subBudgetLineId);
  };

  const getGrant = (grantId: string) => {
    return grants.find(grant => grant.id === grantId);
  };

  // Calculer le montant total payé pour un paiement
  const getTotalPaid = (payment: Payment): number => {
    if (!payment.partialPayments || payment.partialPayments.length === 0) {
      return 0;
    }
    return payment.partialPayments.reduce((sum, pp) => sum + pp.amount, 0);
  };

  // Calculer le montant restant
  const getRemainingAmount = (payment: Payment): number => {
    const totalPaid = getTotalPaid(payment);
    return payment.amount - totalPaid;
  };

  // Obtenir la progression du paiement
  const getPaymentProgress = (payment: Payment): number => {
    if (payment.amount === 0) return 0;
    const totalPaid = getTotalPaid(payment);
    return Math.min((totalPaid / payment.amount) * 100, 100);
  };

  // Vérifier si un paiement est complètement payé
  const isFullyPaid = (payment: Payment): boolean => {
    return getRemainingAmount(payment) <= 0;
  };

  // Vérifier si un paiement a des paiements partiels
  const hasPartialPayments = (payment: Payment): boolean => {
    return payment.partialPayments && payment.partialPayments.length > 0;
  };

  // Mettre à jour automatiquement le statut
  const updatePaymentStatusAutomatically = (payment: Payment): Payment['status'] => {
    const remaining = getRemainingAmount(payment);
    const hasPartials = hasPartialPayments(payment);
    
    if (remaining <= 0) {
      return 'paid';
    } else if (hasPartials && remaining > 0) {
      return 'in_progress';
    }
    return payment.status;
  };

  // Filtrage et recherche avec plage de dates
  const searchedPayments = filteredPayments.filter(payment => {
    const searchLower = searchTerm.toLowerCase();
    const engagement = getEngagement(payment.engagementId);
    const budgetLine = getBudgetLine(payment.budgetLineId);
    const subBudgetLine = getSubBudgetLine(payment.subBudgetLineId);
    
    const budgetLineSearchText = budgetLine ? `${budgetLine.code} ${budgetLine.name}` : '';
    const subBudgetLineSearchText = subBudgetLine ? `${subBudgetLine.code} ${subBudgetLine.name}` : '';
    const engagementSearchText = engagement ? `${engagement.engagementNumber} ${engagement.description}` : '';
    
    const matchesSearch = 
      payment.paymentNumber.toLowerCase().includes(searchLower) ||
      payment.description.toLowerCase().includes(searchLower) ||
      (payment.supplier && payment.supplier.toLowerCase().includes(searchLower)) ||
      engagementSearchText.toLowerCase().includes(searchLower) ||
      payment.checkNumber?.toLowerCase().includes(searchLower) ||
      payment.bankReference?.toLowerCase().includes(searchLower) ||
      budgetLineSearchText.toLowerCase().includes(searchLower) ||
      subBudgetLineSearchText.toLowerCase().includes(searchLower);

    const matchesStatus = statusFilter === 'all' || payment.status === statusFilter;

    // ✅ Filtre "À signer" : uniquement les paiements en attente nécessitant ma signature
    // L'élément reste dans la liste "À signer" tant que ma signature est requise, quel que soit le statut.
    const matchesToSign = !showOnlyToSign || needsUserSignature(payment);

    const matchesDateRange = !showDateRange ? true : (
      (!startDate || payment.date >= startDate) &&
      (!endDate || payment.date <= endDate)
    );
    
    const matchesSupplier = !supplierFilter || 
      (payment.supplier && payment.supplier.toLowerCase().includes(supplierFilter.toLowerCase()));

    const matchesBudgetLine = !budgetLineFilter || 
      payment.budgetLineId === budgetLineFilter;

    const matchesSubBudgetLine = !subBudgetLineFilter || 
      payment.subBudgetLineId === subBudgetLineFilter;

    return matchesSearch && matchesStatus && matchesToSign && matchesDateRange &&
           matchesSupplier && matchesBudgetLine && matchesSubBudgetLine;
  });

  // Tri
  const sortedPayments = [...searchedPayments].sort((a, b) => {
    let aValue: any = a[sortField as keyof Payment];
    let bValue: any = b[sortField as keyof Payment];

    if (sortField === 'amount') {
      aValue = parseFloat(aValue);
      bValue = parseFloat(bValue);
    } else if (sortField === 'date') {
      aValue = new Date(aValue).getTime();
      bValue = new Date(bValue).getTime();
    } else if (sortField === 'engagementNumber') {
      const engagementA = getEngagement(a.engagementId);
      const engagementB = getEngagement(b.engagementId);
      aValue = engagementA?.engagementNumber || '';
      bValue = engagementB?.engagementNumber || '';
    } else if (sortField === 'supplier') {
      aValue = a.supplier || '';
      bValue = b.supplier || '';
    } else if (sortField === 'budgetLine') {
      const budgetLineA = getBudgetLine(a.budgetLineId);
      const budgetLineB = getBudgetLine(b.budgetLineId);
      aValue = budgetLineA?.name || '';
      bValue = budgetLineB?.name || '';
    } else if (sortField === 'subBudgetLine') {
      const subBudgetLineA = getSubBudgetLine(a.subBudgetLineId);
      const subBudgetLineB = getSubBudgetLine(b.subBudgetLineId);
      aValue = subBudgetLineA?.name || '';
      bValue = subBudgetLineB?.name || '';
    }

    if (typeof aValue === 'string') {
      return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
    }

    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Pagination
  const totalPages = Math.ceil(sortedPayments.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentPayments = sortedPayments.slice(startIndex, endIndex);

  const goToPage = (page: number) => setCurrentPage(page);
  const goToPreviousPage = () => currentPage > 1 && setCurrentPage(currentPage - 1);
  const goToNextPage = () => currentPage < totalPages && setCurrentPage(currentPage + 1);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const getSortIcon = (field: string) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />;
  };

  // 🚨 GESTIONNAIRES D'ÉVÉNEMENTS

  const handleSignPayment = (payment: Payment, signatureType: string) => {
    if (!canSignPayment(payment, signatureType)) {
      if (signatureType === 'finalApproval') {
        showWarning('Signature impossible', 'Les signatures du Coordinateur de la Subvention et du Comptable sont requises avant la vôtre.');
      } else {
        showWarning('Permission refusée', 'Vous n\'avez pas les droits pour apposer cette signature.');
      }
      return;
    }

    const signatureData = {
      name: getUserFullName(),
      date: new Date().toISOString().split('T')[0],
      signature: true,
      observation: '',
    };

    const updates: Partial<Payment> = {
      approvals: {
        ...payment.approvals,
        [signatureType]: signatureData,
      }
    };

    if (signatureType === 'finalApproval') {
      updates.status = 'approved';
    }

    onUpdatePayment(payment.id, updates);
    showSuccess('Signature enregistrée', 'Votre signature a été enregistrée avec succès.');
  };

  // Fonction pour ajouter un paiement partiel
  const handleAddPartialPayment = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedPaymentForPartial) {
      showError('Erreur', 'Aucun paiement sélectionné');
      return;
    }

    const amount = parseFloat(partialPaymentData.amount);
    if (isNaN(amount) || amount <= 0) {
      showValidationError('Montant invalide', 'Veuillez saisir un montant valide supérieur à 0');
      return;
    }

    const remaining = getRemainingAmount(selectedPaymentForPartial);
    if (amount > remaining) {
      showValidationError('Montant trop élevé', `Le montant saisi (${formatCurrency(amount)}) dépasse le montant restant (${formatCurrency(remaining)})`);
      return;
    }

    if (!partialPaymentData.reference.trim()) {
      showValidationError('Référence manquante', 'Veuillez saisir une référence pour ce paiement partiel');
      return;
    }

    // Créer le paiement partiel
    const partialPayment: Omit<PartialPayment, 'id'> = {
      amount: amount,
      date: partialPaymentData.date,
      paymentMethod: partialPaymentData.paymentMethod,
      checkNumber: partialPaymentData.checkNumber || undefined,
      bankReference: partialPaymentData.bankReference || undefined,
      reference: partialPaymentData.reference
    };

    // Ajouter le paiement partiel
    if (onAddPartialPayment) {
      onAddPartialPayment(selectedPaymentForPartial.id, partialPayment);
    }

    // Créer une transaction bancaire automatiquement
    if (onAddBankTransaction) {
      const grant = getGrant(selectedPaymentForPartial.grantId);
      const transaction = {
        grantId: selectedPaymentForPartial.grantId,
        date: partialPaymentData.date,
        description: `Paiement partiel - ${selectedPaymentForPartial.paymentNumber} - ${selectedPaymentForPartial.supplier}`,
        amount: amount,
        type: 'debit' as 'debit',
        reference: partialPaymentData.reference,
        paymentId: selectedPaymentForPartial.id
      };
      onAddBankTransaction(transaction);
    }

    // Calculer le nouveau statut automatiquement
    const newTotalPaid = getTotalPaid(selectedPaymentForPartial) + amount;
    const newRemaining = selectedPaymentForPartial.amount - newTotalPaid;
    let newStatus: Payment['status'];
    
    if (newRemaining <= 0) {
      newStatus = 'paid';
    } else if (newTotalPaid > 0) {
      newStatus = 'in_progress';
    } else {
      newStatus = selectedPaymentForPartial.status;
    }

    // Mettre à jour le statut automatiquement
    onUpdatePayment(selectedPaymentForPartial.id, {
      status: newStatus,
      remainingAmount: newRemaining
    });

    showSuccess('Paiement partiel ajouté', `Le paiement partiel de ${formatCurrency(amount)} a été enregistré avec succès`);
    
    // Réinitialiser le formulaire
    setPartialPaymentData({
      amount: '',
      date: new Date().toISOString().split('T')[0],
      paymentMethod: 'transfer',
      checkNumber: '',
      bankReference: '',
      reference: ''
    });
    setShowPartialPaymentForm(false);
    setSelectedPaymentForPartial(null);
  };

  const resetForm = () => {
    setFormData({
      engagementId: '',
      grantId: '',
      budgetLineId: '',
      subBudgetLineId: '',
      paymentNumber: '',
      amount: '',
      description: '',
      supplier: '',
      paymentMethod: 'transfer',
      checkNumber: '',
      bankAccountId: '',
      date: new Date().toISOString().split('T')[0],
      status: 'pending'
    });
    setApprovals({
      supervisor1: { name: '', signature: false, observation: '' },
      supervisor2: { name: '', signature: false, observation: '' },
      finalApproval: { name: '', signature: false, observation: '' }
    });
    setShowObservations({
      supervisor1: false,
      supervisor2: false,
      finalApproval: false
    });
    setShowForm(false);
    setEditingPayment(null);
  };

  const getCurrencySymbol = (currency: Grant['currency']) => {
    switch (currency) {
      case 'EUR': return '€';
      case 'USD': return '$';
      case 'XOF': return 'FCFA';
      default: return '€';
    }
  };

  const formatCurrency = (amount: number) => {
    if (!activeGrant) return amount.toLocaleString('fr-FR');
    
    return amount.toLocaleString('fr-FR', { 
      style: 'currency', 
      currency: activeGrant.currency === 'XOF' ? 'XOF' : activeGrant.currency,
      minimumFractionDigits: activeGrant.currency === 'XOF' ? 0 : 2
    });
  };

  const toggleObservation = (signatureType: string) => {
    setShowObservations(prev => ({
      ...prev,
      [signatureType]: !prev[signatureType as keyof typeof showObservations]
    }));
  };

  const getSignatureIcon = (payment: Payment, signatureType: string) => {
    const approval = payment.approvals?.[signatureType as keyof typeof payment.approvals];
    if (approval?.signature) {
      return <CheckCircle className="w-4 h-4 text-green-600" />;
    } else {
      return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const isSignatureRequired = (payment: Payment, signatureType: string): boolean => {
    const userProfession = getUserProfession();
    
    if (signatureType === 'supervisor1' && userProfession === 'Coordinateur de la Subvention') {
      return !payment.approvals?.supervisor1?.signature;
    } else if (signatureType === 'supervisor2' && userProfession === 'Comptable') {
      return !payment.approvals?.supervisor2?.signature;
    } else if (signatureType === 'finalApproval' && userProfession === 'Coordonnateur National') {
      const hasSupervisor1Signed = payment.approvals?.supervisor1?.signature;
      const hasSupervisor2Signed = payment.approvals?.supervisor2?.signature;
      return hasSupervisor1Signed && hasSupervisor2Signed && !payment.approvals?.finalApproval?.signature;
    }
    return false;
  };

  // Statistiques
  const pendingPayments = filteredPayments.filter(payment => payment.status === 'pending');
  const approvedPayments = filteredPayments.filter(payment => payment.status === 'approved');
  const inProgressPayments = filteredPayments.filter(payment => payment.status === 'in_progress');
  const paidPayments = filteredPayments.filter(payment => payment.status === 'paid');

  const allEngagements = engagements.filter(eng => 
    !selectedGrantId || eng.grantId === selectedGrantId
  );
  const totalEngaged = allEngagements.reduce((sum, eng) => sum + eng.amount, 0);
  const allPaidPayments = payments.filter(payment => 
    (payment.status === 'paid') &&
    (!selectedGrantId || payment.grantId === selectedGrantId)
  );
  const totalPaid = allPaidPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const disbursementRate = totalEngaged > 0 ? (totalPaid / totalEngaged) * 100 : 0;

  // Rendu de la colonne de progression
  const renderProgressColumn = (payment: Payment) => {
    const progress = getPaymentProgress(payment);
    const remaining = getRemainingAmount(payment);
    const isFullyPaidStatus = isFullyPaid(payment);
    
    return (
      <div className="flex flex-col items-center">
        <div className="flex items-center space-x-2 w-full">
          <span className="text-xs font-medium text-gray-600 min-w-[40px]">
            {progress.toFixed(0)}%
          </span>
          <div className="w-full max-w-[80px] bg-gray-200 rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all duration-300 ${
                isFullyPaidStatus ? 'bg-green-600' : 
                progress > 0 ? 'bg-blue-600' : 'bg-gray-400'
              }`}
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {isFullyPaidStatus ? (
            <span className="text-green-600 font-medium">✓ Payé</span>
          ) : (
            <span>Reste: {formatCurrency(remaining)}</span>
          )}
        </div>
      </div>
    );
  };

  // Rendu du statut (lecture seule)
  const renderStatus = (payment: Payment) => {
    const userProfession = getUserProfession();
    const isCoordinator = userProfession === 'Coordonnateur National';
    
    // Le coordonnateur peut modifier uniquement si le statut est "pending"
    const canCoordinatorChange = isCoordinator && payment.status === 'pending';

    // Affichage du statut en lecture seule
    const statusDisplay = (
      <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${PAYMENT_STATUS[payment.status].color}`}>
        {PAYMENT_STATUS[payment.status].label}
      </span>
    );

    // Si le coordonnateur et statut "pending" → sélecteur avec Approuver / Rejeter
    if (canCoordinatorChange) {
      return (
        <div className="text-center">
          <select
            value={payment.status}
            onChange={(e) => {
              const newStatus = e.target.value as Payment['status'];
              onUpdatePayment(payment.id, { status: newStatus });
            }}
            className={`text-xs font-medium rounded-full px-2 py-1 border-0 ${PAYMENT_STATUS[payment.status].color}`}
          >
            <option value="pending">En attente</option>
            <option value="approved">Approuvé</option>
            <option value="rejected">Rejeté</option>
          </select>
        </div>
      );
    }

    // Pour tous les autres cas → affichage en lecture seule (y compris comptable)
    return (
      <div className="text-center">
        {statusDisplay}
        {payment.status === 'in_progress' && (
          <div className="text-xs text-purple-600 mt-1">
            {getPaymentProgress(payment).toFixed(0)}% payé
          </div>
        )}
      </div>
    );
  };

  // Rendu du bouton "Ajouter un paiement partiel"
  const renderAddPartialPaymentButton = (payment: Payment) => {
    const remaining = getRemainingAmount(payment);
    const isFullyPaidStatus = isFullyPaid(payment);
    
    // Ne pas afficher si déjà entièrement payé, ou si le statut n'est ni "approved" ni "in_progress"
    if (isFullyPaidStatus) return null;
    if (payment.status !== 'approved' && payment.status !== 'in_progress') return null;
    if (!canModifyStatusComptable()) return null; // seul le comptable peut ajouter des paiements partiels
    
    // return (
    //   <button
    //     onClick={() => {
    //       setSelectedPaymentForPartial(payment);
    //       setPartialPaymentData({
    //         amount: remaining.toString(),
    //         date: new Date().toISOString().split('T')[0],
    //         paymentMethod: payment.paymentMethod,
    //         checkNumber: '',
    //         bankReference: '',
    //         reference: `PART-${payment.paymentNumber}-${Date.now().toString().slice(-4)}`
    //       });
    //       setShowPartialPaymentForm(true);
    //     }}
    //     className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
    //     title="Ajouter un paiement partiel"
    //   >
    //     <DollarSign className="w-4 h-4" />
    //   </button>
    // );
  };

  // Fonction pour charger le logo
  const loadImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  };

  // Fonction utilitaire pour diviser le texte en lignes
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

  // 🎯 EXPORT PDF
  const exportToPDF = async (exportAllData: boolean = false) => {
    if (!canExport) {
      showError('Permission refusée', 'Vous n\'avez pas la permission d\'exporter des données');
      return;
    }

    setIsGeneratingPDF(true);
    
    try {
      const dataToExport = exportAllData ? sortedPayments : currentPayments;
      
      if (dataToExport.length === 0) {
        showWarning('Aucune donnée', 'Aucune donnée à exporter');
        return;
      }

      const pdf = new jsPDF('l', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      let yPosition = margin;
      let isFirstPage = true;

      // Charger le logo
      let logo: HTMLImageElement | null = null;
      try {
        logo = await loadImage('/budgetbase/logo.png');
      } catch (error) {
        console.warn('Logo non chargé');
      }

      const addHeader = (isFirstPage: boolean = true) => {
        let y = margin;

        if (isFirstPage && logo) {
          const logoWidth = 20;
          const logoHeight = (logo.height * logoWidth) / logo.width;
          pdf.addImage(logo, 'PNG', margin, y, logoWidth, logoHeight);
          y += logoHeight + 3;
        }

        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('LISTE DES PAIEMENTS', pageWidth / 2, y, { align: 'center' });
        y += 6;

        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        if (activeGrant) {
          pdf.text(`Subvention: ${activeGrant.name}`, margin, y);
          pdf.text(`Référence: ${activeGrant.reference}`, margin + 100, y);
          y += 4.5;
        }
        pdf.text(`Généré le: ${new Date().toLocaleDateString('fr-FR')}`, margin, y);
        y += 5;

        pdf.line(margin, y, pageWidth - margin, y);
        y += 4;

        return y;
      };

      yPosition = addHeader(true);

      // === COLONNES RÉPARTIES SUR TOUTE LA LARGEUR ===
      const headers = [
        'N° Paiement', 
        'Date', 
        'Engagement', 
        'Ligne Budgétaire', 
        'Sous-Ligne', 
        'Fournisseur', 
        'Montant', 
        'Payé', 
        'Reste', 
        'Prog.', 
        'Statut'
      ];
      
      const totalWidth = pageWidth - (margin * 2);
      const weights = [1.0, 0.8, 1.2, 1.4, 1.2, 1.2, 0.9, 0.9, 0.9, 0.6, 0.9];
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      const columnWidths = weights.map(w => (w / totalWeight) * totalWidth);
      
      let xPos = margin;

      // En-tête du tableau
      const headerHeight = 7;
      pdf.setFillColor(59, 130, 246);
      pdf.rect(margin, yPosition, totalWidth, headerHeight, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(6);
      pdf.setFont('helvetica', 'bold');

      headers.forEach((header, index) => {
        const align = (index === 6 || index === 7 || index === 8 || index === 9) ? 'right' : 'left';
        const xOffset = align === 'right' ? columnWidths[index] - 1 : 1;
        pdf.text(header, xPos + xOffset, yPosition + 4.5, { align: align === 'right' ? 'right' : 'left' });
        xPos += columnWidths[index];
      });

      yPosition += headerHeight;
      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'normal');

      const statusLabels: Record<string, string> = {
        pending: 'En attente',
        approved: 'Approuvé',
        in_progress: 'En cours',
        paid: 'Payé',
        rejected: 'Rejeté'
      };

      const formatAmount = (amount: number) => {
        return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
      };
      const currencySymbol = getCurrencySymbol(activeGrant?.currency || 'EUR');

      // Fonction pour calculer la hauteur nécessaire pour une cellule
      const getCellHeight = (text: string, width: number, fontSize: number = 5.5): number => {
        if (!text) return 5;
        const maxWidth = width - 2;
        const lines = splitTextToLines(text, maxWidth, pdf);
        return Math.max(5, lines.length * 3 + 2);
      };

      // Pré-calculer la hauteur de chaque ligne
      const rowHeights = dataToExport.map((payment) => {
        const engagement = getEngagement(payment.engagementId);
        const budgetLine = getBudgetLine(payment.budgetLineId);
        const subBudgetLine = getSubBudgetLine(payment.subBudgetLineId);
        
        const budgetLineText = budgetLine ? `${budgetLine.code} - ${budgetLine.name}` : 'N/A';
        const subBudgetLineText = subBudgetLine ? `${subBudgetLine.code} - ${subBudgetLine.name}` : 'N/A';
        const supplierText = payment.supplier || 'Non spécifié';
        
        const h1 = getCellHeight(payment.paymentNumber, columnWidths[0]);
        const h2 = getCellHeight(new Date(payment.date).toLocaleDateString('fr-FR'), columnWidths[1]);
        const h3 = getCellHeight(engagement?.engagementNumber || 'N/A', columnWidths[2]);
        const h4 = getCellHeight(budgetLineText, columnWidths[3]);
        const h5 = getCellHeight(subBudgetLineText, columnWidths[4]);
        const h6 = getCellHeight(supplierText, columnWidths[5]);
        const h7 = getCellHeight(`${formatAmount(payment.amount)} ${currencySymbol}`, columnWidths[6]);
        const h8 = getCellHeight(`${formatAmount(getTotalPaid(payment))} ${currencySymbol}`, columnWidths[7]);
        const h9 = getCellHeight(`${formatAmount(getRemainingAmount(payment))} ${currencySymbol}`, columnWidths[8]);
        const h10 = getCellHeight(`${getPaymentProgress(payment).toFixed(0)}%`, columnWidths[9]);
        const h11 = getCellHeight(statusLabels[payment.status] || payment.status, columnWidths[10]);
        
        return Math.max(h1, h2, h3, h4, h5, h6, h7, h8, h9, h10, h11, 6);
      });

      // Dessiner les lignes avec hauteur dynamique
      dataToExport.forEach((payment, index) => {
        const rowHeight = rowHeights[index];
        
        // Vérifier si on doit passer à une nouvelle page
        if (yPosition + rowHeight > pageHeight - margin) {
          pdf.addPage();
          yPosition = margin;
          isFirstPage = false;
          
          // En-tête du tableau sur les pages suivantes
          pdf.line(margin, yPosition, pageWidth - margin, yPosition);
          yPosition += 2;
          
          pdf.setFillColor(59, 130, 246);
          pdf.rect(margin, yPosition, totalWidth, headerHeight, 'F');
          pdf.setTextColor(255, 255, 255);
          pdf.setFontSize(6);
          pdf.setFont('helvetica', 'bold');
          
          xPos = margin;
          headers.forEach((header, idx) => {
            const align = (idx === 6 || idx === 7 || idx === 8 || idx === 9) ? 'right' : 'left';
            const xOffset = align === 'right' ? columnWidths[idx] - 1 : 1;
            pdf.text(header, xPos + xOffset, yPosition + 4.5, { align: align === 'right' ? 'right' : 'left' });
            xPos += columnWidths[idx];
          });
          
          yPosition += headerHeight;
          pdf.setTextColor(0, 0, 0);
          pdf.setFont('helvetica', 'normal');
        }

        // Alternance des couleurs de ligne
        if (index % 2 === 0) {
          pdf.setFillColor(249, 250, 251);
          pdf.rect(margin, yPosition, totalWidth, rowHeight, 'F');
        }

        const engagement = getEngagement(payment.engagementId);
        const budgetLine = getBudgetLine(payment.budgetLineId);
        const subBudgetLine = getSubBudgetLine(payment.subBudgetLineId);
        const totalPaid = getTotalPaid(payment);
        const remaining = getRemainingAmount(payment);
        const progress = getPaymentProgress(payment);

        pdf.setFontSize(5.5);
        xPos = margin;

        // Fonction pour écrire du texte avec gestion des lignes multiples
        const writeCellText = (text: string, width: number, align: 'left' | 'right' = 'left') => {
          const maxWidth = width - 2;
          const lines = splitTextToLines(text, maxWidth, pdf);
          const totalLines = lines.length;
          const startY = yPosition + 3 + (rowHeight - totalLines * 3) / 2;
          
          lines.forEach((line, lineIndex) => {
            const y = startY + (lineIndex * 3);
            if (align === 'right') {
              pdf.text(line, xPos + width - 1, y, { align: 'right' });
            } else {
              pdf.text(line, xPos + 1, y);
            }
          });
        };

        // 1. N° Paiement
        writeCellText(payment.paymentNumber, columnWidths[0]);
        xPos += columnWidths[0];

        // 2. Date
        writeCellText(new Date(payment.date).toLocaleDateString('fr-FR'), columnWidths[1]);
        xPos += columnWidths[1];

        // 3. Engagement
        writeCellText(engagement?.engagementNumber || 'N/A', columnWidths[2]);
        xPos += columnWidths[2];

        // 4. Ligne Budgétaire
        const budgetLineText = budgetLine ? `${budgetLine.code} - ${budgetLine.name}` : 'N/A';
        writeCellText(budgetLineText, columnWidths[3]);
        xPos += columnWidths[3];

        // 5. Sous-Ligne
        const subBudgetLineText = subBudgetLine ? `${subBudgetLine.code} - ${subBudgetLine.name}` : 'N/A';
        writeCellText(subBudgetLineText, columnWidths[4]);
        xPos += columnWidths[4];

        // 6. Fournisseur
        writeCellText(payment.supplier || 'Non spécifié', columnWidths[5]);
        xPos += columnWidths[5];

        // 7. Montant (aligné à droite)
        writeCellText(`${formatAmount(payment.amount)} ${currencySymbol}`, columnWidths[6], 'right');
        xPos += columnWidths[6];

        // 8. Payé (aligné à droite)
        writeCellText(`${formatAmount(totalPaid)} ${currencySymbol}`, columnWidths[7], 'right');
        xPos += columnWidths[7];

        // 9. Reste (aligné à droite)
        writeCellText(`${formatAmount(remaining)} ${currencySymbol}`, columnWidths[8], 'right');
        xPos += columnWidths[8];

        // 10. Progression (aligné à droite)
        writeCellText(`${progress.toFixed(0)}%`, columnWidths[9], 'right');
        xPos += columnWidths[9];

        // 11. Statut
        writeCellText(statusLabels[payment.status] || payment.status, columnWidths[10]);

        yPosition += rowHeight;
      });

      // Ajouter une ligne de total
      if (yPosition + 8 > pageHeight - margin) {
        pdf.addPage();
        yPosition = margin;
        isFirstPage = false;
      }

      const totalAmount = dataToExport.reduce((sum, eng) => sum + eng.amount, 0);
      const totalPaidAmount = dataToExport.reduce((sum, eng) => sum + getTotalPaid(eng), 0);
      const totalRemainingAmount = dataToExport.reduce((sum, p) => sum + getRemainingAmount(p), 0);
      const overallProgress = totalAmount > 0 ? (totalPaidAmount / totalAmount) * 100 : 0;

      pdf.setFillColor(243, 244, 246);
      pdf.rect(margin, yPosition, totalWidth, 7, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(6);

      xPos = margin;
      const totalLabelWidth = columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + columnWidths[4] + columnWidths[5];
      pdf.text('TOTAL', xPos + 1, yPosition + 4.5);
      xPos += totalLabelWidth;

      pdf.text(`${formatAmount(totalAmount)} ${currencySymbol}`, xPos + columnWidths[6] - 1, yPosition + 4.5, { align: 'right' });
      xPos += columnWidths[6];

      pdf.text(`${formatAmount(totalPaidAmount)} ${currencySymbol}`, xPos + columnWidths[7] - 1, yPosition + 4.5, { align: 'right' });
      xPos += columnWidths[7];

      pdf.text(`${formatAmount(totalRemainingAmount)} ${currencySymbol}`, xPos + columnWidths[8] - 1, yPosition + 4.5, { align: 'right' });
      xPos += columnWidths[8];

      pdf.text(`${overallProgress.toFixed(0)}%`, xPos + columnWidths[9] - 1, yPosition + 4.5, { align: 'right' });

      // Numéros de page en bas
      const pageCount = pdf.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 100, 100);
        pdf.text(
          `Page ${i} sur ${pageCount}`,
          pageWidth / 2,
          pageHeight - 8,
          { align: 'center' }
        );
        pdf.text(
          `© ${new Date().getFullYear()} BudgetBase - Document généré automatiquement`,
          pageWidth / 2,
          pageHeight - 4,
          { align: 'center' }
        );
      }

      const suffix = exportAllData ? 'complet' : 'page';
      pdf.save(`paiements-${suffix}-${activeGrant?.reference || 'global'}-${new Date().toISOString().split('T')[0]}.pdf`);
      showSuccess('Export réussi', 'La liste des paiements a été exportée avec succès');
      
    } catch (error) {
      console.error('Erreur lors de la génération du PDF:', error);
      showError('Erreur', 'Erreur lors de la génération du PDF. Veuillez réessayer.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // 🎯 EXPORT EXCEL
  const exportToExcel = async (exportAllData: boolean = false) => {
    if (!canExport) {
      showError('Permission refusée', 'Vous n\'avez pas la permission d\'exporter des données');
      return;
    }

    setIsGeneratingExcel(true);
    
    try {
      const dataToExport = exportAllData ? sortedPayments : currentPayments;
      
      if (dataToExport.length === 0) {
        showWarning('Aucune donnée', 'Aucune donnée à exporter');
        return;
      }

      const statusLabels: Record<string, string> = {
        pending: 'En attente',
        approved: 'Approuvé',
        in_progress: 'En cours',
        paid: 'Payé',
        rejected: 'Rejeté'
      };

      const currencySymbol = getCurrencySymbol(activeGrant?.currency || 'EUR');

      const infoLines: string[] = [];
      if (activeGrant) {
        infoLines.push(`Subvention : ${activeGrant.name}`);
        infoLines.push(`Référence : ${activeGrant.reference}   •   Devise : ${activeGrant.currency}`);
      }
      infoLines.push(`Généré le : ${new Date().toLocaleDateString('fr-FR')}`);

      const dataRows = dataToExport.map((payment) => {
        const engagement = getEngagement(payment.engagementId);
        const budgetLine = getBudgetLine(payment.budgetLineId);
        const subBudgetLine = getSubBudgetLine(payment.subBudgetLineId);
        const totalPaid = getTotalPaid(payment);
        const remaining = getRemainingAmount(payment);
        const progress = getPaymentProgress(payment);

        return [
          payment.paymentNumber,
          new Date(payment.date).toLocaleDateString('fr-FR'),
          engagement?.engagementNumber || 'N/A',
          budgetLine ? `${budgetLine.code} - ${budgetLine.name}` : 'N/A',
          subBudgetLine ? `${subBudgetLine.code} - ${subBudgetLine.name}` : 'N/A',
          payment.supplier || 'Non spécifié',
          payment.description || '',
          `${payment.amount.toLocaleString('fr-FR')} ${currencySymbol}`,
          `${totalPaid.toLocaleString('fr-FR')} ${currencySymbol}`,
          `${remaining.toLocaleString('fr-FR')} ${currencySymbol}`,
          `${progress.toFixed(1)}%`,
          statusLabels[payment.status] || payment.status
        ];
      });

      const totalAmount = dataToExport.reduce((sum, eng) => sum + eng.amount, 0);
      const totalPaidAmount = dataToExport.reduce((sum, eng) => sum + getTotalPaid(eng), 0);
      const totalRemainingAmount = dataToExport.reduce((sum, p) => sum + getRemainingAmount(p), 0);
      const overallProgress = totalAmount > 0 ? (totalPaidAmount / totalAmount) * 100 : 0;

      const totalsRow = [
        'TOTAUX', '', '', '', '', '', '',
        `${totalAmount.toLocaleString('fr-FR')} ${currencySymbol}`,
        `${totalPaidAmount.toLocaleString('fr-FR')} ${currencySymbol}`,
        `${totalRemainingAmount.toLocaleString('fr-FR')} ${currencySymbol}`,
        `${overallProgress.toFixed(1)}%`,
        ''
      ];

      const suffix = exportAllData ? 'complet' : 'page';
      const fileName = `paiements-${suffix}-${activeGrant?.reference || 'global'}-${new Date().toISOString().split('T')[0]}.xlsx`;

      exportStyledExcel({
        fileName,
        sheetName: exportAllData ? 'Tous les paiements' : 'Paiements page',
        title: 'LISTE DES PAIEMENTS',
        infoLines,
        columns: [
          { header: 'N° Paiement', width: 18 },
          { header: 'Date', width: 15, align: 'center' },
          { header: 'Engagement', width: 18 },
          { header: 'Ligne Budgétaire', width: 30 },
          { header: 'Sous-Ligne Budgétaire', width: 30 },
          { header: 'Fournisseur', width: 25 },
          { header: 'Description Paiement', width: 50 },
          { header: 'Montant', width: 18, align: 'right' },
          { header: 'Payé', width: 18, align: 'right' },
          { header: 'Reste', width: 18, align: 'right' },
          { header: 'Progression', width: 12, align: 'center' },
          { header: 'Statut', width: 15, align: 'center' },
        ],
        rows: dataRows,
        totalsRow,
      });

      showSuccess('Export réussi', 'Le fichier Excel a été généré avec succès');
    } catch (error) {
      console.error('Erreur lors de l\'export Excel:', error);
      showError('Erreur', 'Impossible de générer le fichier Excel');
    } finally {
      setIsGeneratingExcel(false);
    }
  };

  // 🚨 VÉRIFICATIONS DE CHARGEMENT ET PERMISSIONS
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

  if (!hasModuleAccess('payments')) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <CreditCard className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Accès non autorisé</h2>
          <p className="text-gray-500">Vous n'avez pas les permissions nécessaires pour accéder à ce module.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gestion des Paiements</h2>
          <p className="text-gray-600 mt-1">Suivi et validation des paiements basés sur les engagements approuvés</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {canViewSignatureSection() && (
            <button
              type="button"
              onClick={() => setShowOnlyToSign(prev => !prev)}
              className={`rounded-lg px-4 py-2 border transition-colors flex items-center space-x-2 ${
                showOnlyToSign
                  ? 'bg-orange-600 border-orange-600 text-white'
                  : 'bg-orange-50 border-orange-200 text-orange-800 hover:bg-orange-100'
              }`}
              title="Afficher uniquement les paiements qui me restent à signer"
            >
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm font-medium">
                {showOnlyToSign ? 'Tout afficher' : `À signer (${toSignCount})`}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Barre de recherche et filtres */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <div className="relative">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
            <input
              type="text"
              placeholder="Rechercher paiement, fournisseur, engagement..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>
          
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value="all">Tous les statuts</option>
              <option value="pending">En attente</option>
              <option value="approved">Approuvé</option>
              <option value="in_progress">En cours</option>
              <option value="paid">Payé</option>
              <option value="rejected">Rejeté</option>
            </select>
          </div>

          <div>
            <select
              value={budgetLineFilter}
              onChange={(e) => setBudgetLineFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value="">Toutes les lignes</option>
              {budgetLines.map(line => (
                <option key={line.id} value={line.id}>{line.code} - {line.name}</option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={subBudgetLineFilter}
              onChange={(e) => setSubBudgetLineFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value="">Toutes les sous-lignes</option>
              {subBudgetLines
                .filter(line => !budgetLineFilter || line.budgetLineId === budgetLineFilter)
                .map(line => (
                  <option key={line.id} value={line.id}>{line.code} - {line.name}</option>
                ))
              }
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <input
              type="text"
              placeholder="Filtrer par fournisseur"
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>
          
          <div>
            <button
              onClick={() => setShowDateRange(!showDateRange)}
              className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <span className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {showDateRange ? 'Période personnalisée' : 'Filtrer par période'}
              </span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showDateRange ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {showDateRange && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date de début</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date de fin</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
          </div>
        )}
        
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-3">
          <div className="flex items-center space-x-4 text-sm text-gray-600">
            <span>{sortedPayments.length} paiement(s) trouvé(s)</span>
            {(searchTerm || statusFilter !== 'all' || showOnlyToSign || supplierFilter || budgetLineFilter || subBudgetLineFilter || startDate || endDate) && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                  setShowOnlyToSign(false);
                  setSupplierFilter('');
                  setBudgetLineFilter('');
                  setSubBudgetLineFilter('');
                  setStartDate('');
                  setEndDate('');
                  setShowDateRange(false);
                }}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                Réinitialiser les filtres
              </button>
            )}
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
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
              <option value="200">200</option>
              <option value="500">500</option>
            </select>
          </div>
        </div>
      </div>

      {/* Grant Information */}
      {activeGrant && (
        <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-2xl p-4 border border-green-200">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{activeGrant.name}</h3>
              <p className="text-gray-600 text-sm">{activeGrant.reference} - {activeGrant.grantingOrganization}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Devise</p>
              <p className="text-lg font-bold text-green-600">
                {activeGrant.currency} ({getCurrencySymbol(activeGrant.currency)})
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Engagements Disponibles</p>
              <p className="text-2xl font-bold text-blue-600">{filteredAvailableEngagements.length}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <CheckCircle className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">En Attente</p>
              <p className="text-2xl font-bold text-yellow-600">{pendingPayments.length}</p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-full">
              <Clock className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Approuvés</p>
              <p className="text-2xl font-bold text-blue-600">{approvedPayments.length}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <CheckCircle className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">En Cours</p>
              <p className="text-2xl font-bold text-purple-600">{inProgressPayments.length}</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <TrendingUp className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Payés</p>
              <p className="text-2xl font-bold text-green-600">{paidPayments.length}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <CreditCard className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Access to Create Payments */}
      {filteredAvailableEngagements.length > 0 && canCreate && (
        <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-2xl p-4 border border-green-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Plus className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Créer des Fiches de Paiement</h3>
                <p className="text-gray-600 text-sm">{filteredAvailableEngagements.length} engagement{filteredAvailableEngagements.length > 1 ? 's' : ''} prêt{filteredAvailableEngagements.length > 1 ? 's' : ''} pour paiement</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAvailableEngagements.slice(0, 6).map(engagement => {
              const budgetLine = getBudgetLine(engagement.budgetLineId);
              
              return (
                <div key={engagement.id} className="bg-white rounded-xl p-4 border border-gray-200 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-gray-900 text-sm truncate">{engagement.engagementNumber}</h4>
                      <p className="text-xs text-gray-600 truncate">{engagement.supplier || 'Fournisseur non spécifié'}</p>
                      <p className="text-xs text-gray-500 truncate">{budgetLine?.name || ''}</p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <p className="font-bold text-green-600 text-sm whitespace-nowrap">
                        {formatCurrency(engagement.amount)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => onCreatePaymentFromEngagement(engagement.id)}
                    className="w-full bg-gradient-to-r from-green-600 to-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:shadow-md transform hover:scale-[1.02] transition-all duration-200 flex items-center justify-center space-x-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Créer Fiche de Paiement</span>
                  </button>
                </div>
              );
            })}
          </div>
          
          {filteredAvailableEngagements.length > 6 && (
            <div className="mt-3 text-center">
              <p className="text-sm text-gray-600">
                Et {filteredAvailableEngagements.length - 6} autre{filteredAvailableEngagements.length - 6 > 1 ? 's' : ''} engagement{filteredAvailableEngagements.length - 6 > 1 ? 's' : ''} disponible{filteredAvailableEngagements.length - 6 > 1 ? 's' : ''}...
              </p>
            </div>
          )}
        </div>
      )}

      {/* Boutons d'export */}
      {canExport && sortedPayments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => exportToPDF(false)}
            disabled={isGeneratingPDF}
            className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-1 disabled:opacity-50"
          >
            <FileText className="w-4 h-4" />
            <span>PDF Page</span>
          </button>
          <button
            onClick={() => exportToPDF(true)}
            disabled={isGeneratingPDF}
            className="bg-blue-800 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-900 flex items-center gap-1 disabled:opacity-50"
          >
            <FileText className="w-4 h-4" />
            <span>PDF Complet</span>
          </button>
          <button
            onClick={() => exportToExcel(false)}
            disabled={isGeneratingExcel}
            className="bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-1 disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Excel Page</span>
          </button>
          <button
            onClick={() => exportToExcel(true)}
            disabled={isGeneratingExcel}
            className="bg-green-800 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-green-900 flex items-center gap-1 disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Excel Complet</span>
          </button>
        </div>
      )}

      {/* Payments List */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-4 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Liste des Paiements
              {selectedGrantId && (
                <span className="text-sm font-normal text-gray-600 ml-2">
                  ({sortedPayments.length} paiement{sortedPayments.length > 1 ? 's' : ''})
                </span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              {/* Bouton Tout développer / Tout réduire */}
              <button
                onClick={toggleAllRows}
                className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-1"
              >
                <ChevronsUpDown className="w-4 h-4" />
                {expandAll ? 'Tout réduire' : 'Tout développer'}
              </button>
            </div>
          </div>
        </div>
        
        {currentPayments.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <CreditCard className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm || statusFilter !== 'all' || supplierFilter || budgetLineFilter || subBudgetLineFilter || startDate || endDate 
                ? 'Aucun paiement ne correspond aux critères de recherche' 
                : selectedGrantId ? 'Aucun paiement pour cette subvention' : 'Aucun paiement'
              }
            </h3>
            <p className="text-gray-500">
              {searchTerm || statusFilter !== 'all' || supplierFilter || budgetLineFilter || subBudgetLineFilter || startDate || endDate
                ? 'Essayez de modifier vos critères de recherche'
                : selectedGrantId ? 'Aucun paiement n\'a été créé pour cette subvention' : 'Les paiements apparaîtront ici une fois créés'
              }
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th 
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                      onClick={() => handleSort('date')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Date</span>
                        {getSortIcon('date')}
                      </div>
                    </th>
                    <th 
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                      onClick={() => handleSort('paymentNumber')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Paiement</span>
                        {getSortIcon('paymentNumber')}
                      </div>
                    </th>
                    <th 
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                      onClick={() => handleSort('engagementNumber')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Engagement</span>
                        {getSortIcon('engagementNumber')}
                      </div>
                    </th>
                    <th 
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                      onClick={() => handleSort('supplier')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Fournisseur</span>
                        {getSortIcon('supplier')}
                      </div>
                    </th>
                    <th 
                      className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                      onClick={() => handleSort('amount')}
                    >
                      <div className="flex items-center justify-end space-x-1">
                        <span>Montant</span>
                        {getSortIcon('amount')}
                      </div>
                    </th>
                    {/* COLONNE : Payé */}
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      <span>Payé</span>
                    </th>
                    {/* COLONNE : Reste */}
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      <span>Reste</span>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      Signatures
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      Statut
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {currentPayments.map(payment => {
                    const engagement = getEngagement(payment.engagementId);
                    const budgetLine = getBudgetLine(payment.budgetLineId);
                    const isExpanded = expandedRows.has(payment.id);
                    const isFullyPaidStatus = isFullyPaid(payment);
                    const hasPartials = hasPartialPayments(payment);
                    const totalPaid = getTotalPaid(payment);
                    const remaining = getRemainingAmount(payment);
                    const progress = getPaymentProgress(payment);
                    
                    return (
                      <React.Fragment key={payment.id}>
                        <tr className={`hover:bg-gray-50 ${isFullyPaidStatus ? 'bg-green-50/30' : ''}`}>
                          <td className="px-4 py-4 text-sm text-gray-900 whitespace-nowrap">
                            {new Date(payment.date).toLocaleDateString('fr-FR')}
                          </td>
                          <td className="px-4 py-4">
                            <div 
                              className="cursor-pointer hover:text-blue-600 transition-colors"
                              onClick={() => toggleRowExpansion(payment.id)}
                            >
                              <div className="text-sm font-medium text-gray-900">
                                {payment.paymentNumber}
                              </div>
                              <div className="text-xs text-gray-400">
                                {payment.paymentMethod === 'check' ? 'Chèque' : 
                                payment.paymentMethod === 'transfer' ? 'Virement' : 'Espèces'}
                                {payment.checkNumber && ` N°${payment.checkNumber}`}
                              </div>
                              {hasPartials && (
                                <div className="text-xs text-purple-600 mt-1">
                                  {payment.partialPayments?.length || 0} paiement{payment.partialPayments?.length > 1 ? 's' : ''} partiel{payment.partialPayments?.length > 1 ? 's' : ''}
                                </div>
                              )}
                              {!isExpanded && (
                                <div className="text-xs text-blue-600 mt-1 flex items-center">
                                  <ChevronDown className="w-3 h-3 mr-1" />
                                  Voir plus
                                </div>
                              )}
                              {isExpanded && (
                                <div className="text-xs text-blue-600 mt-1 flex items-center">
                                  <ChevronUp className="w-3 h-3 mr-1" />
                                  Voir moins
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm text-gray-900">{engagement?.engagementNumber || 'N/A'}</div>
                            <div className="text-sm text-gray-500 truncate max-w-[120px]" title={budgetLine?.name}>
                              {budgetLine?.name || ''}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-900">
                            {payment.supplier}
                          </td>
                          <td className="px-4 py-4 text-right text-sm font-medium text-gray-900 whitespace-nowrap">
                            {formatCurrency(payment.amount)}
                          </td>
                          {/* COLONNE : Payé */}
                          <td className="px-4 py-4 text-right text-sm font-medium whitespace-nowrap">
                            {totalPaid > 0 ? (
                              <span className="text-green-600">{formatCurrency(totalPaid)}</span>
                            ) : (
                              <span className="text-gray-400">0</span>
                            )}
                            {isFullyPaidStatus && (
                              <div className="text-xs text-green-600 font-medium">
                                ✓ Payé
                              </div>
                            )}
                          </td>
                          {/* COLONNE : Reste */}
                          <td className="px-4 py-4 text-right text-sm font-medium whitespace-nowrap">
                            {remaining > 0 ? (
                              <span className="text-orange-600">{formatCurrency(remaining)}</span>
                            ) : (
                              <span className="text-green-600 font-medium">0</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-center">
                            <div className="flex items-center justify-center space-x-2">
                              {/* Signatures */}
                              <div className="relative group">
                                {getSignatureIcon(payment, 'supervisor1')}
                                {isSignatureRequired(payment, 'supervisor1') && (
                                  <div className="absolute -top-1 -right-1">
                                    <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                                  </div>
                                )}
                                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                                  Coordinateur de la Subvention
                                  {payment.approvals?.supervisor1?.name && (
                                    <div className="font-medium">{payment.approvals.supervisor1.name}</div>
                                  )}
                                  {payment.approvals?.supervisor1?.date && (
                                    <div className="text-gray-300">
                                      {new Date(payment.approvals.supervisor1.date).toLocaleDateString('fr-FR')}
                                    </div>
                                  )}
                                  {canSignPayment(payment, 'supervisor1') && (
                                    <button
                                      onClick={() => handleSignPayment(payment, 'supervisor1')}
                                      className="mt-1 bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700"
                                    >
                                      Signer
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div className="relative group">
                                {getSignatureIcon(payment, 'supervisor2')}
                                {isSignatureRequired(payment, 'supervisor2') && (
                                  <div className="absolute -top-1 -right-1">
                                    <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                                  </div>
                                )}
                                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                                  Comptable
                                  {payment.approvals?.supervisor2?.name && (
                                    <div className="font-medium">{payment.approvals.supervisor2.name}</div>
                                  )}
                                  {payment.approvals?.supervisor2?.date && (
                                    <div className="text-gray-300">
                                      {new Date(payment.approvals.supervisor2.date).toLocaleDateString('fr-FR')}
                                    </div>
                                  )}
                                  {canSignPayment(payment, 'supervisor2') && (
                                    <button
                                      onClick={() => handleSignPayment(payment, 'supervisor2')}
                                      className="mt-1 bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700"
                                    >
                                      Signer
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div className="relative group">
                                {getSignatureIcon(payment, 'finalApproval')}
                                {isSignatureRequired(payment, 'finalApproval') && (
                                  <div className="absolute -top-1 -right-1">
                                    <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                                  </div>
                                )}
                                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                                  Coordonnateur National
                                  {payment.approvals?.finalApproval?.name && (
                                    <div className="font-medium">{payment.approvals.finalApproval.name}</div>
                                  )}
                                  {payment.approvals?.finalApproval?.date && (
                                    <div className="text-gray-300">
                                      {new Date(payment.approvals.finalApproval.date).toLocaleDateString('fr-FR')}
                                    </div>
                                  )}
                                  {canSignPayment(payment, 'finalApproval') && (
                                    <button
                                      onClick={() => handleSignPayment(payment, 'finalApproval')}
                                      className="mt-1 bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700"
                                    >
                                      Signer
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-center">
                            {renderStatus(payment)}
                          </td>
                          <td className="px-4 py-4 text-center">
                            <div className="flex items-center justify-center space-x-1">
                              {canEditPayment(payment) && (
                                <button
                                  onClick={() => onEditPayment(payment.id)}
                                  className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                  title="Modifier le paiement"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                              )}

                              {canView && (
                                <button
                                  onClick={() => onViewPaymentDetails(payment.id)}
                                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Voir les détails"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              )}

                              {renderAddPartialPaymentButton(payment)}
                            </div>
                          </td>
                        </tr>
                        
                        {/* Ligne détaillée expandable avec barre de progression */}
                        {isExpanded && (
                          <tr className="bg-blue-50">
                            <td colSpan={10} className="px-4 py-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                <div>
                                  <h4 className="font-semibold text-gray-900 mb-2">Détails de l'engagement</h4>
                                  <div className="space-y-1">
                                    <p><span className="font-medium">Numéro:</span> {engagement?.engagementNumber}</p>
                                    <p><span className="font-medium">Ligne budgétaire:</span> {budgetLine?.name}</p>
                                    <p><span className="font-medium">Description:</span> {engagement?.description}</p>
                                    <p><span className="font-medium">Date création:</span> {engagement?.date ? new Date(engagement.date).toLocaleDateString('fr-FR') : 'N/A'}</p>
                                  </div>
                                </div>
                                <div>
                                  <h4 className="font-semibold text-gray-900 mb-2">Détails du paiement</h4>
                                  <div className="space-y-1">
                                    <p><span className="font-medium">Description:</span> {payment.description}</p>
                                    <p><span className="font-medium">Mode de paiement:</span> {payment.paymentMethod === 'check' ? 'Chèque' : payment.paymentMethod === 'transfer' ? 'Virement' : 'Espèces'}</p>
                                    {payment.checkNumber && <p><span className="font-medium">N° chèque:</span> {payment.checkNumber}</p>}
                                    <p><span className="font-medium">Montant total:</span> {formatCurrency(payment.amount)}</p>
                                    <p><span className="font-medium">Payé:</span> {formatCurrency(getTotalPaid(payment))}</p>
                                    <p><span className="font-medium">Reste:</span> {formatCurrency(getRemainingAmount(payment))}</p>
                                  </div>
                                  {/* Barre de progression dans les détails */}
                                  <div className="mt-3">
                                    <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                                      <span>Progression</span>
                                      <span>{progress.toFixed(0)}%</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                                      <div 
                                        className={`h-2.5 rounded-full transition-all duration-300 ${
                                          isFullyPaidStatus ? 'bg-green-600' : 
                                          progress > 0 ? 'bg-blue-600' : 'bg-gray-400'
                                        }`}
                                        style={{ width: `${Math.min(progress, 100)}%` }}
                                      />
                                    </div>
                                  </div>
                                  {hasPartials && (
                                    <div className="mt-3">
                                      <h4 className="font-semibold text-gray-900 mb-2">Paiements partiels</h4>
                                      <div className="space-y-2 max-h-32 overflow-y-auto">
                                        {payment.partialPayments?.map((pp, index) => (
                                          <div key={index} className="bg-white p-2 rounded border border-gray-200 text-xs">
                                            <div className="flex justify-between">
                                              <span className="font-medium">{pp.reference}</span>
                                              <span className="text-green-600 font-bold">{formatCurrency(pp.amount)}</span>
                                            </div>
                                            <div className="flex justify-between text-gray-500">
                                              <span>{new Date(pp.date).toLocaleDateString('fr-FR')}</span>
                                              <span>{pp.paymentMethod === 'check' ? 'Chèque' : pp.paymentMethod === 'transfer' ? 'Virement' : 'Espèces'}</span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 py-4 border-t border-gray-200 gap-4 bg-gray-50">
                <div className="text-sm text-gray-700">
                  Affichage de {startIndex + 1} à {Math.min(endIndex, sortedPayments.length)} sur {sortedPayments.length} paiements
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={goToPreviousPage}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed rounded border border-gray-300 flex items-center"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Précédent
                  </button>
                  
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }

                    return (
                      <button
                        key={pageNum}
                        onClick={() => goToPage(pageNum)}
                        className={`px-3 py-1 text-sm rounded min-w-[40px] ${
                          currentPage === pageNum
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-300'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  
                  <button
                    onClick={goToNextPage}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed rounded border border-gray-300 flex items-center"
                  >
                    Suivant
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>


      {/* Modal - Paiement Partiel */}
      {showPartialPaymentForm && selectedPaymentForPartial && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Ajouter un paiement partiel</h3>
                <p className="text-sm text-gray-600">
                  {selectedPaymentForPartial.paymentNumber} - {selectedPaymentForPartial.supplier}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowPartialPaymentForm(false);
                  setSelectedPaymentForPartial(null);
                }}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddPartialPayment} className="space-y-4">
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Montant total:</span>
                  <span className="font-bold">{formatCurrency(selectedPaymentForPartial.amount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Déjà payé:</span>
                  <span className="font-bold text-green-600">{formatCurrency(getTotalPaid(selectedPaymentForPartial))}</span>
                </div>
                <div className="flex justify-between text-sm font-medium border-t pt-2 mt-2">
                  <span className="text-gray-700">Reste à payer:</span>
                  <span className="font-bold text-purple-600">{formatCurrency(getRemainingAmount(selectedPaymentForPartial))}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Montant de ce paiement *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={getRemainingAmount(selectedPaymentForPartial)}
                    value={partialPaymentData.amount}
                    onChange={(e) => setPartialPaymentData(prev => ({ ...prev, amount: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="0.00"
                    required
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Maximum: {formatCurrency(getRemainingAmount(selectedPaymentForPartial))}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date du paiement *
                </label>
                <input
                  type="date"
                  value={partialPaymentData.date}
                  onChange={(e) => setPartialPaymentData(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Mode de paiement *
                </label>
                <select
                  value={partialPaymentData.paymentMethod}
                  onChange={(e) => setPartialPaymentData(prev => ({ 
                    ...prev, 
                    paymentMethod: e.target.value as 'transfer' | 'check' | 'cash' 
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  required
                >
                  <option value="transfer">Virement bancaire</option>
                  <option value="check">Chèque</option>
                  <option value="cash">Espèces</option>
                </select>
              </div>

              {partialPaymentData.paymentMethod === 'check' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Numéro de chèque
                  </label>
                  <input
                    type="text"
                    value={partialPaymentData.checkNumber}
                    onChange={(e) => setPartialPaymentData(prev => ({ ...prev, checkNumber: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="N° de chèque"
                  />
                </div>
              )}

              {partialPaymentData.paymentMethod === 'transfer' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Référence virement
                  </label>
                  <input
                    type="text"
                    value={partialPaymentData.bankReference}
                    onChange={(e) => setPartialPaymentData(prev => ({ ...prev, bankReference: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="Référence du virement"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Référence du paiement partiel *
                </label>
                <input
                  type="text"
                  value={partialPaymentData.reference}
                  onChange={(e) => setPartialPaymentData(prev => ({ ...prev, reference: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Ex: PART-2024-001"
                  required
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowPartialPaymentForm(false);
                    setSelectedPaymentForPartial(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:shadow-lg transition-all duration-200"
                >
                  Ajouter le paiement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentManager;