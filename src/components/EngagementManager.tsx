import React, { useState, useRef, useEffect } from 'react';
import { Plus, Edit, Trash2, FileText, Eye, Download, Printer, User, CheckCircle, Clock, AlertTriangle, X, Search, ChevronUp, ChevronDown, ChevronRight, ChevronLeft } from 'lucide-react';
import { showValidationError, showWarning, showSuccess } from '../utils/alerts';
import { Engagement, BudgetLine, SubBudgetLine, Grant, ENGAGEMENT_STATUS } from '../types';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { usePermissions } from '../hooks/usePermissions';
import { useAuth } from '../hooks/useAuth';

interface EngagementManagerProps {
  engagements: Engagement[];
  budgetLines: BudgetLine[];
  subBudgetLines: SubBudgetLine[];
  grants: Grant[];
  onAddEngagement: (engagement: Omit<Engagement, 'id'>) => void;
  onUpdateEngagement: (id: string, updates: Partial<Engagement>) => void;
}

// Interface pour les signatures d'approbation
interface ApprovalSignature {
  name: string;
  signature: boolean;
  date?: string;
  observation?: string;
}

const EngagementManager: React.FC<EngagementManagerProps> = ({
  engagements,
  budgetLines,
  subBudgetLines,
  grants,
  onAddEngagement,
  onUpdateEngagement
}) => {
  // HOOKS D'AUTHENTIFICATION ET PERMISSIONS
  const { hasPermission, hasModuleAccess, loading: permissionsLoading } = usePermissions();
  const { user: currentUser, userProfile, userRole } = useAuth();
  
  // ÉTATS DU COMPOSANT
  const [showForm, setShowForm] = useState(false);
  const [showSupplierHistory, setShowSupplierHistory] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<string>('');
  const [editingEngagement, setEditingEngagement] = useState<Engagement | null>(null);
  const [viewingEngagement, setViewingEngagement] = useState<Engagement | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  
  // États pour le tri et la pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [sortField, setSortField] = useState<string>('engagementNumber');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [supplierFilter, setSupplierFilter] = useState<string>('');

  // ÉTATS DU FORMULAIRE
  const [formData, setFormData] = useState({
    grantId: '',
    budgetLineId: '',
    subBudgetLineId: '',
    engagementNumber: '',
    amount: '',
    description: '',
    supplier: '',
    quoteReference: '',
    invoiceNumber: '',
    date: new Date().toISOString().split('T')[0],
    status: 'pending' as Engagement['status']
  });

  // État pour stocker le montant disponible
  const [availableAmount, setAvailableAmount] = useState<number>(0);
  const [exceedsAvailableAmount, setExceedsAvailableAmount] = useState<boolean>(false);

  const [approvals, setApprovals] = useState({
    supervisor1: { name: '', signature: false, observation: '' },
    supervisor2: { name: '', signature: false, observation: '' },
    finalApproval: { name: '', signature: false, observation: '' }
  });

  const [showObservations, setShowObservations] = useState({
    supervisor1: false,
    supervisor2: false,
    finalApproval: false
  });

  const closeEngagementDetails = () => {
    setViewingEngagement(null);
  };

  // 🎯 FONCTIONS UTILITAIRES POUR LES RÔLES ET PERMISSIONS

  // Récupère le nom complet de l'utilisateur de manière sécurisée
  const getUserFullName = (): string => {
    if (!userProfile) return '';
    if (userProfile.firstName && userProfile.lastName) {
      return `${userProfile.firstName} ${userProfile.lastName}`.trim();
    }
    return userProfile.email; // Fallback
  };

  // Récupère la profession de l'utilisateur
  const getUserProfession = (): string => {
    return userProfile?.profession || '';
  };

  // Vérifie si l'utilisateur peut voir la section signature
  const canViewSignatureSection = (): boolean => {
    const signatureProfessions = ['Coordinateur de la Subvention', 'Comptable', 'Coordonnateur National'];
    return signatureProfessions.includes(getUserProfession());
  };

  // Vérifie si l'utilisateur peut modifier le statut
  const canModifyStatus = (): boolean => {
    return getUserProfession() === 'Coordonnateur National';
  };

  // Vérifie si l'utilisateur peut signer un engagement spécifique
  const canSignEngagement = (engagement: Engagement | null, signatureType: string): boolean => {
    const userProfession = getUserProfession();
    
    // Coordonnateur National ne peut JAMAIS signer lors de l'ajout
    if (!engagement && signatureType === 'finalApproval') {
      return false;
    }
    
    const currentApprovals = engagement ? engagement.approvals : approvals;
    
    // Vérification basée sur la profession et le type de signature
    const professionCanSign = 
      (signatureType === 'supervisor1' && userProfession === 'Coordinateur de la Subvention') ||
      (signatureType === 'supervisor2' && userProfession === 'Comptable') ||
      (signatureType === 'finalApproval' && userProfession === 'Coordonnateur National');

    if (!professionCanSign) return false;

    // Vérifie que la signature n'est pas déjà apposée
    const existingApproval = currentApprovals?.[signatureType as keyof typeof currentApprovals];
    if (existingApproval?.signature) return false;

    // Pour le signataire final, vérifier que les deux premiers ont signé (uniquement en modification)
    if (signatureType === 'finalApproval' && engagement) {
      const hasSupervisor1Signed = currentApprovals?.supervisor1?.signature;
      const hasSupervisor2Signed = currentApprovals?.supervisor2?.signature;
      
      if (!hasSupervisor1Signed || !hasSupervisor2Signed) {
        return false;
      }
    }

    return true;
  };

  // Récupère les engagements en attente de signature pour l'utilisateur actuel
  const getPendingSignatures = (): Engagement[] => {
    const userProfession = getUserProfession();
    
    return engagements.filter(engagement => {
      if (userProfession === 'Coordinateur de la Subvention') {
        return !engagement.approvals?.supervisor1?.signature;
      } else if (userProfession === 'Comptable') {
        return !engagement.approvals?.supervisor2?.signature;
      } else if (userProfession === 'Coordonnateur National') {
        const hasSupervisor1Signed = engagement.approvals?.supervisor1?.signature;
        const hasSupervisor2Signed = engagement.approvals?.supervisor2?.signature;
        const hasFinalSigned = engagement.approvals?.finalApproval?.signature;
        return hasSupervisor1Signed && hasSupervisor2Signed && !hasFinalSigned;
      }
      return false;
    });
  };

  // EFFET POUR PRÉ-REMPLIR LES NOMS DES SIGNATAIRES
  useEffect(() => {
    if (userProfile && canViewSignatureSection()) {
      const userName = getUserFullName();
      
      setApprovals(prev => {
        const newApprovals = { ...prev };
        const userProfession = getUserProfession();
        
        if (userProfession === 'Coordinateur de la Subvention') {
          newApprovals.supervisor1.name = userName;
        } else if (userProfession === 'Comptable') {
          newApprovals.supervisor2.name = userName;
        } else if (userProfession === 'Coordonnateur National') {
          newApprovals.finalApproval.name = userName;
        }
        
        return newApprovals;
      });
    }
  }, [userProfile]);

  // EFFET POUR CALCULER LE MONTANT DISPONIBLE LORSQUE LA SOUS-LIGNE EST SÉLECTIONNÉE
  useEffect(() => {
    if (formData.subBudgetLineId) {
      calculateAvailableAmount();
    } else {
      setAvailableAmount(0);
      setExceedsAvailableAmount(false);
    }
  }, [formData.subBudgetLineId, formData.amount, editingEngagement?.id]);

  // Fonction pour calculer le montant disponible pour la sous-ligne sélectionnée
  const calculateAvailableAmount = () => {
    const subBudgetLine = subBudgetLines.find(line => line.id === formData.subBudgetLineId);
    
    if (!subBudgetLine) {
      setAvailableAmount(0);
      return;
    }

    // Trouver la ligne budgétaire parente
    const parentBudgetLine = budgetLines.find(line => line.id === subBudgetLine.budgetLineId);
    
    if (!parentBudgetLine) {
      setAvailableAmount(subBudgetLine.notifiedAmount || 0);
      return;
    }

    // Calculer le total déjà engagé pour cette sous-ligne
    let totalEngaged = 0;
    
    // Si on est en mode édition, exclure l'engagement actuel du calcul
    const relevantEngagements = editingEngagement 
      ? engagements.filter(eng => eng.id !== editingEngagement.id)
      : engagements;
    
    relevantEngagements.forEach(engagement => {
      if (engagement.subBudgetLineId === formData.subBudgetLineId) {
        // Vérifier si l'engagement est annulé ou rejeté
        if (engagement.status !== 'cancelled' && engagement.status !== 'rejected') {
          totalEngaged += engagement.amount;
        }
      }
    });

    // Calculer le montant disponible
    const available = (subBudgetLine.notifiedAmount || 0) - totalEngaged;
    setAvailableAmount(available > 0 ? available : 0);

    // Vérifier si le montant saisi dépasse le disponible
    const amountValue = parseFloat(formData.amount) || 0;
    if (amountValue > 0 && amountValue > available) {
      setExceedsAvailableAmount(true);
    } else {
      setExceedsAvailableAmount(false);
    }
  };

  // Fonction pour formater le montant
  const formatAmount = (amount: number, currency: string = 'EUR') => {
    return amount.toLocaleString('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  // PERMISSIONS
  const canCreate = hasPermission('engagements', 'create');
  const canEdit = hasPermission('engagements', 'edit');
  const canDelete = hasPermission('engagements', 'delete');
  const canView = hasPermission('engagements', 'view');
  
  // Vérifier si la subvention sélectionnée est active
  const activeGrant = grants.find(grant => grant.status === 'active');
  const canCreateEngag = canCreate && activeGrant;

  // Récupération des données
  const userProfession = getUserProfession();
  const userFullName = getUserFullName();
  const pendingSignatures = getPendingSignatures();
  const selectedGrant = grants.length > 0 ? grants[0] : null;

  // 🚨 GESTIONNAIRES D'ÉVÉNEMENTS

  // Fonction pour signer un engagement existant (édition)
  const handleSignEngagement = (engagement: Engagement | null, signatureType: string) => {
    if (!canSignEngagement(engagement, signatureType)) {
      showWarning('Permission refusée', 'Vous ne pouvez pas signer cet engagement');
      return;
    }

    if (engagement) {
      // Cas d'un engagement existant (édition)
      const updates: Partial<Engagement> = {
        approvals: { ...engagement.approvals }
      };

      if (signatureType === 'supervisor1') {
        updates.approvals = {
          ...updates.approvals,
          supervisor1: {
            name: userFullName,
            date: new Date().toISOString().split('T')[0],
            signature: true,
            observation: approvals.supervisor1.observation
          }
        };
      } else if (signatureType === 'supervisor2') {
        updates.approvals = {
          ...updates.approvals,
          supervisor2: {
            name: userFullName,
            date: new Date().toISOString().split('T')[0],
            signature: true,
            observation: approvals.supervisor2.observation
          }
        };
      } else if (signatureType === 'finalApproval') {
        updates.approvals = {
          ...updates.approvals,
          finalApproval: {
            name: userFullName,
            date: new Date().toISOString().split('T')[0],
            signature: true,
            observation: approvals.finalApproval.observation
          }
        };
      }

      onUpdateEngagement(engagement.id, updates);
      showSuccess('Signature enregistrée', 'Votre signature a été enregistrée avec succès');
      
      // 🎯 NOUVEAU : Fermer automatiquement le popup de modification après signature
      // Seulement si on est en mode édition (editingEngagement existe)
      if (editingEngagement) {
        setTimeout(() => {
          resetForm(); // Cette fonction ferme le popup
        }, 1000); // Attendre 1 seconde pour que l'utilisateur voie le message de succès
      }
    }
    
    // Réinitialiser les observations après signature
    setApprovals(prev => ({
      ...prev,
      [signatureType]: { ...prev[signatureType as keyof typeof approvals], observation: '' }
    }));
  };

  

  // Fonction pour signer un nouvel engagement (création)
  const handleSignNewEngagement = (signatureType: string) => {
    const userProfession = getUserProfession();
    const userName = getUserFullName();
    
    // Vérifier que l'utilisateur peut signer (Coordonnateur National ne peut pas signer en création)
    if (signatureType === 'finalApproval') {
      showWarning('Signature impossible', 'Le Coordonnateur National ne peut pas signer lors de la création d\'un engagement');
      return;
    }
    
    if (!userName) {
      showWarning('Nom manquant', 'Impossible de signer sans nom d\'utilisateur');
      return;
    }
    
    // Mettre à jour les approbations avec la signature
    setApprovals(prev => ({
      ...prev,
      [signatureType]: {
        name: userName,
        signature: true,
        observation: prev[signatureType as keyof typeof prev].observation,
        date: new Date().toISOString().split('T')[0]
      }
    }));
    
    showSuccess('Signature préparée', 'Votre signature sera enregistrée avec le nouvel engagement');
  };

  // Réinitialisation du formulaire
  const resetForm = () => {
    setFormData({
      grantId: selectedGrant?.id || '',
      budgetLineId: '',
      subBudgetLineId: '',
      engagementNumber: '',
      amount: '',
      description: '',
      supplier: '',
      quoteReference: '',
      invoiceNumber: '',
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
    setAvailableAmount(0);
    setExceedsAvailableAmount(false);
    setShowForm(false);
    setEditingEngagement(null);
  };

  // Gestionnaire de changement pour le montant
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData(prev => ({ ...prev, amount: value }));
    
    // Vérifier si le montant dépasse le disponible
    const amountValue = parseFloat(value) || 0;
    if (amountValue > 0 && amountValue > availableAmount) {
      setExceedsAvailableAmount(true);
    } else {
      setExceedsAvailableAmount(false);
    }
  };

  // Soumission du formulaire
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // 🎯 VÉRIFICATION SUBVENTION ACTIVE
    if (!activeGrant) {
      showWarning('Subvention inactive', 'Impossible de créer un engagement car la subvention n\'est pas active');
      return;
    }
    
    if (!canCreate && !editingEngagement) {
      showWarning('Permission refusée', 'Vous n\'avez pas la permission de créer des engagements');
      return;
    }

    if (!canEdit && editingEngagement) {
      showWarning('Permission refusée', 'Vous n\'avez pas la permission de modifier des engagements');
      return;
    }
    
    // Validation des champs obligatoires
    if (!formData.grantId || !formData.budgetLineId || !formData.subBudgetLineId || !formData.amount || !formData.description || !formData.supplier) {
      showValidationError('Champs obligatoires manquants', 'Veuillez remplir tous les champs obligatoires');
      return;
    }

    // 🎯 VÉRIFICATION DU MONTANT DISPONIBLE
    const amountValue = parseFloat(formData.amount);
    if (amountValue > availableAmount) {
      showWarning('Montant insuffisant', `Le montant saisi (${formatAmount(amountValue)} ${getCurrencySymbol(selectedGrant?.currency || 'EUR')}) dépasse le montant disponible (${formatAmount(availableAmount)} ${getCurrencySymbol(selectedGrant?.currency || 'EUR')}) pour cette sous-ligne budgétaire.`);
      return;
    }

    // 🎯 MODIFICATION IMPORTANTE : Préparation des données d'approbation
    // Pour les NOUVEAUX engagements, on enregistre seulement les signatures validées
    const approvalData: any = {};
    
    // Coordinateur de la Subvention - enregistré seulement si signé
    if (approvals.supervisor1.signature && approvals.supervisor1.name) {
      approvalData.supervisor1 = {
        name: approvals.supervisor1.name,
        date: new Date().toISOString().split('T')[0],
        signature: true,
        observation: approvals.supervisor1.observation
      };
    }
    
    // Comptable - enregistré seulement si signé
    if (approvals.supervisor2.signature && approvals.supervisor2.name) {
      approvalData.supervisor2 = {
        name: approvals.supervisor2.name,
        date: new Date().toISOString().split('T')[0],
        signature: true,
        observation: approvals.supervisor2.observation
      };
    }
    
    // Coordonnateur National - NE PEUT PAS signer lors de l'ajout
    // Pour les nouveaux engagements, on n'enregistre JAMAIS le Coordonnateur National
    if (editingEngagement && approvals.finalApproval.signature && approvals.finalApproval.name) {
      approvalData.finalApproval = {
        name: approvals.finalApproval.name,
        date: new Date().toISOString().split('T')[0],
        signature: true,
        observation: approvals.finalApproval.observation
      };
    }

    if (editingEngagement) {
      // Modification d'un engagement existant
      onUpdateEngagement(editingEngagement.id, {
        grantId: formData.grantId,
        budgetLineId: formData.budgetLineId,
        subBudgetLineId: formData.subBudgetLineId,
        engagementNumber: formData.engagementNumber,
        amount: parseFloat(formData.amount),
        description: formData.description,
        supplier: formData.supplier,
        quoteReference: formData.quoteReference,
        invoiceNumber: formData.invoiceNumber,
        date: formData.date,
        status: formData.status,
        approvals: approvalData
      });
      showSuccess('Engagement modifié', 'L\'engagement a été modifié avec succès');
    } else {
      // Création d'un nouvel engagement
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const timestamp = String(Date.now()).slice(-6);
      const engagementNumber = `ENG-${year}-${month}-${timestamp}`;
      
      onAddEngagement({
        grantId: formData.grantId,
        budgetLineId: formData.budgetLineId,
        subBudgetLineId: formData.subBudgetLineId,
        engagementNumber: engagementNumber,
        amount: parseFloat(formData.amount),
        description: formData.description,
        supplier: formData.supplier,
        quoteReference: formData.quoteReference,
        invoiceNumber: formData.invoiceNumber,
        date: formData.date,
        status: formData.status,
        approvals: Object.keys(approvalData).length > 0 ? approvalData : undefined
      });
      showSuccess('Engagement créé', 'L\'engagement a été créé avec succès');
    }

    resetForm();
  };

  // Début de l'édition d'un engagement
  const startEdit = (engagement: Engagement) => {
    if (!canEdit) {
      showWarning('Permission refusée', 'Vous n\'avez pas la permission de modifier des engagements');
      return;
    }
    
    setEditingEngagement(engagement);
    setFormData({
      grantId: engagement.grantId,
      budgetLineId: engagement.budgetLineId,
      subBudgetLineId: engagement.subBudgetLineId,
      engagementNumber: engagement.engagementNumber,
      amount: engagement.amount.toString(),
      description: engagement.description,
      supplier: engagement.supplier || '',
      quoteReference: engagement.quoteReference || '',
      invoiceNumber: engagement.invoiceNumber || '',
      date: engagement.date,
      status: engagement.status
    });

    // Pré-remplir les signatures existantes
    if (engagement.approvals) {
      setApprovals({
        supervisor1: engagement.approvals.supervisor1 || { name: '', signature: false, observation: '' },
        supervisor2: engagement.approvals.supervisor2 || { name: '', signature: false, observation: '' },
        finalApproval: engagement.approvals.finalApproval || { name: '', signature: false, observation: '' }
      });
    }

    setShowForm(true);
  };

  // Mise à jour du statut d'un engagement
  const updateEngagementStatus = (engagementId: string, newStatus: Engagement['status']) => {
    if (!canModifyStatus()) {
      showWarning('Permission refusée', 'Seul le Coordonnateur National peut modifier le statut des engagements');
      return;
    }
    onUpdateEngagement(engagementId, { status: newStatus });
    showSuccess('Statut modifié', 'Le statut de l\'engagement a été modifié avec succès');
  };

  // 🔧 FONCTIONS UTILITAIRES

  // Récupération des données liées
  const getBudgetLine = (budgetLineId: string) => {
    return budgetLines.find(line => line.id === budgetLineId);
  };

  const getSubBudgetLine = (subBudgetLineId: string) => {
    return subBudgetLines.find(line => line.id === subBudgetLineId);
  };

  const getGrant = (grantId: string) => {
    return grants.find(grant => grant.id === grantId);
  };

  // Calculer le montant disponible pour une sous-ligne spécifique
  const getAvailableAmountForSubLine = (subBudgetLineId: string): number => {
    const subBudgetLine = subBudgetLines.find(line => line.id === subBudgetLineId);
    if (!subBudgetLine) return 0;

    // Calculer le total déjà engagé pour cette sous-ligne
    const totalEngaged = engagements
      .filter(eng => eng.subBudgetLineId === subBudgetLineId && eng.status !== 'cancelled' && eng.status !== 'rejected')
      .reduce((sum, eng) => sum + eng.amount, 0);

    const available = (subBudgetLine.notifiedAmount || 0) - totalEngaged;
    return available > 0 ? available : 0;
  };

  // Obtenir le montant total engagé pour une sous-ligne
  const getTotalEngagedForSubLine = (subBudgetLineId: string): number => {
    return engagements
      .filter(eng => eng.subBudgetLineId === subBudgetLineId && eng.status !== 'cancelled' && eng.status !== 'rejected')
      .reduce((sum, eng) => sum + eng.amount, 0);
  };

  // Historique des fournisseurs
  const getSupplierHistory = (supplierName: string) => {
    return engagements.filter(eng => 
      eng.supplier && 
      eng.supplier.toLowerCase().includes(supplierName.toLowerCase()) &&
      eng.id !== editingEngagement?.id
    );
  };

  const showSupplierHistoryModal = (supplierName: string) => {
    setSelectedSupplier(supplierName);
    setShowSupplierHistory(true);
  };

  // Gestion de la pagination et du tri
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: string) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />;
  };

  // Filtrage et tri des engagements
  const searchedEngagements = engagements.filter(engagement => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      engagement.engagementNumber.toLowerCase().includes(searchLower) ||
      engagement.description.toLowerCase().includes(searchLower) ||
      (engagement.supplier && engagement.supplier.toLowerCase().includes(searchLower)) ||
      engagement.quoteReference?.toLowerCase().includes(searchLower) ||
      engagement.invoiceNumber?.toLowerCase().includes(searchLower);

    const matchesStatus = statusFilter === 'all' || engagement.status === statusFilter;
    const matchesDate = !dateFilter || engagement.date === dateFilter;
    const matchesSupplier = !supplierFilter || 
      (engagement.supplier && engagement.supplier.toLowerCase().includes(supplierFilter.toLowerCase()));

    return matchesSearch && matchesStatus && matchesDate && matchesSupplier;
  });

  const sortedEngagements = [...searchedEngagements].sort((a, b) => {
    let aValue: any = a[sortField as keyof Engagement];
    let bValue: any = b[sortField as keyof Engagement];

    if (sortField === 'amount') {
      aValue = parseFloat(aValue);
      bValue = parseFloat(bValue);
    } else if (sortField === 'date') {
      aValue = new Date(aValue).getTime();
      bValue = new Date(bValue).getTime();
    }

    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Pagination
  const totalPages = Math.ceil(sortedEngagements.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentEngagements = sortedEngagements.slice(startIndex, endIndex);

  // Navigation des pages
  const goToPage = (page: number) => setCurrentPage(page);
  const goToPreviousPage = () => currentPage > 1 && setCurrentPage(currentPage - 1);
  const goToNextPage = () => currentPage < totalPages && setCurrentPage(currentPage + 1);

  // 🎯 MODIFICATION : Export PDF avec logo uniquement sur la première page
  const exportEngagementForm = async () => {
    const engagement = editingEngagement;
    if (!engagement) return;

    setIsGeneratingPDF(true);
    
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;

      // Générer le contenu principal (première page avec logo)
      const mainContent = generateMainPDFContent(engagement);
      const tempMainDiv = document.createElement('div');
      tempMainDiv.innerHTML = mainContent;
      document.body.appendChild(tempMainDiv);

      const mainCanvas = await html2canvas(tempMainDiv, {
        scale: 2,
        useCORS: true,
        logging: false
      });
      document.body.removeChild(tempMainDiv);

      const mainImgData = mainCanvas.toDataURL('image/png');
      const mainImgWidth = pageWidth - (margin * 2);
      const mainImgHeight = (mainCanvas.height * mainImgWidth) / mainCanvas.width;

      // Ajouter la première page avec le contenu principal et le logo
      pdf.addImage(mainImgData, 'PNG', margin, margin, mainImgWidth, mainImgHeight);

      // Générer le contenu des signatures (deuxième page SANS logo)
      const signatureContent = generateSignaturePDFContent(engagement);
      const tempSignatureDiv = document.createElement('div');
      tempSignatureDiv.innerHTML = signatureContent;
      document.body.appendChild(tempSignatureDiv);

      const signatureCanvas = await html2canvas(tempSignatureDiv, {
        scale: 2,
        useCORS: true,
        logging: false
      });
      document.body.removeChild(tempSignatureDiv);

      const signatureImgData = signatureCanvas.toDataURL('image/png');
      const signatureImgWidth = pageWidth - (margin * 2);
      const signatureImgHeight = (signatureCanvas.height * signatureImgWidth) / signatureCanvas.width;

      // Ajouter une deuxième page pour les signatures (sans logo)
      pdf.addPage();
      pdf.addImage(signatureImgData, 'PNG', margin, margin, signatureImgWidth, signatureImgHeight);

      // Télécharger le PDF
      pdf.save(`engagement-${engagement.engagementNumber}.pdf`);
      
    } catch (error) {
      console.error('Erreur lors de la génération du PDF:', error);
      showWarning('Erreur', 'Impossible de générer le PDF. Veuillez réessayer.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // 🎯 MODIFICATION : Génération du contenu principal avec logo
  const generateMainPDFContent = (engagement: Engagement) => {
    const budgetLine = getBudgetLine(engagement.budgetLineId);
    const subBudgetLine = getSubBudgetLine(engagement.subBudgetLineId);
    const grant = getGrant(engagement.grantId);
    const currencySymbol = getCurrencySymbol(grant?.currency || 'EUR');
    const availableAmountForSubLine = getAvailableAmountForSubLine(engagement.subBudgetLineId);
    const totalEngagedForSubLine = getTotalEngagedForSubLine(engagement.subBudgetLineId);

    return `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
        <!-- Header avec Logo -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #2c5aa0;">
          <div style="flex: 1;">
            <h1 style="color: #2c5aa0; margin-bottom: 10px; font-size: 24px;">FICHE D'ENGAGEMENT</h1>
            <h2 style="color: #555; font-size: 18px; margin-bottom: 10px;">${engagement.engagementNumber}</h2>
            <p>Date: ${new Date(engagement.date).toLocaleDateString('fr-FR', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}</p>
          </div>
          <div style="width: 80px; height: 32px;">
            <img src="/budgetbase/logo.png" alt="Logo" style="width: 100%; height: 100%; object-fit: contain;" />
          </div>
        </div>
        
        <!-- Informations de la Ligne Budgétaire -->
        <div style="margin-bottom: 25px; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background: #fafafa;">
          <h3 style="color: #2c5aa0; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #eee; font-size: 16px;">
            Informations de la Ligne Budgétaire
          </h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
            <div>
              <strong>Subvention:</strong>
              <div style="border: 1px solid #ccc; padding: 8px; margin: 5px 0; border-radius: 4px; background: #fff;">
                ${grant?.name || 'Non spécifié'}
              </div>
            </div>
            <div>
              <strong>Référence:</strong>
              <div style="border: 1px solid #ccc; padding: 8px; margin: 5px 0; border-radius: 4px; background: #fff;">
                ${grant?.reference || 'N/A'}
              </div>
            </div>
            <div>
              <strong>Ligne Budgétaire:</strong>
              <div style="border: 1px solid #ccc; padding: 8px; margin: 5px 0; border-radius: 4px; background: #fff;">
                ${budgetLine?.code || 'N/A'} - ${budgetLine?.name || 'Ligne supprimée'}
              </div>
            </div>
            <div>
              <strong>Sous-Ligne Budgétaire:</strong>
              <div style="border: 1px solid #ccc; padding: 8px; margin: 5px 0; border-radius: 4px; background: #fff;">
                ${subBudgetLine?.code || 'N/A'} - ${subBudgetLine?.name || 'Sous-ligne supprimée'}
              </div>
            </div>
          </div>
          
          <!-- Informations financières de la sous-ligne -->
          <div style="margin-top: 20px; padding: 15px; border: 1px solid #2c5aa0; border-radius: 6px; background: #f0f7ff;">
            <h4 style="color: #2c5aa0; margin-bottom: 10px; font-size: 14px;">État financier de la sous-ligne</h4>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
              <div style="text-align: center;">
                <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Budget notifié</div>
                <div style="font-weight: bold; color: #2c5aa0;">${formatAmount(subBudgetLine?.notifiedAmount || 0)} ${currencySymbol}</div>
              </div>
              <div style="text-align: center;">
                <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Total engagé</div>
                <div style="font-weight: bold; color: #d97706;">${formatAmount(totalEngagedForSubLine)} ${currencySymbol}</div>
              </div>
              <div style="text-align: center;">
                <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Disponible</div>
                <div style="font-weight: bold; color: #059669;">${formatAmount(availableAmountForSubLine)} ${currencySymbol}</div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Détails de l'Engagement -->
        <div style="margin-bottom: 25px; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background: #fafafa;">
          <h3 style="color: #2c5aa0; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #eee; font-size: 16px;">
            Détails de l'Engagement
          </h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
            <div>
              <strong>N° d'Engagement:</strong>
              <div style="border: 1px solid #ccc; padding: 8px; margin: 5px 0; border-radius: 4px; background: #fff;">
                ${engagement.engagementNumber}
              </div>
            </div>
            <div>
              <strong>Date:</strong>
              <div style="border: 1px solid #ccc; padding: 8px; margin: 5px 0; border-radius: 4px; background: #fff;">
                ${new Date(engagement.date).toLocaleDateString('fr-FR')}
              </div>
            </div>
            <div>
              <strong>Fournisseur:</strong>
              <div style="border: 1px solid #ccc; padding: 8px; margin: 5px 0; border-radius: 4px; background: #fff;">
                ${engagement.supplier || 'Non spécifié'}
              </div>
            </div>
            <div>
              <strong>Statut:</strong>
              <div style="border: 1px solid #ccc; padding: 8px; margin: 5px 0; border-radius: 4px; background: #fff;">
                ${ENGAGEMENT_STATUS[engagement.status]?.label || engagement.status}
              </div>
            </div>
            <div>
              <strong>Montant:</strong>
              <div style="border: 1px solid #ccc; padding: 8px; margin: 5px 0; border-radius: 4px; background: #fff;">
                ${engagement.amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
              </div>
            </div>
            <div>
              <strong>Devise:</strong>
              <div style="border: 1px solid #ccc; padding: 8px; margin: 5px 0; border-radius: 4px; background: #fff;">
                ${grant?.currency || 'EUR'} (${currencySymbol})
              </div>
            </div>
          </div>
          
          <div style="margin-bottom: 15px;">
            <strong>Description:</strong>
            <div style="border: 1px solid #ccc; padding: 8px; margin: 5px 0; border-radius: 4px; background: #fff; min-height: 60px;">
              ${engagement.description.replace(/\n/g, '<br>')}
            </div>
          </div>
          
          ${engagement.quoteReference ? `
          <div style="margin-bottom: 10px;">
            <strong>Référence du Devis:</strong>
            <div style="border: 1px solid #ccc; padding: 8px; margin: 5px 0; border-radius: 4px; background: #fff;">
              ${engagement.quoteReference}
            </div>
          </div>
          ` : ''}
          
          ${engagement.invoiceNumber ? `
          <div>
            <strong>N° de Facture:</strong>
            <div style="border: 1px solid #ccc; padding: 8px; margin: 5px 0; border-radius: 4px; background: #fff;">
              ${engagement.invoiceNumber}
            </div>
          </div>
          ` : ''}
        </div>
        
        <!-- Footer -->
        <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #2c5aa0; text-align: center; font-size: 12px; color: #777;">
          <p>Page 1/2 - Document généré le ${new Date().toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}</p>
          <p>Fiche d'engagement - ${engagement.engagementNumber}</p>
        </div>
      </div>
    `;
  };

  // 🎯 MODIFICATION : Génération du contenu des signatures SANS logo
  const generateSignaturePDFContent = (engagement: Engagement) => {
    const currentApprovals = engagement.approvals || approvals;

    return `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; padding-top: 50px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2c5aa0; margin-bottom: 10px; font-size: 24px;">SIGNATURES D'APPROBATION</h1>
          <h2 style="color: #555; font-size: 18px; margin-bottom: 10px;">${engagement.engagementNumber}</h2>
        </div>
        
        <!-- Signatures -->
        <div style="margin-bottom: 25px;">
          <h3 style="color: #2c5aa0; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #eee; font-size: 16px;">
            Signatures d'Approbation
          </h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px;">
            <div style="border: 1px solid #ccc; padding: 20px; text-align: center; min-height: 150px; border-radius: 8px; background: #fff;">
              <h4 style="font-size: 14px; color: #555; margin-bottom: 15px;">Coordinateur de la subvention</h4>
              <div style="height: 1px; background: #ccc; margin: 20px 0;"></div>
              <div style="border: 1px solid #ccc; padding: 10px; margin: 10px 0; border-radius: 4px; min-height: 40px; background: #f9f9f9;">
                ${currentApprovals.supervisor1?.name || '_________________________'}
              </div>
              <p>Date: ${(currentApprovals.supervisor1 as any)?.date || '___/___/_____'}</p>
              <p>Signature: ${currentApprovals.supervisor1?.signature ? '✅ Validée' : '◻ Non validée'}</p>
              ${currentApprovals.supervisor1?.observation ? `
              <div style="margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 4px;">
                <strong style="font-size: 11px;">Observation:</strong>
                <p style="font-size: 11px; color: #666; margin: 5px 0 0 0;">${currentApprovals.supervisor1.observation}</p>
              </div>
              ` : ''}
            </div>
            
            <div style="border: 1px solid #ccc; padding: 20px; text-align: center; min-height: 150px; border-radius: 8px; background: #fff;">
              <h4 style="font-size: 14px; color: #555; margin-bottom: 15px;">Comptable</h4>
              <div style="height: 1px; background: #ccc; margin: 20px 0;"></div>
              <div style="border: 1px solid #ccc; padding: 10px; margin: 10px 0; border-radius: 4px; min-height: 40px; background: #f9f9f9;">
                ${currentApprovals.supervisor2?.name || '_________________________'}
              </div>
              <p>Date: ${(currentApprovals.supervisor2 as any)?.date || '___/___/_____'}</p>
              <p>Signature: ${currentApprovals.supervisor2?.signature ? '✅ Validée' : '◻ Non validée'}</p>
              ${currentApprovals.supervisor2?.observation ? `
              <div style="margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 4px;">
                <strong style="font-size: 11px;">Observation:</strong>
                <p style="font-size: 11px; color: #666; margin: 5px 0 0 0;">${currentApprovals.supervisor2.observation}</p>
              </div>
              ` : ''}
            </div>
            
            <div style="border: 1px solid #ccc; padding: 20px; text-align: center; min-height: 150px; border-radius: 8px; background: #fff;">
              <h4 style="font-size: 14px; color: #555; margin-bottom: 15px;">Coordonnateur national</h4>
              <div style="height: 1px; background: #ccc; margin: 20px 0;"></div>
              <div style="border: 1px solid #ccc; padding: 10px; margin: 10px 0; border-radius: 4px; min-height: 40px; background: #f9f9f9;">
                ${currentApprovals.finalApproval?.name || '_________________________'}
              </div>
              <p>Date: ${(currentApprovals.finalApproval as any)?.date || '___/___/_____'}</p>
              <p>Signature: ${currentApprovals.finalApproval?.signature ? '✅ Validée' : '◻ Non validée'}</p>
              ${currentApprovals.finalApproval?.observation ? `
              <div style="margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 4px;">
                <strong style="font-size: 11px;">Observation:</strong>
                <p style="font-size: 11px; color: #666; margin: 5px 0 0 0;">${currentApprovals.finalApproval.observation}</p>
              </div>
              ` : ''}
            </div>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="margin-top: 50px; padding-top: 20px; border-top: 2px solid #2c5aa0; text-align: center; font-size: 12px; color: #777;">
          <p>Page 2/2 - Signatures d'approbation</p>
          <p>Fiche d'engagement - ${engagement.engagementNumber}</p>
        </div>
      </div>
    `;
  };

  const getCurrencySymbol = (currency: Grant['currency']) => {
    switch (currency) {
      case 'EUR': return '€';
      case 'USD': return '$';
      case 'XOF': return 'CFA';
      default: return '€';
    }
  };

  const formatCurrency = (amount: number, currency: Grant['currency']) => {
    return amount.toLocaleString('fr-FR', { 
      style: 'currency', 
      currency: currency === 'XOF' ? 'XOF' : currency,
      minimumFractionDigits: currency === 'XOF' ? 0 : 2
    });
  };

  const truncateText = (text: string, maxLength: number) => {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  // Fonction pour basculer l'affichage des observations
  const toggleObservation = (signatureType: string) => {
    setShowObservations(prev => ({
      ...prev,
      [signatureType]: !prev[signatureType as keyof typeof showObservations]
    }));
  };

  // Fonction pour obtenir l'icône de signature
  const getSignatureIcon = (engagement: Engagement, signatureType: string) => {
    const approval = engagement.approvals?.[signatureType as keyof typeof engagement.approvals];
    if (approval?.signature) {
      return <CheckCircle className="w-4 h-4 text-green-600" />;
    } else {
      return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  // Rendu des champs manquants du formulaire
  const renderFormFields = () => {
    const subBudgetLine = getSubBudgetLine(formData.subBudgetLineId);
    const totalEngaged = getTotalEngagedForSubLine(formData.subBudgetLineId);
    const currencySymbol = getCurrencySymbol(selectedGrant?.currency || 'EUR');

    return (
      <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sous-ligne budgétaire *
            </label>
            <select
              value={formData.subBudgetLineId}
              onChange={(e) => setFormData(prev => ({ ...prev, subBudgetLineId: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              disabled={!formData.budgetLineId}
            >
              <option value="">Sélectionner une sous-ligne</option>
              {subBudgetLines.filter(line => line.budgetLineId === formData.budgetLineId).map(line => (
                <option key={line.id} value={line.id}>
                  {line.code} - {line.name} (Budget: {formatAmount(line.notifiedAmount || 0)} {currencySymbol})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date *
            </label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
        </div>

        {/* Affichage des informations financières de la sous-ligne */}
        {formData.subBudgetLineId && subBudgetLine && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200 mb-4">
            <h4 className="font-medium text-gray-900 mb-3 flex items-center">
              <FileText className="w-4 h-4 mr-2 text-blue-600" />
              État financier de la sous-ligne
            </h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-xs text-gray-600 mb-1">Budget notifié</p>
                <p className="text-lg font-bold text-blue-600">
                  {formatAmount(subBudgetLine.notifiedAmount || 0)} {currencySymbol}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-600 mb-1">Total engagé</p>
                <p className="text-lg font-bold text-orange-600">
                  {formatAmount(totalEngaged)} {currencySymbol}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-600 mb-1">Disponible</p>
                <p className={`text-lg font-bold ${availableAmount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatAmount(availableAmount)} {currencySymbol}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Montant ({currencySymbol}) *
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.amount}
                onChange={handleAmountChange}
                className={`w-full px-3 py-2 border ${exceedsAvailableAmount ? 'border-red-300' : 'border-gray-300'} rounded-lg focus:ring-2 ${exceedsAvailableAmount ? 'focus:ring-red-500' : 'focus:ring-blue-500'} focus:border-transparent pl-8`}
                placeholder="0.00"
                required
              />
              {exceedsAvailableAmount && (
                <div className="absolute -bottom-6 left-0 text-xs text-red-600 font-medium">
                  ⚠️ Montant supérieur au disponible ({formatAmount(availableAmount)} {currencySymbol})
                </div>
              )}
            </div>
            {formData.subBudgetLineId && availableAmount > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                Disponible: {formatAmount(availableAmount)} {currencySymbol}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Fournisseur *
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={formData.supplier}
                onChange={(e) => setFormData(prev => ({ ...prev, supplier: e.target.value }))}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Nom du fournisseur"
                required
              />
              {formData.supplier && (
                <button
                  type="button"
                  onClick={() => showSupplierHistoryModal(formData.supplier)}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Voir l'historique du fournisseur"
                >
                  <Eye className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Description *
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={3}
            placeholder="Description de l'engagement..."
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Référence du devis
            </label>
            <input
              type="text"
              value={formData.quoteReference}
              onChange={(e) => setFormData(prev => ({ ...prev, quoteReference: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Ex: DEV-2024-001"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              N° Facture
            </label>
            <input
              type="text"
              value={formData.invoiceNumber}
              onChange={(e) => setFormData(prev => ({ ...prev, invoiceNumber: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Ex: FAC-2024-001"
            />
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Statut
          </label>
          <select
            value={formData.status}
            onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as Engagement['status'] }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="pending">En attente</option>
            {userProfession === "Coordonnateur National" && (
              <>
                <option value="approved">Approuvé</option>
                <option value="rejected">Rejeté</option>
              </>
            )}
          </select>
        </div>
      </>
    );
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

  if (!hasModuleAccess('engagements')) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Accès non autorisé</h2>
          <p className="text-gray-500">Vous n'avez pas les permissions nécessaires pour accéder à ce module.</p>
        </div>
      </div>
    );
  }

  // 🎯 RENDU PRINCIPAL
  return (
    <div className="space-y-6">
      {/* Header avec notifications de signatures en attente */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gestion des Engagements</h2>
          <p className="text-gray-600 mt-1">Suivi et validation des engagements par ligne budgétaire</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Notification des signatures en attente */}
          {pendingSignatures.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-2">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-orange-600" />
                <span className="text-sm font-medium text-orange-800">
                  {pendingSignatures.length} signature(s) en attente
                </span>
              </div>
            </div>
          )}
          
          {canCreate && (
            <button
              onClick={() => {
                if (!selectedGrant) {
                  showWarning('Aucune subvention', 'Aucune subvention disponible pour ajouter un engagement');
                  return;
                }
                setFormData(prev => ({ ...prev, grantId: selectedGrant.id }));
                setShowForm(true);
              }}
              disabled={!canCreateEngag}
              className={`px-4 py-2 rounded-xl font-medium transition-all duration-200 flex items-center space-x-2 ${
                canCreateEngag
                  ? 'bg-gradient-to-r from-green-600 to-blue-600 text-white hover:shadow-lg transform hover:scale-[1.02]'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>Nouvel Engagement</span>
            </button>
          )}
        </div>
      </div>

      {/* Barre de recherche et filtres */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div className="relative">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">Tous les statuts</option>
              <option value="pending">En attente</option>
              <option value="approved">Approuvé</option>
              <option value="rejected">Rejeté</option>
            </select>
          </div>
          
          <div>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div>
            <input
              type="text"
              placeholder="Filtrer par fournisseur"
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
        
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center space-x-4 text-sm text-gray-600">
            <span>{sortedEngagements.length} engagement(s) trouvé(s)</span>
          </div>
        </div>
      </div>

      {/* Informations sur la subvention */}
      {selectedGrant && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-6 border border-blue-200">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-4 gap-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{selectedGrant.name}</h3>
              <p className="text-gray-600">{selectedGrant.reference} - {selectedGrant.grantingOrganization}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Devise</p>
              <p className="text-lg font-bold text-blue-600">
                {selectedGrant.currency} ({getCurrencySymbol(selectedGrant.currency)})
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-sm text-gray-600">Montant Total</p>
              <p className="text-xl font-bold text-blue-600">
                {formatCurrency(selectedGrant.totalAmount, selectedGrant.currency)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">Engagements</p>
              <p className="text-xl font-bold text-green-600">{engagements.length}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">Montant Engagé</p>
              <p className="text-xl font-bold text-orange-600">
                {formatCurrency(engagements.reduce((sum, eng) => sum + eng.amount, 0), selectedGrant.currency)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">En Attente</p>
              <p className="text-xl font-bold text-yellow-600">{engagements.filter(eng => eng.status === 'pending').length}</p>
            </div>
          </div>
        </div>
      )}

      {/* Modal du formulaire */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FileText className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    {editingEngagement ? 'Modifier l\'engagement' : 'Nouvel engagement'}
                  </h2>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {editingEngagement && (
                  <button
                    onClick={exportEngagementForm}
                    disabled={isGeneratingPDF}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                    title="Exporter la fiche"
                  >
                    {isGeneratingPDF ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                    ) : (
                      <Download className="w-5 h-5" />
                    )}
                  </button>
                )}
                <button
                  onClick={resetForm}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Champs du formulaire */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Subvention *
                  </label>
                  <select
                    value={formData.grantId}
                    onChange={(e) => setFormData(prev => ({ ...prev, grantId: e.target.value, budgetLineId: '' }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-100"
                    required
                    disabled={!editingEngagement}
                  >
                    <option value="">Sélectionner une subvention</option>
                    {grants.map(grant => (
                      <option key={grant.id} value={grant.id}>
                        {grant.name} ({grant.reference})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ligne budgétaire *
                  </label>
                  <select
                    value={formData.budgetLineId}
                    onChange={(e) => setFormData(prev => ({ ...prev, budgetLineId: e.target.value, subBudgetLineId: '' }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                    disabled={!formData.grantId}
                  >
                    <option value="">Sélectionner une ligne</option>
                    {budgetLines.filter(line => line.grantId === formData.grantId).map(line => (
                      <option key={line.id} value={line.id}>
                        {line.code} - {line.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {renderFormFields()}

              {/* Section Signatures - Affichée seulement pour les rôles autorisés */}
              {canViewSignatureSection() && (
                <div className="bg-yellow-50 rounded-xl p-6 border border-yellow-200">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <User className="w-5 h-5 mr-2" />
                    Signatures d'Approbation
                    {!editingEngagement && (
                      <span className="ml-2 text-sm font-normal text-blue-600 bg-blue-100 px-2 py-1 rounded">
                        Mode création
                      </span>
                    )}
                  </h3>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Coordinateur de la Subvention */}
                    <div className="bg-white rounded-lg p-4 border border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-gray-800">Coordinateur de la Subvention</h4>
                        {canSignEngagement(editingEngagement, 'supervisor1') && (
                          <button
                            type="button"
                            onClick={() => editingEngagement 
                              ? handleSignEngagement(editingEngagement, 'supervisor1')
                              : handleSignNewEngagement('supervisor1')
                            }
                            className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors"
                          >
                            Signer
                          </button>
                        )}
                      </div>
                      
                      <div className="mb-3">
                        <label className="block text-xs text-gray-600 mb-1">Nom du signataire</label>
                        <input
                          type="text"
                          value={approvals.supervisor1.name}
                          onChange={(e) => !editingEngagement && setApprovals(prev => ({
                            ...prev,
                            supervisor1: { ...prev.supervisor1, name: e.target.value }
                          }))}
                          className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                            editingEngagement || approvals.supervisor1.signature ? 'bg-gray-100' : ''
                          }`}
                          disabled={editingEngagement || approvals.supervisor1.signature}
                          placeholder={userProfession === 'Coordinateur de la Subvention' ? getUserFullName() : "Nom du coordinateur"}
                        />
                      </div>
                      
                      <div className="flex items-center justify-between mb-3">
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={approvals.supervisor1.signature}
                            onChange={(e) => setApprovals(prev => ({
                              ...prev,
                              supervisor1: { ...prev.supervisor1, signature: e.target.checked }
                            }))}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            disabled={true} // La case est gérée par le bouton "Signer"
                          />
                          <span className="text-sm text-gray-700">
                            {approvals.supervisor1.signature ? '✅ Signature validée' : 'Signature en attente'}
                          </span>
                        </label>
                        
                        <button
                          type="button"
                          onClick={() => toggleObservation('supervisor1')}
                          className="text-blue-600 text-sm hover:text-blue-800 flex items-center space-x-1"
                        >
                          <span>Observation</span>
                          {showObservations.supervisor1 ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                      
                      {showObservations.supervisor1 && (
                        <div className="mt-3">
                          <textarea
                            value={approvals.supervisor1.observation}
                            onChange={(e) => setApprovals(prev => ({
                              ...prev,
                              supervisor1: { ...prev.supervisor1, observation: e.target.value }
                            }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            rows={3}
                            placeholder="Saisissez votre observation..."
                            disabled={approvals.supervisor1.signature}
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            {approvals.supervisor1.signature 
                              ? "Observation verrouillée après signature" 
                              : "Cette observation sera enregistrée avec votre signature"
                            }
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Comptable */}
                    <div className="bg-white rounded-lg p-4 border border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-gray-800">Comptable</h4>
                        {canSignEngagement(editingEngagement, 'supervisor2') && (
                          <button
                            type="button"
                            onClick={() => editingEngagement 
                              ? handleSignEngagement(editingEngagement, 'supervisor2')
                              : handleSignNewEngagement('supervisor2')
                            }
                            className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors"
                          >
                            Signer
                          </button>
                        )}
                      </div>
                      
                      <div className="mb-3">
                        <label className="block text-xs text-gray-600 mb-1">Nom du signataire</label>
                        <input
                          type="text"
                          value={approvals.supervisor2.name}
                          onChange={(e) => !editingEngagement && setApprovals(prev => ({
                            ...prev,
                            supervisor2: { ...prev.supervisor2, name: e.target.value }
                          }))}
                          className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                            editingEngagement || approvals.supervisor2.signature ? 'bg-gray-100' : ''
                          }`}
                          disabled={editingEngagement || approvals.supervisor2.signature}
                          placeholder={userProfession === 'Comptable' ? getUserFullName() : "Nom du comptable"}
                        />
                      </div>
                      
                      <div className="flex items-center justify-between mb-3">
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={approvals.supervisor2.signature}
                            onChange={(e) => setApprovals(prev => ({
                              ...prev,
                              supervisor2: { ...prev.supervisor2, signature: e.target.checked }
                            }))}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            disabled={true}
                          />
                          <span className="text-sm text-gray-700">
                            {approvals.supervisor2.signature ? '✅ Signature validée' : 'Signature en attente'}
                          </span>
                        </label>
                        
                        <button
                          type="button"
                          onClick={() => toggleObservation('supervisor2')}
                          className="text-blue-600 text-sm hover:text-blue-800 flex items-center space-x-1"
                        >
                          <span>Observation</span>
                          {showObservations.supervisor2 ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                      
                      {showObservations.supervisor2 && (
                        <div className="mt-3">
                          <textarea
                            value={approvals.supervisor2.observation}
                            onChange={(e) => setApprovals(prev => ({
                              ...prev,
                              supervisor2: { ...prev.supervisor2, observation: e.target.value }
                            }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            rows={3}
                            placeholder="Saisissez votre observation..."
                            disabled={approvals.supervisor2.signature}
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            {approvals.supervisor2.signature 
                              ? "Observation verrouillée après signature" 
                              : "Cette observation sera enregistrée avec votre signature"
                            }
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Coordonnateur National */}
                    <div className="bg-white rounded-lg p-4 border border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-gray-800">Coordonnateur National</h4>
                        {canSignEngagement(editingEngagement, 'finalApproval') && (
                          <button
                            type="button"
                            onClick={() => handleSignEngagement(editingEngagement, 'finalApproval')}
                            className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors"
                          >
                            Signer
                          </button>
                        )}
                      </div>
                      
                      <div className="mb-3">
                        <label className="block text-xs text-gray-600 mb-1">Nom du signataire</label>
                        <input
                          type="text"
                          value={approvals.finalApproval.name}
                          onChange={(e) => !editingEngagement && setApprovals(prev => ({
                            ...prev,
                            finalApproval: { ...prev.finalApproval, name: e.target.value }
                          }))}
                          className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                            editingEngagement || approvals.finalApproval.signature ? 'bg-gray-100' : ''
                          }`}
                          disabled={editingEngagement || approvals.finalApproval.signature || !editingEngagement}
                          placeholder={userProfession === 'Coordonnateur National' ? getUserFullName() : "Nom du coordonnateur"}
                        />
                      </div>
                      
                      {!editingEngagement && (
                        <div className="mb-3 p-2 bg-blue-50 rounded border border-blue-200">
                          <p className="text-xs text-blue-700">
                            ℹ️ Le Coordonnateur National ne peut signer qu'après la création de l'engagement
                          </p>
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between mb-3">
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={approvals.finalApproval.signature}
                            onChange={(e) => setApprovals(prev => ({
                              ...prev,
                              finalApproval: { ...prev.finalApproval, signature: e.target.checked }
                            }))}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            disabled={true}
                          />
                          <span className="text-sm text-gray-700">
                            {approvals.finalApproval.signature ? '✅ Signature validée' : 'Signature en attente'}
                          </span>
                        </label>
                        
                        <button
                          type="button"
                          onClick={() => toggleObservation('finalApproval')}
                          className="text-blue-600 text-sm hover:text-blue-800 flex items-center space-x-1"
                          disabled={!editingEngagement}
                        >
                          <span>Observation</span>
                          {showObservations.finalApproval ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                      
                      {showObservations.finalApproval && (
                        <div className="mt-3">
                          <textarea
                            value={approvals.finalApproval.observation}
                            onChange={(e) => setApprovals(prev => ({
                              ...prev,
                              finalApproval: { ...prev.finalApproval, observation: e.target.value }
                            }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            rows={3}
                            placeholder="Saisissez votre observation..."
                            disabled={approvals.finalApproval.signature || !editingEngagement}
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            {!editingEngagement 
                              ? "Observations disponibles après création" 
                              : approvals.finalApproval.signature 
                                ? "Observation verrouillée après signature" 
                                : "Cette observation sera enregistrée avec votre signature"
                            }
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Information sur le comportement des signatures */}
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <h4 className="font-medium text-blue-900 mb-2">Comportement des signatures :</h4>
                    <ul className="text-sm text-blue-700 space-y-1">
                      <li>• <strong>Coordinateur & Comptable</strong> : Peuvent signer dès la création</li>
                      <li>• <strong>Coordonnateur National</strong> : Ne peut signer qu'après création</li>
                      <li>• Les noms ne sont enregistrés que si la signature est validée</li>
                      <li>• Les observations sont verrouillées après signature</li>
                    </ul>
                  </div>
                </div>
              )}

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Fermer
                </button>

                <button
                  type="submit"
                  disabled={editingEngagement && userProfession !== 'Comptable' || exceedsAvailableAmount}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                    (editingEngagement && userProfession !== 'Comptable') || exceedsAvailableAmount
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {editingEngagement ? (
                    <>
                      {userProfession === 'Comptable' 
                        ? 'Modifier l\'engagement' 
                        : 'Modification réservée au comptable'
                      }
                    </>
                  ) : 'Ajouter'}
                </button>

                {/* <button
                  type="submit"
                  disabled={exceedsAvailableAmount}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                    exceedsAvailableAmount
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {editingEngagement ? 'Modifier' : 'Ajouter'}
                </button> */}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tableau des engagements */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {currentEngagements.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <FileText className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun engagement</h3>
            <p className="text-gray-500 mb-4">Commencez par ajouter votre premier engagement</p>
           
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th 
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('engagementNumber')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Engagement</span>
                        {getSortIcon('engagementNumber')}
                      </div>
                    </th>
                    <th 
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('date')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Date</span>
                        {getSortIcon('date')}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ligne budgétaire
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sous-ligne
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fournisseur
                    </th>
                    <th 
                      className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('amount')}
                    >
                      <div className="flex items-center justify-end space-x-1">
                        <span>Montant</span>
                        {getSortIcon('amount')}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Disponible
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Signatures
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Statut
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {currentEngagements.map(engagement => {
                    const budgetLine = getBudgetLine(engagement.budgetLineId);
                    const subBudgetLine = getSubBudgetLine(engagement.subBudgetLineId);
                    const grant = getGrant(engagement.grantId);
                    const availableForSubLine = getAvailableAmountForSubLine(engagement.subBudgetLineId);
                    const currencySymbol = getCurrencySymbol(grant?.currency || 'EUR');
                    
                    return (
                      <tr key={engagement.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{engagement.engagementNumber}</div>
                            <div className="text-sm text-gray-500 truncate max-w-[150px]">
                              {truncateText(engagement.description, 30)}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-900">
                          {new Date(engagement.date).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm text-gray-900" title={budgetLine?.name || 'Ligne supprimée'}>
                            {truncateText(budgetLine?.name || 'Ligne supprimée', 20)}
                          </div>
                          <div className="text-sm text-gray-500">{budgetLine?.code}</div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm text-gray-900" title={subBudgetLine?.name || 'Sous-ligne supprimée'}>
                            {truncateText(subBudgetLine?.name || 'Sous-ligne supprimée', 20)}
                          </div>
                          <div className="text-sm text-gray-500">{subBudgetLine?.code}</div>
                          <div className="text-xs text-gray-400">
                            {subBudgetLine ? `Budget: ${formatAmount(subBudgetLine.notifiedAmount || 0)} ${currencySymbol}` : ''}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <button
                            onClick={() => engagement.supplier && showSupplierHistoryModal(engagement.supplier)}
                            className="text-sm text-blue-600 hover:text-blue-800 hover:underline cursor-pointer text-left"
                            title={engagement.supplier || 'Non spécifié'}
                          >
                            {truncateText(engagement.supplier || 'Non spécifié', 20)}
                          </button>
                        </td>
                        <td className="px-4 py-4 text-right text-sm font-medium text-gray-900">
                          {grant ? formatCurrency(engagement.amount, grant.currency) : engagement.amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="flex flex-col items-center">
                            <span className={`text-sm font-medium ${availableForSubLine > 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {formatAmount(availableForSubLine)} {currencySymbol}
                            </span>
                            {availableForSubLine < 100 && availableForSubLine > 0 && (
                              <span className="text-xs text-orange-600 bg-orange-50 px-1 rounded mt-1">Faible</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="flex items-center justify-center space-x-2">
                            {getSignatureIcon(engagement, 'supervisor1')}
                            {getSignatureIcon(engagement, 'supervisor2')}
                            {getSignatureIcon(engagement, 'finalApproval')}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          {canModifyStatus() ? (
                            <select
                              value={engagement.status}
                              onChange={(e) => updateEngagementStatus(engagement.id, e.target.value as Engagement['status'])}
                              className={`text-xs font-medium rounded-full px-2 py-1 border-0 ${ENGAGEMENT_STATUS[engagement.status].color}`}
                            >
                              <option value="pending">En attente</option>
                              <option value="approved">Approuvé</option>
                              <option value="rejected">Rejeté</option>
                            </select>
                          ) : (
                            <span className={`text-xs font-medium rounded-full px-2 py-1 ${ENGAGEMENT_STATUS[engagement.status].color}`}>
                              {ENGAGEMENT_STATUS[engagement.status].label}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="flex items-center justify-center space-x-1">
                            {canView && (
                              <button
                                onClick={() => setViewingEngagement(engagement)}
                                className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                title="Voir les détails"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}
                            {canEdit && (
                              <button
                                onClick={() => startEdit(engagement)}
                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Modifier"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 py-4 border-t border-gray-200 gap-4">
                <div className="text-sm text-gray-700">
                  Affichage de {startIndex + 1} à {Math.min(endIndex, sortedEngagements.length)} sur {sortedEngagements.length} engagements
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

      {/* Supplier History Modal */}
      {showSupplierHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Historique du fournisseur: {selectedSupplier}
              </h3>
              <button
                onClick={() => setShowSupplierHistory(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(() => {
              const supplierEngagements = getSupplierHistory(selectedSupplier);
              const totalEngagements = supplierEngagements.length;
              const totalAmount = supplierEngagements.reduce((sum, eng) => sum + eng.amount, 0);
              const approvedAmount = supplierEngagements
                .filter(eng => eng.status === 'approved' || eng.status === 'paid')
                .reduce((sum, eng) => sum + eng.amount, 0);

              return (
                <div className="space-y-4">
                  {/* Statistics */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-blue-50 rounded-lg p-4">
                      <p className="text-sm text-blue-600 font-medium">Total Engagements</p>
                      <p className="text-2xl font-bold text-blue-900">{totalEngagements}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                      <p className="text-sm text-green-600 font-medium">Montant Total</p>
                      <p className="text-2xl font-bold text-green-900">
                        {totalAmount} {getCurrencySymbol(selectedGrant?.currency || 'EUR')}
                      </p>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-4">
                      <p className="text-sm text-purple-600 font-medium">Montant Approuvé</p>
                      <p className="text-2xl font-bold text-purple-900">
                        {approvedAmount} {getCurrencySymbol(selectedGrant?.currency || 'EUR')}
                      </p>
                    </div>
                  </div>

                  {/* Engagements List */}
                  {totalEngagements === 0 ? (
                    <p className="text-gray-500 text-center py-8">
                      Aucun engagement trouvé pour ce fournisseur
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {supplierEngagements.map(engagement => {
                        const budgetLine = getBudgetLine(engagement.budgetLineId);
                        const grant = getGrant(engagement.grantId);
                        
                        return (
                          <div key={engagement.id} className="bg-gray-50 rounded-lg p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-3 mb-2">
                                  <h4 className="font-medium text-gray-900">{engagement.engagementNumber}</h4>
                                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${ENGAGEMENT_STATUS[engagement.status].color}`}>
                                    {ENGAGEMENT_STATUS[engagement.status].label}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600 mb-1">{engagement.description}</p>
                                <p className="text-xs text-gray-500">
                                  {budgetLine?.name} • {grant?.name} • {new Date(engagement.date).toLocaleDateString('fr-FR')}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-gray-900">
                                  {engagement.amount} {getCurrencySymbol(selectedGrant?.currency || 'EUR')}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Engagement Details Modal */}
      {viewingEngagement && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Détails de l'engagement</h2>
              <button
                onClick={closeEngagementDetails}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Informations générales</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-600">Numéro d'engagement</label>
                      <p className="text-sm text-gray-900">{viewingEngagement.engagementNumber}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">Date</label>
                      <p className="text-sm text-gray-900">{new Date(viewingEngagement.date).toLocaleDateString('fr-FR')}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">Statut</label>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${ENGAGEMENT_STATUS[viewingEngagement.status].color}`}>
                        {ENGAGEMENT_STATUS[viewingEngagement.status].label}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Informations financières</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-600">Montant </label>
                      <p className="text-lg font-bold text-gray-900">
                        {formatCurrency(viewingEngagement.amount, selectedGrant?.currency || 'EUR')}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">Fournisseur</label>
                      <p className="text-sm text-gray-900">{viewingEngagement.supplier || 'Non spécifié'}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Lignes budgétaires</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Ligne budgétaire</label>
                    {(() => {
                      const budgetLine = getBudgetLine(viewingEngagement.budgetLineId);
                      const subBudgetLine = getSubBudgetLine(viewingEngagement.subBudgetLineId);
                      const availableForSubLine = getAvailableAmountForSubLine(viewingEngagement.subBudgetLineId);
                      const totalEngagedForSubLine = getTotalEngagedForSubLine(viewingEngagement.subBudgetLineId);
                      
                      return (
                        <div className="mt-1 p-3 bg-gray-50 rounded-lg space-y-2">
                          <p className="text-sm font-medium text-gray-900">{budgetLine?.name || 'Ligne supprimée'}</p>
                          <p className="text-xs text-gray-600">Code: {budgetLine?.code || 'N/A'}</p>
                          {subBudgetLine && (
                            <>
                              <div className="pt-2 border-t border-gray-200">
                                <p className="text-xs font-medium text-gray-600">Sous-ligne: {subBudgetLine.name}</p>
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                  <div>
                                    <p className="text-xs text-gray-600">Budget notifié:</p>
                                    <p className="text-xs font-bold text-blue-600">
                                      {formatAmount(subBudgetLine.notifiedAmount || 0)} {getCurrencySymbol(selectedGrant?.currency || 'EUR')}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-600">Total engagé:</p>
                                    <p className="text-xs font-bold text-orange-600">
                                      {formatAmount(totalEngagedForSubLine)} {getCurrencySymbol(selectedGrant?.currency || 'EUR')}
                                    </p>
                                  </div>
                                </div>
                                <div className="mt-2">
                                  <p className="text-xs text-gray-600">Disponible après cet engagement:</p>
                                  <p className={`text-xs font-bold ${availableForSubLine > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {formatAmount(availableForSubLine)} {getCurrencySymbol(selectedGrant?.currency || 'EUR')}
                                  </p>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600">Sous-ligne budgétaire</label>
                    {(() => {
                      const subBudgetLine = getSubBudgetLine(viewingEngagement.subBudgetLineId);
                      return (
                        <div className="mt-1 p-3 bg-gray-50 rounded-lg">
                          <p className="text-sm font-medium text-gray-900">{subBudgetLine?.name || 'Sous-ligne supprimée'}</p>
                          <p className="text-xs text-gray-600">Code: {subBudgetLine?.code || 'N/A'}</p>
                          {subBudgetLine && (
                            <p className="text-xs text-gray-600">
                              Budget: {formatAmount(subBudgetLine.notifiedAmount || 0)} {getCurrencySymbol(selectedGrant?.currency || 'EUR')}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Description</h3>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-900">{viewingEngagement.description}</p>
                </div>
              </div>

              {viewingEngagement.quoteReference && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Références</h3>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-600">Référence du devis</label>
                      <p className="text-sm text-gray-900">{viewingEngagement.quoteReference}</p>
                    </div>
                    {viewingEngagement.invoiceNumber && (
                      <div>
                        <label className="block text-sm font-medium text-gray-600">N° de Facture</label>
                        <p className="text-sm text-gray-900">{viewingEngagement.invoiceNumber}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {viewingEngagement.approvals && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Signatures d'approbation</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {viewingEngagement.approvals.supervisor1 && (
                      <div className="p-3 bg-yellow-50 rounded-lg">
                        <h4 className="font-medium text-gray-800">Coordinateur de la Subvention</h4>
                        <p className="text-sm text-gray-900">{viewingEngagement.approvals.supervisor1.name}</p>
                        <p className="text-xs text-gray-600">
                          Signé: {viewingEngagement.approvals.supervisor1.signature ? 'Oui' : 'Non'}
                        </p>
                        {viewingEngagement.approvals.supervisor1.date && (
                          <p className="text-xs text-gray-600">
                            Date: {new Date(viewingEngagement.approvals.supervisor1.date).toLocaleDateString('fr-FR')}
                          </p>
                        )}
                        {viewingEngagement.approvals.supervisor1.observation && (
                          <div className="mt-2">
                            <p className="text-xs font-medium text-gray-600">Observation:</p>
                            <p className="text-xs text-gray-500">{viewingEngagement.approvals.supervisor1.observation}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {viewingEngagement.approvals.supervisor2 && (
                      <div className="p-3 bg-yellow-50 rounded-lg">
                        <h4 className="font-medium text-gray-800">Comptable</h4>
                        <p className="text-sm text-gray-900">{viewingEngagement.approvals.supervisor2.name}</p>
                        <p className="text-xs text-gray-600">
                          Signé: {viewingEngagement.approvals.supervisor2.signature ? 'Oui' : 'Non'}
                        </p>
                        {viewingEngagement.approvals.supervisor2.date && (
                          <p className="text-xs text-gray-600">
                            Date: {new Date(viewingEngagement.approvals.supervisor2.date).toLocaleDateString('fr-FR')}
                          </p>
                        )}
                        {viewingEngagement.approvals.supervisor2.observation && (
                          <div className="mt-2">
                            <p className="text-xs font-medium text-gray-600">Observation:</p>
                            <p className="text-xs text-gray-500">{viewingEngagement.approvals.supervisor2.observation}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {viewingEngagement.approvals.finalApproval && (
                      <div className="p-3 bg-yellow-50 rounded-lg">
                        <h4 className="font-medium text-gray-800">Coordonnateur National</h4>
                        <p className="text-sm text-gray-900">{viewingEngagement.approvals.finalApproval.name}</p>
                        <p className="text-xs text-gray-600">
                          Signé: {viewingEngagement.approvals.finalApproval.signature ? 'Oui' : 'Non'}
                        </p>
                        {viewingEngagement.approvals.finalApproval.date && (
                          <p className="text-xs text-gray-600">
                            Date: {new Date(viewingEngagement.approvals.finalApproval.date).toLocaleDateString('fr-FR')}
                          </p>
                        )}
                        {viewingEngagement.approvals.finalApproval.observation && (
                          <div className="mt-2">
                            <p className="text-xs font-medium text-gray-600">Observation:</p>
                            <p className="text-xs text-gray-500">{viewingEngagement.approvals.finalApproval.observation}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EngagementManager;