import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Banknote, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Filter,
  X,
  Download,
  CreditCard,
  ArrowRight,
  Search,
  Clock,
  DollarSign,
  FileText,
  Wallet,
  Eye
} from 'lucide-react';
import { showSuccess, showValidationError, showError, showWarning } from '../utils/alerts';
import { Payment, BankTransaction, PAYMENT_STATUS, Grant, PartialPayment } from '../types';
import { usePermissions } from '../hooks/usePermissions';
import jsPDF from 'jspdf';

interface TreasuryManagerProps {
  payments: Payment[];
  bankTransactions: BankTransaction[];
  selectedGrant?: Grant;
  onAddBankTransaction: (transaction: Omit<BankTransaction, 'id'>) => void;
  onUpdateGrant: (id: string, updates: Partial<Grant>) => void;
  onUpdatePayment?: (id: string, updates: Partial<Payment>) => void;
  onAddPartialPayment?: (paymentId: string, partialPayment: Omit<PartialPayment, 'id'>) => void;
}

type SortField = 'date' | 'description' | 'amount' | 'type';
type SortDirection = 'asc' | 'desc';

// Interface pour le formulaire de paiement échelonné
interface PartialPaymentFormData {
  amount: string;
  date: string;
  paymentMethod: 'transfer' | 'check' | 'cash';
  checkNumber: string;
  bankReference: string;
  reference: string;
  description: string;
}

// Interface pour le formulaire de paiement complet
interface FullPaymentFormData {
  date: string;
  reference: string;
  description: string;
}

