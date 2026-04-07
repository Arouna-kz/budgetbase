import React, { useState, useEffect, useRef } from 'react';
import { Plus, Edit, CreditCard, CheckCircle, Clock, AlertCircle, Eye, Filter, TrendingUp, User, X, ChevronUp, ChevronDown, ChevronRight, ChevronLeft, Search, Download } from 'lucide-react';
import { showWarning, showSuccess, showValidationError } from '../utils/alerts';
import { Payment, Engagement, BudgetLine, SubBudgetLine, Grant, BankAccount, PAYMENT_STATUS } from '../types';
import { usePermissions } from '../hooks/usePermissions';
import { useAuth } from '../hooks/useAuth';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
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
}

// Interface pour les signatures d'approbation des paiements
interface PaymentApprovalSignature {
  name: string;
  signature: boolean;
  date?: string;
  observation?: string;
}

interface PaymentApprovals {
  supervisor1?: { 
    name: string; 
    signature: boolean; 
    observation: string;
    date?: string;
  };
  supervisor2?: { 
    name: string; 
    signature: boolean; 
    observation: string;
    date?: string;
  };
  finalApproval?: { 
    name: string; 
    signature: boolean; 
    observation: string;
    date?: string;
  };
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
  onCreatePaymentFromEngagement
}) => {
  // HOOKS D'AUTHENTIFICATION ET PERMISSIONS
  const { hasPermission, hasModuleAccess, loading: permissionsLoading } = usePermissions();
  const { user: currentUser, userProfile, userRole } = useAuth();

  // HOOK DE NOTIFICATIONS POUR LES PAIEMENTS
  const { notificationCount, hasNotifications} = usePaymentNotifications(payments);

  const getAvailableEngagementsCount = () => {
    return filteredAvailableEngagements.length;
  };

  // ÉTATS DU COMPOSANT
  const [showForm, setShowForm] = useState(false);
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [selectedEngagement, setSelectedEngagement] = useState<string>('');

  // États pour le tri et la pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sortField, setSortField] = useState<string>('paymentNumber');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [supplierFilter, setSupplierFilter] = useState<string>('');

  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  // Références pour le PDF
  const mainContentRef = useRef<HTMLDivElement>(null);
  const signatureContentRef = useRef<HTMLDivElement>(null);

  // État pour gérer l'expansion du contenu des cellules
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // ÉTATS DU FORMULAIRE
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

  const [approvals, setApprovals] = useState<PaymentApprovals>({
    supervisor1: { name: '', signature: false, observation: '' },
    supervisor2: { name: '', signature: false, observation: '' },
    finalApproval: { name: '', signature: false, observation: '' }
  });

  const [showObservations, setShowObservations] = useState({
    supervisor1: false,
    supervisor2: false,
    finalApproval: false
  });


  // Optionnel : Ajouter une validation avant la génération
  const handleExportPDF = () => {
    // Vérifier si on a au moins les données minimales pour un brouillon
    if (!editingPayment && (!formData.supplier || !formData.amount)) {
      showWarning(
        'Données manquantes', 
        'Veuillez remplir au moins le fournisseur et le montant avant de générer le PDF'
      );
      return;
    }
    exportPaymentForm();
  };

  // 🎯 NOUVELLE FONCTION POUR EXPORTER LE FORMULAIRE DE PAIEMENT
  const exportPaymentForm = async () => {
    setIsGeneratingPDF(true);
    
    try {
      // Déterminer les données à utiliser : édition ou création
      const paymentData = editingPayment ? editingPayment : {
        // Créer un objet paiement temporaire à partir des données du formulaire
        id: 'temp',
        engagementId: formData.engagementId,
        grantId: formData.grantId,
        budgetLineId: formData.budgetLineId,
        subBudgetLineId: formData.subBudgetLineId,
        paymentNumber: formData.paymentNumber || `BROUILLON-${Date.now()}`,
        amount: parseFloat(formData.amount) || 0,
        description: formData.description,
        supplier: formData.supplier,
        paymentMethod: formData.paymentMethod,
        checkNumber: formData.checkNumber,
        bankAccountId: formData.bankAccountId,
        date: formData.date,
        status: formData.status,
        approvals: approvals
      };

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;

      // Générer le contenu principal
      const mainContent = generateMainPDFContent(paymentData);
      const tempMainDiv = document.createElement('div');
      tempMainDiv.innerHTML = mainContent;
      tempMainDiv.style.width = '800px';
      tempMainDiv.style.padding = '20px';
      tempMainDiv.style.fontFamily = 'Arial, sans-serif';
      document.body.appendChild(tempMainDiv);

      const mainCanvas = await html2canvas(tempMainDiv, {
        scale: 2,
        useCORS: true,
        logging: false,
        width: 800,
        windowWidth: 800
      });
      document.body.removeChild(tempMainDiv);

      const mainImgData = mainCanvas.toDataURL('image/png');
      const mainImgWidth = pageWidth - (margin * 2);
      const mainImgHeight = (mainCanvas.height * mainImgWidth) / mainCanvas.width;

      // Ajouter la première page avec le contenu principal
      pdf.addImage(mainImgData, 'PNG', margin, margin, mainImgWidth, mainImgHeight);

      // Générer le contenu des signatures (deuxième page)
      const signatureContent = generateSignaturePDFContent(paymentData);
      const tempSignatureDiv = document.createElement('div');
      tempSignatureDiv.innerHTML = signatureContent;
      tempSignatureDiv.style.width = '800px';
      tempSignatureDiv.style.padding = '20px';
      tempSignatureDiv.style.fontFamily = 'Arial, sans-serif';
      document.body.appendChild(tempSignatureDiv);

      const signatureCanvas = await html2canvas(tempSignatureDiv, {
        scale: 2,
        useCORS: true,
        logging: false,
        width: 800,
        windowWidth: 800
      });
      document.body.removeChild(tempSignatureDiv);

      const signatureImgData = signatureCanvas.toDataURL('image/png');
      const signatureImgWidth = pageWidth - (margin * 2);
      const signatureImgHeight = (signatureCanvas.height * signatureImgWidth) / signatureCanvas.width;

      // Ajouter une deuxième page pour les signatures
      pdf.addPage();
      pdf.addImage(signatureImgData, 'PNG', margin, margin, signatureImgWidth, signatureImgHeight);

      // Télécharger le PDF avec un nom approprié
      const fileName = editingPayment 
        ? `paiement-${editingPayment.paymentNumber}.pdf`
        : `brouillon-paiement-${new Date().toISOString().split('T')[0]}.pdf`;
      
      pdf.save(fileName);
      
      showSuccess('PDF généré', 'Le formulaire de paiement a été téléchargé avec succès');
      
    } catch (error) {
      console.error('Erreur lors de la génération du PDF:', error);
      showWarning('Erreur', 'Impossible de générer le PDF. Veuillez réessayer.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // 🎯 FONCTION POUR GÉNÉRER LE CONTENU PRINCIPAL DU PDF
  const generateMainPDFContent = (payment: any) => {
    // Récupérer les données avec des valeurs par défaut
    const engagement = payment.engagementId ? getEngagement(payment.engagementId) : null;
    const budgetLine = payment.budgetLineId ? getBudgetLine(payment.budgetLineId) : null;
    const subBudgetLine = payment.subBudgetLineId ? getSubBudgetLine(payment.subBudgetLineId) : null;
    const grant = payment.grantId ? getGrant(payment.grantId) : activeGrant;
    const bankAccount = payment.bankAccountId ? bankAccounts.find(acc => acc.id === payment.bankAccountId) : null;
    const currencySymbol = getCurrencySymbol(grant?.currency || 'EUR');

    const getPaymentMethodLabel = (method: Payment['paymentMethod']) => {
      switch (method) {
        case 'transfer': return 'Virement Bancaire';
        case 'check': return 'Chèque';
        case 'cash': return 'Espèces';
        default: return method;
      }
    };

    const getStatusLabel = (status: Payment['status']) => {
      return PAYMENT_STATUS[status]?.label || status;
    };

    return `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; color: #333;">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #2c5aa0;">
          <h1 style="color: #2c5aa0; margin-bottom: 10px; font-size: 24px; font-weight: bold;">
            ${editingPayment ? 'FICHE DE PAIEMENT' : 'BROUILLON - FICHE DE PAIEMENT'}
          </h1>
          <h2 style="color: #555; font-size: 18px; margin-bottom: 10px;">${payment.paymentNumber}</h2>
          <p style="color: #777; font-size: 14px;">
            Date: ${new Date(payment.date).toLocaleDateString('fr-FR', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </p>
          ${!editingPayment && '<p style="color: #d97706; font-size: 12px; margin-top: 5px;">⚠️ Document non sauvegardé - Version brouillon</p>'}
        </div>
        
        <!-- Informations de la Subvention -->
        <div style="margin-bottom: 25px;">
          <h3 style="color: #2c5aa0; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #eee; font-size: 16px; font-weight: bold;">
            Informations de la Subvention
          </h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div>
              <strong>Subvention:</strong>
              <div style="padding: 8px; background: #f8f9fa; border-radius: 4px; margin-top: 5px;">
                ${grant?.name || 'Non spécifié'}
              </div>
            </div>
            <div>
              <strong>Référence:</strong>
              <div style="padding: 8px; background: #f8f9fa; border-radius: 4px; margin-top: 5px;">
                ${grant?.reference || 'N/A'}
              </div>
            </div>
            <div>
              <strong>Organisation:</strong>
              <div style="padding: 8px; background: #f8f9fa; border-radius: 4px; margin-top: 5px;">
                ${grant?.grantingOrganization || 'N/A'}
              </div>
            </div>
            <div>
              <strong>Devise:</strong>
              <div style="padding: 8px; background: #f8f9fa; border-radius: 4px; margin-top: 5px;">
                ${grant?.currency || 'EUR'} (${currencySymbol})
              </div>
            </div>
          </div>
        </div>

        <!-- Informations de l'Engagement -->
        ${engagement && `
        <div style="margin-bottom: 25px;">
          <h3 style="color: #2c5aa0; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #eee; font-size: 16px; font-weight: bold;">
            Informations de l'Engagement
          </h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div>
              <strong>N° d'Engagement:</strong>
              <div style="padding: 8px; background: #f8f9fa; border-radius: 4px; margin-top: 5px;">
                ${engagement.engagementNumber || 'N/A'}
              </div>
            </div>
            <div>
              <strong>Ligne Budgétaire:</strong>
              <div style="padding: 8px; background: #f8f9fa; border-radius: 4px; margin-top: 5px;">
                ${budgetLine?.code || 'N/A'} - ${budgetLine?.name || 'Non spécifié'}
              </div>
            </div>
            <div>
              <strong>Sous-Ligne Budgétaire:</strong>
              <div style="padding: 8px; background: #f8f9fa; border-radius: 4px; margin-top: 5px;">
                ${subBudgetLine?.code || 'N/A'} - ${subBudgetLine?.name || 'Non spécifié'}
              </div>
            </div>
          </div>
        </div>
        `}
        
        <!-- Détails du Paiement -->
        <div style="margin-bottom: 25px;">
          <h3 style="color: #2c5aa0; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #eee; font-size: 16px; font-weight: bold;">
            Détails du Paiement
          </h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
            <div>
              <strong>N° de Paiement:</strong>
              <div style="padding: 8px; background: #f8f9fa; border-radius: 4px; margin-top: 5px;">
                ${payment.paymentNumber}
              </div>
            </div>
            <div>
              <strong>Date:</strong>
              <div style="padding: 8px; background: #f8f9fa; border-radius: 4px; margin-top: 5px;">
                ${new Date(payment.date).toLocaleDateString('fr-FR')}
              </div>
            </div>
            <div>
              <strong>Fournisseur:</strong>
              <div style="padding: 8px; background: #f8f9fa; border-radius: 4px; margin-top: 5px;">
                ${payment.supplier || 'Non spécifié'}
              </div>
            </div>
            <div>
              <strong>Statut:</strong>
              <div style="padding: 8px; background: #f8f9fa; border-radius: 4px; margin-top: 5px; font-weight: bold; color: ${
                payment.status === 'paid' ? '#059669' : 
                payment.status === 'approved' ? '#2563eb' : 
                payment.status === 'pending' ? '#d97706' : '#dc2626'
              };">
                ${getStatusLabel(payment.status)}
              </div>
            </div>
            <div>
              <strong>Montant:</strong>
              <div style="padding: 8px; background: #f8f9fa; border-radius: 4px; margin-top: 5px; font-weight: bold; font-size: 16px;">
                ${(payment.amount || 0).toLocaleString('fr-FR')} ${currencySymbol}
              </div>
            </div>
            <div>
              <strong>Mode de Paiement:</strong>
              <div style="padding: 8px; background: #f8f9fa; border-radius: 4px; margin-top: 5px;">
                ${getPaymentMethodLabel(payment.paymentMethod)}
              </div>
            </div>
          </div>
          
          ${payment.checkNumber ? `
          <div style="margin-bottom: 10px;">
            <strong>Numéro de Chèque:</strong>
            <div style="padding: 8px; background: #f8f9fa; border-radius: 4px; margin-top: 5px;">
              ${payment.checkNumber}
            </div>
          </div>
          ` : ''}
          
          ${bankAccount ? `
          <div style="margin-bottom: 10px;">
            <strong>Compte Bancaire:</strong>
            <div style="padding: 8px; background: #f8f9fa; border-radius: 4px; margin-top: 5px;">
              ${bankAccount.accountNumber} - ${bankAccount.bankName} (${bankAccount.accountHolder})
            </div>
          </div>
          ` : ''}
          
          <div style="margin-bottom: 10px;">
            <strong>Description:</strong>
            <div style="padding: 12px; background: #f8f9fa; border-radius: 4px; margin-top: 5px; min-height: 60px;">
              ${payment.description ? payment.description.replace(/\n/g, '<br>') : 'Aucune description'}
            </div>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #2c5aa0; text-align: center; font-size: 12px; color: #777;">
          <p>Document généré le ${new Date().toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}</p>
          <p>${editingPayment ? `Fiche de paiement - ${payment.paymentNumber}` : 'Brouillon de fiche de paiement'}</p>
        </div>
      </div>
    `;
  };

  // 🎯 FONCTION POUR GÉNÉRER LE CONTENU DES SIGNATURES DU PDF
  const generateSignaturePDFContent = (payment: Payment) => {
    const currentApprovals = payment.approvals || approvals;

    return `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; color: #333; padding-top: 50px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2c5aa0; margin-bottom: 10px; font-size: 24px; font-weight: bold;">SIGNATURES D'APPROBATION</h1>
          <h2 style="color: #555; font-size: 18px; margin-bottom: 10px;">${payment.paymentNumber}</h2>
        </div>
        
        <!-- Signatures -->
        <div style="margin-bottom: 25px;">
          <h3 style="color: #2c5aa0; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #eee; font-size: 16px; font-weight: bold;">
            Signatures d'Approbation du Paiement
          </h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px;">
            <!-- Coordinateur de la Subvention -->
            <div style="border: 1px solid #ddd; border-radius: 8px; padding: 20px; text-align: center;">
              <h4 style="font-size: 14px; color: #555; margin-bottom: 15px; font-weight: bold;">Coordinateur de la Subvention</h4>
              <div style="height: 1px; background: #ccc; margin: 20px 0;"></div>
              <div style="min-height: 40px; margin-bottom: 10px; font-weight: bold;">
                ${currentApprovals.supervisor1?.name || '_________________________'}
              </div>
              <p style="font-size: 12px; margin: 5px 0;">
                <strong>Date:</strong> ${(currentApprovals.supervisor1 as any)?.date || '___/___/_____'}
              </p>
              <p style="font-size: 12px; margin: 5px 0;">
                <strong>Signature:</strong> ${currentApprovals.supervisor1?.signature ? '✅ Validée' : '◻ Non validée'}
              </p>
              ${currentApprovals.supervisor1?.observation ? `
              <div style="margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 4px;">
                <strong style="font-size: 11px;">Observation:</strong>
                <p style="font-size: 11px; color: #666; margin: 5px 0 0 0;">${currentApprovals.supervisor1.observation}</p>
              </div>
              ` : ''}
            </div>
            
            <!-- Comptable -->
            <div style="border: 1px solid #ddd; border-radius: 8px; padding: 20px; text-align: center;">
              <h4 style="font-size: 14px; color: #555; margin-bottom: 15px; font-weight: bold;">Comptable</h4>
              <div style="height: 1px; background: #ccc; margin: 20px 0;"></div>
              <div style="min-height: 40px; margin-bottom: 10px; font-weight: bold;">
                ${currentApprovals.supervisor2?.name || '_________________________'}
              </div>
              <p style="font-size: 12px; margin: 5px 0;">
                <strong>Date:</strong> ${(currentApprovals.supervisor2 as any)?.date || '___/___/_____'}
              </p>
              <p style="font-size: 12px; margin: 5px 0;">
                <strong>Signature:</strong> ${currentApprovals.supervisor2?.signature ? '✅ Validée' : '◻ Non validée'}
              </p>
              ${currentApprovals.supervisor2?.observation ? `
              <div style="margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 4px;">
                <strong style="font-size: 11px;">Observation:</strong>
                <p style="font-size: 11px; color: #666; margin: 5px 0 0 0;">${currentApprovals.supervisor2.observation}</p>
              </div>
              ` : ''}
            </div>
            
            <!-- Coordonnateur National -->
            <div style="border: 1px solid #ddd; border-radius: 8px; padding: 20px; text-align: center;">
              <h4 style="font-size: 14px; color: #555; margin-bottom: 15px; font-weight: bold;">Coordonnateur National</h4>
              <div style="height: 1px; background: #ccc; margin: 20px 0;"></div>
              <div style="min-height: 40px; margin-bottom: 10px; font-weight: bold;">
                ${currentApprovals.finalApproval?.name || '_________________________'}
              </div>
              <p style="font-size: 12px; margin: 5px 0;">
                <strong>Date:</strong> ${(currentApprovals.finalApproval as any)?.date || '___/___/_____'}
              </p>
              <p style="font-size: 12px; margin: 5px 0;">
                <strong>Signature:</strong> ${currentApprovals.finalApproval?.signature ? '✅ Validée' : '◻ Non validée'}
              </p>
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
          <p>Fiche de paiement - ${payment.paymentNumber}</p>
        </div>
      </div>
    `;
  };

  // 🎯 FONCTIONS UTILITAIRES POUR LES RÔLES ET PERMISSIONS

  // Récupère le nom complet de l'utilisateur
  const getUserFullName = (): string => {
    if (!userProfile) return '';
    if (userProfile.firstName && userProfile.lastName) {
      return `${userProfile.firstName} ${userProfile.lastName}`.trim();
    }
    return userProfile?.email || '';
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
  const canModifyStatusComptable = (): boolean => {
    return getUserProfession() === 'Comptable';
  };

  const canModifyStatus = (): boolean => {
    return getUserProfession() === 'Coordonnateur National';
  };

  // Vérifie si l'utilisateur peut signer un paiement spécifique
  const canSignPayment = (payment: Payment | null, signatureType: string): boolean => {
    const currentApprovals = payment ? payment.approvals : approvals;
    
    if (!currentApprovals) {
      return false;
    }
    
    const userProfession = getUserProfession();
    
    // Vérification basée sur la profession et le type de signature
    const professionCanSign = 
      (signatureType === 'supervisor1' && userProfession === 'Coordinateur de la Subvention') ||
      (signatureType === 'supervisor2' && userProfession === 'Comptable') ||
      (signatureType === 'finalApproval' && userProfession === 'Coordonnateur National');

    if (!professionCanSign) return false;

    // Vérifie que la signature n'est pas déjà apposée
    const existingApproval = currentApprovals[signatureType as keyof typeof currentApprovals];
    if (existingApproval?.signature) return false;

    // Pour le coordonnateur national, vérifier que les deux premiers ont signé
    if (signatureType === 'finalApproval') {
      const hasSupervisor1Signed = currentApprovals.supervisor1?.signature;
      const hasSupervisor2Signed = currentApprovals.supervisor2?.signature;
      
      if (!payment) return false; // Le CN ne peut signer que les paiements existants
      
      if (!hasSupervisor1Signed || !hasSupervisor2Signed) {
        return false;
      }
    }

    return true;
  };

  // Récupère les paiements en attente de signature pour l'utilisateur actuel
  const getPendingSignatures = (): Payment[] => {
    const userProfession = getUserProfession();
    
    return payments.filter(payment => {
      if (userProfession === 'Coordinateur de la Subvention') {
        return !payment.approvals?.supervisor1?.signature;
      } else if (userProfession === 'Comptable') {
        return !payment.approvals?.supervisor2?.signature;
      } else if (userProfession === 'Coordonnateur National') {
        const hasSupervisor1Signed = payment.approvals?.supervisor1?.signature;
        const hasSupervisor2Signed = payment.approvals?.supervisor2?.signature;
        const hasFinalSigned = payment.approvals?.finalApproval?.signature;
        return hasSupervisor1Signed && hasSupervisor2Signed && !hasFinalSigned;
      }
      return false;
    });
  };

  // Fonction pour basculer l'expansion d'une ligne
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

  // Fonction pour tronquer le texte
  const truncateText = (text: string, maxLength: number = 30): string => {
    if (!text) return '';
    return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
  };

  // EFFET POUR PRÉ-REMPLIR LES NOMS DES SIGNATAIRES
  React.useEffect(() => {
    if (userProfile && canViewSignatureSection()) {
      const userName = getUserFullName();
      
      setApprovals(prev => {
        const newApprovals = { ...prev };
        const userProfession = getUserProfession();
        
        if (userProfession === 'Coordinateur de la Subvention') {
          newApprovals.supervisor1 = { 
            ...newApprovals.supervisor1, 
            name: userName 
          };
        } else if (userProfession === 'Comptable') {
          newApprovals.supervisor2 = { 
            ...newApprovals.supervisor2, 
            name: userName 
          };
        } else if (userProfession === 'Coordonnateur National') {
          newApprovals.finalApproval = { 
            ...newApprovals.finalApproval, 
            name: userName 
          };
        }
        
        return newApprovals;
      });
    }
  }, [userProfile]);

  // PERMISSIONS SPÉCIFIQUES AU MODULE PAIEMENTS
  const canCreate = hasPermission('payments', 'create');
  const canEdit = hasPermission('payments', 'edit');
  const canDelete = hasPermission('payments', 'delete');
  const canView = hasPermission('payments', 'view');

  // Récupération des données utilisateur
  const userProfession = getUserProfession();
  const userFullName = getUserFullName();
  const pendingSignatures = getPendingSignatures();

  // Filtrer les engagements approuvés qui n'ont pas encore de paiement
  const availableEngagements = engagements.filter(engagement => 
    engagement.status === 'approved' && 
    !payments.some(payment => payment.engagementId === engagement.id)
  );

  // Filtrer les paiements par subvention sélectionnée
  const filteredPayments = selectedGrantId 
    ? payments.filter(payment => payment.grantId === selectedGrantId)
    : payments;

  // Filtrer les engagements disponibles par subvention sélectionnée
  const filteredAvailableEngagements = selectedGrantId
    ? availableEngagements.filter(engagement => engagement.grantId === selectedGrantId)
    : availableEngagements;

  // Trouver la subvention active
  const activeGrant = grants.find(grant => grant.id === selectedGrantId) || 
                     grants.find(grant => grant.status === 'active') || 
                     grants[0] || 
                     null;

  // 🎯 FONCTIONS DE RECHERCHE ET FILTRAGE AMÉLIORÉES

  // Fonction pour obtenir les données liées
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

  // Filtrage et recherche des paiements
  const searchedPayments = filteredPayments.filter(payment => {
    const searchLower = searchTerm.toLowerCase();
    const engagement = getEngagement(payment.engagementId);
    
    const matchesSearch = 
      payment.paymentNumber.toLowerCase().includes(searchLower) ||
      payment.description.toLowerCase().includes(searchLower) ||
      (payment.supplier && payment.supplier.toLowerCase().includes(searchLower)) ||
      (engagement && engagement.engagementNumber.toLowerCase().includes(searchLower)) ||
      payment.checkNumber?.toLowerCase().includes(searchLower) ||
      payment.bankReference?.toLowerCase().includes(searchLower) ||
      payment.invoiceNumber?.toLowerCase().includes(searchLower) ||
      payment.quoteReference?.toLowerCase().includes(searchLower);

    const matchesStatus = statusFilter === 'all' || payment.status === statusFilter;
    const matchesDate = !dateFilter || payment.date === dateFilter;
    const matchesSupplier = !supplierFilter || 
      (payment.supplier && payment.supplier.toLowerCase().includes(supplierFilter.toLowerCase()));

    return matchesSearch && matchesStatus && matchesDate && matchesSupplier;
  });

  // Tri des paiements
  const sortedPayments = [...searchedPayments].sort((a, b) => {
    let aValue: any = a[sortField as keyof Payment];
    let bValue: any = b[sortField as keyof Payment];

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
  const totalPages = Math.ceil(sortedPayments.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentPayments = sortedPayments.slice(startIndex, endIndex);

  // Navigation des pages
  const goToPage = (page: number) => setCurrentPage(page);
  const goToPreviousPage = () => currentPage > 1 && setCurrentPage(currentPage - 1);
  const goToNextPage = () => currentPage < totalPages && setCurrentPage(currentPage + 1);

  // Gestion du tri
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
   

  // 🚨 GESTIONNAIRES D'ÉVÉNEMENTS

  // Fonction pour signer un paiement
  const handleSignPayment = (payment: Payment, signatureType: string) => {
      if (!canSignPayment(payment, signatureType)) {
          if (signatureType === 'finalApproval') {
              showWarning('Signature impossible', 'Les signatures du Coordinateur de la Subvention et du Comptable sont requises avant la vôtre.');
          } else {
              showWarning('Permission refusée', 'Vous n\'avez pas les droits pour apposer cette signature.');
          }
          return;
      }

      // Préparer les données de la nouvelle signature
      const signatureData = {
          name: getUserFullName(),
          date: new Date().toISOString().split('T')[0],
          signature: true,
          observation: '', // L'observation doit être ajoutée via le formulaire de modification complet
      };

      // Créer l'objet de mise à jour partiel
      const updates: Partial<Payment> = {
          approvals: {
              ...payment.approvals,
              [signatureType]: signatureData,
          }
      };

      // Mettre à jour le statut si le Coordonnateur National signe
      if (signatureType === 'finalApproval') {
          updates.status = 'approved';
      }

      onUpdatePayment(payment.id, updates);
      showSuccess('Signature enregistrée', 'Votre signature a été enregistrée avec succès.');
  };

  // Réinitialisation du formulaire - CORRIGÉE
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
    // Réinitialiser avec la structure correcte
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
      case 'XOF': return 'CFA';
      default: return '€';
    }
  };

  // Fonction pour formater les montants avec la devise de la subvention active
  const formatCurrency = (amount: number) => {
    if (!activeGrant) return amount.toLocaleString('fr-FR');
    
    return amount.toLocaleString('fr-FR', { 
      style: 'currency', 
      currency: activeGrant.currency === 'XOF' ? 'XOF' : activeGrant.currency,
      minimumFractionDigits: activeGrant.currency === 'XOF' ? 0 : 2
    });
  };

  const updatePaymentStatus = (paymentId: string, newStatus: Payment['status']) => {
    if (!canModifyStatus() && !canModifyStatusComptable()) {
      showWarning('Permission refusée', 'Seul le Coordonnateur National ou Comptable peuvent modifier le statut des paiements');
      return;
    }
    onUpdatePayment(paymentId, { status: newStatus });
  };

  // Fonction pour basculer l'affichage des observations
  const toggleObservation = (signatureType: string) => {
    setShowObservations(prev => ({
      ...prev,
      [signatureType]: !prev[signatureType as keyof typeof showObservations]
    }));
  };

  // Fonction pour obtenir l'icône de signature
  const getSignatureIcon = (payment: Payment, signatureType: string) => {
    const approval = payment.approvals?.[signatureType as keyof typeof payment.approvals];
    if (approval?.signature) {
      return <CheckCircle className="w-4 h-4 text-green-600" />;
    } else {
      return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  // Fonction pour déterminer si une signature est requise
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

   // Récupération des données utilisateur
  // const userProfession = getUserProfession();
  // const userFullName = getUserFullName();
  // const pendingSignatures = getPendingSignatures();

  // Calcul des statistiques
  const pendingPayments = filteredPayments.filter(payment => payment.status === 'pending');
  const approvedPayments = filteredPayments.filter(payment => payment.status === 'approved');
  const paidPayments = filteredPayments.filter(payment => payment.status === 'paid');

  // Calcul du taux de décaissement
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

  

  // 🎯 RENDU PRINCIPAL
  return (
    <div className="space-y-6">
      {/* Header avec notifications de signatures en attente */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gestion des Paiements</h2>
          <p className="text-gray-600 mt-1">Suivi et validation des paiements basés sur les engagements approuvés</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Notification des signatures en attente */}
          {pendingSignatures.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-2">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-orange-600" />
                <span className="text-sm font-medium text-orange-800">
                  {pendingSignatures.length} signature(s) en attente
                </span>
              </div>
            </div>
          )}
          
          {/* {canCreate && (
            <button
              onClick={() => {
                if (filteredAvailableEngagements.length === 0) {
                  showWarning(
                    'Aucun engagement disponible',
                    'Aucun engagement approuvé n\'est disponible pour créer un paiement'
                  );
                  return;
                }
                setShowForm(true);
              }}
              className="bg-gradient-to-r from-green-600 to-blue-600 text-white px-6 py-3 rounded-xl font-medium hover:shadow-lg transform hover:scale-[1.02] transition-all duration-200 flex items-center space-x-2"
            >
              <Plus className="w-5 h-5" />
              <span>Créer un Paiement</span>
            </button>
          )} */}
        </div>
      </div>

      {/* Barre de recherche et filtres */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div className="relative">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
            <input
              type="text"
              placeholder="Rechercher paiement, fournisseur, engagement..."
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
              <option value="paid">Payé</option>
              {/* <option value="cashed">Encaissé</option> */}
              <option value="rejected">Rejeté</option>
            </select>
          </div>
          
          <div>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Filtrer par date"
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
            <span>{sortedPayments.length} paiement(s) trouvé(s)</span>
            {(searchTerm || statusFilter !== 'all' || dateFilter || supplierFilter) && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                  setDateFilter('');
                  setSupplierFilter('');
                }}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                Réinitialiser les filtres
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Grant Information */}
      {activeGrant && (
        <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-2xl p-6 border border-green-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{activeGrant.name}</h3>
              <p className="text-gray-600">{activeGrant.reference} - {activeGrant.grantingOrganization}</p>
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
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

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Paiements en Attente</p>
              <p className="text-2xl font-bold text-yellow-600">{pendingPayments.length}</p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-full">
              <Clock className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Paiements Approuvés</p>
              <p className="text-2xl font-bold text-green-600">{approvedPayments.length}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Paiements Effectués</p>
              <p className="text-2xl font-bold text-purple-600">{paidPayments.length}</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <CreditCard className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Taux de Décaissement</p>
              <p className="text-2xl font-bold text-indigo-600">{disbursementRate.toFixed(1)}%</p>
              <p className="text-sm text-gray-500 mt-1">
                {formatCurrency(totalPaid)} payés
              </p>
            </div>
            <div className="p-3 bg-indigo-100 rounded-full">
              <TrendingUp className="w-6 h-6 text-indigo-600" />
            </div>
          </div>
        </div>
      </div>

      

      {/* Quick Access to Create Payments */}
      {filteredAvailableEngagements.length > 0 && canCreate && (
        <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-2xl p-6 border border-green-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Plus className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Créer des Fiches de Paiement</h3>
                <p className="text-gray-600">{filteredAvailableEngagements.length} engagement{filteredAvailableEngagements.length > 1 ? 's' : ''} prêt{filteredAvailableEngagements.length > 1 ? 's' : ''} pour paiement</p>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAvailableEngagements.slice(0, 6).map(engagement => {
              const budgetLine = getBudgetLine(engagement.budgetLineId);
              
              return (
                <div key={engagement.id} className="bg-white rounded-xl p-4 border border-gray-200 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900 text-sm">{engagement.engagementNumber}</h4>
                      <p className="text-xs text-gray-600 mb-1">{engagement.supplier}</p>
                      <p className="text-xs text-gray-500">{budgetLine?.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-600 text-sm">
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
            <div className="mt-4 text-center">
              <p className="text-sm text-gray-600">
                Et {filteredAvailableEngagements.length - 6} autre{filteredAvailableEngagements.length - 6 > 1 ? 's' : ''} engagement{filteredAvailableEngagements.length - 6 > 1 ? 's' : ''} disponible{filteredAvailableEngagements.length - 6 > 1 ? 's' : ''}...
              </p>
            </div>
          )}
        </div>
      )}

      {/* Payments List - MODIFIÉ avec pagination intégrée et contenu expansible */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Liste des Paiements
              {selectedGrantId && (
                <span className="text-sm font-normal text-gray-600 ml-2">
                  ({sortedPayments.length} paiement{sortedPayments.length > 1 ? 's' : ''})
                </span>
              )}
            </h3>
            
            {/* Sélecteur du nombre de lignes par page */}
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Lignes par page:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1); // Retour à la première page
                }}
                className="px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </div>
        
        {currentPayments.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <CreditCard className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm || statusFilter !== 'all' || dateFilter || supplierFilter 
                ? 'Aucun paiement ne correspond aux critères de recherche' 
                : selectedGrantId ? 'Aucun paiement pour cette subvention' : 'Aucun paiement'
              }
            </h3>
            <p className="text-gray-500">
              {searchTerm || statusFilter !== 'all' || dateFilter || supplierFilter
                ? 'Essayez de modifier vos critères de recherche'
                : selectedGrantId ? 'Aucun paiement n\'a été créé pour cette subvention' : 'Les paiements apparaîtront ici une fois créés'
              }
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('paymentNumber')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Paiement</span>
                        {getSortIcon('paymentNumber')}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('date')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Date</span>
                        {getSortIcon('date')}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Engagement
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fournisseur
                    </th>
                    <th 
                      className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('amount')}
                    >
                      <div className="flex items-center justify-end space-x-1">
                        <span>Montant</span>
                        {getSortIcon('amount')}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Signatures
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Statut
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {currentPayments.map(payment => {
                    const engagement = getEngagement(payment.engagementId);
                    const budgetLine = getBudgetLine(payment.budgetLineId);
                    const isExpanded = expandedRows.has(payment.id);
                    
                    return (
                      <React.Fragment key={payment.id}>
                        <tr className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <div>
                              <div className="text-sm font-medium text-gray-900">{payment.paymentNumber}</div>
                              <div className="text-sm text-gray-500">
                                {new Date(payment.date).toLocaleDateString('fr-FR')}
                              </div>
                              <div className="text-xs text-gray-400">
                                {payment.paymentMethod === 'check' ? 'Chèque' : 
                                 payment.paymentMethod === 'transfer' ? 'Virement' : 'Espèces'}
                                {payment.checkNumber && ` N°${payment.checkNumber}`}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {new Date(payment.date).toLocaleDateString('fr-FR')}
                          </td>
                          <td className="px-6 py-4">
                            <div 
                              className="cursor-pointer hover:text-blue-600 transition-colors"
                              onClick={() => toggleRowExpansion(payment.id)}
                            >
                              <div className="text-sm text-gray-900">
                                {isExpanded ? engagement?.engagementNumber : truncateText(engagement?.engagementNumber || '', 15)}
                              </div>
                              <div className="text-sm text-gray-500">
                                {isExpanded ? budgetLine?.name : truncateText(budgetLine?.name || '', 20)}
                              </div>
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
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {payment.supplier}
                          </td>
                          <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">
                            {formatCurrency(payment.amount)}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center space-x-2">
                              {/* Signature Coordinateur de la Subvention */}
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

                              {/* Signature Comptable */}
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

                              {/* Signature Coordonnateur National */}
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
                          <td className="px-6 py-4 text-center">
                            {canModifyStatus() ? (
                              <>
                                <select
                                  value={payment.status}
                                  onChange={(e) => updatePaymentStatus(payment.id, e.target.value as Payment['status'])}
                                  className={`text-xs font-medium rounded-full px-2 py-1 border-0 ${PAYMENT_STATUS[payment.status].color}`}
                                >
                                  
                                  <option value="pending">En attente</option>
                                  <option value="approved">Approuvé</option>
                                  <option value="rejected">Rejeté</option>
                                </select>

                                <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${PAYMENT_STATUS[payment.status].color}`}>
                                  {PAYMENT_STATUS[payment.status].label}
                                </span>
                              </>
                            ): canModifyStatusComptable() ? (
                              <>
                                {payment.status === 'approved' || payment.status === 'paid' ? (
                                  <select
                                    value={payment.status}
                                    onChange={(e) => updatePaymentStatus(payment.id, e.target.value as Payment['status'])}
                                    className={`text-xs font-medium rounded-full px-2 py-1 border-0 ${PAYMENT_STATUS[payment.status].color}`}
                                  >
                                    <option value="">Selectionnez</option>
                                    <option value="pending">En attente</option>
                                    <option value="paid">Payé</option>
                                    {/* <option value="cashed">Encaissé</option> */}
                                  </select>
                                ):''}

                                <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${PAYMENT_STATUS[payment.status].color}`}>
                                {PAYMENT_STATUS[payment.status].label}
                              </span>
                              </>
                            ):(
                              <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${PAYMENT_STATUS[payment.status].color}`}>
                                {PAYMENT_STATUS[payment.status].label}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center space-x-2">
                              {canEdit && (
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
                              {/* {canEdit && (
                                <button
                                  onClick={() => {
                                    setEditingPayment(payment);
                                    setFormData({
                                      engagementId: payment.engagementId,
                                      grantId: payment.grantId,
                                      budgetLineId: payment.budgetLineId,
                                      subBudgetLineId: payment.subBudgetLineId,
                                      paymentNumber: payment.paymentNumber,
                                      amount: payment.amount.toString(),
                                      description: payment.description,
                                      supplier: payment.supplier || '',
                                      paymentMethod: payment.paymentMethod,
                                      checkNumber: payment.checkNumber || '',
                                      bankAccountId: payment.bankAccountId || '',
                                      date: payment.date,
                                      status: payment.status
                                    });
                                    if (payment.approvals) {
                                      setApprovals({
                                        financialController: payment.approvals.financialController || { name: '', signature: false, observation: '' },
                                        accountingManager: payment.approvals.accountingManager || { name: '', signature: false, observation: '' },
                                        nationalCoordinator: payment.approvals.nationalCoordinator || { name: '', signature: false, observation: '' }
                                      });
                                    }
                                    setShowForm(true);
                                  }}
                                  className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                              )} */}
                            </div>
                          </td>
                        </tr>
                        
                        {/* Ligne détaillée expandable */}
                        {isExpanded && (
                          <tr className="bg-blue-50">
                            <td colSpan={8} className="px-6 py-4">
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
                                    <p><span className="font-medium">Statut:</span> <span className={PAYMENT_STATUS[payment.status].color.replace('bg-', 'text-').replace('-100', '-800')}>{PAYMENT_STATUS[payment.status].label}</span></p>
                                  </div>
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

            {/* Pagination intégrée au tableau */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-6 py-4 border-t border-gray-200 gap-4 bg-gray-50">
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
    </div>
  );
};

export default PaymentManager;