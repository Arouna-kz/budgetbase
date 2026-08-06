import React, { useState, useEffect, useRef } from 'react';
import { X, Save, FileText, User, CheckCircle, AlertTriangle, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { showValidationError } from '../utils/alerts';
import { BudgetLine, SubBudgetLine, Grant, Engagement } from '../types';

interface EngagementFormProps {
  subBudgetLine: SubBudgetLine;
  budgetLine: BudgetLine;
  grant: Grant;
  onSave: (engagement: Omit<Engagement, 'id'>) => void;
  onCancel: () => void;
  editingEngagement?: Engagement | null;
}

const EngagementForm: React.FC<EngagementFormProps> = ({
  subBudgetLine,
  budgetLine,
  grant,
  onSave,
  onCancel,
  editingEngagement
}) => {
  const [currentUserName, setCurrentUserName] = useState('');
  const printRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // 🎯 Télécharger la fiche d'engagement en PDF (capture fidèle du formulaire)
  const handleDownloadPDF = async () => {
    if (!printRef.current) return;
    setIsDownloading(true);
    try {
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const ref = (editingEngagement ? editingEngagement.engagementNumber : formData.engagementNumber) || 'nouveau';
      pdf.save(`Fiche_Engagement_${ref}.pdf`);
    } catch (error) {
      console.error('Erreur génération PDF:', error);
      showValidationError('Erreur', 'Impossible de générer le PDF de la fiche');
    } finally {
      setIsDownloading(false);
    }
  };

  // Récupérer le nom de l'utilisateur connecté depuis localStorage
  useEffect(() => {
    const savedUser = localStorage.getItem('budgetBaseCurrentUser');
    if (savedUser) {
      try {
        const userData = JSON.parse(savedUser);
        setCurrentUserName(`${userData.firstName} ${userData.lastName}`);
      } catch (error) {
        console.error('Error loading user data:', error);
      }
    }
  }, []);

  const [formData, setFormData] = useState({
    engagementNumber: '',
    amount: '',
    description: '',
    supplier: '',
    quoteReference: '',
    date: new Date().toISOString().split('T')[0]
  });

  const [approvals, setApprovals] = useState({
    supervisor1: { name: '', signature: false },
    supervisor2: { name: '', signature: false },
    finalApproval: { name: '', signature: false }
  });

  useEffect(() => {
    if (editingEngagement) {
      setFormData({
        engagementNumber: editingEngagement.engagementNumber,
        amount: editingEngagement.amount.toString(),
        description: editingEngagement.description,
        supplier: editingEngagement.supplier || '',
        quoteReference: editingEngagement.quoteReference || '',
        date: editingEngagement.date
      });
      
      if (editingEngagement.approvals) {
        setApprovals({
          supervisor1: editingEngagement.approvals.supervisor1 || { name: '', signature: false },
          supervisor2: editingEngagement.approvals.supervisor2 || { name: '', signature: false },
          finalApproval: editingEngagement.approvals.finalApproval || { name: '', signature: false }
        });
      }
    } else {
      // Générer un numéro d'engagement automatique
      const generateEngagementNumber = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const timestamp = String(Date.now()).slice(-6);
        return `ENG-${year}-${month}-${timestamp}`;
      };
      
      setFormData(prev => ({ 
        ...prev, 
        engagementNumber: generateEngagementNumber()
      }));
      
      // Auto-remplir le nom de l'utilisateur connecté dans les signatures
      if (currentUserName) {
        setApprovals(prev => ({
          ...prev,
          supervisor1: { name: currentUserName, signature: true }
        }));
      }
    }
  }, [editingEngagement, currentUserName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.amount || !formData.description || !formData.supplier) {
      showValidationError('Champs obligatoires manquants', 'Veuillez remplir le montant, la description et le fournisseur');
      return;
    }

    const engagement: Omit<Engagement, 'id'> = {
      engagementNumber: formData.engagementNumber,
      grantId: grant.id,
      budgetLineId: budgetLine.id,
      subBudgetLineId: subBudgetLine.id,
      amount: parseFloat(formData.amount),
      description: formData.description,
      date: formData.date,
      supplier: formData.supplier,
      quoteReference: formData.quoteReference,
      // ✅ Préserver le statut existant en modification ; "pending" seulement à la création
      status: editingEngagement ? editingEngagement.status : 'pending',
      approvals: {
        supervisor1: approvals.supervisor1.name ? {
          name: approvals.supervisor1.name,
          date: new Date().toISOString().split('T')[0],
          signature: approvals.supervisor1.signature
        } : undefined,
        supervisor2: approvals.supervisor2.name ? {
          name: approvals.supervisor2.name,
          date: new Date().toISOString().split('T')[0],
          signature: approvals.supervisor2.signature
        } : undefined,
        finalApproval: approvals.finalApproval.name ? {
          name: approvals.finalApproval.name,
          date: new Date().toISOString().split('T')[0],
          signature: approvals.finalApproval.signature
        } : undefined
      }
    };

    onSave(engagement);
  };

  // Calculs budgétaires
  const soldeDisponible = subBudgetLine.availableAmount;
  const montantEngagement = parseFloat(formData.amount || '0');
  const nouveauSolde = soldeDisponible - montantEngagement;
  const tauxEngagementActuel = subBudgetLine.notifiedAmount > 0 ? 
    (subBudgetLine.engagedAmount / subBudgetLine.notifiedAmount) * 100 : 0;
  const nouveauTauxEngagement = subBudgetLine.notifiedAmount > 0 ? 
    ((subBudgetLine.engagedAmount + montantEngagement) / subBudgetLine.notifiedAmount) * 100 : 0;

  const getTauxColor = (taux: number) => {
    if (taux >= 100) return 'text-red-600';
    if (taux >= 90) return 'text-orange-600';
    if (taux >= 75) return 'text-yellow-600';
    return 'text-green-600';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div ref={printRef} className="bg-white rounded-2xl max-w-4xl w-full p-8 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Fiche d'Engagement</h2>
              <p className="text-gray-600">{editingEngagement ? 'Modification' : 'Nouveau'} - {subBudgetLine.name}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2" data-html2canvas-ignore="true">
            <button
              type="button"
              onClick={handleDownloadPDF}
              disabled={isDownloading}
              className="flex items-center space-x-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              title="Télécharger la fiche en PDF"
            >
              <Download className="w-4 h-4" />
              <span>{isDownloading ? 'Génération...' : 'Télécharger PDF'}</span>
            </button>
            <button
              onClick={onCancel}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Solde budgétaire disponible et taux d'engagement avant la demande — uniquement à la création */}
        {!editingEngagement && (
        <div className="bg-blue-50 rounded-xl p-6 mb-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-4">Situation de la Sous-ligne Budgétaire Avant la Demande d'Engagement</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-blue-700 font-medium">Sous-ligne Budgétaire</p>
              <p className="text-blue-900 font-semibold">{subBudgetLine.code}</p>
              <p className="text-blue-900 text-sm">{subBudgetLine.name}</p>
            </div>
            <div>
              <p className="text-sm text-blue-700 font-medium">Ligne Budgétaire</p>
              <p className="text-blue-900 font-semibold">{budgetLine.code}</p>
              <p className="text-blue-900 text-sm">{budgetLine.name}</p>
            </div>
            <div>
              <p className="text-sm text-blue-700 font-medium">Budget Notifié</p>
              <p className="text-blue-900 font-semibold">
                {subBudgetLine.notifiedAmount.toLocaleString('fr-FR', { style: 'currency', currency: grant.currency })}
              </p>
            </div>
            <div>
              <p className="text-sm text-blue-700 font-medium">Solde Disponible</p>
              <p className={`font-semibold ${soldeDisponible >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {soldeDisponible.toLocaleString('fr-FR', { style: 'currency', currency: grant.currency })}
              </p>
              <p className="text-sm text-blue-700 font-medium">Taux d'Engagement</p>
              <p className={`font-semibold ${getTauxColor(tauxEngagementActuel)}`}>
                {tauxEngagementActuel.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Détails de l'Engagement */}
          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Détails de l'Engagement</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fournisseur Concerné *
                </label>
                <input
                  type="text"
                  value={formData.supplier}
                  onChange={(e) => setFormData(prev => ({ ...prev, supplier: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Nom du fournisseur"
                  required
                />
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

            {editingEngagement && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  N° d'Engagement
                </label>
                <input
                  type="text"
                  value={formData.engagementNumber}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 font-mono"
                  readOnly
                  tabIndex={-1}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Numéro généré automatiquement (non modifiable)
                </p>
              </div>
            )}

            <div className="mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Référence du Devis
                </label>
                <input
                  type="text"
                  value={formData.quoteReference}
                  onChange={(e) => setFormData(prev => ({ ...prev, quoteReference: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Ex: DEV-2024-001"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Montant de l'Engagement *
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.amount}
                  onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pl-8"
                  placeholder="0.00"
                  required
                />
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                  €
                </div>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description *
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={3}
                placeholder="Description détaillée de l'engagement..."
                required
              />
            </div>
          </div>

          {/* Solde de la ligne budgétaire si la demande est validée — uniquement à la création */}
          {!editingEngagement && formData.amount && (
            <div className="bg-green-50 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-green-900 mb-4">Solde de la Sous-ligne Budgétaire si la Demande est Validée</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-green-700 font-medium">Montant de l'Engagement</p>
                  <p className="text-lg font-bold text-purple-600">
                    {montantEngagement.toLocaleString('fr-FR', { style: 'currency', currency: grant.currency })}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-green-700 font-medium">Solde de la Sous-ligne</p>
                  <p className={`font-semibold ${nouveauSolde >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {nouveauSolde.toLocaleString('fr-FR', { style: 'currency', currency: grant.currency })}
                  </p>
                  {nouveauSolde < 0 && (
                    <div className="flex items-center space-x-1 text-red-600 text-xs mt-1">
                      <AlertTriangle className="w-3 h-3" />
                      <span>Dépassement budgétaire</span>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-sm text-green-700 font-medium">Nouveau Taux d'Engagement</p>
                  <p className={`font-semibold ${getTauxColor(nouveauTauxEngagement)}`}>
                    {nouveauTauxEngagement.toFixed(1)}%
                  </p>
                  {nouveauTauxEngagement > 100 && (
                    <div className="flex items-center space-x-1 text-red-600 text-xs mt-1">
                      <AlertTriangle className="w-3 h-3" />
                      <span>Taux dépassé</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Signatures d'Approbation - Seulement en modification */}
          {editingEngagement && (
            <div className="bg-yellow-50 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <User className="w-5 h-5 mr-2" />
                Signatures d'Approbation
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Responsable 1 */}
                <div className="space-y-3">
                  <h4 className="font-medium text-gray-800">Coordinateur de la subvention</h4>
                  <input
                    type="text"
                    placeholder="Nom du coordinateur"
                    value={approvals.supervisor1.name}
                    onChange={(e) => setApprovals(prev => ({
                      ...prev,
                      supervisor1: { ...prev.supervisor1, name: e.target.value }
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={approvals.supervisor1.signature}
                      onChange={(e) => setApprovals(prev => ({
                        ...prev,
                        supervisor1: { ...prev.supervisor1, signature: e.target.checked }
                      }))}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Signature validée</span>
                  </label>
                </div>

                {/* Responsable 2 */}
                <div className="space-y-3">
                  <h4 className="font-medium text-gray-800">Comptable</h4>
                  <input
                    type="text"
                    placeholder="Nom du chef unité"
                    value={approvals.supervisor2.name}
                    onChange={(e) => setApprovals(prev => ({
                      ...prev,
                      supervisor2: { ...prev.supervisor2, name: e.target.value }
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={approvals.supervisor2.signature}
                      onChange={(e) => setApprovals(prev => ({
                        ...prev,
                        supervisor2: { ...prev.supervisor2, signature: e.target.checked }
                      }))}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Signature validée</span>
                  </label>
                </div>

                {/* Validation Finale */}
                <div className="space-y-3">
                  <h4 className="font-medium text-gray-800"></h4>
                  <input
                    type="text"
                    placeholder="Nom du coordonnateur"
                    value={approvals.finalApproval.name}
                    onChange={(e) => setApprovals(prev => ({
                      ...prev,
                      finalApproval: { ...prev.finalApproval, name: e.target.value }
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={approvals.finalApproval.signature}
                      onChange={(e) => setApprovals(prev => ({
                        ...prev,
                        finalApproval: { ...prev.finalApproval, signature: e.target.checked }
                      }))}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Signature validée</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Information pour nouveaux engagements */}
          {!editingEngagement && (
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
              <div className="flex items-start space-x-3">
                <CheckCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-900">Information</h4>
                  <p className="text-sm text-blue-700 mt-1">
                    Les signatures d'approbation seront disponibles après la création de l'engagement, 
                    lors de sa modification.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex space-x-4 pt-6" data-html2canvas-ignore="true">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-xl font-medium hover:shadow-lg transform hover:scale-[1.02] transition-all duration-200 flex items-center justify-center space-x-2"
            >
              <Save className="w-5 h-5" />
              <span>{editingEngagement ? 'Modifier' : 'Enregistrer'} l'Engagement</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EngagementForm;