import React, { useState, useEffect } from 'react';
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
  Download
} from 'lucide-react';
import { showSuccess, showValidationError, showError } from '../utils/alerts';
import { Payment, BankTransaction, PAYMENT_STATUS, Grant } from '../types';
import { usePermissions } from '../hooks/usePermissions';
import jsPDF from 'jspdf';

interface TreasuryManagerProps {
  payments: Payment[];
  bankTransactions: BankTransaction[];
  selectedGrant?: Grant;
  onAddBankTransaction: (transaction: Omit<BankTransaction, 'id'>) => void;
  onUpdateGrant: (id: string, updates: Partial<Grant>) => void;
}

type SortField = 'date' | 'description' | 'amount' | 'type';
type SortDirection = 'asc' | 'desc';

const TreasuryManager: React.FC<TreasuryManagerProps> = ({
  payments,
  bankTransactions,
  selectedGrant,
  onAddBankTransaction,
  onUpdateGrant
}) => {
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  
  // États pour la pagination et le tri
  const [currentPage, setCurrentPage] = useState(1);
  const [transactionsPerPage, setTransactionsPerPage] = useState(10);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  
  // États pour les filtres
  const [dateFilter, setDateFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [descriptionFilter, setDescriptionFilter] = useState<string>('');
  
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

  const [transactionFormData, setTransactionFormData] = useState({
    grantId: selectedGrant ? selectedGrant.id : '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    type: 'credit' as 'credit' | 'debit',
    reference: ''
  });

  // Mettre à jour grantId quand selectedGrant change
  useEffect(() => {
    if (selectedGrant) {
      setTransactionFormData(prev => ({
        ...prev,
        grantId: selectedGrant.id
      }));
    }
  }, [selectedGrant]);

  // Fonction pour mettre à jour le solde du compte bancaire de la subvention
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

  // Fonction pour obtenir les transactions de la subvention
  const getGrantTransactions = (grantId: string) => {
    return bankTransactions.filter(transaction => transaction.grantId === grantId);
  };

  // Fonction de tri
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

  // Fonction pour appliquer les filtres
  const filterTransactions = (transactions: BankTransaction[]) => {
    return transactions.filter(transaction => {
      // Filtre par date
      if (dateFilter) {
        const transactionDate = new Date(transaction.date).toISOString().split('T')[0];
        if (transactionDate !== dateFilter) return false;
      }
      
      // Filtre par type
      if (typeFilter !== 'all' && transaction.type !== typeFilter) {
        return false;
      }
      
      // Filtre par description
      if (descriptionFilter && !transaction.description.toLowerCase().includes(descriptionFilter.toLowerCase())) {
        return false;
      }
      
      return true;
    });
  };

  // Gestion du tri
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setCurrentPage(1); // Retour à la première page après tri
  };

  // Obtenir les transactions filtrées et triées
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
  
  // Calculer les transactions pour la page courante
  const indexOfLastTransaction = currentPage * transactionsPerPage;
  const indexOfFirstTransaction = indexOfLastTransaction - transactionsPerPage;
  const currentTransactions = allTransactions.slice(indexOfFirstTransaction, indexOfLastTransaction);

  // Gestion des pages
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

  // Réinitialiser les filtres
  const resetFilters = () => {
    setDateFilter('');
    setTypeFilter('all');
    setDescriptionFilter('');
    setCurrentPage(1);
  };

  // Formater les montants
  const formatCurrency = (amount: number) => {
    if (!selectedGrant) return amount.toLocaleString('fr-FR');
    
    return amount.toLocaleString('fr-FR', { 
      style: 'currency', 
      currency: selectedGrant.currency === 'XOF' ? 'XOF' : selectedGrant.currency,
      minimumFractionDigits: selectedGrant.currency === 'XOF' ? 0 : 2
    });
  };

  // Formater les dates
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR');
  };

  // Fonction pour obtenir le symbole de la devise
  const getCurrencySymbol = (currency: string) => {
    switch (currency) {
      case 'EUR': return '€';
      case 'USD': return '$';
      case 'XOF': return 'CFA';
      default: return '€';
    }
  };

  // Fonction pour formater les montants pour le PDF
  const formatCurrencyForPDF = (amount: number) => {
    if (!selectedGrant) return amount.toLocaleString('fr-FR');
    
    return amount.toLocaleString('fr-FR', { 
      minimumFractionDigits: selectedGrant.currency === 'XOF' ? 0 : 2,
      maximumFractionDigits: selectedGrant.currency === 'XOF' ? 0 : 2
    }).replace(/\s/g, ' ');
  };

  const resetTransactionForm = () => {
    setTransactionFormData({
      grantId: selectedGrant ? selectedGrant.id : '',
      date: new Date().toISOString().split('T')[0],
      description: '',
      amount: '',
      type: 'credit',
      reference: ''
    });
    setShowTransactionForm(false);
  };

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
      reference: transactionFormData.reference.trim()
    };

    onAddBankTransaction(transactionData);
    updateGrantBankAccountBalance(amount, transactionFormData.type);
    showSuccess('Transaction ajoutée', 'La transaction a été ajoutée avec succès');
    resetTransactionForm();
  };

  // Fonction d'exportation en PDF
  const exportToPDF = async () => {
    try {
      showSuccess('Génération du PDF', 'Le PDF est en cours de génération...');

      // Calculer les totaux
      const totalTransactionsCount = allTransactions.length;
      const totalCredits = allTransactions
        .filter(t => t.type === 'credit')
        .reduce((sum, t) => sum + t.amount, 0);
      const totalDebits = allTransactions
        .filter(t => t.type === 'debit')
        .reduce((sum, t) => sum + t.amount, 0);
      const netBalance = totalCredits - totalDebits;

      // Créer le PDF
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      
      // Marges
      const margin = {
        top: 25,
        right: 15,
        bottom: 20,
        left: 15
      };
      
      const contentWidth = pageWidth - margin.left - margin.right;
      let yPosition = margin.top;

      // Fonction pour charger et ajouter le logo (UNIQUEMENT sur la première page)
      const addLogoToPDF = () => {
        return new Promise<number>((resolve) => {
          try {
            // Créer une image pour le logo
            const logoImg = new Image();
            logoImg.src = '/budgetbase/logo.png';
            
            logoImg.onload = () => {
              try {
                // Ajouter le logo en haut à gauche de la première page
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

      // Ajouter le logo uniquement sur la première page
      const logoHeight = await addLogoToPDF();
      
      // Ajuster la position Y pour l'en-tête de la première page en fonction du logo
      const headerY = logoHeight > 0 ? Math.max(margin.top, 8 + logoHeight + 5) : margin.top;
      yPosition = headerY;

      // Fonction pour vérifier si on a besoin d'une nouvelle page
      const checkPageBreak = (requiredHeight: number) => {
        if (yPosition + requiredHeight > pageHeight - margin.bottom) {
          pdf.addPage();
          // Sur les pages suivantes, réinitialiser la position Y sans logo
          yPosition = margin.top;
          return true;
        }
        return false;
      };

      // EN-TÊTE DE LA PREMIÈRE PAGE AVEC LOGO
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      
      // Titre principal - centré
      pdf.text('RAPPORT DE TRÉSORERIE', pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 8;

      // Informations de génération
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      
      // Si logo présent, aligner à droite du logo, sinon à gauche
      const infoX = logoHeight > 0 ? margin.left + 35 : margin.left;
      
      pdf.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, infoX, yPosition);
      pdf.text(`à ${new Date().toLocaleTimeString('fr-FR')}`, infoX, yPosition + 4);
      
      // Informations de la subvention alignées à droite
      if (selectedGrant) {
        const grantText = `Subvention: ${selectedGrant.name}`;
        const grantTextWidth = pdf.getTextWidth(grantText);
        pdf.text(grantText, pageWidth - margin.right - grantTextWidth, yPosition);
        pdf.text(`Réf: ${selectedGrant.reference}`, pageWidth - margin.right - pdf.getTextWidth(`Réf: ${selectedGrant.reference}`), yPosition + 4);
      }

      yPosition += 12;

      // Informations du compte bancaire
      if (grantBankAccount) {
        checkPageBreak(15);
        
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Compte Bancaire', margin.left, yPosition);
        yPosition += 6;
        
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Nom: ${grantBankAccount.name}`, margin.left, yPosition);
        pdf.text(`Banque: ${grantBankAccount.bankName}`, margin.left + 70, yPosition);
        yPosition += 5;
        
        pdf.text(`N°: ${grantBankAccount.accountNumber}`, margin.left, yPosition);
        pdf.text(`Devise: ${selectedGrant?.currency || 'EUR'}`, margin.left + 70, yPosition);
        yPosition += 5;
        
        pdf.text(`Solde: ${formatCurrencyForPDF(grantBankAccount.balance || 0)} ${getCurrencySymbol(selectedGrant?.currency || 'EUR')}`, margin.left, yPosition);
        yPosition += 8;
      }

      // Ligne de séparation
      pdf.setDrawColor(200, 200, 200);
      pdf.line(margin.left, yPosition, pageWidth - margin.right, yPosition);
      yPosition += 10;

      // RÉSUMÉ DES TRANSACTIONS
      checkPageBreak(25);
      
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('RÉSUMÉ DES TRANSACTIONS', margin.left, yPosition);
      yPosition += 8;

      // Cartes de résumé
      const cardWidth = contentWidth / 3 - 8;
      const cardHeight = 18;

      // Vérifier si on a la place pour les cartes
      checkPageBreak(cardHeight + 10);

      // Carte 1 - Total Transactions
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

      // Carte 2 - Total Crédits
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

      // Carte 3 - Total Débits
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

      // Carte 4 - Solde Net (sur une ligne complète)
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
      const netBalanceWidth = pdf.getTextWidth(netBalanceText);
      pdf.text(netBalanceText, pageWidth - margin.right - 10, yPosition + 6, { align: 'right' });
      
      pdf.setTextColor(0, 0, 0);
      yPosition += cardHeight + 15;

      // DÉTAIL DES TRANSACTIONS
      checkPageBreak(20);
      
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`HISTORIQUE DES TRANSACTIONS (${totalTransactionsCount})`, margin.left, yPosition);
      yPosition += 8;

      // Préparer les données du tableau
      const tableHeaders = ['Date', 'Description', 'Type', 'Montant', 'Référence'];
      const columnWidths = [25, 65, 25, 35, 30];
      const baseRowHeight = 8;
      const headerHeight = 8;
      const cellPadding = 2;

      // Vérifier si on a la place pour l'en-tête du tableau
      checkPageBreak(headerHeight + baseRowHeight);

      // Fonction pour dessiner l'en-tête du tableau
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

      // Fonction pour dessiner une ligne de tableau
      const drawTableRow = (transaction: BankTransaction, rowY: number, bgColor?: number[]) => {
        let currentX = margin.left;
        let maxCellHeight = baseRowHeight;

        // Préparer les cellules
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
            text: transaction.type === 'credit' ? 'Crédit' : 'Débit',
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

        // Calculer la hauteur maximale
        cells.forEach((cell, index) => {
          const lines = pdf.splitTextToSize(cell.text, cell.maxWidth - cellPadding * 2);
          const cellHeight = Math.max(baseRowHeight, lines.length * cell.fontSize * 0.35 + cellPadding * 2);
          maxCellHeight = Math.max(maxCellHeight, cellHeight);
        });

        // Fond de couleur
        if (bgColor) {
          pdf.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
          pdf.rect(margin.left, rowY, contentWidth, maxCellHeight, 'F');
        }

        // Dessiner les cellules
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

      // Dessiner l'en-tête du tableau initial
      drawTableHeader(yPosition);
      yPosition += headerHeight;

      // Données du tableau
      let isFirstRowOnNewPage = false;
      let rowIndex = 0;

      allTransactions.forEach((transaction) => {
        const estimatedHeight = baseRowHeight * 2;
        if (checkPageBreak(estimatedHeight)) {
          isFirstRowOnNewPage = true;
        }

        if (isFirstRowOnNewPage) {
          // Sur les nouvelles pages, redessiner seulement l'en-tête du tableau
          drawTableHeader(yPosition);
          yPosition += headerHeight;
          isFirstRowOnNewPage = false;
        }

        const bgColor = rowIndex % 2 === 0 ? [249, 250, 251] : [255, 255, 255];
        const rowHeight = drawTableRow(transaction, yPosition, bgColor);
        yPosition += rowHeight;
        rowIndex++;
      });

      // PIED DE PAGE SUR CHAQUE PAGE
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

      // Sauvegarder le PDF
      const fileName = `rapport_tresorerie_${selectedGrant?.name || 'transactions'}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
      
      showSuccess('PDF généré', 'Le rapport PDF a été généré avec succès');
    } catch (error) {
      console.error('Erreur lors de la génération du PDF:', error);
      showError('Erreur', 'Une erreur est survenue lors de la génération du PDF');
    }
  };

  // Calculs pour l'état de trésorerie
  const totalBankBalance = filteredBankAccounts.reduce((sum, account) => sum + account.balance, 0);
  const uncashedPayments = payments.filter(payment => payment.status === 'approved' && !payment.cashedDate);
  const totalUncashedPayments = uncashedPayments.reduce((sum, payment) => sum + payment.amount, 0);

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

  // Composant pour la pagination
  const Pagination = () => (
    <div className="flex items-center justify-between mt-6">
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
        
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
          // Afficher seulement les pages pertinentes
          if (
            page === 1 || 
            page === totalPages || 
            (page >= currentPage - 1 && page <= currentPage + 1)
          ) {
            return (
              <button
                key={page}
                onClick={() => handlePageChange(page)}
                className={`px-3 py-1 rounded-lg text-sm font-medium ${
                  currentPage === page
                    ? 'bg-blue-600 text-white'
                    : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {page}
              </button>
            );
          } else if (
            page === currentPage - 2 || 
            page === currentPage + 2
          ) {
            return <span key={page} className="px-2 text-gray-500">...</span>;
          }
          return null;
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">État de Trésorerie</h2>
          <p className="text-gray-600 mt-1">Suivi des comptes bancaires et des paiements</p>
        </div>
        <div className="flex space-x-3">
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
              onClick={() => setShowTransactionForm(true)}
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
          <div className="flex items-center justify-between">
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
                {selectedGrant.currency} ({selectedGrant.currency === 'EUR' ? '€' : selectedGrant.currency === 'USD' ? '$' : 'CFA'})
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
              <p className="text-sm font-medium text-gray-600">Chèques Non Encaissés</p>
              <p className="text-2xl font-bold text-orange-600">
                {formatCurrency(totalUncashedPayments)}
              </p>
              <p className="text-sm text-gray-500">{uncashedPayments.length} chèques</p>
            </div>
            <div className="p-3 bg-orange-100 rounded-full">
              <AlertCircle className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Comptes Bancaires</p>
              <p className="text-2xl font-bold text-purple-600">{filteredBankAccounts.length}</p>
              <p className="text-sm text-gray-500">
                {selectedGrant ? 'Compte de la subvention' : 'Aucun compte'}
              </p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <TrendingUp className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
        {/* Compte Bancaire */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-gray-900">
              {selectedGrant ? 'Compte Bancaire de la Subvention' : 'Comptes Bancaires'}
            </h3>
            
            {/* Bouton pour voir toutes les transactions */}
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
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h4 className="font-medium text-gray-900">{account.name}</h4>
                    <p className="text-sm text-gray-600">{account.bankName}</p>
                    <p className="text-xs text-gray-500">N° {account.accountNumber}</p>
                  </div>
                  <div className="text-right">
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
                  <div className="flex items-center justify-between mb-3">
                    <h5 className="font-medium text-gray-700 flex items-center">
                      <Filter className="w-4 h-4 mr-2" />
                      Filtres des transactions
                    </h5>
                    {(dateFilter || typeFilter !== 'all' || descriptionFilter) && (
                      <button
                        onClick={resetFilters}
                        className="text-sm text-red-600 hover:text-red-800 flex items-center"
                      >
                        <X className="w-3 h-3 mr-1" />
                        Réinitialiser
                      </button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                      <input
                        type="date"
                        value={dateFilter}
                        onChange={(e) => {
                          setDateFilter(e.target.value);
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
                        <option value="credit">Crédit</option>
                        <option value="debit">Débit</option>
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
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    transaction.type === 'credit' 
                                      ? 'bg-green-100 text-green-800' 
                                      : 'bg-red-100 text-red-800'
                                  }`}>
                                    {transaction.type === 'credit' ? 'Crédit' : 'Débit'}
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
                    
                    {/* Pagination */}
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

        {/* Paiements Non Encaissés */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Paiements Non Encaissés</h3>
          <div className="space-y-3">
            {uncashedPayments.map(payment => (
              <div key={payment.id} className="p-4 bg-orange-50 border border-orange-200 rounded-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900">{payment.paymentNumber}</h4>
                    <p className="text-sm text-gray-600">{payment.supplier}</p>
                    <p className="text-xs text-gray-500">
                      {payment.paymentMethod === 'check' ? 'Chèque' : 'Virement'} 
                      {payment.checkNumber && ` N°${payment.checkNumber}`}
                    </p>
                    <p className="text-xs text-gray-500">
                      Émis le {new Date(payment.date).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-orange-600">
                      {formatCurrency(payment.amount)}
                    </p>
                    <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full mt-1 ${PAYMENT_STATUS[payment.status].color}`}>
                      {PAYMENT_STATUS[payment.status].label}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {uncashedPayments.length === 0 && (
              <div className="text-center py-4">
                <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <p className="text-green-600 font-medium">Tous les paiements sont encaissés</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal pour voir toutes les transactions */}
      {showAllTransactions && selectedGrant && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-6xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
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
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            transaction.type === 'credit' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {transaction.type === 'credit' ? 'Crédit' : 'Débit'}
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
              
              {/* Pagination dans la modal */}
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

      {/* Transaction Form Modal */}
      {showTransactionForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Nouvelle transaction bancaire
            </h3>
            
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
                    <span className="text-blue-700">Banque:</span>
                    <span className="ml-2 font-medium">{grantBankAccount.bankName}</span>
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
                    <option value="credit">Crédit (+)</option>
                    <option value="debit">Débit (-)</option>
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

              <div className="flex space-x-3 pt-4">
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
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  Ajouter Transaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TreasuryManager;