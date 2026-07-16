// components/PaymentDetailsView.tsx
import React from 'react';
import { 
  X, 
  CreditCard, 
  FileText, 
  User, 
  CheckCircle, 
  Clock,
  Truck,
  CheckSquare,
  Building,
  Download,
  History,
  DollarSign
} from 'lucide-react';
import { Payment, Engagement, BudgetLine, SubBudgetLine, Grant, PAYMENT_STATUS, PartialPayment } from '../types';
import jsPDF from 'jspdf';

interface PaymentDetailsViewProps {
  payment: Payment;
  engagement: Engagement;
  subBudgetLine: SubBudgetLine;
  budgetLine: BudgetLine;
  grant: Grant;
  onClose: () => void;
}

const PaymentDetailsView: React.FC<PaymentDetailsViewProps> = ({
  payment,
  engagement,
  subBudgetLine,
  budgetLine,
  grant,
  onClose
}) => {
  const getCurrencySymbol = (currency: string) => {
    switch (currency) {
      case 'EUR': return '€';
      case 'USD': return '$';
      case 'XOF': return 'CFA';
      default: return '€';
    }
  };

  const formatAmount = (amount: number) => {
    return amount.toLocaleString('fr-FR') + ' ' + getCurrencySymbol(grant.currency);
  };

  const getPaymentMethodLabel = (method: Payment['paymentMethod']) => {
    switch (method) {
      case 'transfer': return 'Virement Bancaire';
      case 'check': return 'Chèque';
      case 'cash': return 'Espèces';
      default: return method;
    }
  };

  // Calculer le total payé et le reste
  const getTotalPaid = (): number => {
    if (!payment.partialPayments || payment.partialPayments.length === 0) {
      return 0;
    }
    return payment.partialPayments.reduce((sum, pp) => sum + pp.amount, 0);
  };

  const getRemainingAmount = (): number => {
    return payment.amount - getTotalPaid();
  };

  const getPaymentProgress = (): number => {
    if (payment.amount === 0) return 0;
    return Math.min((getTotalPaid() / payment.amount) * 100, 100);
  };

  const hasPartialPayments = (): boolean => {
    return payment.partialPayments && payment.partialPayments.length > 0;
  };

  // Fonction d'export PDF
  const exportPDF = async () => {
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      let yPosition = 15;

      // Charger le logo
      const loadImage = (url: string): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = url;
        });
      };

      let logoHeight = 0;
      try {
        const logo = await loadImage('/budgetbase/logo.png');
        const logoWidth = 25;
        logoHeight = (logo.height * logoWidth) / logo.width;
        pdf.addImage(logo, 'PNG', 15, 10, logoWidth, logoHeight);
      } catch (error) {
        console.warn('Logo non chargé');
      }

      const titleY = logoHeight > 0 ? 10 + logoHeight + 8 : 20;
      yPosition = titleY;

      // En-tête
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.text('FICHE DE PAIEMENT', pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 8;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Référence: ${payment.paymentNumber}`, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 6;

      pdf.setFontSize(8);
      pdf.text(`Généré le: ${new Date().toLocaleDateString('fr-FR')}`, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 12;

      // Ligne de séparation
      pdf.setDrawColor(200, 200, 200);
      pdf.line(15, yPosition, pageWidth - 15, yPosition);
      yPosition += 8;

      // Informations générales
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text('INFORMATIONS GÉNÉRALES', 15, yPosition);
      yPosition += 6;

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      
      const infoRows = [
        ['Statut:', PAYMENT_STATUS[payment.status].label],
        // ✅ En échelonné, chaque transaction a sa propre date dans l'historique
        ['Date:', hasPartialPayments() ? 'Paiement échelonné (voir historique)' : new Date(payment.date).toLocaleDateString('fr-FR')],
        ['Montant:', formatAmount(payment.amount)],
        ['Mode de paiement:', getPaymentMethodLabel(payment.paymentMethod)],
        ['Fournisseur:', payment.supplier || engagement.supplier],
        ['N° Engagement:', engagement.engagementNumber],
        ['Ligne Budgétaire:', `${budgetLine.code} - ${budgetLine.name}`],
        ['Sous-Ligne:', `${subBudgetLine.code} - ${subBudgetLine.name}`]
      ];

      // ✅ N° chèque / réf. bancaire uniquement pour un paiement direct (pas échelonné)
      if (!hasPartialPayments() && payment.checkNumber) {
        infoRows.push(['N° Chèque:', payment.checkNumber]);
      }
      if (!hasPartialPayments() && payment.bankReference) {
        infoRows.push(['Réf. Bancaire:', payment.bankReference]);
      }

      infoRows.forEach(([label, value]) => {
        if (yPosition > pageHeight - 20) {
          pdf.addPage();
          yPosition = 15;
        }
        pdf.setFont('helvetica', 'bold');
        pdf.text(label, 15, yPosition);
        pdf.setFont('helvetica', 'normal');
        pdf.text(String(value), 70, yPosition);
        yPosition += 6;
      });

      yPosition += 4;

      // Section paiements partiels
      if (hasPartialPayments()) {
        // Vérifier l'espace
        if (yPosition > pageHeight - 30) {
          pdf.addPage();
          yPosition = 15;
        }

        pdf.setDrawColor(200, 200, 200);
        pdf.line(15, yPosition, pageWidth - 15, yPosition);
        yPosition += 8;

        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.text('HISTORIQUE DES PAIEMENTS PARTIELS', 15, yPosition);
        yPosition += 6;

        // Barre de progression
        const progress = getPaymentProgress();
        const barWidth = 100;
        const barHeight = 6;
        pdf.setDrawColor(200, 200, 200);
        pdf.rect(15, yPosition, barWidth, barHeight);
        pdf.setFillColor(128, 90, 213);
        pdf.rect(15, yPosition, (progress / 100) * barWidth, barHeight, 'F');
        
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`${progress.toFixed(0)}% payé`, 15 + barWidth + 8, yPosition + 4);
        yPosition += 12;

        // Tableau des paiements partiels
        const tableHeaders = ['Date', 'Référence', 'Mode', 'Montant'];
        const colWidths = [30, 45, 40, 40];
        const headerHeight = 7;

        // En-tête du tableau
        pdf.setFillColor(243, 244, 246);
        pdf.rect(15, yPosition, colWidths.reduce((a, b) => a + b, 0), headerHeight, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7);

        let xPos = 15;
        tableHeaders.forEach((header, index) => {
          pdf.text(header, xPos + 1, yPosition + 4.5);
          xPos += colWidths[index];
        });

        yPosition += headerHeight;
        pdf.setFont('helvetica', 'normal');

        // Lignes du tableau
        const sortedPartials = [...(payment.partialPayments || [])].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        sortedPartials.forEach((pp: PartialPayment, index: number) => {
          if (yPosition > pageHeight - 15) {
            pdf.addPage();
            yPosition = 15;
            
            // Réafficher l'en-tête
            pdf.setFillColor(243, 244, 246);
            pdf.rect(15, yPosition, colWidths.reduce((a, b) => a + b, 0), headerHeight, 'F');
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(7);
            xPos = 15;
            tableHeaders.forEach((header, idx) => {
              pdf.text(header, xPos + 1, yPosition + 4.5);
              xPos += colWidths[idx];
            });
            yPosition += headerHeight;
            pdf.setFont('helvetica', 'normal');
          }

          const bgColor = index % 2 === 0 ? [249, 250, 251] : [255, 255, 255];
          pdf.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
          pdf.rect(15, yPosition, colWidths.reduce((a, b) => a + b, 0), 6, 'F');

          xPos = 15;
          const rowData = [
            new Date(pp.date).toLocaleDateString('fr-FR'),
            pp.reference || '-',
            getPaymentMethodLabel(pp.paymentMethod),
            `${pp.amount.toLocaleString('fr-FR')} ${getCurrencySymbol(grant.currency)}`
          ];

          rowData.forEach((text, idx) => {
            pdf.setFontSize(7);
            pdf.text(text, xPos + 1, yPosition + 4);
            xPos += colWidths[idx];
          });

          yPosition += 6;
        });

        // Total payé
        if (yPosition > pageHeight - 15) {
          pdf.addPage();
          yPosition = 15;
        }

        yPosition += 4;
        pdf.setDrawColor(200, 200, 200);
        pdf.line(15, yPosition, pageWidth - 15, yPosition);
        yPosition += 6;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.text(`Total payé: ${formatAmount(getTotalPaid())}`, 15, yPosition);
        pdf.text(`Reste à payer: ${formatAmount(getRemainingAmount())}`, 100, yPosition);
        yPosition += 6;
      }

      // Signatures
      if (yPosition > pageHeight - 30) {
        pdf.addPage();
        yPosition = 15;
      }

      pdf.setDrawColor(200, 200, 200);
      pdf.line(15, yPosition, pageWidth - 15, yPosition);
      yPosition += 8;

      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text('VALIDATIONS', 15, yPosition);
      yPosition += 8;

      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');

      const signatures = [
        { label: 'Coordinateur de la Subvention', data: payment.approvals?.supervisor1 },
        { label: 'Comptable', data: payment.approvals?.supervisor2 },
        { label: 'Coordonnateur National', data: payment.approvals?.finalApproval }
      ];

      signatures.forEach((sig) => {
        if (yPosition > pageHeight - 20) {
          pdf.addPage();
          yPosition = 15;
        }

        const isSigned = sig.data?.signature || false;
        pdf.setFont('helvetica', 'bold');
        pdf.text(`${sig.label}:`, 15, yPosition);
        pdf.setFont('helvetica', 'normal');
        pdf.text(isSigned ? '✓ Signé' : 'En attente', 80, yPosition);
        
        if (isSigned && sig.data?.name) {
          pdf.text(`Par: ${sig.data.name}`, 130, yPosition);
        }
        if (isSigned && sig.data?.date) {
          pdf.text(`Le: ${new Date(sig.data.date).toLocaleDateString('fr-FR')}`, 180, yPosition);
        }
        yPosition += 6;
      });

      // Pied de page
      const pageCount = pdf.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFontSize(7);
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

      pdf.save(`paiement_${payment.paymentNumber}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Erreur lors de la génération du PDF:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <CreditCard className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Détails Complets du Paiement</h2>
              <p className="text-gray-600">{payment.paymentNumber}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={exportPDF}
              className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-full transition-colors"
              title="Télécharger en PDF"
            >
              <Download className="w-6 h-6" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-8">
          {/* Section 1: Informations Générales */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Colonne 1: Informations du Paiement */}
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <CreditCard className="w-5 h-5 mr-2" />
                Informations du Paiement
              </h3>
              
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Numéro de Paiement</label>
                  <p className="text-gray-900 font-medium text-lg">{payment.paymentNumber}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date de Paiement</label>
                    {hasPartialPayments() ? (
                      <p className="text-gray-500 italic text-sm">Paiement échelonné — voir l'historique</p>
                    ) : (
                      <p className="text-gray-900">{new Date(payment.date).toLocaleDateString('fr-FR')}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
                    <span className={`inline-block px-3 py-1 text-sm font-medium rounded-full ${PAYMENT_STATUS[payment.status].color}`}>
                      {PAYMENT_STATUS[payment.status].label}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Montant</label>
                  <p className="text-3xl font-bold text-green-600">{formatAmount(payment.amount)}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mode de Paiement</label>
                    <p className="text-gray-900 font-medium">{getPaymentMethodLabel(payment.paymentMethod)}</p>
                  </div>

                  {!hasPartialPayments() && payment.checkNumber && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">N° de Chèque</label>
                      <p className="text-gray-900 font-medium">{payment.checkNumber}</p>
                    </div>
                  )}
                </div>

                {!hasPartialPayments() && payment.bankReference && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Référence Bancaire</label>
                    <p className="text-gray-900">{payment.bankReference}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Colonne 2: Informations de l'Engagement */}
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <FileText className="w-5 h-5 mr-2" />
                Informations de l'Engagement
              </h3>
              
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">N° d'Engagement</label>
                  <p className="text-gray-900 font-medium text-lg">{engagement.engagementNumber}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fournisseur</label>
                  <p className="text-gray-900 font-medium">{engagement.supplier}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ligne Budgétaire</label>
                    <p className="text-gray-900">{budgetLine.code} - {budgetLine.name}</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Sous-Ligne</label>
                    <p className="text-gray-900">{subBudgetLine.code} - {subBudgetLine.name}</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Montant Engagé</label>
                  <p className="text-xl font-semibold text-blue-600">{formatAmount(engagement.amount)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Historique des paiements partiels */}
          <div className="border-t border-gray-200 pt-8">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center mb-4">
              <History className="w-5 h-5 mr-2" />
              Historique des Paiements
            </h3>

            {hasPartialPayments() ? (
              <div>
                {/* Barre de progression */}
                <div className="mb-4">
                  <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                    <span>Progression du paiement</span>
                    <span>{getPaymentProgress().toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div 
                      className="h-2.5 rounded-full bg-purple-600 transition-all duration-300"
                      style={{ width: `${Math.min(getPaymentProgress(), 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-sm text-gray-500 mt-1">
                    <span>Payé: {formatAmount(getTotalPaid())}</span>
                    <span className="text-orange-600 font-medium">Reste: {formatAmount(getRemainingAmount())}</span>
                  </div>
                </div>

                {/* Tableau des paiements partiels */}
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Référence</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mode</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">N° Chèque</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Montant</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {payment.partialPayments && [...payment.partialPayments]
                        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                        .map((pp, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {new Date(pp.date).toLocaleDateString('fr-FR')}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                              {pp.reference || '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {getPaymentMethodLabel(pp.paymentMethod)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {pp.checkNumber || '-'}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-green-600 text-right">
                              {formatAmount(pp.amount)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td colSpan={4} className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                          Total payé:
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-green-600 text-right">
                          {formatAmount(getTotalPaid())}
                        </td>
                      </tr>
                      <tr className="border-t-2 border-gray-300">
                        <td colSpan={4} className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                          Reste à payer:
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-orange-600 text-right">
                          {formatAmount(getRemainingAmount())}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-lg p-6 text-center border border-gray-200">
                <p className="text-gray-500">Aucun paiement partiel enregistré</p>
                <p className="text-sm text-gray-400 mt-1">Le paiement a été effectué en une seule fois</p>
              </div>
            )}
          </div>

          {/* Section 2: Informations de Contrôle */}
          <div className="border-t border-gray-200 pt-8">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center mb-6">
              <CheckSquare className="w-5 h-5 mr-2" />
              Informations de Contrôle
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {payment.invoiceNumber && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">N° de Facture</label>
                  <p className="text-gray-900 font-medium">{payment.invoiceNumber}</p>
                </div>
              )}

              {payment.invoiceAmount && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Montant Facture</label>
                  <p className="text-gray-900">{formatAmount(payment.invoiceAmount)}</p>
                </div>
              )}

              {payment.quoteReference && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Référence Devis</label>
                  <p className="text-gray-900">{payment.quoteReference}</p>
                </div>
              )}

              {payment.deliveryNote && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bon de Livraison</label>
                  <p className="text-gray-900">{payment.deliveryNote}</p>
                </div>
              )}

              {payment.purchaseOrderNumber && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bon de Commande</label>
                  <p className="text-gray-900">{payment.purchaseOrderNumber}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Service Accepté</label>
                <div className="flex items-center space-x-2">
                  {payment.serviceAcceptance ? (
                    <>
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <span className="text-green-600 font-medium">Oui</span>
                    </>
                  ) : (
                    <>
                      <Clock className="w-5 h-5 text-gray-400" />
                      <span className="text-gray-500">Non</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {payment.controlNotes && (
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Notes de Contrôle</label>
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <p className="text-gray-900 whitespace-pre-wrap">{payment.controlNotes}</p>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Description */}
          {payment.description && (
            <div className="border-t border-gray-200 pt-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Description</h3>
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <p className="text-gray-900 whitespace-pre-wrap">{payment.description}</p>
              </div>
            </div>
          )}

          {/* Section 4: Signatures */}
          <div className="border-t border-gray-200 pt-8">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center mb-6">
              <User className="w-5 h-5 mr-2" />
              Signatures d'Approval
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Coordinateur de la Subvention */}
              <div className="border border-gray-200 rounded-lg p-6 bg-white">
                <h4 className="font-semibold text-gray-800 mb-4 text-center">Coordinateur de la Subvention</h4>
                {payment.approvals?.supervisor1 ? (
                  <div className="space-y-3 text-center">
                    <div className="flex items-center justify-center space-x-2">
                      {payment.approvals.supervisor1.signature ? (
                        <CheckCircle className="w-6 h-6 text-green-600" />
                      ) : (
                        <Clock className="w-6 h-6 text-gray-400" />
                      )}
                      <span className="font-medium text-lg">{payment.approvals.supervisor1.name}</span>
                    </div>
                    {payment.approvals.supervisor1.date && (
                      <p className="text-sm text-gray-600">
                        Signé le {new Date(payment.approvals.supervisor1.date).toLocaleDateString('fr-FR')}
                      </p>
                    )}
                    {payment.approvals.supervisor1.observation && (
                      <div className="mt-3 p-3 bg-yellow-50 rounded border border-yellow-200">
                        <p className="text-sm text-yellow-800 font-medium">Observation:</p>
                        <p className="text-sm text-yellow-700 mt-1">{payment.approvals.supervisor1.observation}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm text-center">En attente de signature</p>
                )}
              </div>

              {/* Comptable */}
              <div className="border border-gray-200 rounded-lg p-6 bg-white">
                <h4 className="font-semibold text-gray-800 mb-4 text-center">Comptable</h4>
                {payment.approvals?.supervisor2 ? (
                  <div className="space-y-3 text-center">
                    <div className="flex items-center justify-center space-x-2">
                      {payment.approvals.supervisor2.signature ? (
                        <CheckCircle className="w-6 h-6 text-green-600" />
                      ) : (
                        <Clock className="w-6 h-6 text-gray-400" />
                      )}
                      <span className="font-medium text-lg">{payment.approvals.supervisor2.name}</span>
                    </div>
                    {payment.approvals.supervisor2.date && (
                      <p className="text-sm text-gray-600">
                        Signé le {new Date(payment.approvals.supervisor2.date).toLocaleDateString('fr-FR')}
                      </p>
                    )}
                    {payment.approvals.supervisor2.observation && (
                      <div className="mt-3 p-3 bg-yellow-50 rounded border border-yellow-200">
                        <p className="text-sm text-yellow-800 font-medium">Observation:</p>
                        <p className="text-sm text-yellow-700 mt-1">{payment.approvals.supervisor2.observation}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm text-center">En attente de signature</p>
                )}
              </div>

              {/* Coordonnateur National */}
              <div className="border border-gray-200 rounded-lg p-6 bg-white">
                <h4 className="font-semibold text-gray-800 mb-4 text-center">Coordonnateur National</h4>
                {payment.approvals?.finalApproval ? (
                  <div className="space-y-3 text-center">
                    <div className="flex items-center justify-center space-x-2">
                      {payment.approvals.finalApproval.signature ? (
                        <CheckCircle className="w-6 h-6 text-green-600" />
                      ) : (
                        <Clock className="w-6 h-6 text-gray-400" />
                      )}
                      <span className="font-medium text-lg">{payment.approvals.finalApproval.name}</span>
                    </div>
                    {payment.approvals.finalApproval.date && (
                      <p className="text-sm text-gray-600">
                        Signé le {new Date(payment.approvals.finalApproval.date).toLocaleDateString('fr-FR')}
                      </p>
                    )}
                    {payment.approvals.finalApproval.observation && (
                      <div className="mt-3 p-3 bg-yellow-50 rounded border border-yellow-200">
                        <p className="text-sm text-yellow-800 font-medium">Observation:</p>
                        <p className="text-sm text-yellow-700 mt-1">{payment.approvals.finalApproval.observation}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm text-center">En attente de signature</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentDetailsView;