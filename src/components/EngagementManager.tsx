import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { 
  Plus, Edit, Trash2, FileText, Eye, Download, Printer, User, CheckCircle, Clock, 
  AlertTriangle, X, Search, ChevronUp, ChevronDown, ChevronRight, ChevronLeft, 
  Calendar, Filter, FileSpreadsheet, Circle, CircleDot, AlertOctagon, Users, UserPlus
} from 'lucide-react';
import { showValidationError, showWarning, showSuccess, confirmDelete, showError } from '../utils/alerts';
import { Engagement, BudgetLine, SubBudgetLine, Grant, ENGAGEMENT_STATUS } from '../types';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { exportStyledExcel } from '../utils/excelExport';
import { usePermissions } from '../hooks/usePermissions';
import { useAuth } from '../hooks/useAuth';

// ------------------------------------------------------------------
// COMPOSANT FOURNISSEUR SÉPARÉ (avec gestion interne du focus)
// ------------------------------------------------------------------
// ------------------------------------------------------------------
// COMPOSANT FOURNISSEUR SÉPARÉ (avec gestion interne du focus)
// ------------------------------------------------------------------
interface SupplierSelectorProps {
  existingSuppliers: string[];
  selectedSupplier: string;
  onSelectSupplier: (supplier: string) => void;
  disabled?: boolean;
  className?: string;
}