const TreasuryManager: React.FC<TreasuryManagerProps> = ({
  payments,
  bankTransactions,
  selectedGrant,
  onAddBankTransaction,
  onUpdateGrant,
  onUpdatePayment,
  onAddPartialPayment
}) => {
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [showPartialPaymentForm, setShowPartialPaymentForm] = useState(false);
  
  // États pour la pagination et le tri
  const [currentPage, setCurrentPage] = useState(1);
  const [transactionsPerPage, setTransactionsPerPage] = useState(10);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  
  // États pour les filtres
  const [dateFilter, setDateFilter] = useState<string>('');
  // Tri périodique des transactions (plage Du → Au)
  const [txDateFrom, setTxDateFrom] = useState<string>('');
  const [txDateTo, setTxDateTo] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [descriptionFilter, setDescriptionFilter] = useState<string>('');
  
  // États pour les paiements non décaissés
  const [paymentTab, setPaymentTab] = useState<'approved' | 'in_progress'>('approved');
  const [paymentSearchTerm, setPaymentSearchTerm] = useState('');
  
  // État pour le paiement sélectionné
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  // État pour l'affichage du détail d'un paiement à décaisser
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);
  
  // Vérification des permissions
  const { hasPermission, hasModuleAccess, loading: permissionsLoading } = usePermissions();

  // Utiliser directement le compte bancaire de la subvention sélectionnée
  const grantBankAccount = selectedGrant?.bankAccount;

  // Créer un objet compte bancaire virtuel pour la subvention
  const virtualBankAccount = grantBankAccount ? {
    id: `grant-${selectedGrant?.id}`,
    name: grantBankAccount.name,
    bankName: grantBankAccount.bankName,
    accountNumber: grantBankAccount.accountNumber,
    balance: grantBankAccount.balance || 0,
    currency: selectedGrant?.currency || 'EUR',
    lastUpdateDate: grantBankAccount.lastUpdateDate || new Date().toISOString()
  } : null;

  const filteredBankAccounts = virtualBankAccount ? [virtualBankAccount] : [];

  // Formulaire pour les transactions simples (non liées à un paiement)
  const [transactionFormData, setTransactionFormData] = useState({
    grantId: selectedGrant ? selectedGrant.id : '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    type: 'debit' as 'credit' | 'debit',
    reference: '',
    paymentId: ''
  });

  // Formulaire pour les paiements échelonnés
  const [partialPaymentFormData, setPartialPaymentFormData] = useState<PartialPaymentFormData>({
    amount: '',
    date: new Date().toISOString().split('T')[0],
    paymentMethod: 'transfer',
    checkNumber: '',
    bankReference: '',
    reference: '',
    description: ''
  });

  // Formulaire pour les paiements complets
  const [fullPaymentFormData, setFullPaymentFormData] = useState<FullPaymentFormData>({
    date: new Date().toISOString().split('T')[0],
    reference: '',
    description: ''
  });

  // Rapprochement bancaire : le décaissement attend-il un rapprochement ? (défaut : oui)
  const [partialNeedsReconciliation, setPartialNeedsReconciliation] = useState(true);
  const [fullNeedsReconciliation, setFullNeedsReconciliation] = useState(true);

  // Mettre à jour grantId quand selectedGrant change
  useEffect(() => {
    if (selectedGrant) {
      setTransactionFormData(prev => ({
        ...prev,
        grantId: selectedGrant.id
      }));
    }
  }, [selectedGrant]);

  // ============================================
  // FONCTIONS DE CALCUL DES PAIEMENTS PARTIELS
  // ============================================

  const getTotalPaid = (payment: Payment): number => {
    if (!payment.partialPayments || payment.partialPayments.length === 0) {
      return 0;
    }
    return payment.partialPayments.reduce((sum, pp) => sum + pp.amount, 0);
  };

  const getRemainingAmount = (payment: Payment): number => {
    const totalPaid = getTotalPaid(payment);
    return payment.amount - totalPaid;
  };

  const isFullyPaid = (payment: Payment): boolean => {
    return getRemainingAmount(payment) <= 0;
  };

  const hasPartialPayments = (payment: Payment): boolean => {
    return payment.partialPayments && payment.partialPayments.length > 0;
  };

  const getPaymentProgress = (payment: Payment): number => {
    if (payment.amount === 0) return 0;
    const totalPaid = getTotalPaid(payment);
    return Math.min((totalPaid / payment.amount) * 100, 100);
  };

  // Vérifie l'unicité d'un numéro de chèque sur l'ensemble des paiements et paiements partiels
  const isCheckNumberUsed = (value: string): boolean => {
    const target = value.trim().toLowerCase();
    if (!target) return false;
    return payments.some(p =>
      (p.checkNumber && p.checkNumber.trim().toLowerCase() === target) ||
      (p.partialPayments || []).some(pp => pp.checkNumber && pp.checkNumber.trim().toLowerCase() === target)
    );
  };

  // Vérifie l'unicité d'une référence de virement sur l'ensemble des paiements et paiements partiels
  const isBankReferenceUsed = (value: string): boolean => {
    const target = value.trim().toLowerCase();
    if (!target) return false;
    return payments.some(p =>
      (p.bankReference && p.bankReference.trim().toLowerCase() === target) ||
      (p.partialPayments || []).some(pp => pp.bankReference && pp.bankReference.trim().toLowerCase() === target)
    );
  };

  // Calcul des paiements pour chaque onglet
  const approvedPayments = useMemo(() => {
    return payments.filter(p =>
      p.grantId === selectedGrant?.id &&
      p.status === 'approved' &&
      !hasPartialPayments(p) &&
      !p.isScheduled              // ✅ une fiche marquée "échelonnée" va dans l'onglet "En cours"
    );
  }, [payments, selectedGrant]);

  const inProgressPayments = useMemo(() => {
    return payments.filter(p => {
      if (p.grantId !== selectedGrant?.id) return false;
      if (p.status === 'rejected' || p.status === 'paid') return false;
      // Soit le statut est in_progress, soit il est approved et a des paiements partiels avec reste > 0
      if (p.status === 'in_progress') return true;
      // ✅ Échelonné dès le départ : dès qu'il est approuvé, il apparaît en "En cours"
      if (p.status === 'approved' && p.isScheduled) return true;
      if (p.status === 'approved' && hasPartialPayments(p) && getRemainingAmount(p) > 0) return true;
      return false;
    });
  }, [payments, selectedGrant]);

  // Pour l'affichage selon l'onglet
  const displayedPayments = paymentTab === 'approved' ? approvedPayments : inProgressPayments;

  // Le rapprochement bancaire est désormais géré dans le menu dédié (ReconciliationManager).

  // ============================================
  // OUVERTURE DES FORMULAIRES
  // ============================================

  const openPartialPaymentForm = (payment: Payment) => {
    if (payment.status !== 'approved' && payment.status !== 'in_progress') {
      showWarning('Paiement non éligible', 'Seuls les paiements approuvés ou en cours peuvent être décaissés.');
      return;
    }

    const remaining = getRemainingAmount(payment);
    if (remaining <= 0) {
      showWarning('Paiement déjà complété', 'Ce paiement a déjà été entièrement décaissé.');
      return;
    }

    setSelectedPayment(payment);
    
    // Pré-remplir le formulaire avec les infos du paiement original
    setPartialPaymentFormData({
      amount: remaining.toString(),
      date: new Date().toISOString().split('T')[0],
      paymentMethod: payment.paymentMethod || 'transfer',
      checkNumber: '',
      bankReference: '',
      reference: `PART-${payment.paymentNumber}-${Date.now().toString().slice(-4)}`,
      description: `Paiement partiel - ${payment.paymentNumber} - ${payment.supplier}`
    });
    
    setShowPartialPaymentForm(true);
  };

  const openFullPaymentForm = (payment: Payment) => {
    if (payment.status !== 'approved' && payment.status !== 'in_progress') {
      showWarning('Paiement non éligible', 'Seuls les paiements approuvés ou en cours peuvent être décaissés.');
      return;
    }

    const remaining = getRemainingAmount(payment);
    if (remaining <= 0) {
      showWarning('Paiement déjà complété', 'Ce paiement a déjà été entièrement décaissé.');
      return;
    }

    setSelectedPayment(payment);
    
    // Pré-remplir le formulaire avec les infos du paiement original
    setFullPaymentFormData({
      date: new Date().toISOString().split('T')[0],
      reference: payment.checkNumber || payment.bankReference || `PAY-${payment.paymentNumber}`,
      description: `Décaissement complet - ${payment.paymentNumber} - ${payment.supplier}`
    });
    
    setShowTransactionForm(true);
  };

  // ============================================
  // SOUMISSION DES FORMULAIRES
  // ============================================

  // Soumission du formulaire de paiement échelonné
  const handlePartialPaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedPayment) {
      showError('Erreur', 'Aucun paiement sélectionné');
      return;
    }

    const amount = parseFloat(partialPaymentFormData.amount);
    if (isNaN(amount) || amount <= 0) {
      showValidationError('Montant invalide', 'Veuillez saisir un montant valide supérieur à 0');
      return;
    }

    const remaining = getRemainingAmount(selectedPayment);
    if (amount > remaining) {
      showValidationError('Montant trop élevé', `Le montant saisi dépasse le montant restant (${formatCurrency(remaining)})`);
      return;
    }

    if (!partialPaymentFormData.reference.trim()) {
      showValidationError('Référence manquante', 'Veuillez saisir une référence pour ce paiement partiel');
      return;
    }

    // Validation pour le mode de paiement
    if (partialPaymentFormData.paymentMethod === 'check' && !partialPaymentFormData.checkNumber.trim()) {
      showValidationError('Numéro de chèque requis', 'Veuillez saisir le numéro du chèque');
      return;
    }

    if (partialPaymentFormData.paymentMethod === 'transfer' && !partialPaymentFormData.bankReference.trim()) {
      showValidationError('Référence virement requise', 'Veuillez saisir la référence du virement');
      return;
    }

    // ✅ Unicité du numéro de chèque / référence de virement
    if (partialPaymentFormData.paymentMethod === 'check' && isCheckNumberUsed(partialPaymentFormData.checkNumber)) {
      showValidationError('Numéro de chèque déjà utilisé', `Le numéro de chèque "${partialPaymentFormData.checkNumber}" est déjà utilisé par un autre paiement. Veuillez en saisir un unique.`);
      return;
    }
    if (partialPaymentFormData.paymentMethod === 'transfer' && isBankReferenceUsed(partialPaymentFormData.bankReference)) {
      showValidationError('Référence de virement déjà utilisée', `La référence de virement "${partialPaymentFormData.bankReference}" est déjà utilisée par un autre paiement. Veuillez en saisir une unique.`);
      return;
    }

    // Créer l'objet paiement partiel AVEC un ID (pour correspondre au type PartialPayment)
    const partialPayment: PartialPayment = {
      id: `pp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      amount: amount,
      date: partialPaymentFormData.date,
      paymentMethod: partialPaymentFormData.paymentMethod,
      checkNumber: partialPaymentFormData.paymentMethod === 'check' ? partialPaymentFormData.checkNumber : undefined,
      bankReference: partialPaymentFormData.paymentMethod === 'transfer' ? partialPaymentFormData.bankReference : undefined,
      reference: partialPaymentFormData.reference,
      needsReconciliation: partialPaymentFormData.paymentMethod === 'cash' ? false : partialNeedsReconciliation,
      reconciled: false
    };

    // Construire le nouveau tableau de paiements partiels
    const updatedPartialPayments = [
      ...(selectedPayment.partialPayments || []),
      partialPayment
    ];

    // Calculer le nouveau statut
    const newTotalPaid = getTotalPaid(selectedPayment) + amount;
    const newRemaining = selectedPayment.amount - newTotalPaid;
    let newStatus: Payment['status'];
    if (newRemaining <= 0) newStatus = 'paid';
    else if (newTotalPaid > 0) newStatus = 'in_progress';
    else newStatus = selectedPayment.status;

    // Mettre à jour le paiement via onUpdatePayment (qui renomme partialPayments → partial_payments)
    if (onUpdatePayment) {
      onUpdatePayment(selectedPayment.id, {
        status: newStatus,
        partialPayments: updatedPartialPayments,
        // NE PAS envoyer cashedDate
      });
    }

    // Créer la transaction bancaire
    const transactionData = {
      grantId: selectedPayment.grantId,
      date: partialPaymentFormData.date,
      description: partialPaymentFormData.description || `Paiement partiel - ${selectedPayment.paymentNumber}`,
      amount: amount,
      type: 'debit' as 'debit',
      // Référence bancaire réelle (n° chèque / réf. virement) plutôt que la référence interne auto
      reference: partialPaymentFormData.paymentMethod === 'check'
        ? (partialPaymentFormData.checkNumber || partialPaymentFormData.reference)
        : partialPaymentFormData.paymentMethod === 'transfer'
        ? (partialPaymentFormData.bankReference || partialPaymentFormData.reference)
        : partialPaymentFormData.reference,
      paymentId: selectedPayment.id
    };
    onAddBankTransaction(transactionData);
    updateGrantBankAccountBalance(amount, 'debit');

    showSuccess('Paiement partiel ajouté', `Le paiement partiel de ${formatCurrency(amount)} a été enregistré avec succès`);
    
    // Réinitialiser le formulaire
    resetPartialPaymentForm();
  };

  // Soumission du formulaire de paiement complet
  const handleFullPaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedPayment) {
      showError('Erreur', 'Aucun paiement sélectionné');
      return;
    }

    const amount = getRemainingAmount(selectedPayment);
    if (amount <= 0) {
      showValidationError('Paiement déjà complété', 'Ce paiement a déjà été entièrement décaissé.');
      return;
    }

    if (!fullPaymentFormData.reference.trim()) {
      showValidationError('Référence manquante', 'Veuillez saisir une référence pour ce paiement');
      return;
    }

    // Créer le paiement partiel (complet) avec ID
    const partialPayment: PartialPayment = {
      id: `pp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      amount: amount,
      date: fullPaymentFormData.date,
      paymentMethod: selectedPayment.paymentMethod || 'transfer',
      checkNumber: selectedPayment.paymentMethod === 'check' ? selectedPayment.checkNumber : undefined,
      bankReference: selectedPayment.paymentMethod === 'transfer' ? selectedPayment.bankReference : undefined,
      reference: fullPaymentFormData.reference,
      needsReconciliation: selectedPayment.paymentMethod === 'cash' ? false : fullNeedsReconciliation,
      reconciled: false
    };

    const updatedPartialPayments = [
      ...(selectedPayment.partialPayments || []),
      partialPayment
    ];

    // Mettre à jour le paiement
    if (onUpdatePayment) {
      onUpdatePayment(selectedPayment.id, {
        status: 'paid',
        partialPayments: updatedPartialPayments,
        needsReconciliation: selectedPayment.paymentMethod === 'cash' ? false : fullNeedsReconciliation,
        reconciled: false,
        // NE PAS envoyer cashedDate
      });
    }

    // Créer la transaction bancaire
    const transactionData = {
      grantId: selectedPayment.grantId,
      date: fullPaymentFormData.date,
      description: fullPaymentFormData.description || `Décaissement - ${selectedPayment.paymentNumber}`,
      amount: amount,
      type: 'debit' as 'debit',
      // Référence bancaire réelle (n° chèque / réf. virement) si disponible
      reference: selectedPayment.paymentMethod === 'check'
        ? (selectedPayment.checkNumber || fullPaymentFormData.reference)
        : selectedPayment.paymentMethod === 'transfer'
        ? (selectedPayment.bankReference || fullPaymentFormData.reference)
        : fullPaymentFormData.reference,
      paymentId: selectedPayment.id
    };
    onAddBankTransaction(transactionData);
    updateGrantBankAccountBalance(amount, 'debit');

    showSuccess('Paiement décaissé', `Le paiement ${selectedPayment.paymentNumber} a été entièrement décaissé`);
    
    resetFullPaymentForm();
  };

  // Soumission du formulaire de transaction simple
  const handleTransactionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedGrant) {
      showValidationError('Subvention manquante', 'Aucune subvention sélectionnée');
      return;
    }
    
    if (!transactionFormData.description.trim()) {
      showValidationError('Description manquante', 'Veuillez saisir une description pour la transaction');
      return;
    }
    
    if (!transactionFormData.amount || parseFloat(transactionFormData.amount) <= 0) {
      showValidationError('Montant invalide', 'Veuillez saisir un montant valide supérieur à 0');
      return;
    }

    const amount = parseFloat(transactionFormData.amount);
    
    const transactionData = {
      grantId: transactionFormData.grantId,
      date: transactionFormData.date,
      description: transactionFormData.description.trim(),
      amount: amount,
      type: transactionFormData.type,
      reference: transactionFormData.reference.trim(),
      paymentId: transactionFormData.paymentId || undefined
    };

    onAddBankTransaction(transactionData);
    updateGrantBankAccountBalance(amount, transactionFormData.type);
    
    showSuccess('Transaction ajoutée', 'La transaction a été ajoutée avec succès');
    resetTransactionForm();
  };

  
  // ============================================
  // RÉINITIALISATION DES FORMULAIRES
  // ============================================

  const resetPartialPaymentForm = () => {
    setPartialPaymentFormData({
      amount: '',
      date: new Date().toISOString().split('T')[0],
      paymentMethod: 'transfer',
      checkNumber: '',
      bankReference: '',
      reference: '',
      description: ''
    });
    setSelectedPayment(null);
    setShowPartialPaymentForm(false);
    setPartialNeedsReconciliation(true);
  };

  const resetFullPaymentForm = () => {
    setFullPaymentFormData({
      date: new Date().toISOString().split('T')[0],
      reference: '',
      description: ''
    });
    setSelectedPayment(null);
    setShowTransactionForm(false);
    setFullNeedsReconciliation(true);
  };

  const resetTransactionForm = () => {
    setTransactionFormData({
      grantId: selectedGrant ? selectedGrant.id : '',
      date: new Date().toISOString().split('T')[0],
      description: '',
      amount: '',
      type: 'debit' as 'credit' | 'debit',
      reference: '',
      paymentId: ''
    });
    setShowTransactionForm(false);
  };

  // ============================================
  // MISE À JOUR DU SOLDE
  // ============================================

  const updateGrantBankAccountBalance = (amount: number, type: 'credit' | 'debit') => {
    if (!selectedGrant || !selectedGrant.bankAccount) return;

    const currentBalance = selectedGrant.bankAccount.balance || 0;
    const newBalance = type === 'credit' 
      ? currentBalance + amount 
      : currentBalance - amount;

    onUpdateGrant(selectedGrant.id, {
      bankAccount: {
        ...selectedGrant.bankAccount,
        balance: newBalance,
        lastUpdateDate: new Date().toISOString()
      }
    });
  };

  // ============================================
  // FONCTIONS DE GESTION DES TRANSACTIONS
  // ============================================

  const getGrantTransactions = (grantId: string) => {
    return bankTransactions.filter(transaction => transaction.grantId === grantId);
  };

  const sortTransactions = (transactions: BankTransaction[]) => {
    return [...transactions].sort((a, b) => {
      let aValue, bValue;
      
      switch (sortField) {
        case 'date':
          aValue = new Date(a.date).getTime();
          bValue = new Date(b.date).getTime();
          break;
        case 'amount':
          aValue = a.amount;
          bValue = b.amount;
          break;
        case 'description':
          aValue = a.description.toLowerCase();
          bValue = b.description.toLowerCase();
          break;
        case 'type':
          aValue = a.type;
          bValue = b.type;
          break;
        default:
          return 0;
      }
      
      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
  };

  const filterTransactions = (transactions: BankTransaction[]) => {
    return transactions.filter(transaction => {
      const transactionDate = new Date(transaction.date).toISOString().split('T')[0];
      // Tri périodique : plage Du → Au
      if (txDateFrom && transactionDate < txDateFrom) return false;
      if (txDateTo && transactionDate > txDateTo) return false;

      if (typeFilter !== 'all' && transaction.type !== typeFilter) {
        return false;
      }
      
      if (descriptionFilter && !transaction.description.toLowerCase().includes(descriptionFilter.toLowerCase())) {
        return false;
      }
      
      return true;
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setCurrentPage(1);
  };

  const getFilteredAndSortedTransactions = () => {
    if (!selectedGrant) return [];
    
    const grantTransactions = getGrantTransactions(selectedGrant.id);
    const filtered = filterTransactions(grantTransactions);
    return sortTransactions(filtered);
  };

  // Pagination
  const allTransactions = getFilteredAndSortedTransactions();
  const totalTransactions = allTransactions.length;
  const totalPages = Math.ceil(totalTransactions / transactionsPerPage);
  
  const indexOfLastTransaction = currentPage * transactionsPerPage;
  const indexOfFirstTransaction = indexOfLastTransaction - transactionsPerPage;
  const currentTransactions = allTransactions.slice(indexOfFirstTransaction, indexOfLastTransaction);

  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const resetFilters = () => {
    setDateFilter('');
    setTxDateFrom('');
    setTxDateTo('');
    setTypeFilter('all');
    setDescriptionFilter('');
    setCurrentPage(1);
  };

  // ============================================
  // FONCTIONS D'AFFICHAGE
  // ============================================

  const formatCurrency = (amount: number) => {
    if (!selectedGrant) return amount.toLocaleString('fr-FR');
    
    return amount.toLocaleString('fr-FR', { 
      style: 'currency', 
      currency: selectedGrant.currency === 'XOF' ? 'XOF' : selectedGrant.currency,
      minimumFractionDigits: selectedGrant.currency === 'XOF' ? 0 : 2
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR');
  };

  const getCurrencySymbol = (currency: string) => {
    switch (currency) {
      case 'EUR': return '€';
      case 'USD': return '$';
      case 'XOF': return 'FCFA';
      default: return '€';
    }
  };

  const formatCurrencyForPDF = (amount: number) => {
    if (!selectedGrant) return amount.toLocaleString('fr-FR');
    
    return amount.toLocaleString('fr-FR', { 
      minimumFractionDigits: selectedGrant.currency === 'XOF' ? 0 : 2,
      maximumFractionDigits: selectedGrant.currency === 'XOF' ? 0 : 2
    }).replace(/\s/g, ' ');
  };

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case 'transfer': return 'Virement bancaire';
      case 'check': return 'Chèque';
      case 'cash': return 'Espèces';
      default: return method;
    }
  };

  // ============================================
  // EXPORT PDF (simplifié pour garder la même logique)
  // ============================================

  // Fonction d'exportation en PDF
  const exportToPDF = async () => {
    try {
      showSuccess('Génération du PDF', 'Le PDF est en cours de génération...');

      const totalTransactionsCount = allTransactions.length;
      const totalCredits = allTransactions
        .filter(t => t.type === 'credit')
        .reduce((sum, t) => sum + t.amount, 0);
      const totalDebits = allTransactions
        .filter(t => t.type === 'debit')
        .reduce((sum, t) => sum + t.amount, 0);
      const netBalance = totalCredits - totalDebits;

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      
      const margin = {
        top: 25,
        right: 15,
        bottom: 20,
        left: 15
      };
      
      const contentWidth = pageWidth - margin.left - margin.right;
      let yPosition = margin.top;

      const addLogoToPDF = () => {
        return new Promise<number>((resolve) => {
          try {
            const logoImg = new Image();
            logoImg.src = '/budgetbase/logo.png';
            
            logoImg.onload = () => {
              try {
                const logoWidth = 30;
                const logoHeight = (logoImg.height * logoWidth) / logoImg.width;
                
                pdf.addImage(
                  logoImg, 
                  'PNG', 
                  margin.left, 
                  8,
                  logoWidth, 
                  logoHeight
                );
                resolve(logoHeight);
              } catch (error) {
                console.warn('Erreur lors de l\'ajout du logo:', error);
                resolve(0);
              }
            };

            logoImg.onerror = () => {
              console.warn('Logo non trouvé, continuation sans logo');
              resolve(0);
            };

            setTimeout(() => resolve(0), 2000);
          } catch (error) {
            console.warn('Erreur lors du chargement du logo:', error);
            resolve(0);
          }
        });
      };

      const logoHeight = await addLogoToPDF();
      const headerY = logoHeight > 0 ? Math.max(margin.top, 8 + logoHeight + 5) : margin.top;
      yPosition = headerY;

      const checkPageBreak = (requiredHeight: number) => {
        if (yPosition + requiredHeight > pageHeight - margin.bottom) {
          pdf.addPage();
          yPosition = margin.top;
          return true;
        }
        return false;
      };

      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.text('RAPPORT DE TRÉSORERIE', pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 8;

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      
      const infoX = logoHeight > 0 ? margin.left + 35 : margin.left;
      
      pdf.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, infoX, yPosition);
      pdf.text(`à ${new Date().toLocaleTimeString('fr-FR')}`, infoX, yPosition + 4);
      
      if (selectedGrant) {
        const grantText = `Subvention: ${selectedGrant.name}`;
        const grantTextWidth = pdf.getTextWidth(grantText);
        pdf.text(grantText, pageWidth - margin.right - grantTextWidth, yPosition);
        pdf.text(`Réf: ${selectedGrant.reference}`, pageWidth - margin.right - pdf.getTextWidth(`Réf: ${selectedGrant.reference}`), yPosition + 4);
      }

      yPosition += 12;

      // Gestion des noms longs avec retour à la ligne - Version alternative
      if (grantBankAccount) {
        checkPageBreak(15);
        
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Compte Bancaire', margin.left, yPosition);
        yPosition += 6;
        
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');
        
        // Gestion des noms longs avec retour à la ligne
        const bankNameLines = splitTextToLines(grantBankAccount.name, 55, pdf);
        const labelWidth = pdf.getTextWidth('Nom: ');
        
        // Afficher "Nom:" suivi du nom sur plusieurs lignes
        bankNameLines.forEach((line, index) => {
          const xOffset = index === 0 ? 0 : labelWidth;
          const prefix = index === 0 ? 'Nom: ' : '';
          pdf.text(`${prefix}${line}`, margin.left + xOffset, yPosition + (index * 4.5));
        });
        const nameHeight = bankNameLines.length * 4.5;
        yPosition += nameHeight;
        
        pdf.text(`Banque: ${grantBankAccount.bankName}`, margin.left, yPosition);
        yPosition += 5;
        
        pdf.text(`N°: ${grantBankAccount.accountNumber}`, margin.left, yPosition);
        pdf.text(`Devise: ${selectedGrant?.currency || 'EUR'}`, margin.left + 70, yPosition);
        yPosition += 5;
        
        pdf.text(`Solde: ${formatCurrencyForPDF(grantBankAccount.balance || 0)} ${getCurrencySymbol(selectedGrant?.currency || 'EUR')}`, margin.left, yPosition);
        yPosition += 8;
      }

      pdf.setDrawColor(200, 200, 200);
      pdf.line(margin.left, yPosition, pageWidth - margin.right, yPosition);
      yPosition += 10;

      checkPageBreak(25);
      
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('RÉSUMÉ DES TRANSACTIONS', margin.left, yPosition);
      yPosition += 8;

      const cardWidth = contentWidth / 3 - 8;
      const cardHeight = 18;

      checkPageBreak(cardHeight + 10);

      pdf.setFillColor(219, 234, 254);
      pdf.rect(margin.left, yPosition, cardWidth, cardHeight, 'F');
      pdf.setDrawColor(150, 150, 150);
      pdf.rect(margin.left, yPosition, cardWidth, cardHeight);
      
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0, 0, 0);
      pdf.text('TRANSACTIONS', margin.left + cardWidth / 2, yPosition + 5, { align: 'center' });
      
      pdf.setFontSize(10);
      pdf.setTextColor(37, 99, 235);
      pdf.text(
        totalTransactionsCount.toString(),
        margin.left + cardWidth / 2, 
        yPosition + 12,
        { align: 'center' }
      );

      pdf.setFillColor(220, 252, 231);
      pdf.rect(margin.left + cardWidth + 4, yPosition, cardWidth, cardHeight, 'F');
      pdf.setDrawColor(150, 150, 150);
      pdf.rect(margin.left + cardWidth + 4, yPosition, cardWidth, cardHeight);
      
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0, 0, 0);
      pdf.text('TOTAL CRÉDITS', margin.left + cardWidth + 4 + cardWidth / 2, yPosition + 5, { align: 'center' });
      
      pdf.setFontSize(9);
      pdf.setTextColor(5, 150, 105);
      
      const totalCreditsText = `${formatCurrencyForPDF(totalCredits)} ${getCurrencySymbol(selectedGrant?.currency || 'EUR')}`;
      
      pdf.text(
        totalCreditsText,
        margin.left + cardWidth + 4 + cardWidth / 2, 
        yPosition + 12,
        { align: 'center' }
      );

      pdf.setFillColor(254, 226, 226);
      pdf.rect(margin.left + (cardWidth + 4) * 2, yPosition, cardWidth, cardHeight, 'F');
      pdf.setDrawColor(150, 150, 150);
      pdf.rect(margin.left + (cardWidth + 4) * 2, yPosition, cardWidth, cardHeight);
      
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0, 0, 0);
      pdf.text('TOTAL DÉBITS', margin.left + (cardWidth + 4) * 2 + cardWidth / 2, yPosition + 5, { align: 'center' });
      
      pdf.setFontSize(9);
      pdf.setTextColor(239, 68, 68);
      
      const totalDebitsText = `${formatCurrencyForPDF(totalDebits)} ${getCurrencySymbol(selectedGrant?.currency || 'EUR')}`;
      
      pdf.text(
        totalDebitsText,
        margin.left + (cardWidth + 4) * 2 + cardWidth / 2, 
        yPosition + 12,
        { align: 'center' }
      );

      pdf.setTextColor(0, 0, 0);
      yPosition += cardHeight + 15;

      pdf.setFillColor(243, 232, 255);
      pdf.rect(margin.left, yPosition, contentWidth, cardHeight, 'F');
      pdf.setDrawColor(150, 150, 150);
      pdf.rect(margin.left, yPosition, contentWidth, cardHeight);
      
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.text('SOLDE NET', margin.left + 10, yPosition + 6);
      
      pdf.setFontSize(10);
      pdf.setTextColor(124, 58, 237);
      
      const netBalanceText = `${formatCurrencyForPDF(netBalance)} ${getCurrencySymbol(selectedGrant?.currency || 'EUR')}`;
      pdf.text(netBalanceText, pageWidth - margin.right - 10, yPosition + 6, { align: 'right' });
      
      pdf.setTextColor(0, 0, 0);
      yPosition += cardHeight + 15;

      checkPageBreak(20);
      
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`HISTORIQUE DES TRANSACTIONS (${totalTransactionsCount})`, margin.left, yPosition);
      yPosition += 8;

      const tableHeaders = ['Date', 'Description', 'Type', 'Montant', 'Référence'];
      const columnWidths = [25, 65, 25, 35, 30];
      const baseRowHeight = 8;
      const headerHeight = 8;
      const cellPadding = 2;

      checkPageBreak(headerHeight + baseRowHeight);

      const drawTableHeader = (y: number) => {
        pdf.setFillColor(243, 244, 246);
        pdf.rect(margin.left, y, contentWidth, headerHeight, 'F');
        
        let headerX = margin.left;
        tableHeaders.forEach((header, index) => {
          pdf.setFontSize(8);
          pdf.setFont('helvetica', 'bold');
          const align = index === 3 ? 'right' : 'left';
          const textX = align === 'right' ? headerX + columnWidths[index] - cellPadding : headerX + cellPadding;
          
          if (index === 1) {
            const lines = pdf.splitTextToSize(header, columnWidths[index] - cellPadding * 2);
            lines.forEach((line: string, lineIndex: number) => {
              pdf.text(line, textX, y + 3 + (lineIndex * 3));
            });
          } else {
            pdf.text(header, textX, y + 5, { align });
          }
          
          pdf.setDrawColor(200, 200, 200);
          pdf.rect(headerX, y, columnWidths[index], headerHeight);
          
          headerX += columnWidths[index];
        });
      };

      const drawTableRow = (transaction: BankTransaction, rowY: number, bgColor?: number[]) => {
        let currentX = margin.left;
        let maxCellHeight = baseRowHeight;

        const cells = [
          {
            text: formatDate(transaction.date),
            align: 'left' as const,
            fontSize: 7,
            fontStyle: 'normal',
            maxWidth: columnWidths[0]
          },
          {
            text: transaction.description,
            align: 'left' as const,
            fontSize: 7,
            fontStyle: 'normal',
            maxWidth: columnWidths[1]
          },
          {
            text: transaction.type === 'credit' ? 'Entrée' : 'Sortie',
            align: 'left' as const,
            fontSize: 7,
            fontStyle: 'bold',
            maxWidth: columnWidths[2],
            textColor: transaction.type === 'credit' ? [5, 150, 105] : [239, 68, 68]
          },
          {
            text: `${transaction.type === 'credit' ? '+' : '-'}${formatCurrencyForPDF(transaction.amount)} ${getCurrencySymbol(selectedGrant?.currency || 'EUR')}`,
            align: 'right' as const,
            fontSize: 7,
            fontStyle: 'bold',
            maxWidth: columnWidths[3],
            textColor: transaction.type === 'credit' ? [5, 150, 105] : [239, 68, 68]
          },
          {
            text: transaction.reference || '-',
            align: 'left' as const,
            fontSize: 7,
            fontStyle: 'normal',
            maxWidth: columnWidths[4]
          }
        ];

        cells.forEach((cell, index) => {
          const lines = pdf.splitTextToSize(cell.text, cell.maxWidth - cellPadding * 2);
          const cellHeight = Math.max(baseRowHeight, lines.length * cell.fontSize * 0.35 + cellPadding * 2);
          maxCellHeight = Math.max(maxCellHeight, cellHeight);
        });

        if (bgColor) {
          pdf.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
          pdf.rect(margin.left, rowY, contentWidth, maxCellHeight, 'F');
        }

        currentX = margin.left;
        cells.forEach((cell, index) => {
          pdf.setDrawColor(200, 200, 200);
          pdf.rect(currentX, rowY, columnWidths[index], maxCellHeight);

          pdf.setFontSize(cell.fontSize);
          pdf.setFont('helvetica', cell.fontStyle as any);
          if (cell.textColor) {
            pdf.setTextColor(cell.textColor[0], cell.textColor[1], cell.textColor[2]);
          } else {
            pdf.setTextColor(0, 0, 0);
          }

          const lines = pdf.splitTextToSize(cell.text, cell.maxWidth - cellPadding * 2);
          const textY = rowY + cellPadding + (cell.fontSize * 0.35);
          
          lines.forEach((line: string, lineIndex: number) => {
            const textX = cell.align === 'right' 
              ? currentX + columnWidths[index] - cellPadding
              : currentX + cellPadding;
            
            pdf.text(line, textX, textY + (lineIndex * cell.fontSize * 0.35), { align: cell.align });
          });

          currentX += columnWidths[index];
        });

        pdf.setTextColor(0, 0, 0);
        return maxCellHeight;
      };

      drawTableHeader(yPosition);
      yPosition += headerHeight;

      let isFirstRowOnNewPage = false;
      let rowIndex = 0;

      allTransactions.forEach((transaction) => {
        const estimatedHeight = baseRowHeight * 2;
        if (checkPageBreak(estimatedHeight)) {
          isFirstRowOnNewPage = true;
        }

        if (isFirstRowOnNewPage) {
          drawTableHeader(yPosition);
          yPosition += headerHeight;
          isFirstRowOnNewPage = false;
        }

        const bgColor = rowIndex % 2 === 0 ? [249, 250, 251] : [255, 255, 255];
        const rowHeight = drawTableRow(transaction, yPosition, bgColor);
        yPosition += rowHeight;
        rowIndex++;
      });

      const pageCount = pdf.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 100, 100);
        
        pdf.text(
          `Page ${i} sur ${pageCount}`,
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

      const fileName = `rapport_tresorerie_${selectedGrant?.name || 'transactions'}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
      
      showSuccess('PDF généré', 'Le rapport PDF a été généré avec succès');
    } catch (error) {
      console.error('Erreur lors de la génération du PDF:', error);
      showError('Erreur', 'Une erreur est survenue lors de la génération du PDF');
    }
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


  // ============================================
  // CALCULS POUR LES STATISTIQUES
  // ============================================

  const totalBankBalance = filteredBankAccounts.reduce((sum, account) => sum + account.balance, 0);
  const totalUncashedPayments = approvedPayments.reduce((sum, payment) => sum + payment.amount, 0);

  // ============================================
  // PERMISSIONS
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

  if (!hasModuleAccess('treasury')) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Banknote className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Accès non autorisé</h2>
          <p className="text-gray-500">Vous n'avez pas les permissions nécessaires pour accéder à ce module.</p>
        </div>
      </div>
    );
  }

  const canView = hasPermission('treasury', 'view');
  const canCreate = hasPermission('treasury', 'create');
  const canExport = hasPermission('treasury', 'export');
  const canCreateTreasury = canCreate && selectedGrant && selectedGrant.status === 'active';

  if (!canView) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Banknote className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Accès non autorisé</h2>
          <p className="text-gray-500">Vous n'avez pas les permissions nécessaires pour visualiser le module de trésorerie.</p>
        </div>
      </div>
    );
  }

  // ============================================
  // COMPOSANT DE PAGINATION
  // ============================================

  const Pagination = () => (
    <div className="flex flex-col sm:flex-row items-center justify-between mt-6 gap-4">
      <div className="text-sm text-gray-600">
        Affichage de {indexOfFirstTransaction + 1} à {Math.min(indexOfLastTransaction, totalTransactions)} 
        sur {totalTransactions} transactions
      </div>
      
      <div className="flex items-center space-x-2">
        <select
          value={transactionsPerPage}
          onChange={(e) => {
            setTransactionsPerPage(Number(e.target.value));
            setCurrentPage(1);
          }}
          className="px-3 py-1 border border-gray-300 rounded-lg text-sm"
        >
          <option value="5">5 par page</option>
          <option value="10">10 par page</option>
          <option value="20">20 par page</option>
          <option value="50">50 par page</option>
        </select>
        
        <button
          onClick={handlePrevPage}
          disabled={currentPage === 1}
          className="p-2 rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
        >
          <ChevronLeft className="w-4 h-4" />
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
              onClick={() => handlePageChange(pageNum)}
              className={`px-3 py-1 rounded-lg text-sm font-medium ${
                currentPage === pageNum
                  ? 'bg-blue-600 text-white'
                  : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {pageNum}
            </button>
          );
        })}
        
        <button
          onClick={handleNextPage}
          disabled={currentPage === totalPages}
          className="p-2 rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  // ============================================
  // RENDU PRINCIPAL
  // ============================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">État de Trésorerie</h2>
          <p className="text-gray-600 mt-1">Suivi des comptes bancaires et des paiements</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {canExport && (
            <button
              onClick={exportToPDF}
              className="bg-red-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-red-700 flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>Exporter PDF</span>
            </button>
          )}
          {canCreate && (
            <button
              onClick={() => {
                setSelectedPayment(null);
                setTransactionFormData({
                  grantId: selectedGrant ? selectedGrant.id : '',
                  date: new Date().toISOString().split('T')[0],
                  description: '',
                  amount: '',
                  type: 'debit' as 'credit' | 'debit',
                  reference: '',
                  paymentId: ''
                });
                setShowTransactionForm(true);
              }}
              disabled={!canCreateTreasury}
              className={`px-4 py-2 rounded-xl font-medium transition-all duration-200 flex items-center space-x-2 ${
                canCreateTreasury
                  ? 'bg-gradient-to-r from-green-600 to-blue-600 text-white hover:shadow-lg transform hover:scale-[1.02]'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>Transaction</span>
            </button>
          )}
        </div>
      </div>

      {/* Information sur la subvention active */}
      {selectedGrant && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-4 border border-blue-200">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Subvention Active</h3>
              <p className="text-sm text-gray-600">{selectedGrant.name}</p>
              {grantBankAccount && (
                <p className="text-sm text-gray-500">
                  Compte: {grantBankAccount.name} - {grantBankAccount.bankName}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Devise</p>
              <p className="text-sm font-bold text-blue-600">
                {selectedGrant.currency} ({selectedGrant.currency === 'EUR' ? '€' : selectedGrant.currency === 'USD' ? '$' : 'FCFA'})
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Solde Total Banques</p>
              <p className="text-2xl font-bold text-blue-600">
                {formatCurrency(totalBankBalance)}
              </p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <Banknote className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">À Décaisser</p>
              <p className="text-2xl font-bold text-orange-600">
                {formatCurrency(totalUncashedPayments)}
              </p>
              <p className="text-sm text-gray-500">
                {approvedPayments.length} paiement(s)
              </p>
            </div>
            <div className="p-3 bg-orange-100 rounded-full">
              <AlertCircle className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">En Cours</p>
              <p className="text-2xl font-bold text-purple-600">
                {inProgressPayments.length}
              </p>
              <p className="text-sm text-gray-500">
                Paiements partiellement décaissés
              </p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <Clock className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
        {/* Compte Bancaire — placé après la section décaissement (order-2) */}
        <div className="order-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <h3 className="text-lg font-semibold text-gray-900">
              {selectedGrant ? 'Compte Bancaire de la Subvention' : 'Comptes Bancaires'}
            </h3>
            
            {selectedGrant && allTransactions.length > 0 && (
              <button
                onClick={() => setShowAllTransactions(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center space-x-2"
              >
                <Filter className="w-4 h-4" />
                <span>Voir toutes les transactions ({allTransactions.length})</span>
              </button>
            )}
          </div>
          
          <div className="space-y-4">
            {filteredBankAccounts.map(account => (
              <div key={account.id} className="p-4 bg-gray-50 rounded-xl">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                  <div className="max-w-[60%]">
                    <h4 className="font-medium text-gray-900 break-words">{account.name}</h4>
                    <p className="text-sm text-gray-600">{account.bankName}</p>
                    <p className="text-xs text-gray-500">N° {account.accountNumber}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xl font-bold ${account.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(account.balance)}
                    </p>
                    <p className="text-xs text-gray-500">
                      MAJ: {new Date(account.lastUpdateDate).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                </div>

                {/* Filtres des transactions */}
                <div className="bg-white p-4 rounded-lg border border-gray-200 mb-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
                    <h5 className="font-medium text-gray-700 flex items-center">
                      <Filter className="w-4 h-4 mr-2" />
                      Filtres des transactions
                    </h5>
                    {(txDateFrom || txDateTo || typeFilter !== 'all' || descriptionFilter) && (
                      <button
                        onClick={resetFilters}
                        className="text-sm text-red-600 hover:text-red-800 flex items-center"
                      >
                        <X className="w-3 h-3 mr-1" />
                        Réinitialiser
                      </button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Du</label>
                      <input
                        type="date"
                        value={txDateFrom}
                        onChange={(e) => {
                          setTxDateFrom(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Au</label>
                      <input
                        type="date"
                        value={txDateTo}
                        onChange={(e) => {
                          setTxDateTo(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                      <select
                        value={typeFilter}
                        onChange={(e) => {
                          setTypeFilter(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="all">Tous les types</option>
                        <option value="credit">Entrée</option>
                        <option value="debit">Sortie</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                      <input
                        type="text"
                        value={descriptionFilter}
                        onChange={(e) => {
                          setDescriptionFilter(e.target.value);
                          setCurrentPage(1);
                        }}
                        placeholder="Rechercher..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Tableau des transactions */}
                {selectedGrant && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th 
                              className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                              onClick={() => handleSort('date')}
                            >
                              <div className="flex items-center">
                                <Calendar className="w-3 h-3 mr-1" />
                                Date
                                {sortField === 'date' && (
                                  sortDirection === 'asc' ? 
                                    <ChevronUp className="w-3 h-3 ml-1" /> : 
                                    <ChevronDown className="w-3 h-3 ml-1" />
                                )}
                              </div>
                            </th>
                            <th 
                              className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                              onClick={() => handleSort('description')}
                            >
                              <div className="flex items-center">
                                Description
                                {sortField === 'description' && (
                                  sortDirection === 'asc' ? 
                                    <ChevronUp className="w-3 h-3 ml-1" /> : 
                                    <ChevronDown className="w-3 h-3 ml-1" />
                                )}
                              </div>
                            </th>
                            <th 
                              className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                              onClick={() => handleSort('type')}
                            >
                              <div className="flex items-center">
                                Type
                                {sortField === 'type' && (
                                  sortDirection === 'asc' ? 
                                    <ChevronUp className="w-3 h-3 ml-1" /> : 
                                    <ChevronDown className="w-3 h-3 ml-1" />
                                )}
                              </div>
                            </th>
                            <th 
                              className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                              onClick={() => handleSort('amount')}
                            >
                              <div className="flex items-center">
                                Montant
                                {sortField === 'amount' && (
                                  sortDirection === 'asc' ? 
                                    <ChevronUp className="w-3 h-3 ml-1" /> : 
                                    <ChevronDown className="w-3 h-3 ml-1" />
                                )}
                              </div>
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Référence
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {currentTransactions.length > 0 ? (
                            currentTransactions.map(transaction => (
                              <tr key={transaction.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                  {formatDate(transaction.date)}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-900">
                                  {transaction.description}
                                  {transaction.paymentId && (
                                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                      Paiement
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    transaction.type === 'credit' 
                                      ? 'bg-green-100 text-green-800' 
                                      : 'bg-red-100 text-red-800'
                                  }`}>
                                    {transaction.type === 'credit' ? 'Entrée' : 'Sortie'}
                                  </span>
                                </td>
                                <td className={`px-4 py-3 whitespace-nowrap text-sm font-medium ${
                                  transaction.type === 'credit' ? 'text-green-600' : 'text-red-600'
                                }`}>
                                  {transaction.type === 'credit' ? '+' : '-'}
                                  {formatCurrency(transaction.amount)}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-500">
                                  {transaction.reference || '-'}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                                {allTransactions.length === 0 
                                  ? 'Aucune transaction enregistrée' 
                                  : 'Aucune transaction ne correspond aux filtres'
                                }
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    
                    {totalTransactions > 0 && <Pagination />}
                  </div>
                )}
              </div>
            ))}
            
            {filteredBankAccounts.length === 0 && (
              <p className="text-gray-500 text-center py-4">Aucun compte bancaire configuré</p>
            )}
          </div>
        </div>

        {/* Paiements à Décaisser — placé juste sous les 3 cartes, avant l'historique (order-1) */}
        <div className="order-1 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Paiements à Décaisser</h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">
                  {displayedPayments.length} paiement(s)
                </span>
              </div>
            </div>

            {/* Barre de recherche */}
            <div className="relative mb-4">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
              <input
                type="text"
                placeholder="Rechercher par numéro de paiement ou fournisseur..."
                value={paymentSearchTerm}
                onChange={(e) => setPaymentSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>

            {/* Onglets */}
            <div className="flex border-b border-gray-200 mb-4">
              <button
                onClick={() => setPaymentTab('approved')}
                className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                  paymentTab === 'approved'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Approuvés</span>
                  <span className="bg-gray-200 text-gray-700 text-xs px-2 py-0.5 rounded-full">
                    {approvedPayments.length}
                  </span>
                </div>
              </button>
              <button
                onClick={() => setPaymentTab('in_progress')}
                className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                  paymentTab === 'in_progress'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>En cours</span>
                  <span className="bg-gray-200 text-gray-700 text-xs px-2 py-0.5 rounded-full">
                    {inProgressPayments.length}
                  </span>
                </div>
              </button>
            </div>

          <div className="space-y-3">
            {displayedPayments.length === 0 ? (
              <div className="text-center py-6">
                <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
                <p className="text-green-600 font-medium">
                  {paymentTab === 'approved' ? 'Aucun paiement à décaisser' : 'Aucun paiement en cours'}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {paymentTab === 'approved' 
                    ? 'Tous les paiements approuvés ont été décaissés' 
                    : 'Aucun paiement partiellement décaissé'}
                </p>
              </div>
            ) : (
              displayedPayments.map(payment => {
                const remaining = getRemainingAmount(payment);
                const totalPaid = getTotalPaid(payment);
                const progress = getPaymentProgress(payment);
                const isPartial = hasPartialPayments(payment);

                return (
                  <div key={payment.id} className="p-4 bg-orange-50 border border-orange-200 rounded-xl">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-medium text-gray-900">{payment.paymentNumber}</h4>
                          <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${PAYMENT_STATUS[payment.status].color}`}>
                            {PAYMENT_STATUS[payment.status].label}
                          </span>
                          {isPartial && (
                            <span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                              Partiel
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 truncate">{payment.supplier}</p>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mt-1">
                          <span>
                            {payment.paymentMethod === 'check' ? 'Chèque' : 
                             payment.paymentMethod === 'transfer' ? 'Virement' : 'Espèces'}
                          </span>
                          {payment.checkNumber && (
                            <span>N° {payment.checkNumber}</span>
                          )}
                          <span>Émis le {new Date(payment.date).toLocaleDateString('fr-FR')}</span>
                        </div>
                        {isPartial && (
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                              <span>Progression</span>
                              <span>{progress.toFixed(0)}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1.5">
                              <div 
                                className="h-1.5 rounded-full bg-purple-600 transition-all duration-300"
                                style={{ width: `${Math.min(progress, 100)}%` }}
                              />
                            </div>
                            <div className="flex justify-between text-xs text-gray-500 mt-1">
                              <span>Payé: {formatCurrency(totalPaid)}</span>
                              <span className="text-orange-600 font-medium">Reste: {formatCurrency(remaining)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 flex-shrink-0">
                        <div className="text-right mb-1 sm:mb-0">
                          <p className="font-bold text-orange-600">
                            {formatCurrency(payment.amount)}
                          </p>
                          {isPartial && (
                            <p className="text-xs text-gray-500">
                              Reste: {formatCurrency(remaining)}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                          {/* Voir le détail du paiement (disponible dans les deux onglets, pour tous les paiements) */}
                          <button
                            onClick={() => { setSelectedPayment(payment); setShowPaymentDetails(true); }}
                            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center space-x-1 whitespace-nowrap"
                            title="Voir le détail du paiement"
                          >
                            <Eye className="w-4 h-4" />
                            <span>Voir détail</span>
                          </button>
                          {canCreateTreasury && remaining > 0 && (
                            <>
                              {/* Afficher "Décaisser complet" uniquement dans l'onglet "Approuvés" */}
                              {paymentTab === 'approved' && (
                                <button
                                  onClick={() => openFullPaymentForm(payment)}
                                  className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center space-x-1 whitespace-nowrap"
                                >
                                  <ArrowRight className="w-4 h-4" />
                                  <span>Décaisser complet</span>
                                </button>
                              )}
                              
                              {/* Toujours afficher "Paiement partiel" si reste > 0 */}
                              <button
                                onClick={() => openPartialPaymentForm(payment)}
                                className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium flex items-center space-x-1 whitespace-nowrap"
                              >
                                <DollarSign className="w-4 h-4" />
                                <span>Paiement partiel</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* La section « Rapprochement bancaire » a été déplacée dans le menu dédié (ReconciliationManager). */}

      {/* ============================================ */}
      {/* MODAL - PAIEMENT ÉCHELONNÉ (AVEC CHOIX DU MODE) */}
      {/* ============================================ */}
      {/* Modal de détail d'un paiement à décaisser */}
      {showPaymentDetails && selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Détail du paiement
                </h3>
                <p className="text-sm text-blue-600 mt-1">
                  {selectedPayment.paymentNumber} - {selectedPayment.supplier}
                </p>
              </div>
              <button
                onClick={() => { setShowPaymentDetails(false); setSelectedPayment(null); }}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Résumé montants */}
            <div className="bg-orange-50 rounded-lg p-4 border border-orange-200 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Montant total:</span>
                <span className="font-bold">{formatCurrency(selectedPayment.amount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Déjà payé:</span>
                <span className="font-bold text-green-600">{formatCurrency(getTotalPaid(selectedPayment))}</span>
              </div>
              <div className="flex justify-between text-sm font-medium border-t pt-2 mt-2">
                <span className="text-gray-700">Reste à payer:</span>
                <span className="font-bold text-orange-600">{formatCurrency(getRemainingAmount(selectedPayment))}</span>
              </div>
            </div>

            {/* Informations générales */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <span className="block text-gray-500">Statut</span>
                <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${PAYMENT_STATUS[selectedPayment.status].color}`}>
                  {PAYMENT_STATUS[selectedPayment.status].label}
                </span>
              </div>
              <div>
                <span className="block text-gray-500">Date d'émission</span>
                <span className="text-gray-900 font-medium">{formatDate(selectedPayment.date)}</span>
              </div>
              <div>
                <span className="block text-gray-500">Fournisseur</span>
                <span className="text-gray-900 font-medium">{selectedPayment.supplier}</span>
              </div>
              <div>
                <span className="block text-gray-500">Mode de paiement</span>
                <span className="text-gray-900 font-medium">{getPaymentMethodLabel(selectedPayment.paymentMethod)}</span>
              </div>
              {selectedPayment.checkNumber && (
                <div>
                  <span className="block text-gray-500">N° de chèque</span>
                  <span className="text-gray-900 font-medium">{selectedPayment.checkNumber}</span>
                </div>
              )}
              {selectedPayment.bankReference && (
                <div>
                  <span className="block text-gray-500">Référence bancaire</span>
                  <span className="text-gray-900 font-medium">{selectedPayment.bankReference}</span>
                </div>
              )}
              {selectedPayment.invoiceNumber && (
                <div>
                  <span className="block text-gray-500">N° de facture</span>
                  <span className="text-gray-900 font-medium">{selectedPayment.invoiceNumber}</span>
                </div>
              )}
              {selectedPayment.quoteReference && (
                <div>
                  <span className="block text-gray-500">Référence devis</span>
                  <span className="text-gray-900 font-medium">{selectedPayment.quoteReference}</span>
                </div>
              )}
              {selectedPayment.purchaseOrderNumber && (
                <div>
                  <span className="block text-gray-500">N° bon de commande</span>
                  <span className="text-gray-900 font-medium">{selectedPayment.purchaseOrderNumber}</span>
                </div>
              )}
            </div>

            {selectedPayment.description && (
              <div className="mt-4 text-sm">
                <span className="block text-gray-500 mb-1">Description</span>
                <p className="text-gray-900 bg-gray-50 rounded-lg p-3 border border-gray-200">{selectedPayment.description}</p>
              </div>
            )}

            {/* Historique des paiements partiels */}
            {selectedPayment.partialPayments && selectedPayment.partialPayments.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-2">Historique des décaissements</h4>
                <div className="space-y-2">
                  {selectedPayment.partialPayments.map((pp, idx) => (
                    <div key={pp.id || idx} className="flex justify-between items-center text-sm bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <div>
                        <span className="text-gray-900 font-medium">{formatDate(pp.date)}</span>
                        {pp.reference && <span className="text-gray-500 ml-2">Réf: {pp.reference}</span>}
                      </div>
                      <span className="font-bold text-green-600">{formatCurrency(pp.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => { setShowPaymentDetails(false); setSelectedPayment(null); }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {showPartialPaymentForm && selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Paiement échelonné
                </h3>
                <p className="text-sm text-blue-600 mt-1">
                  {selectedPayment.paymentNumber} - {selectedPayment.supplier}
                </p>
              </div>
              <button
                onClick={resetPartialPaymentForm}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handlePartialPaymentSubmit} className="space-y-4">
              {/* Résumé du paiement */}
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Montant total:</span>
                  <span className="font-bold">{formatCurrency(selectedPayment.amount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Déjà payé:</span>
                  <span className="font-bold text-green-600">{formatCurrency(getTotalPaid(selectedPayment))}</span>
                </div>
                <div className="flex justify-between text-sm font-medium border-t pt-2 mt-2">
                  <span className="text-gray-700">Reste à payer:</span>
                  <span className="font-bold text-purple-600">{formatCurrency(getRemainingAmount(selectedPayment))}</span>
                </div>
              </div>

              {/* Montant */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Montant de ce paiement *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={getRemainingAmount(selectedPayment)}
                    value={partialPaymentFormData.amount}
                    onChange={(e) => setPartialPaymentFormData(prev => ({ ...prev, amount: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="0.00"
                    required
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Maximum: {formatCurrency(getRemainingAmount(selectedPayment))}
                </p>
              </div>

              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date du paiement *
                </label>
                <input
                  type="date"
                  value={partialPaymentFormData.date}
                  onChange={(e) => setPartialPaymentFormData(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  required
                />
              </div>

              {/* Mode de paiement - NOUVEAU : permet de choisir ! */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Mode de paiement *
                </label>
                <select
                  value={partialPaymentFormData.paymentMethod}
                  onChange={(e) => {
                    const method = e.target.value as 'transfer' | 'check' | 'cash';
                    setPartialPaymentFormData(prev => ({ ...prev, paymentMethod: method }));
                    // Espèces : pas de rapprochement bancaire ; virement/chèque : coché par défaut
                    setPartialNeedsReconciliation(method !== 'cash');
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  required
                >
                  <option value="transfer">Virement bancaire</option>
                  <option value="check">Chèque</option>
                  <option value="cash">Espèces</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Choisissez le mode de paiement pour cette échéance
                </p>
              </div>

              {/* Numéro de chèque (si mode = chèque) */}
              {partialPaymentFormData.paymentMethod === 'check' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Numéro de chèque *
                  </label>
                  <input
                    type="text"
                    value={partialPaymentFormData.checkNumber}
                    onChange={(e) => setPartialPaymentFormData(prev => ({ ...prev, checkNumber: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="Ex: CHQ-2024-001"
                    required
                  />
                </div>
              )}

              {/* Référence virement (si mode = virement) */}
              {partialPaymentFormData.paymentMethod === 'transfer' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Référence virement *
                  </label>
                  <input
                    type="text"
                    value={partialPaymentFormData.bankReference}
                    onChange={(e) => setPartialPaymentFormData(prev => ({ ...prev, bankReference: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="Ex: VIR-2024-001"
                    required
                  />
                </div>
              )}

              {/* Référence du paiement partiel */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Référence du paiement partiel *
                </label>
                <input
                  type="text"
                  value={partialPaymentFormData.reference}
                  onChange={(e) => setPartialPaymentFormData(prev => ({ ...prev, reference: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Ex: PART-2024-001"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (optionnel)
                </label>
                <input
                  type="text"
                  value={partialPaymentFormData.description}
                  onChange={(e) => setPartialPaymentFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Description de ce paiement partiel..."
                />
              </div>

              {/* Rapprochement bancaire (non applicable en espèces) */}
              <label className="flex items-start gap-2 cursor-pointer select-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <input
                  type="checkbox"
                  checked={partialPaymentFormData.paymentMethod !== 'cash' && partialNeedsReconciliation}
                  disabled={partialPaymentFormData.paymentMethod === 'cash'}
                  onChange={(e) => setPartialNeedsReconciliation(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 disabled:opacity-50"
                />
                <span className="text-sm text-gray-700">
                  Ce versement <span className="font-semibold">attend un rapprochement bancaire</span>
                  {partialPaymentFormData.paymentMethod === 'cash' ? (
                    <span className="block text-xs text-amber-600">Non applicable : un paiement en espèces ne fait pas l'objet d'un rapprochement bancaire.</span>
                  ) : (
                    <span className="block text-xs text-gray-500">Décochez si ce versement ne nécessite pas de rapprochement.</span>
                  )}
                </span>
              </label>

              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <button
                  type="button"
                  onClick={resetPartialPaymentForm}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:shadow-lg transition-all duration-200"
                >
                  Ajouter le paiement partiel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* MODAL - PAIEMENT COMPLET (UTILISE LE MODE ORIGINAL) */}
      {/* ============================================ */}
      {showTransactionForm && selectedPayment && !transactionFormData.paymentId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Décaissement complet
                </h3>
                <p className="text-sm text-blue-600 mt-1">
                  {selectedPayment.paymentNumber} - {selectedPayment.supplier}
                </p>
              </div>
              <button
                onClick={resetFullPaymentForm}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleFullPaymentSubmit} className="space-y-4">
              {/* Résumé du paiement */}
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Montant total:</span>
                  <span className="font-bold">{formatCurrency(selectedPayment.amount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Déjà payé:</span>
                  <span className="font-bold text-green-600">{formatCurrency(getTotalPaid(selectedPayment))}</span>
                </div>
                <div className="flex justify-between text-sm font-medium border-t pt-2 mt-2">
                  <span className="text-gray-700">Montant à décaisser:</span>
                  <span className="font-bold text-green-600">{formatCurrency(getRemainingAmount(selectedPayment))}</span>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  Mode de paiement original: {getPaymentMethodLabel(selectedPayment.paymentMethod)}
                  {selectedPayment.checkNumber && ` - N° ${selectedPayment.checkNumber}`}
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date du décaissement *
                </label>
                <input
                  type="date"
                  value={fullPaymentFormData.date}
                  onChange={(e) => setFullPaymentFormData(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  required
                />
              </div>

              {/* Référence */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Référence *
                </label>
                <input
                  type="text"
                  value={fullPaymentFormData.reference}
                  onChange={(e) => setFullPaymentFormData(prev => ({ ...prev, reference: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Numéro de chèque, référence virement..."
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  {selectedPayment.paymentMethod === 'check' 
                    ? 'Saisissez le numéro du chèque' 
                    : selectedPayment.paymentMethod === 'transfer'
                    ? 'Saisissez la référence du virement'
                    : 'Saisissez une référence pour ce paiement'}
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (optionnel)
                </label>
                <input
                  type="text"
                  value={fullPaymentFormData.description}
                  onChange={(e) => setFullPaymentFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Description du décaissement..."
                />
              </div>

              {/* Rapprochement bancaire (non applicable en espèces) */}
              <label className="flex items-start gap-2 cursor-pointer select-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <input
                  type="checkbox"
                  checked={selectedPayment.paymentMethod !== 'cash' && fullNeedsReconciliation}
                  disabled={selectedPayment.paymentMethod === 'cash'}
                  onChange={(e) => setFullNeedsReconciliation(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500 disabled:opacity-50"
                />
                <span className="text-sm text-gray-700">
                  Ce décaissement <span className="font-semibold">attend un rapprochement bancaire</span>
                  {selectedPayment.paymentMethod === 'cash' ? (
                    <span className="block text-xs text-amber-600">Non applicable : un paiement en espèces ne fait pas l'objet d'un rapprochement bancaire.</span>
                  ) : (
                    <span className="block text-xs text-gray-500">Décochez si ce paiement ne nécessite pas de rapprochement.</span>
                  )}
                </span>
              </label>

              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <button
                  type="button"
                  onClick={resetFullPaymentForm}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-lg hover:shadow-lg transition-all duration-200"
                >
                  Décaisser complètement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* MODAL - TRANSACTION SIMPLE (NON LIÉE À UN PAIEMENT) */}
      {/* ============================================ */}
      {showTransactionForm && !selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Nouvelle transaction bancaire</h3>
              </div>
              <button
                onClick={resetTransactionForm}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            {selectedGrant && grantBankAccount && (
              <div className="bg-blue-50 rounded-lg p-4 mb-4">
                <h4 className="font-medium text-blue-900 mb-2">Subvention et Compte Associé</h4>
                <div className="space-y-1 text-sm">
                  <div>
                    <span className="text-blue-700">Subvention:</span>
                    <span className="ml-2 font-medium">{selectedGrant.name}</span>
                  </div>
                  <div>
                    <span className="text-blue-700">Compte:</span>
                    <span className="ml-2 font-medium">{grantBankAccount.name}</span>
                  </div>
                  <div>
                    <span className="text-blue-700">Devise:</span>
                    <span className="ml-2 font-medium">{selectedGrant.currency}</span>
                  </div>
                  <div>
                    <span className="text-blue-700">Solde actuel:</span>
                    <span className="ml-2 font-bold text-blue-600">
                      {formatCurrency(grantBankAccount.balance || 0)}
                    </span>
                  </div>
                </div>
              </div>
            )}
            
            <form onSubmit={handleTransactionSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Compte bancaire *
                </label>
                {selectedGrant && grantBankAccount ? (
                  <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700">
                    {grantBankAccount.name} - {grantBankAccount.bankName}
                  </div>
                ) : (
                  <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500">
                    Aucun compte bancaire configuré
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date *
                  </label>
                  <input
                    type="date"
                    value={transactionFormData.date}
                    onChange={(e) => setTransactionFormData(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Type *
                  </label>
                  <select
                    value={transactionFormData.type}
                    onChange={(e) => setTransactionFormData(prev => ({ ...prev, type: e.target.value as 'credit' | 'debit' }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="debit">Sortie (-)</option>
                    <option value="credit">Entrée (+)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description *
                </label>
                <input
                  type="text"
                  value={transactionFormData.description}
                  onChange={(e) => setTransactionFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Description de la transaction"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Montant ({selectedGrant?.currency || '€'}) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={transactionFormData.amount}
                  onChange={(e) => setTransactionFormData(prev => ({ ...prev, amount: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Référence
                </label>
                <input
                  type="text"
                  value={transactionFormData.reference}
                  onChange={(e) => setTransactionFormData(prev => ({ ...prev, reference: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Numéro de chèque, référence virement..."
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <button
                  type="button"
                  onClick={resetTransactionForm}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={!selectedGrant || !grantBankAccount}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-lg hover:shadow-lg transition-all duration-200 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  Ajouter la transaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* MODAL - HISTORIQUE COMPLET DES TRANSACTIONS */}
      {/* ============================================ */}
      {showAllTransactions && selectedGrant && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-6xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Historique complet des transactions</h3>
                <p className="text-gray-600">Compte: {grantBankAccount?.name} - {selectedGrant.name}</p>
              </div>
              <button
                onClick={() => setShowAllTransactions(false)}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <X className="w-6 h-6 text-gray-500" />
              </button>
            </div>
            
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Montant</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Référence</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {allTransactions.map(transaction => (
                      <tr key={transaction.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {formatDate(transaction.date)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {transaction.description}
                          {transaction.paymentId && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              Paiement
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            transaction.type === 'credit' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {transaction.type === 'credit' ? 'Entrée' : 'Sortie'}
                          </span>
                        </td>
                        <td className={`px-4 py-3 whitespace-nowrap text-sm font-medium ${
                          transaction.type === 'credit' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {transaction.type === 'credit' ? '+' : '-'}
                          {formatCurrency(transaction.amount)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {transaction.reference || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {totalTransactions > 0 && (
                <div className="p-4 border-t border-gray-200">
                  <Pagination />
                </div>
              )}
            </div>
            
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <span className="font-bold">Total des transactions :</span> {allTransactions.length} transactions
              </p>
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div className="text-sm">
                  <span className="text-green-600 font-medium">Crédits : </span>
                  {formatCurrency(allTransactions.filter(t => t.type === 'credit').reduce((sum, t) => sum + t.amount, 0))}
                </div>
                <div className="text-sm">
                  <span className="text-red-600 font-medium">Débits : </span>
                  {formatCurrency(allTransactions.filter(t => t.type === 'debit').reduce((sum, t) => sum + t.amount, 0))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TreasuryManager;