const SupplierSelector = memo(({
  existingSuppliers,
  selectedSupplier,
  onSelectSupplier,
  disabled = false,
  className = ''
}: SupplierSelectorProps) => {
  // Par défaut : "Nouveau fournisseur" à la création (aucun fournisseur pré-sélectionné),
  // "Sélectionner existant" en modification pour afficher le fournisseur déjà enregistré.
  const [mode, setMode] = useState<'select' | 'new'>(selectedSupplier ? 'select' : 'new');
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredSuppliers, setFilteredSuppliers] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Mettre à jour le terme de recherche si un fournisseur est pré-sélectionné
  useEffect(() => {
    if (selectedSupplier && mode === 'select') {
      setSearchTerm(selectedSupplier);
      setFilteredSuppliers(
        existingSuppliers.filter(s => s.toLowerCase().includes(selectedSupplier.toLowerCase()))
      );
    } else if (selectedSupplier && mode === 'new') {
      setNewSupplierName(selectedSupplier);
    }
  }, [selectedSupplier, existingSuppliers, mode]);

  // Filtrer les fournisseurs lors de la recherche
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    if (value.length > 0) {
      const filtered = existingSuppliers.filter(s =>
        s.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredSuppliers(filtered);
      setShowDropdown(filtered.length > 0);
    } else {
      setFilteredSuppliers(existingSuppliers);
      setShowDropdown(existingSuppliers.length > 0);
    }
  };

  const selectSupplier = (supplier: string) => {
    onSelectSupplier(supplier);
    setSearchTerm(supplier);
    setShowDropdown(false);
    setMode('select');
    setNewSupplierName('');
  };

  const switchToSelectMode = () => {
    setMode('select');
    setSearchTerm('');
    setNewSupplierName('');
    setFilteredSuppliers(existingSuppliers);
    setShowDropdown(existingSuppliers.length > 0);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const switchToNewMode = () => {
    setMode('new');
    setShowDropdown(false);
    setNewSupplierName(selectedSupplier || '');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleNewSupplierChange = (value: string) => {
    setNewSupplierName(value);
    // Mise à jour en direct du parent
    onSelectSupplier(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (mode === 'select' && filteredSuppliers.length > 0) {
        // Sélectionner le premier élément de la liste
        selectSupplier(filteredSuppliers[0]);
      }
    }
    if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  const isSupplierSelected = selectedSupplier && mode === 'select';

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Boutons de basculement */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={switchToSelectMode}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-2 ${
            mode === 'select'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
          disabled={disabled}
        >
          <Users className="w-4 h-4" />
          <span>Sélectionner existant</span>
        </button>
        <button
          type="button"
          onClick={switchToNewMode}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-2 ${
            mode === 'new'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
          disabled={disabled}
        >
          <UserPlus className="w-4 h-4" />
          <span>Nouveau fournisseur</span>
        </button>
      </div>

      {mode === 'select' && (
        <div className="relative">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => {
                if (searchTerm.length > 0) {
                  const filtered = existingSuppliers.filter(s =>
                    s.toLowerCase().includes(searchTerm.toLowerCase())
                  );
                  setFilteredSuppliers(filtered);
                  setShowDropdown(filtered.length > 0);
                } else {
                  setFilteredSuppliers(existingSuppliers);
                  setShowDropdown(existingSuppliers.length > 0);
                }
              }}
              onKeyDown={handleKeyDown}
              placeholder="Rechercher un fournisseur existant..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={disabled}
            />
          </div>

          {showDropdown && filteredSuppliers.length > 0 && (
            <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {filteredSuppliers.map(supplier => (
                <button
                  key={supplier}
                  type="button"
                  onClick={() => selectSupplier(supplier)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 transition-colors flex items-center justify-between border-b border-gray-100 last:border-b-0"
                >
                  <span className="font-medium">{supplier}</span>
                </button>
              ))}
            </div>
          )}

          {showDropdown && filteredSuppliers.length === 0 && searchTerm.length > 0 && (
            <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-3 text-center">
              <p className="text-sm text-gray-500">
                Aucun fournisseur trouvé pour "{searchTerm}"
              </p>
              <button
                type="button"
                onClick={() => {
                  switchToNewMode();
                  setNewSupplierName(searchTerm);
                  onSelectSupplier(searchTerm);
                }}
                className="mt-2 text-sm text-blue-600 hover:text-blue-800 underline"
              >
                Créer "{searchTerm}"
              </button>
            </div>
          )}

          {isSupplierSelected && (
            <div className="mt-2 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm text-green-700">
                Fournisseur sélectionné : <strong>{selectedSupplier}</strong>
              </span>
              <button
                type="button"
                onClick={() => {
                  onSelectSupplier('');
                  setSearchTerm('');
                  setShowDropdown(false);
                }}
                className="ml-auto text-xs text-red-500 hover:text-red-700"
              >
                Effacer
              </button>
            </div>
          )}
        </div>
      )}

      {mode === 'new' && (
        <div>
          <input
            ref={inputRef}
            type="text"
            value={newSupplierName}
            onChange={(e) => handleNewSupplierChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Saisissez le nom du nouveau fournisseur..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={disabled}
          />
          {newSupplierName && (
            <p className="text-xs text-blue-600 mt-1">
              💡 Nouveau fournisseur "{newSupplierName}" sera créé automatiquement
            </p>
          )}
          {/* Vérification si le nom saisi existe déjà */}
          {newSupplierName &&
            existingSuppliers.some(s => s.toLowerCase() === newSupplierName.toLowerCase()) && (
              <div className="mt-2 flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg p-2">
                <AlertTriangle className="w-4 h-4 text-yellow-600" />
                <span className="text-sm text-yellow-700">
                  Ce fournisseur existe déjà.{" "}
                  <button
                    type="button"
                    onClick={() => {
                      switchToSelectMode();
                      setSearchTerm(newSupplierName);
                      selectSupplier(newSupplierName);
                    }}
                    className="text-blue-600 hover:text-blue-800 underline"
                  >
                    Sélectionner {newSupplierName}
                  </button>
                </span>
              </div>
            )}
        </div>
      )}
    </div>
  );
});

SupplierSelector.displayName = 'SupplierSelector';

// ------------------------------------------------------------------
// COMPOSANT PRINCIPAL
// ------------------------------------------------------------------
interface EngagementManagerProps {
  engagements: Engagement[];
  budgetLines: BudgetLine[];
  subBudgetLines: SubBudgetLine[];
  grants: Grant[];
  onAddEngagement: (engagement: Omit<Engagement, 'id'>) => void;
  onUpdateEngagement: (id: string, updates: Partial<Engagement>) => void;
  onDeleteEngagement?: (id: string) => void;
}

interface ApprovalSignature {
  name: string;
  signature: boolean;
  date?: string;
  observation?: string;
}

interface DuplicateCheck {
  isChecking: boolean;
  isDuplicate: boolean;
  duplicateEngagements: Engagement[];
  message: string;
  duplicateType: 'none' | 'supplier_amount' | 'invoice' | 'quote' | 'similar';
}

const EngagementManager: React.FC<EngagementManagerProps> = ({
  engagements,
  budgetLines,
  subBudgetLines,
  grants,
  onAddEngagement,
  onUpdateEngagement,
  onDeleteEngagement
}) => {
  const { hasPermission, hasModuleAccess, loading: permissionsLoading } = usePermissions();
  const { user: currentUser, userProfile, userRole } = useAuth();

  // ÉTATS DU COMPOSANT
  const [showForm, setShowForm] = useState(false);
  const [showSupplierHistory, setShowSupplierHistory] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<string>('');
  const [editingEngagement, setEditingEngagement] = useState<Engagement | null>(null);
  const [viewingEngagement, setViewingEngagement] = useState<Engagement | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // État pour la vérification des doublons
  const [duplicateCheck, setDuplicateCheck] = useState<DuplicateCheck>({
    isChecking: false,
    isDuplicate: false,
    duplicateEngagements: [],
    message: '',
    duplicateType: 'none'
  });

  // État pour l'unicité du numéro de facture
  const [invoiceNumberExists, setInvoiceNumberExists] = useState(false);
  const [existingInvoiceEngagement, setExistingInvoiceEngagement] = useState<Engagement | null>(null);

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

  const getUserFullName = (): string => {
    if (!userProfile) return '';
    if (userProfile.firstName && userProfile.lastName) {
      return `${userProfile.firstName} ${userProfile.lastName}`.trim();
    }
    return userProfile.email || '';
  };

  const getUserProfession = (): string => {
    return userProfile?.profession || '';
  };

  const canViewSignatureSection = (): boolean => {
    const signatureProfessions = ['Coordinateur de la Subvention', 'Comptable', 'Coordonnateur National'];
    return signatureProfessions.includes(getUserProfession());
  };

  const canModifyStatus = (): boolean => {
    return getUserProfession() === 'Coordonnateur National';
  };

  const canSignEngagement = (engagement: Engagement | null, signatureType: string): boolean => {
    const userProfession = getUserProfession();

    if (!engagement && signatureType === 'finalApproval') {
      return false;
    }

    const currentApprovals = engagement ? engagement.approvals : approvals;

    const professionCanSign =
      (signatureType === 'supervisor1' && userProfession === 'Coordinateur de la Subvention') ||
      (signatureType === 'supervisor2' && userProfession === 'Comptable') ||
      (signatureType === 'finalApproval' && userProfession === 'Coordonnateur National');

    if (!professionCanSign) return false;

    const existingApproval = currentApprovals?.[signatureType as keyof typeof currentApprovals];
    if (existingApproval?.signature) return false;

    if (signatureType === 'finalApproval' && engagement) {
      const hasSupervisor1Signed = currentApprovals?.supervisor1?.signature;
      const hasSupervisor2Signed = currentApprovals?.supervisor2?.signature;

      if (!hasSupervisor1Signed || !hasSupervisor2Signed) {
        return false;
      }
    }

    return true;
  };

  const getPendingSignatures = (): Engagement[] => {
    return engagements.filter(engagement => needsUserSignature(engagement));
  };

  const needsUserSignature = (engagement: Engagement): boolean => {
    const userProfession = getUserProfession();
    if (userProfession === 'Coordinateur de la Subvention') {
      return !engagement.approvals?.supervisor1?.signature;
    } else if (userProfession === 'Comptable') {
      return !engagement.approvals?.supervisor2?.signature;
    } else if (userProfession === 'Coordonnateur National') {
      const hasSupervisor1Signed = engagement.approvals?.supervisor1?.signature;
      const hasSupervisor2Signed = engagement.approvals?.supervisor2?.signature;
      const hasFinalSigned = engagement.approvals?.finalApproval?.signature;
      // Le coordonnateur (signataire final) doit signer ET décider (approuver/rejeter).
      // L'élément reste dans la liste "À signer" tant qu'il n'a pas fait les DEUX :
      // il n'en disparaît qu'une fois signé ET son statut décidé (≠ 'pending'),
      // pour lui éviter d'avoir à rechercher l'élément plus tard pour changer le statut.
      const hasDecision = engagement.status !== 'pending';
      return !!(hasSupervisor1Signed && hasSupervisor2Signed && !(hasFinalSigned && hasDecision));
    }
    return false;
  };

  // 🎯 FONCTIONS POUR LA GESTION DES FOURNISSEURS

  const getExistingSuppliers = useCallback((): string[] => {
    return [...new Set(
      engagements
        .filter(e => e.supplier && e.supplier.trim())
        .map(e => e.supplier as string)
    )].sort((a, b) => a.localeCompare(b));
  }, [engagements]);

  // Callback pour la sélection d'un fournisseur (utilisé par SupplierSelector)
  const handleSelectSupplier = useCallback((supplier: string) => {
    setFormData(prev => ({ ...prev, supplier }));
    // La vérification des doublons se fera via l'effet ci-dessous
  }, []);

  // 🎯 FONCTIONS DE VÉRIFICATION DES DOUBLONS

  const checkForDuplicates = useCallback((data: any) => {
    if (!data.supplier || !data.amount || !data.subBudgetLineId) {
      setDuplicateCheck({
        isChecking: false,
        isDuplicate: false,
        duplicateEngagements: [],
        message: '',
        duplicateType: 'none'
      });
      return;
    }

    setDuplicateCheck(prev => ({ ...prev, isChecking: true }));

    const amountValue = parseFloat(data.amount) || 0;
    if (amountValue === 0) {
      setDuplicateCheck({
        isChecking: false,
        isDuplicate: false,
        duplicateEngagements: [],
        message: '',
        duplicateType: 'none'
      });
      return;
    }

    const potentialDuplicates = engagements.filter(engagement => {
      if (editingEngagement && engagement.id === editingEngagement.id) {
        return false;
      }

      const sameSupplier = engagement.supplier?.toLowerCase() === data.supplier.toLowerCase();
      const sameAmount = Math.abs(engagement.amount - amountValue) < 0.01;
      const sameSubLine = engagement.subBudgetLineId === data.subBudgetLineId;
      const sameQuote = data.quoteReference && engagement.quoteReference &&
        engagement.quoteReference.toLowerCase() === data.quoteReference.toLowerCase();
      const sameInvoice = data.invoiceNumber && engagement.invoiceNumber &&
        engagement.invoiceNumber.toLowerCase() === data.invoiceNumber.toLowerCase();

      const descWords = data.description?.toLowerCase().split(' ') || [];
      const engDescWords = engagement.description?.toLowerCase().split(' ') || [];
      const commonWords = descWords.filter(word => engDescWords.includes(word) && word.length > 3);
      const similarDescription = commonWords.length >= 2;

      let score = 0;
      let type: 'none' | 'supplier_amount' | 'invoice' | 'quote' | 'similar' = 'none';

      if (sameSupplier) score += 2;
      if (sameAmount) score += 2;
      if (sameSubLine) score += 1;
      if (sameQuote) { score += 3; type = 'quote'; }
      if (sameInvoice) { score += 3; type = 'invoice'; }
      if (sameSupplier && sameAmount && sameSubLine) { score += 2; type = 'supplier_amount'; }
      if (similarDescription && sameSupplier) { score += 1; type = 'similar'; }

      return score >= 3;
    });

    let duplicateType: DuplicateCheck['duplicateType'] = 'none';
    if (potentialDuplicates.length > 0) {
      const hasInvoice = potentialDuplicates.some(e =>
        data.invoiceNumber && e.invoiceNumber &&
        e.invoiceNumber.toLowerCase() === data.invoiceNumber.toLowerCase()
      );
      const hasQuote = potentialDuplicates.some(e =>
        data.quoteReference && e.quoteReference &&
        e.quoteReference.toLowerCase() === data.quoteReference.toLowerCase()
      );
      const hasSupplierAmount = potentialDuplicates.some(e =>
        e.supplier?.toLowerCase() === data.supplier.toLowerCase() &&
        Math.abs(e.amount - amountValue) < 0.01 &&
        e.subBudgetLineId === data.subBudgetLineId
      );

      if (hasInvoice) duplicateType = 'invoice';
      else if (hasQuote) duplicateType = 'quote';
      else if (hasSupplierAmount) duplicateType = 'supplier_amount';
      else duplicateType = 'similar';
    }

    setDuplicateCheck({
      isChecking: false,
      isDuplicate: potentialDuplicates.length > 0,
      duplicateEngagements: potentialDuplicates,
      message: potentialDuplicates.length > 0
        ? `⚠️ ${potentialDuplicates.length} engagement(s) similaire(s) trouvé(s)`
        : '',
      duplicateType
    });
  }, [engagements, editingEngagement]);

  // 🎯 VÉRIFICATION DE L'UNICITÉ DU NUMÉRO DE FACTURE

  const checkInvoiceNumberUniqueness = (invoiceNumber: string) => {
    if (!invoiceNumber || !invoiceNumber.trim()) {
      setInvoiceNumberExists(false);
      setExistingInvoiceEngagement(null);
      return;
    }

    const trimmedInvoice = invoiceNumber.trim();
    const existing = engagements.find(e =>
      e.invoiceNumber &&
      e.invoiceNumber.toLowerCase() === trimmedInvoice.toLowerCase() &&
      (!editingEngagement || e.id !== editingEngagement.id)
    );

    if (existing) {
      setInvoiceNumberExists(true);
      setExistingInvoiceEngagement(existing);
    } else {
      setInvoiceNumberExists(false);
      setExistingInvoiceEngagement(null);
    }
  };

  // 🎯 VALIDATION FINALE AVANT SOUMISSION

  const validateNoDuplicates = (): boolean => {
    const strictDuplicates = engagements.filter(engagement => {
      if (editingEngagement && engagement.id === editingEngagement.id) return false;

      const sameSupplier = engagement.supplier?.toLowerCase() === formData.supplier.toLowerCase();
      const sameAmount = Math.abs(engagement.amount - parseFloat(formData.amount)) < 0.01;
      const sameSubLine = engagement.subBudgetLineId === formData.subBudgetLineId;
      const sameInvoice = engagement.invoiceNumber && formData.invoiceNumber &&
        engagement.invoiceNumber.toLowerCase() === formData.invoiceNumber.toLowerCase();
      const sameQuote = engagement.quoteReference && formData.quoteReference &&
        engagement.quoteReference.toLowerCase() === formData.quoteReference.toLowerCase();

      if (sameInvoice) return true;
      if (sameQuote) return true;
      if (sameSupplier && sameAmount && sameSubLine) return true;

      return false;
    });

    if (strictDuplicates.length > 0) {
      const duplicateDetails = strictDuplicates.map(e =>
        `• ${e.engagementNumber} - ${e.supplier} - ${e.amount.toLocaleString('fr-FR')} €`
      ).join('\n');

      showWarning(
        '⚠️ Doublon détecté',
        `${strictDuplicates.length} engagement(s) similaire(s) existe(nt) déjà :\n\n${duplicateDetails}\n\n` +
        `Fournisseur: ${formData.supplier}\n` +
        `Montant: ${formData.amount} €\n` +
        `Sous-ligne: ${getSubBudgetLine(formData.subBudgetLineId)?.name || 'N/A'}\n\n` +
        `Voulez-vous continuer quand même ?`
      );

      return window.confirm('Souhaitez-vous vraiment créer cet engagement malgré le doublon détecté ?');
    }

    return true;
  };

  // Effets pour les vérifications
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

  useEffect(() => {
    if (formData.subBudgetLineId) {
      calculateAvailableAmount();
    } else {
      setAvailableAmount(0);
      setExceedsAvailableAmount(false);
    }
  }, [formData.subBudgetLineId, formData.amount, editingEngagement?.id]);

  useEffect(() => {
    checkInvoiceNumberUniqueness(formData.invoiceNumber);
  }, [formData.invoiceNumber, editingEngagement?.id]);

  // Effet pour la vérification des doublons (déclenché quand le fournisseur, le montant ou la sous-ligne change)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.supplier && formData.amount && formData.subBudgetLineId && formData.supplier.length > 1) {
        checkForDuplicates(formData);
      } else {
        setDuplicateCheck({
          isChecking: false,
          isDuplicate: false,
          duplicateEngagements: [],
          message: '',
          duplicateType: 'none'
        });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [formData.supplier, formData.amount, formData.subBudgetLineId, formData.description, formData.quoteReference, formData.invoiceNumber, checkForDuplicates]);

  const calculateAvailableAmount = () => {
    const subBudgetLine = subBudgetLines.find(line => line.id === formData.subBudgetLineId);

    if (!subBudgetLine) {
      setAvailableAmount(0);
      return;
    }

    // ✅ Utiliser la valeur calculée de la sous-ligne (déjà mise à jour par recalculateSubBudgetLines)
    // OU recalculer localement
    let totalEngaged = 0;

    const relevantEngagements = editingEngagement
      ? engagements.filter(eng => eng.id !== editingEngagement.id)
      : engagements;

    relevantEngagements.forEach(engagement => {
      if (engagement.subBudgetLineId === formData.subBudgetLineId) {
        // ✅ EXCLURE : rejected, cancelled, pending (en attente)
        if (engagement.status !== 'rejected' && engagement.status !== 'cancelled' && engagement.status !== 'pending') {
          totalEngaged += engagement.amount;
        }
      }
    });

    const available = (subBudgetLine.notifiedAmount || 0) - totalEngaged;
    setAvailableAmount(available > 0 ? available : 0);

    const amountValue = parseFloat(formData.amount) || 0;
    if (amountValue > 0 && amountValue > available) {
      setExceedsAvailableAmount(true);
    } else {
      setExceedsAvailableAmount(false);
    }
  };

  const formatAmount = (amount: number, currency: string = 'EUR') => {
    return amount.toLocaleString('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const getCurrencySymbol = (currency: Grant['currency']) => {
    switch (currency) {
      case 'EUR': return '€';
      case 'USD': return '$';
      case 'XOF': return 'FCFA';
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

  // PERMISSIONS
  const canCreate = hasPermission('engagements', 'create');
  const canEdit = hasPermission('engagements', 'edit');
  const canDelete = hasPermission('engagements', 'delete');
  const canView = hasPermission('engagements', 'view');
  const canExport = hasPermission('engagements', 'export');

  const activeGrant = grants.find(grant => grant.status === 'active');
  const canCreateEngag = canCreate && activeGrant;

  const userProfession = getUserProfession();
  const userFullName = getUserFullName();
  const pendingSignatures = getPendingSignatures();
  const selectedGrant = grants.length > 0 ? grants[0] : null;

  const isComptable = userProfession === 'Comptable';

  // ✅ Utilisateur signataire + nombre d'engagements en attente de SA signature
  const isSignatory = ['Coordinateur de la Subvention', 'Comptable', 'Coordonnateur National'].includes(userProfession);
  // ✅ Un élément reste "à signer" tant que l'utilisateur ne l'a pas signé, quel que soit le statut.
  // (Approuver/rejeter sans signer ne doit PAS retirer l'élément de la liste.)
  const toSignCount = engagements.filter(e => needsUserSignature(e)).length;

  // 🚨 GESTIONNAIRES D'ÉVÉNEMENTS

  const handleSignEngagement = (engagement: Engagement | null, signatureType: string) => {
    if (!canSignEngagement(engagement, signatureType)) {
      showWarning('Permission refusée', 'Vous ne pouvez pas signer cet engagement');
      return;
    }

    if (engagement) {
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
        // ❌ SUPPRIMEZ la ligne suivante pour ne pas modifier automatiquement le statut
        // updates.status = 'approved';
      }

      onUpdateEngagement(engagement.id, updates);
      showSuccess('Signature enregistrée', 'Votre signature a été enregistrée avec succès');

      if (editingEngagement) {
        setTimeout(() => {
          resetForm();
        }, 1000);
      }
    }

    setApprovals(prev => ({
      ...prev,
      [signatureType]: { ...prev[signatureType as keyof typeof approvals], observation: '' }
    }));
  };

  const handleSignNewEngagement = (signatureType: string) => {
    const userProfession = getUserProfession();
    const userName = getUserFullName();

    if (signatureType === 'finalApproval') {
      showWarning('Signature impossible', 'Le Coordonnateur National ne peut pas signer lors de la création d\'un engagement');
      return;
    }

    if (!userName) {
      showWarning('Nom manquant', 'Impossible de signer sans nom d\'utilisateur');
      return;
    }

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
    setIsSubmitting(false);
    setDuplicateCheck({
      isChecking: false,
      isDuplicate: false,
      duplicateEngagements: [],
      message: '',
      duplicateType: 'none'
    });
    setInvoiceNumberExists(false);
    setExistingInvoiceEngagement(null);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData(prev => ({ ...prev, amount: value }));

    const amountValue = parseFloat(value) || 0;
    if (amountValue > 0 && amountValue > availableAmount) {
      setExceedsAvailableAmount(true);
    } else {
      setExceedsAvailableAmount(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) {
      showWarning('Traitement en cours', 'Veuillez patienter, la soumission est en cours...');
      return;
    }

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

    if (!formData.grantId || !formData.budgetLineId || !formData.subBudgetLineId || !formData.amount || !formData.description || !formData.supplier) {
      showValidationError('Champs obligatoires manquants', 'Veuillez remplir tous les champs obligatoires');
      return;
    }

    // ✅ Vérification du numéro de facture (obligatoire)
    if (!formData.invoiceNumber || !formData.invoiceNumber.trim()) {
      showValidationError('Numéro de facture requis', 'Le numéro de facture est obligatoire. Veuillez saisir un numéro de facture valide.');
      return;
    }

    const amountValue = parseFloat(formData.amount);
    if (amountValue > availableAmount) {
      showWarning('Montant insuffisant', `Le montant saisi (${formatAmount(amountValue)} ${getCurrencySymbol(selectedGrant?.currency || 'EUR')}) dépasse le montant disponible (${formatAmount(availableAmount)} ${getCurrencySymbol(selectedGrant?.currency || 'EUR')}) pour cette sous-ligne budgétaire.`);
      return;
    }

    // ✅ Vérification de l'unicité du numéro de facture
    const trimmedInvoice = formData.invoiceNumber.trim();
    const existing = engagements.find(e =>
      e.invoiceNumber &&
      e.invoiceNumber.toLowerCase() === trimmedInvoice.toLowerCase() &&
      (!editingEngagement || e.id !== editingEngagement.id)
    );

    if (existing) {
      showValidationError(
        'Numéro de facture déjà utilisé',
        `Le numéro de facture "${formData.invoiceNumber}" est déjà utilisé par l'engagement ${existing.engagementNumber} (${existing.supplier}).\n\n` +
        `Veuillez utiliser un numéro de facture unique.`
      );
      return;
    }

    // ✅ Vérification des doublons avant soumission
    if (!validateNoDuplicates()) {
      return;
    }

    setIsSubmitting(true);

    const approvalData: any = {};

    if (approvals.supervisor1.signature && approvals.supervisor1.name) {
      approvalData.supervisor1 = {
        name: approvals.supervisor1.name,
        date: new Date().toISOString().split('T')[0],
        signature: true,
        observation: approvals.supervisor1.observation
      };
    }

    if (approvals.supervisor2.signature && approvals.supervisor2.name) {
      approvalData.supervisor2 = {
        name: approvals.supervisor2.name,
        date: new Date().toISOString().split('T')[0],
        signature: true,
        observation: approvals.supervisor2.observation
      };
    }

    if (editingEngagement && approvals.finalApproval.signature && approvals.finalApproval.name) {
      approvalData.finalApproval = {
        name: approvals.finalApproval.name,
        date: new Date().toISOString().split('T')[0],
        signature: true,
        observation: approvals.finalApproval.observation
      };
    }

    try {
      if (editingEngagement) {
        // ✅ Préserver le statut actuel si l'utilisateur n'est pas habilité à le modifier
        // (seul le Coordonnateur National peut changer le statut). Évite qu'une
        // modification d'un autre champ ne remette le statut à "En attente".
        const statusToSave = canModifyStatus() ? formData.status : editingEngagement.status;
        onUpdateEngagement(editingEngagement.id, {
          grantId: formData.grantId,
          budgetLineId: formData.budgetLineId,
          subBudgetLineId: formData.subBudgetLineId,
          engagementNumber: formData.engagementNumber,
          amount: parseFloat(formData.amount),
          description: formData.description,
          supplier: formData.supplier,
          quoteReference: formData.quoteReference,
          invoiceNumber: formData.invoiceNumber.trim(),
          date: formData.date,
          status: statusToSave,
          approvals: approvalData
        });
        showSuccess('Engagement modifié', 'L\'engagement a été modifié avec succès');
      } else {
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
          invoiceNumber: formData.invoiceNumber.trim(),
          date: formData.date,
          status: formData.status,
          approvals: Object.keys(approvalData).length > 0 ? approvalData : undefined
        });
        showSuccess('Engagement créé', 'L\'engagement a été créé avec succès');
      }
    } catch (error) {
      console.error('Erreur lors de la soumission:', error);
      showError('Erreur', 'Une erreur est survenue lors de la sauvegarde de l\'engagement');
    } finally {
      setIsSubmitting(false);
      resetForm();
    }
  };

  const startEdit = (engagement: Engagement) => {
    // Un signataire qui n'a pas encore signé peut toujours ouvrir le formulaire pour signer,
    // même sans permission de modification et quel que soit le statut de l'engagement.
    if (!canEdit && !needsUserSignature(engagement)) {
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

    if (engagement.approvals) {
      setApprovals({
        supervisor1: engagement.approvals.supervisor1 || { name: '', signature: false, observation: '' },
        supervisor2: engagement.approvals.supervisor2 || { name: '', signature: false, observation: '' },
        finalApproval: engagement.approvals.finalApproval || { name: '', signature: false, observation: '' }
      });
    }

    setShowForm(true);
  };

  const handleDeleteEngagement = async (engagementId: string) => {
    const engagement = engagements.find(e => e.id === engagementId);
    if (!engagement) return;

    if (engagement.status !== 'pending') {
      showWarning('Suppression impossible', 'Seuls les engagements en attente peuvent être supprimés.');
      return;
    }

    if (!canDelete) {
      showWarning('Permission refusée', 'Vous n\'avez pas la permission de supprimer des engagements.');
      return;
    }

    const confirmed = await confirmDelete(
      'Supprimer l\'engagement',
      `Êtes-vous sûr de vouloir supprimer l'engagement ${engagement.engagementNumber} ? Cette action est irréversible.`
    );

    if (confirmed && onDeleteEngagement) {
      onDeleteEngagement(engagementId);
      showSuccess('Engagement supprimé', 'L\'engagement a été supprimé avec succès');
    }
  };

  const updateEngagementStatus = (engagementId: string, newStatus: Engagement['status']) => {
    if (!canModifyStatus()) {
      showWarning('Permission refusée', 'Seul le Coordonnateur National peut modifier le statut des engagements');
      return;
    }
    onUpdateEngagement(engagementId, { status: newStatus });
    showSuccess('Statut modifié', 'Le statut de l\'engagement a été modifié avec succès');
  };

  // 🔧 FONCTIONS UTILITAIRES

  const getBudgetLine = (budgetLineId: string) => {
    return budgetLines.find(line => line.id === budgetLineId);
  };

  const getSubBudgetLine = (subBudgetLineId: string) => {
    return subBudgetLines.find(line => line.id === subBudgetLineId);
  };

  const getGrant = (grantId: string) => {
    return grants.find(grant => grant.id === grantId);
  };

  const getAvailableAmountForSubLine = (subBudgetLineId: string): number => {
    const subBudgetLine = subBudgetLines.find(line => line.id === subBudgetLineId);
    if (!subBudgetLine) return 0;

    const totalEngaged = engagements
      .filter(eng => eng.subBudgetLineId === subBudgetLineId && eng.status !== 'cancelled' && eng.status !== 'rejected')
      .reduce((sum, eng) => sum + eng.amount, 0);

    const available = (subBudgetLine.notifiedAmount || 0) - totalEngaged;
    return available > 0 ? available : 0;
  };

  const getTotalEngagedForSubLine = (subBudgetLineId: string): number => {
    return engagements
      .filter(eng => eng.subBudgetLineId === subBudgetLineId && eng.status !== 'cancelled' && eng.status !== 'rejected')
      .reduce((sum, eng) => sum + eng.amount, 0);
  };

  const getSupplierHistory = (supplierName: string) => {
    const normalizedName = supplierName.trim().toLowerCase();
    return engagements.filter(eng =>
      eng.supplier &&
      eng.supplier.trim().toLowerCase() === normalizedName &&
      eng.id !== editingEngagement?.id
    );
  };

  const showSupplierHistoryModal = (supplierName: string) => {
    setSelectedSupplier(supplierName);
    setShowSupplierHistory(true);
  };

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

  const getSignatureIcon = (engagement: Engagement, signatureType: string) => {
    const approval = engagement.approvals?.[signatureType as keyof typeof engagement.approvals];
    const needsSignature = needsUserSignature(engagement);

    let userSignatureType = '';
    const userProfession = getUserProfession();
    if (userProfession === 'Coordinateur de la Subvention') userSignatureType = 'supervisor1';
    else if (userProfession === 'Comptable') userSignatureType = 'supervisor2';
    else if (userProfession === 'Coordonnateur National') userSignatureType = 'finalApproval';

    const isUserSignatureType = signatureType === userSignatureType;
    const isSigned = approval?.signature || false;

    if (isSigned) {
      return <CheckCircle className="w-4 h-4 text-green-600" />;
    }

    if (isUserSignatureType && needsSignature) {
      return <CircleDot className="w-4 h-4 text-yellow-500 animate-pulse" />;
    }

    return <Clock className="w-4 h-4 text-gray-400" />;
  };

  const toggleObservation = (signatureType: string) => {
    setShowObservations(prev => ({
      ...prev,
      [signatureType]: !prev[signatureType as keyof typeof showObservations]
    }));
  };

  const getFilteredEngagements = () => {
    return engagements.filter(engagement => {
      const searchLower = searchTerm.toLowerCase();

      const budgetLine = getBudgetLine(engagement.budgetLineId);
      const subBudgetLine = getSubBudgetLine(engagement.subBudgetLineId);
      const budgetLineSearchText = budgetLine ? `${budgetLine.code} ${budgetLine.name}` : '';
      const subBudgetLineSearchText = subBudgetLine ? `${subBudgetLine.code} ${subBudgetLine.name}` : '';

      const matchesSearch =
        engagement.engagementNumber.toLowerCase().includes(searchLower) ||
        engagement.description.toLowerCase().includes(searchLower) ||
        (engagement.supplier && engagement.supplier.toLowerCase().includes(searchLower)) ||
        engagement.quoteReference?.toLowerCase().includes(searchLower) ||
        engagement.invoiceNumber?.toLowerCase().includes(searchLower) ||
        budgetLineSearchText.toLowerCase().includes(searchLower) ||
        subBudgetLineSearchText.toLowerCase().includes(searchLower);

      const matchesStatus = statusFilter === 'all' || engagement.status === statusFilter;

      // ✅ Filtre "À signer" : l'engagement reste dans la liste tant que ma signature est requise,
      // quel que soit son statut. Il n'en disparaît qu'une fois signé (approuver/rejeter ne suffit pas).
      const matchesToSign = !showOnlyToSign || needsUserSignature(engagement);

      const matchesDateRange = !showDateRange ? true : (
        (!startDate || engagement.date >= startDate) &&
        (!endDate || engagement.date <= endDate)
      );

      const matchesSupplier = !supplierFilter ||
        (engagement.supplier && engagement.supplier.toLowerCase().includes(supplierFilter.toLowerCase()));

      const matchesBudgetLine = !budgetLineFilter ||
        engagement.budgetLineId === budgetLineFilter;

      const matchesSubBudgetLine = !subBudgetLineFilter ||
        engagement.subBudgetLineId === subBudgetLineFilter;

      return matchesSearch && matchesStatus && matchesToSign && matchesDateRange &&
        matchesSupplier && matchesBudgetLine && matchesSubBudgetLine;
    });
  };

  const filteredEngagements = getFilteredEngagements();

  const sortedEngagements = [...filteredEngagements].sort((a, b) => {
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

  const totalPages = Math.ceil(sortedEngagements.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentEngagements = sortedEngagements.slice(startIndex, endIndex);

  const goToPage = (page: number) => setCurrentPage(page);
  const goToPreviousPage = () => currentPage > 1 && setCurrentPage(currentPage - 1);
  const goToNextPage = () => currentPage < totalPages && setCurrentPage(currentPage + 1);

  // 🎯 EXPORT PDF DE LA FICHE D'ENGAGEMENT
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


  // 🎯 FONCTION DE FORMATAGE DES MONTANTS (SANS ESPACES PROBLÉMATIQUES)
  const formatAmountWithSpace = (amount: number): string => {
    // Arrondir à 2 décimales
    const rounded = Math.round(amount * 100) / 100;
    // Séparer la partie entière et décimale
    const parts = rounded.toFixed(2).split('.');
    // Formater la partie entière avec des espaces tous les 3 chiffres
    const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    // Retourner le résultat avec la partie décimale
    return `${integerPart},${parts[1]}`;
  };

  // 🎯 EXPORT PDF DE LA FICHE D'ENGAGEMENT (AVEC PARAMÈTRE)
  const exportEngagementForm = async (engagement: Engagement) => {
    if (!engagement) {
      showWarning('Aucun engagement', 'Aucun engagement à exporter');
      return;
    }

    setIsGeneratingPDF(true);

    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;
      let yPosition = margin;

      // Charger le logo
      let logo: HTMLImageElement | null = null;
      try {
        logo = await loadImage('/budgetbase/logo.png');
      } catch (error) {
        console.warn('Logo non chargé');
      }

      // ============================================
      // PAGE 1 : Informations générales + Titre Signatures
      // ============================================
      
      // Logo
      if (logo) {
        const logoWidth = 35;
        const logoHeight = (logo.height * logoWidth) / logo.width;
        pdf.addImage(logo, 'PNG', margin, yPosition, logoWidth, logoHeight);
        yPosition += logoHeight + 10;
      }

      // Titre principal
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      pdf.text('FICHE D\'ENGAGEMENT', pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 12;

      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text(engagement.engagementNumber, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 8;

      // --- TITRE SIGNATURES (sur la page 1) ---
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('SIGNATURES D\'APPROBATION', pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 6;

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Engagement: ${engagement.engagementNumber}`, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 10;

      // Ligne de séparation
      pdf.setDrawColor(44, 90, 160);
      pdf.line(margin, yPosition, pageWidth - margin, yPosition);
      yPosition += 10;

      const budgetLine = getBudgetLine(engagement.budgetLineId);
      const subBudgetLine = getSubBudgetLine(engagement.subBudgetLineId);
      const grant = getGrant(engagement.grantId);
      const currencySymbol = getCurrencySymbol(grant?.currency || 'EUR');

      // --- Informations de la Ligne Budgétaire ---
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Informations de la Ligne Budgétaire', margin, yPosition);
      yPosition += 8;

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');

      const infoData = [
        [`Subvention: ${grant?.name || 'Non spécifié'}`, `Référence: ${grant?.reference || 'N/A'}`],
        [`Ligne Budgétaire: ${budgetLine?.code || 'N/A'} - ${budgetLine?.name || 'Ligne supprimée'}`],
        [`Sous-Ligne Budgétaire: ${subBudgetLine?.code || 'N/A'} - ${subBudgetLine?.name || 'Sous-ligne supprimée'}`]
      ];

      infoData.forEach((row, rowIndex) => {
        const y = yPosition + (rowIndex * 7);
        if (row.length === 2) {
          pdf.text(row[0], margin, y);
          pdf.text(row[1], pageWidth - margin - pdf.getTextWidth(row[1]), y);
        } else {
          pdf.text(row[0], margin, y);
        }
      });
      yPosition += infoData.length * 7 + 10;

      // --- État financier de la sous-ligne ---
      const availableAmountForSubLine = getAvailableAmountForSubLine(engagement.subBudgetLineId);
      const totalEngagedForSubLine = getTotalEngagedForSubLine(engagement.subBudgetLineId);

      pdf.setFillColor(240, 247, 255);
      pdf.rect(margin, yPosition, pageWidth - (margin * 2), 36, 'F');
      pdf.setDrawColor(44, 90, 160);
      pdf.rect(margin, yPosition, pageWidth - (margin * 2), 36);

      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text('État financier de la sous-ligne', pageWidth / 2, yPosition + 8, { align: 'center' });

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      
      const financeData = [
        [`Budget notifié : ${formatAmountWithSpace(subBudgetLine?.notifiedAmount || 0)} ${currencySymbol}`],
        [`Total engagé : ${formatAmountWithSpace(totalEngagedForSubLine)} ${currencySymbol}`],
        [`Disponible : ${formatAmountWithSpace(availableAmountForSubLine)} ${currencySymbol}`]
      ];

      const colWidth = (pageWidth - (margin * 2)) / 3;
      financeData.forEach(([text], index) => {
        const x = margin + (index * colWidth) + colWidth / 2;
        pdf.text(text, x, yPosition + 26, { align: 'center' });
      });
      yPosition += 44;

      // --- Détails de l'Engagement ---
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Détails de l\'Engagement', margin, yPosition);
      yPosition += 8;

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');

      const detailData = [
        [`N° d'Engagement: ${engagement.engagementNumber}`, `Date: ${new Date(engagement.date).toLocaleDateString('fr-FR')}`],
        [`Fournisseur: ${engagement.supplier || 'Non spécifié'}`, `Statut: ${ENGAGEMENT_STATUS[engagement.status]?.label || engagement.status}`],
        [`Montant: ${formatAmountWithSpace(engagement.amount)} ${currencySymbol}`, `Devise: ${grant?.currency || 'EUR'} (${currencySymbol})`],
        [`N° Facture: ${engagement.invoiceNumber || 'Non spécifié'}`]
      ];

      detailData.forEach((row, rowIndex) => {
        const y = yPosition + (rowIndex * 7);
        if (row.length === 2) {
          pdf.text(row[0], margin, y);
          pdf.text(row[1], pageWidth - margin - pdf.getTextWidth(row[1]), y);
        } else {
          pdf.text(row[0], margin, y);
        }
      });
      yPosition += detailData.length * 7 + 10;

      // --- Description ---
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Description :', margin, yPosition);
      yPosition += 6;

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      const descLines = splitTextToLines(engagement.description, pageWidth - (margin * 2) - 4, pdf);
      descLines.forEach((line, index) => {
        pdf.text(line, margin + 4, yPosition + (index * 5));
      });
      yPosition += descLines.length * 5 + 10;

      // --- Référence du devis ---
      if (engagement.quoteReference) {
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Référence du Devis :', margin, yPosition);
        pdf.setFont('helvetica', 'normal');
        pdf.text(engagement.quoteReference, margin + 50, yPosition);
        yPosition += 8;
      }

      // ============================================
      // PAGE 2 : Signatures (UNIQUEMENT les cartes)
      // ============================================
      pdf.addPage();
      yPosition = margin + 20;

      const currentApprovals = engagement.approvals || {};
      const signatureTypes = [
        { key: 'supervisor1', label: 'Coordinateur de la Subvention' },
        { key: 'supervisor2', label: 'Comptable' },
        { key: 'finalApproval', label: 'Coordonnateur National' }
      ];

      const cardWidth = (pageWidth - (margin * 2) - 20) / 3;
      const cardHeight = 95; // Augmenté pour plus d'espace

      signatureTypes.forEach((type, index) => {
        const x = margin + (index * (cardWidth + 10));
        const approval = currentApprovals[type.key as keyof typeof currentApprovals];

        // Dessiner la carte
        pdf.setDrawColor(200, 200, 200);
        pdf.setFillColor(255, 255, 255);
        pdf.rect(x, yPosition, cardWidth, cardHeight, 'F');
        pdf.rect(x, yPosition, cardWidth, cardHeight);

        // --- Titre avec gestion des retours à la ligne ---
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'bold');
        
        // Découper le titre en plusieurs lignes si nécessaire
        const titleLines = pdf.splitTextToSize(type.label, cardWidth - 10);
        let contentY = yPosition + 10;
        
        titleLines.forEach((line: string, lineIndex: number) => {
          pdf.text(line, x + 5, contentY);
          contentY += 5;
        });
        
        contentY += 6; // Espace après le titre

        // --- Informations du signataire ---
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'normal');
        
        const nameText = `Nom : ${approval?.name || '_________________________'}`;
        const dateText = `Date : ${(approval as any)?.date || '___/___/_____'}`;
        const statusText = `Signature : ${approval?.signature ? 'Validee' : 'Non validee'}`;
        
        pdf.text(nameText, x + 5, contentY);
        contentY += 11;
        
        pdf.text(dateText, x + 5, contentY);
        contentY += 11;
        
        pdf.text(statusText, x + 5, contentY);
        contentY += 11;

        // --- Observations (si présentes) ---
        if (approval?.observation) {
          pdf.setFontSize(6);
          const obsLines = pdf.splitTextToSize(`Obs : ${approval.observation}`, cardWidth - 10);
          obsLines.forEach((line: string, idx: number) => {
            pdf.text(line, x + 5, contentY + (idx * 4));
          });
        }
      });

      // --- Pied de page ---
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

      pdf.save(`engagement-${engagement.engagementNumber}.pdf`);
      showSuccess('Export réussi', 'La fiche d\'engagement a été exportée avec succès');

    } catch (error) {
      console.error('Erreur lors de la génération du PDF:', error);
      showWarning('Erreur', 'Impossible de générer le PDF. Veuillez réessayer.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

 

  // 🎯 EXPORT EXCEL DE LA LISTE
  const exportToExcel = async (exportAllData: boolean = false) => {
    if (!canExport) {
      showError('Permission refusée', 'Vous n\'avez pas la permission d\'exporter des données');
      return;
    }

    setIsGeneratingExcel(true);

    try {
      const dataToExport = exportAllData ? sortedEngagements : currentEngagements;

      if (dataToExport.length === 0) {
        showWarning('Aucune donnée', 'Aucune donnée à exporter');
        return;
      }

      const statusLabels: Record<string, string> = {
        pending: 'En attente',
        approved: 'Approuvé',
        rejected: 'Rejeté',
        paid: 'Payé'
      };

      const currencySymbol = getCurrencySymbol(selectedGrant?.currency || 'EUR');

      const infoLines: string[] = [];
      if (selectedGrant) {
        infoLines.push(`Subvention : ${selectedGrant.name}`);
        infoLines.push(`Référence : ${selectedGrant.reference}   •   Devise : ${selectedGrant.currency}`);
      }
      infoLines.push(`Généré le : ${new Date().toLocaleDateString('fr-FR')}`);

      const dataRows = dataToExport.map((engagement) => {
        const budgetLine = getBudgetLine(engagement.budgetLineId);
        const subBudgetLine = getSubBudgetLine(engagement.subBudgetLineId);
        const availableForSubLine = getAvailableAmountForSubLine(engagement.subBudgetLineId);

        return [
          engagement.engagementNumber,
          new Date(engagement.date).toLocaleDateString('fr-FR'),
          budgetLine ? `${budgetLine.code} - ${budgetLine.name}` : 'N/A',
          subBudgetLine ? `${subBudgetLine.code} - ${subBudgetLine.name}` : 'N/A',
          engagement.supplier || 'Non spécifié',
          engagement.description,
          `${engagement.amount.toLocaleString('fr-FR')} ${currencySymbol}`,
          `${availableForSubLine.toLocaleString('fr-FR')} ${currencySymbol}`,
          engagement.invoiceNumber || '-',
          statusLabels[engagement.status] || engagement.status
        ];
      });

      const totalAmount = dataToExport.reduce((sum, eng) => sum + eng.amount, 0);
      // Total Disponible = somme sur les sous-lignes distinctes (évite de compter plusieurs fois la même)
      const distinctSubLineIds = Array.from(new Set(dataToExport.map(e => e.subBudgetLineId)));
      const totalAvailable = distinctSubLineIds.reduce((sum, id) => sum + getAvailableAmountForSubLine(id), 0);
      const totalsRow = [
        'TOTAUX', '', '', '', '', '',
        `${totalAmount.toLocaleString('fr-FR')} ${currencySymbol}`,
        `${totalAvailable.toLocaleString('fr-FR')} ${currencySymbol}`,
        '', ''
      ];

      const suffix = exportAllData ? 'complet' : 'page';
      const fileName = `engagements-${suffix}-${selectedGrant?.reference || 'global'}-${new Date().toISOString().split('T')[0]}.xlsx`;

      exportStyledExcel({
        fileName,
        sheetName: exportAllData ? 'Tous les engagements' : 'Engagements page',
        title: 'LISTE DES ENGAGEMENTS',
        infoLines,
        columns: [
          { header: 'N° Engagement', width: 18 },
          { header: 'Date', width: 15, align: 'center' },
          { header: 'Ligne budgétaire', width: 35 },
          { header: 'Sous-ligne budgétaire', width: 35 },
          { header: 'Fournisseur', width: 25 },
          { header: 'Description', width: 50 },
          { header: 'Montant', width: 18, align: 'right' },
          { header: 'Disponible', width: 18, align: 'right' },
          { header: 'N° Facture', width: 18 },
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

  // 🎯 EXPORT PDF DE LA LISTE
  const exportListToPDF = async (exportAllData: boolean = false) => {
    if (!canExport) {
      showError('Permission refusée', 'Vous n\'avez pas la permission d\'exporter des données');
      return;
    }

    setIsGeneratingPDF(true);

    try {
      const dataToExport = exportAllData ? sortedEngagements : currentEngagements;

      if (dataToExport.length === 0) {
        showWarning('Aucune donnée', 'Aucune donnée à exporter');
        return;
      }

      const pdf = new jsPDF('l', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      let yPosition = margin;

      // ---- Chargement du logo ----
      let logo: HTMLImageElement | null = null;
      try {
        logo = await loadImage('/budgetbase/logo.png');
      } catch (error) {
        console.warn('Logo non chargé');
      }

      // ---- Définition des colonnes (largeurs ajustées) ----
      const colDefs = [
        { id: 'number', label: 'N°', width: 30 },
        { id: 'date', label: 'Date', width: 18 },
        { id: 'budgetLine', label: 'Ligne budgétaire', width: 26 },
        { id: 'subBudgetLine', label: 'Sous-ligne', width: 26 },
        { id: 'supplier', label: 'Fournisseur', width: 28 },
        { id: 'description', label: 'Description', width: 38 },
        { id: 'amount', label: 'Montant', width: 22 },
        { id: 'available', label: 'Disponible', width: 20 },
        { id: 'invoice', label: 'N° Facture', width: 22 },
        { id: 'status', label: 'Statut', width: 18 }
      ];

      // Ajustement automatique si la largeur totale dépasse la page
      const totalWidth = colDefs.reduce((sum, col) => sum + col.width, 0);
      if (totalWidth > pageWidth - margin * 2) {
        const ratio = (pageWidth - margin * 2) / totalWidth;
        colDefs.forEach(col => col.width *= ratio);
      }

      // ---- Fonction pour dessiner l'en-tête principal (1ère page uniquement) ----
      const drawMainHeader = (): number => {
        let y = margin;

        if (logo) {
          const logoWidth = 25;
          const logoHeight = (logo.height * logoWidth) / logo.width;
          pdf.addImage(logo, 'PNG', margin, y, logoWidth, logoHeight);
          y += logoHeight + 5;
        }

        pdf.setFontSize(16);
        pdf.setFont('helvetica', 'bold');
        pdf.text('LISTE DES ENGAGEMENTS', pageWidth / 2, y, { align: 'center' });
        y += 10;

        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        if (selectedGrant) {
          pdf.text(`Subvention: ${selectedGrant.name}`, margin, y);
          y += 5;
          pdf.text(`Référence: ${selectedGrant.reference}`, margin, y);
          y += 5;
        }
        pdf.text(`Généré le: ${new Date().toLocaleDateString('fr-FR')}`, margin, y);
        y += 10;

        pdf.line(margin, y, pageWidth - margin, y);
        y += 8;

        return y;
      };

      // ---- Fonction pour dessiner les en-têtes de colonnes ----
      const drawColumnHeaders = (y: number): number => {
        pdf.setFillColor(59, 130, 246);
        pdf.rect(margin, y, pageWidth - (margin * 2), 10, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'bold');

        let x = margin;
        colDefs.forEach(col => {
          pdf.text(col.label, x + 1, y + 6);
          x += col.width;
        });

        pdf.setTextColor(0, 0, 0);
        pdf.setFont('helvetica', 'normal');
        return y + 10;
      };

      // ---- 1ère page : en-tête principal + en-têtes colonnes ----
      yPosition = drawMainHeader();
      yPosition = drawColumnHeaders(yPosition);

      // ---- Statuts pour l'affichage ----
      const statusLabels: Record<string, string> = {
        pending: 'En attente',
        approved: 'Approuvé',
        rejected: 'Rejeté',
        paid: 'Payé'
      };

      const currencySymbol = getCurrencySymbol(selectedGrant?.currency || 'EUR');

      // Formatage des montants (sans décimales pour FCFA)
      const formatAmountShort = (amount: number) => {
        return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
      };

      // ---- Définir la police et la taille avant de découper les textes ----
      pdf.setFontSize(6.5);
      pdf.setFont('helvetica', 'normal');

      // ---- Parcours des engagements ----
      dataToExport.forEach((engagement, index) => {
        const budgetLine = getBudgetLine(engagement.budgetLineId);
        const subBudgetLine = getSubBudgetLine(engagement.subBudgetLineId);
        const availableForSubLine = getAvailableAmountForSubLine(engagement.subBudgetLineId);

        // Préparer les textes pour chaque colonne
        const texts = {
          number: engagement.engagementNumber,
          date: new Date(engagement.date).toLocaleDateString('fr-FR'),
          budgetLine: budgetLine ? `${budgetLine.code} - ${budgetLine.name}` : 'N/A',
          subBudgetLine: subBudgetLine ? `${subBudgetLine.code} - ${subBudgetLine.name}` : 'N/A',
          supplier: engagement.supplier || 'Non spécifié',
          description: engagement.description,
          amount: `${formatAmountShort(engagement.amount)} ${currencySymbol}`,
          available: `${formatAmountShort(availableForSubLine)} ${currencySymbol}`,
          invoice: engagement.invoiceNumber || '-',
          status: statusLabels[engagement.status] || engagement.status
        };

        // Calculer le nombre de lignes nécessaires pour chaque colonne
        let maxLines = 1;
        const colLines: Record<string, string[]> = {};
        colDefs.forEach(col => {
          const text = texts[col.id as keyof typeof texts] || '';
          const lines = splitTextToLines(text, col.width - 2, pdf);
          colLines[col.id] = lines;
          if (lines.length > maxLines) maxLines = lines.length;
        });

        // Hauteur de ligne : 5 mm par ligne + un peu de padding
        const rowHeight = Math.max(10, maxLines * 4.5 + 2);

        // Vérifier si la ligne tient sur la page
        if (yPosition + rowHeight > pageHeight - margin) {
          pdf.addPage();
          yPosition = margin + 5;
          yPosition = drawColumnHeaders(yPosition);
          // Réappliquer la police après le changement de page
          pdf.setFontSize(6.5);
          pdf.setFont('helvetica', 'normal');
        }

        // Fond alterné
        if (index % 2 === 0) {
          pdf.setFillColor(249, 250, 251);
          pdf.rect(margin, yPosition, pageWidth - (margin * 2), rowHeight, 'F');
        }

        // Dessiner chaque cellule
        let xPos = margin;
        colDefs.forEach(col => {
          const lines = colLines[col.id] || [''];
          lines.forEach((line, lineIndex) => {
            pdf.text(line, xPos + 1, yPosition + 4 + lineIndex * 4.5);
          });
          xPos += col.width;
        });

        yPosition += rowHeight;
      });

      // ---- Ajout des totaux en bas ----
      const totalAmount = dataToExport.reduce((sum, eng) => sum + eng.amount, 0);
      const totalRowHeight = 10;
      if (yPosition + totalRowHeight > pageHeight - margin) {
        pdf.addPage();
        yPosition = margin + 5;
        yPosition = drawColumnHeaders(yPosition);
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'bold');
      }

      pdf.setFillColor(243, 244, 246);
      pdf.rect(margin, yPosition, pageWidth - (margin * 2), totalRowHeight, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);

      // Total Disponible = somme sur les sous-lignes distinctes (évite de compter plusieurs fois la même sous-ligne)
      const distinctSubLineIds = Array.from(new Set(dataToExport.map(e => e.subBudgetLineId)));
      const totalAvailable = distinctSubLineIds.reduce((sum, id) => sum + getAvailableAmountForSubLine(id), 0);

      // Libellé "TOTAL" sous la colonne Description, puis totaux alignés sous Montant et Disponible
      let xTotal = margin;
      for (let i = 0; i < 5; i++) {
        xTotal += colDefs[i].width;
      }
      pdf.text('TOTAL', xTotal + 1, yPosition + 6);        // colonne Description
      xTotal += colDefs[5].width;                          // début colonne Montant
      pdf.text(`${formatAmountShort(totalAmount)} ${currencySymbol}`, xTotal + 1, yPosition + 6);
      xTotal += colDefs[6].width;                          // début colonne Disponible
      pdf.text(`${formatAmountShort(totalAvailable)} ${currencySymbol}`, xTotal + 1, yPosition + 6);

      // ---- Numéros de pages ----
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

      // ---- Sauvegarde ----
      const suffix = exportAllData ? 'complet' : 'page';
      pdf.save(`engagements-${suffix}-${selectedGrant?.reference || 'global'}-${new Date().toISOString().split('T')[0]}.pdf`);
      showSuccess('Export réussi', 'La liste des engagements a été exportée avec succès');

    } catch (error) {
      console.error('Erreur lors de la génération du PDF:', error);
      showError('Erreur', 'Erreur lors de la génération du PDF. Veuillez réessayer.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // 🎯 EXPORT EXCEL DE L'HISTORIQUE FOURNISSEUR
  const exportSupplierHistoryToExcel = async () => {
    if (!selectedSupplier) return;

    const supplierEngagements = getSupplierHistory(selectedSupplier);
    if (supplierEngagements.length === 0) {
      showWarning('Aucune donnée', 'Aucun engagement trouvé pour ce fournisseur');
      return;
    }

    try {
      const statusLabels: Record<string, string> = {
        pending: 'En attente',
        approved: 'Approuvé',
        rejected: 'Rejeté',
        paid: 'Payé'
      };

      const currencySymbol = getCurrencySymbol(selectedGrant?.currency || 'EUR');

      const dataRows = supplierEngagements.map((engagement) => {
        const budgetLine = getBudgetLine(engagement.budgetLineId);
        const subBudgetLine = getSubBudgetLine(engagement.subBudgetLineId);

        return [
          engagement.engagementNumber,
          new Date(engagement.date).toLocaleDateString('fr-FR'),
          budgetLine ? `${budgetLine.code} - ${budgetLine.name}` : 'N/A',
          subBudgetLine ? `${subBudgetLine.code} - ${subBudgetLine.name}` : 'N/A',
          engagement.description,
          `${engagement.amount.toLocaleString('fr-FR')} ${currencySymbol}`,
          engagement.invoiceNumber || '-',
          statusLabels[engagement.status] || engagement.status
        ];
      });

      const totalAmount = supplierEngagements.reduce((sum, eng) => sum + eng.amount, 0);
      const totalsRow = [
        'TOTAUX', '', '', '', '',
        `${totalAmount.toLocaleString('fr-FR')} ${currencySymbol}`,
        '', ''
      ];

      exportStyledExcel({
        fileName: `historique-fournisseur-${selectedSupplier}-${new Date().toISOString().split('T')[0]}.xlsx`,
        sheetName: 'Historique',
        title: 'HISTORIQUE DU FOURNISSEUR',
        infoLines: [
          `Fournisseur : ${selectedSupplier}`,
          `Généré le : ${new Date().toLocaleDateString('fr-FR')}`,
        ],
        columns: [
          { header: 'N° Engagement', width: 18 },
          { header: 'Date', width: 15, align: 'center' },
          { header: 'Ligne budgétaire', width: 35 },
          { header: 'Sous-ligne budgétaire', width: 35 },
          { header: 'Description', width: 50 },
          { header: 'Montant', width: 18, align: 'right' },
          { header: 'N° Facture', width: 18 },
          { header: 'Statut', width: 15, align: 'center' },
        ],
        rows: dataRows,
        totalsRow,
      });

      showSuccess('Export réussi', 'L\'historique du fournisseur a été exporté avec succès');
    } catch (error) {
      console.error('Erreur lors de l\'export:', error);
      showError('Erreur', 'Impossible de générer le fichier Excel');
    }
  };

  // 🎯 COMPOSANT D'ALERTE DE DOUBLON
  const DuplicateAlert = () => {
    if (!duplicateCheck.isDuplicate || duplicateCheck.duplicateEngagements.length === 0) {
      return null;
    }

    const getAlertColor = () => {
      switch (duplicateCheck.duplicateType) {
        case 'invoice': return 'border-red-500 bg-red-50';
        case 'quote': return 'border-orange-500 bg-orange-50';
        case 'supplier_amount': return 'border-yellow-500 bg-yellow-50';
        default: return 'border-blue-500 bg-blue-50';
      }
    };

    const getAlertTitle = () => {
      switch (duplicateCheck.duplicateType) {
        case 'invoice': return '⚠️ Numéro de facture déjà utilisé';
        case 'quote': return '⚠️ Référence de devis déjà utilisée';
        case 'supplier_amount': return '⚠️ Même fournisseur et montant';
        default: return '⚠️ Engagement similaire détecté';
      }
    };

    return (
      <div className={`rounded-xl p-4 mb-4 border-2 ${getAlertColor()}`}>
        <div className="flex items-start">
          <AlertOctagon className="w-5 h-5 text-orange-500 mt-0.5 mr-3 flex-shrink-0" />
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-gray-900">
              {getAlertTitle()}
            </h4>
            <p className="text-sm text-gray-700 mt-1">
              {duplicateCheck.duplicateEngagements.length} engagement(s) similaire(s) trouvé(s) :
            </p>
            <ul className="mt-2 space-y-1">
              {duplicateCheck.duplicateEngagements.map(eng => (
                <li key={eng.id} className="text-xs text-gray-600 flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900">{eng.engagementNumber}</span>
                  <span>•</span>
                  <span>{eng.supplier}</span>
                  <span>•</span>
                  <span>{eng.amount.toLocaleString('fr-FR')} €</span>
                  {eng.invoiceNumber && (
                    <>
                      <span>•</span>
                      <span className="text-blue-600">Facture: {eng.invoiceNumber}</span>
                    </>
                  )}
                  <span>•</span>
                  <span className="text-gray-500">{eng.description.substring(0, 40)}...</span>
                  <button
                    type="button"
                    onClick={() => {
                      setViewingEngagement(eng);
                    }}
                    className="text-blue-600 hover:text-blue-800 underline text-xs"
                  >
                    Voir
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-500 mt-2">
              Vérifiez que vous ne créez pas un doublon avant de continuer.
            </p>
          </div>
        </div>
      </div>
    );
  };

  // 🎯 COMPOSANT D'ALERTE FACTURE EXISTANTE
  const InvoiceDuplicateAlert = () => {
    if (!invoiceNumberExists || !existingInvoiceEngagement) {
      return null;
    }

    return (
      <div className="bg-red-50 border-2 border-red-500 rounded-xl p-4 mb-4">
        <div className="flex items-start">
          <AlertOctagon className="w-5 h-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" />
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-red-800">
              ⚠️ Numéro de facture déjà utilisé
            </h4>
            <p className="text-sm text-red-700 mt-1">
              Le numéro de facture <strong>"{formData.invoiceNumber}"</strong> est déjà utilisé par l'engagement :
            </p>
            <div className="mt-2 p-2 bg-white rounded-lg border border-red-200">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="font-medium">{existingInvoiceEngagement.engagementNumber}</span>
                  <span className="mx-2 text-gray-400">•</span>
                  <span>{existingInvoiceEngagement.supplier}</span>
                  <span className="mx-2 text-gray-400">•</span>
                  <span>{existingInvoiceEngagement.amount.toLocaleString('fr-FR')} €</span>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingEngagement(existingInvoiceEngagement)}
                  className="text-blue-600 hover:text-blue-800 underline text-sm"
                >
                  Voir l'engagement
                </button>
              </div>
            </div>
            <p className="text-xs text-red-600 mt-2">
              Veuillez utiliser un numéro de facture unique pour cet engagement.
            </p>
          </div>
        </div>
      </div>
    );
  };

  // Rendu des champs du formulaire
  const renderFormFields = () => {
    const subBudgetLine = getSubBudgetLine(formData.subBudgetLineId);
    const totalEngaged = getTotalEngagedForSubLine(formData.subBudgetLineId);
    const currencySymbol = getCurrencySymbol(selectedGrant?.currency || 'EUR');
    const existingSuppliers = getExistingSuppliers();

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
                required={!editingEngagement}
              />
            </div>
        </div>

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
              <div className="flex-1">
                <SupplierSelector
                  existingSuppliers={existingSuppliers}
                  selectedSupplier={formData.supplier}
                  onSelectSupplier={handleSelectSupplier}
                  disabled={false}
                />
              </div>
              {formData.supplier && (
                <button
                  type="button"
                  onClick={() => showSupplierHistoryModal(formData.supplier)}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex-shrink-0"
                  title="Voir l'historique du fournisseur"
                >
                  <Eye className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Alertes de doublons */}
        <DuplicateAlert />
        <InvoiceDuplicateAlert />

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
              N° Facture *
              {formData.invoiceNumber && invoiceNumberExists && (
                <span className="ml-2 text-xs text-red-600 font-medium">
                  ⚠️ Déjà utilisé
                </span>
              )}
            </label>
            <input
              type="text"
              value={formData.invoiceNumber}
              onChange={(e) => setFormData(prev => ({ ...prev, invoiceNumber: e.target.value }))}
              className={`w-full px-3 py-2 border ${invoiceNumberExists ? 'border-red-500' : 'border-gray-300'} rounded-lg focus:ring-2 ${invoiceNumberExists ? 'focus:ring-red-500' : 'focus:ring-blue-500'} focus:border-transparent`}
              placeholder="Ex: FAC-2024-001 (obligatoire)"
              required
            />
            {formData.invoiceNumber && !invoiceNumberExists && (
              <p className="text-xs text-green-600 mt-1">✅ Numéro de facture unique</p>
            )}
            {!formData.invoiceNumber && (
              <p className="text-xs text-gray-400 mt-1">⚠️ Le numéro de facture est obligatoire</p>
            )}
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
            disabled={editingEngagement && editingEngagement.status !== 'pending' && !isComptable}
          >
            <option value="pending">En attente</option>
            {/* Toujours afficher l'option correspondant au statut actuel pour éviter
                un décalage valeur/option (qui affichait "En attente" par défaut). */}
            {(userProfession === "Coordonnateur National" || formData.status === 'approved') && (
              <option value="approved">Approuvé</option>
            )}
            {(userProfession === "Coordonnateur National" || formData.status === 'rejected') && (
              <option value="rejected">Rejeté</option>
            )}
          </select>
          {editingEngagement && editingEngagement.status !== 'pending' && !isComptable && (
            <p className="text-xs text-gray-500 mt-1">
              Le statut ne peut plus être modifié car l'engagement a été {editingEngagement.status === 'approved' ? 'approuvé' : 'rejeté'}.
            </p>
          )}
          {editingEngagement && isComptable && editingEngagement.status !== 'pending' && (
            <p className="text-xs text-blue-500 mt-1">
              ℹ️ En tant que comptable, vous pouvez modifier cet engagement même s'il est {editingEngagement.status === 'approved' ? 'approuvé' : 'rejeté'}.
            </p>
          )}
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
          {isSignatory && (
            <button
              type="button"
              onClick={() => setShowOnlyToSign(prev => !prev)}
              className={`rounded-lg px-4 py-2 border transition-colors flex items-center space-x-2 ${
                showOnlyToSign
                  ? 'bg-orange-600 border-orange-600 text-white'
                  : 'bg-orange-50 border-orange-200 text-orange-800 hover:bg-orange-100'
              }`}
              title="Afficher uniquement les engagements qui me restent à signer"
            >
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm font-medium">
                {showOnlyToSign ? 'Tout afficher' : `À signer (${toSignCount})`}
              </span>
            </button>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <div className="relative">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
            <input
              type="text"
              placeholder="Rechercher par n°, fournisseur, ligne, sous-ligne..."
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
            <span>{sortedEngagements.length} engagement(s) trouvé(s)</span>
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

      {/* Informations sur la subvention */}
      {selectedGrant && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-4 sm:p-6 border border-blue-200">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{selectedGrant.name}</h3>
              <p className="text-gray-600 text-sm">{selectedGrant.reference} - {selectedGrant.grantingOrganization}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Devise</p>
              <p className="text-lg font-bold text-blue-600">
                {selectedGrant.currency} ({getCurrencySymbol(selectedGrant.currency)})
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
            <div className="text-center">
              <p className="text-xs text-gray-600">Montant Total</p>
              <p className="text-lg font-bold text-blue-600">
                {formatCurrency(selectedGrant.totalAmount, selectedGrant.currency)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-600">Engagements</p>
              <p className="text-lg font-bold text-green-600">{engagements.length}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-600">Montant Total Approuvé</p>
              <p className="text-lg font-bold text-emerald-600">
                {formatCurrency(
                  engagements
                    .filter(eng => eng.status === 'approved' || eng.status === 'paid')
                    .reduce((sum, eng) => sum + eng.amount, 0),
                  selectedGrant.currency
                )}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-600">Montant Total Rejeté</p>
              <p className="text-lg font-bold text-red-600">
                {formatCurrency(
                  engagements
                    .filter(eng => eng.status === 'rejected')
                    .reduce((sum, eng) => sum + eng.amount, 0),
                  selectedGrant.currency
                )}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-600">Montant Total En Attente</p>
              <p className="text-lg font-bold text-yellow-600">
                {formatCurrency(
                  engagements
                    .filter(eng => eng.status === 'pending')
                    .reduce((sum, eng) => sum + eng.amount, 0),
                  selectedGrant.currency
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Boutons d'export */}
      {canExport && sortedEngagements.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => exportListToPDF(false)}
            disabled={isGeneratingPDF}
            className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-1 disabled:opacity-50"
          >
            <FileText className="w-4 h-4" />
            <span>PDF Page</span>
          </button>
          <button
            onClick={() => exportListToPDF(true)}
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

      {/* Modal du formulaire */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 max-h-[90vh] overflow-y-auto">
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
                <button
                  onClick={resetForm}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
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

              {/* Section Signatures */}
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
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            disabled={true}
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

                  <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <h4 className="font-medium text-blue-900 mb-2">Comportement des signatures :</h4>
                    <ul className="text-sm text-blue-700 space-y-1">
                      <li>• <strong>Coordinateur & Comptable</strong> : Peuvent signer dès la création</li>
                      <li>• <strong>Coordonnateur National</strong> : Ne peut signer qu'après création</li>
                      <li>• Les noms ne sont enregistrés que si la signature est validée</li>
                      <li>• Les observations sont verrouillées après signature</li>
                      <li>• Une fois approuvé, le statut ne peut plus être modifié (sauf comptable)</li>
                    </ul>
                  </div>
                </div>
              )}

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Fermer
                </button>

                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    (!isComptable && editingEngagement && editingEngagement.status !== 'pending') ||
                    exceedsAvailableAmount ||
                    invoiceNumberExists ||
                    !formData.invoiceNumber ||
                    !formData.invoiceNumber.trim() ||
                    !formData.supplier
                  }
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                    isSubmitting ||
                    (!isComptable && editingEngagement && editingEngagement.status !== 'pending') ||
                    exceedsAvailableAmount ||
                    invoiceNumberExists ||
                    !formData.invoiceNumber ||
                    !formData.invoiceNumber.trim() ||
                    !formData.supplier
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      Traitement...
                    </span>
                  ) : (
                    editingEngagement ? (
                      <>
                        {isComptable ? 'Modifier l\'engagement' : (
                          editingEngagement.status === 'pending'
                            ? 'Modifier l\'engagement'
                            : 'Modification réservée au comptable'
                        )}
                      </>
                    ) : 'Ajouter'
                  )}
                </button>
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
                      onClick={() => handleSort('engagementNumber')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>N°</span>
                        {getSortIcon('engagementNumber')}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      Ligne budgétaire
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      Sous-ligne
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      Fournisseur
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      N° Facture
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
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      Disponible
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
                  {currentEngagements.map(engagement => {
                    const budgetLine = getBudgetLine(engagement.budgetLineId);
                    const subBudgetLine = getSubBudgetLine(engagement.subBudgetLineId);
                    const grant = getGrant(engagement.grantId);
                    const currencySymbol = getCurrencySymbol(grant?.currency || 'EUR');
                    const availableForSubLine = getAvailableAmountForSubLine(engagement.subBudgetLineId);
                    const isDeletable = engagement.status === 'pending' && canDelete;

                    return (
                      <tr key={engagement.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4 text-sm text-gray-900 whitespace-nowrap">
                          {new Date(engagement.date).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm font-medium text-gray-900">{engagement.engagementNumber}</div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm text-gray-900 max-w-[150px]" title={budgetLine?.name}>
                            {budgetLine ? `${budgetLine.code} - ${budgetLine.name}` : 'N/A'}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm text-gray-900 max-w-[150px]" title={subBudgetLine?.name}>
                            {subBudgetLine ? `${subBudgetLine.code} - ${subBudgetLine.name}` : 'N/A'}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <button
                            onClick={() => engagement.supplier && showSupplierHistoryModal(engagement.supplier)}
                            className="text-sm text-blue-600 hover:text-blue-800 hover:underline cursor-pointer text-left"
                            title={engagement.supplier || 'Non spécifié'}
                          >
                            {engagement.supplier || 'Non spécifié'}
                          </button>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm text-gray-600 font-medium">
                            {engagement.invoiceNumber || '-'}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right text-sm font-medium text-gray-900 whitespace-nowrap">
                          {grant ? formatCurrency(engagement.amount, grant.currency) : `${engagement.amount.toLocaleString('fr-FR')} €`}
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
                          {canModifyStatus() && engagement.status === 'pending' ? (
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
                          {engagement.status !== 'pending' && !canModifyStatus() && (
                            <div className="text-xs text-gray-400 mt-1">
                              {engagement.status === 'approved' ? '✅ Verrouillé' : '❌ Verrouillé'}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="flex items-center justify-center space-x-1">
                            {(canEdit || needsUserSignature(engagement)) && (
                              <button
                                onClick={() => startEdit(engagement)}
                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title={canEdit ? 'Modifier' : 'Signer'}
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                            )}
                            {canView && (
                              <button
                                onClick={() => setViewingEngagement(engagement)}
                                className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                title="Voir les détails"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}

                            {isDeletable && onDeleteEngagement && (
                              <button
                                onClick={() => handleDeleteEngagement(engagement.id)}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Supprimer"
                              >
                                <Trash2 className="w-4 h-4" />
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
              <div className="flex items-center gap-2">
                {canExport && (
                  <button
                    onClick={exportSupplierHistoryToExcel}
                    className="p-2 text-green-600 hover:text-green-800 hover:bg-green-50 rounded-lg transition-colors"
                    title="Exporter en Excel"
                  >
                    <FileSpreadsheet className="w-5 h-5" />
                  </button>
                )}
                <button
                  onClick={() => setShowSupplierHistory(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
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
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-blue-50 rounded-lg p-4">
                      <p className="text-sm text-blue-600 font-medium">Total Engagements</p>
                      <p className="text-2xl font-bold text-blue-900">{totalEngagements}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                      <p className="text-sm text-green-600 font-medium">Montant Total</p>
                      <p className="text-2xl font-bold text-green-900">
                        {formatAmount(totalAmount)} {getCurrencySymbol(selectedGrant?.currency || 'EUR')}
                      </p>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-4">
                      <p className="text-sm text-purple-600 font-medium">Montant Approuvé</p>
                      <p className="text-2xl font-bold text-purple-900">
                        {formatAmount(approvedAmount)} {getCurrencySymbol(selectedGrant?.currency || 'EUR')}
                      </p>
                    </div>
                  </div>

                  {totalEngagements === 0 ? (
                    <p className="text-gray-500 text-center py-8">
                      Aucun engagement trouvé pour ce fournisseur
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {supplierEngagements.map(engagement => {
                        const budgetLine = getBudgetLine(engagement.budgetLineId);
                        const subBudgetLine = getSubBudgetLine(engagement.subBudgetLineId);
                        const grant = getGrant(engagement.grantId);

                        return (
                          <div key={engagement.id} className="bg-gray-50 rounded-lg p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-3 mb-2 flex-wrap">
                                  <h4 className="font-medium text-gray-900">{engagement.engagementNumber}</h4>
                                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${ENGAGEMENT_STATUS[engagement.status].color}`}>
                                    {ENGAGEMENT_STATUS[engagement.status].label}
                                  </span>
                                  {engagement.invoiceNumber && (
                                    <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                                      Facture: {engagement.invoiceNumber}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-gray-600 mb-1">{engagement.description}</p>
                                <p className="text-xs text-gray-500">
                                  {budgetLine ? `${budgetLine.code} - ${budgetLine.name}` : 'N/A'} •
                                  {subBudgetLine ? ` ${subBudgetLine.code} - ${subBudgetLine.name}` : ' N/A'} •
                                  {grant?.name || 'N/A'} • {new Date(engagement.date).toLocaleDateString('fr-FR')}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-gray-900">
                                  {formatCurrency(engagement.amount, grant?.currency || 'EUR')}
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
              <div className="flex items-center gap-2">
                {/* Bouton de téléchargement PDF */}
                {canExport && (
                  <button
                    onClick={() => exportEngagementForm(viewingEngagement)}
                    disabled={isGeneratingPDF}
                    className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-full transition-colors disabled:opacity-50"
                    title="Télécharger en PDF"
                  >
                    <Download className="w-6 h-6" />
                  </button>
                )}
                <button
                  onClick={closeEngagementDetails}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
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
                      <label className="block text-sm font-medium text-gray-600">Montant</label>
                      <p className="text-lg font-bold text-gray-900">
                        {formatCurrency(viewingEngagement.amount, selectedGrant?.currency || 'EUR')}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">Fournisseur</label>
                      <p className="text-sm text-gray-900">{viewingEngagement.supplier || 'Non spécifié'}</p>
                    </div>
                    {viewingEngagement.invoiceNumber && (
                      <div>
                        <label className="block text-sm font-medium text-gray-600">N° Facture</label>
                        <p className="text-sm text-gray-900">{viewingEngagement.invoiceNumber}</p>
                      </div>
                    )}
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