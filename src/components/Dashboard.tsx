import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, Target, AlertTriangle, CheckCircle, Clock, Eye, EyeOff, ChevronDown, ChevronUp, BarChart3, PieChart, DollarSign, Calendar, FileText, Plus, Minus } from 'lucide-react';
import { Grant, BudgetLine, SubBudgetLine, Engagement, Payment, Prefinancing, EmployeeLoan, GRANT_STATUS } from '../types';
import { usePermissions } from '../hooks/usePermissions';

interface DashboardProps {
  grants: Grant[];
  budgetLines: BudgetLine[];
  subBudgetLines: SubBudgetLine[];
  engagements: Engagement[];
  payments: Payment[];
  prefinancings: Prefinancing[];
  employeeLoans: EmployeeLoan[];
  onNavigate?: (tab: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  grants,
  budgetLines,
  subBudgetLines,
  engagements,
  payments = [],
  prefinancings = [],
  employeeLoans = [],
  onNavigate
}) => {
  const { hasPermission } = usePermissions();
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [showAllBudgetLines, setShowAllBudgetLines] = useState(false);
  const [showAllGrants, setShowAllGrants] = useState(false);
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [showAllEngagements, setShowAllEngagements] = useState(false);
  const [expandedBudgetLines, setExpandedBudgetLines] = useState<Set<string>>(new Set());
  const [animatedText, setAnimatedText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const fullText = "Vue d'ensemble complète de la gestion des subventions";
  
  // Animation du texte
  useEffect(() => {
    if (currentIndex < fullText.length) {
      const timer = setTimeout(() => {
        setAnimatedText(prev => prev + fullText[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }, 50); // Vitesse de frappe (50ms entre chaque caractère)
      
      return () => clearTimeout(timer);
    }
  }, [currentIndex, fullText]);

  const activeGrants = grants.filter(grant => grant.status === 'active');

  // 🎯 FONCTIONS DE CALCUL RÉELLES POUR LE DÉCAISSEMENT
  const getTotalDisbursed = (grantId: string) => {
    let totalDisbursed = 0;

    // 1. Paiements décaissés : cumule l'échelonné déjà payé (in_progress) + le direct complet (paid)
    const grantPayments = (payments || []).filter(p =>
      p.grantId === grantId && (p.status === 'paid' || p.status === 'in_progress')
    );
    const paymentsAmount = grantPayments.reduce((sum, payment) => {
      // Paiement échelonné : additionner ce qui a déjà été payé (partiels)
      if (payment.partialPayments && payment.partialPayments.length > 0) {
        return sum + payment.partialPayments.reduce((s, pp) => s + pp.amount, 0);
      }
      // Paiement direct complet
      if (payment.status === 'paid') {
        return sum + payment.amount;
      }
      return sum;
    }, 0);
    totalDisbursed += paymentsAmount;

    // 2. Préfinancements décaissés (statut 'paid' ou 'repaid')
    // const grantPrefinancings = (prefinancings || []).filter(p => 
    //   p.grantId === grantId && (p.status === 'paid' || p.status === 'repaid')
    // );
    // const prefinancingsAmount = grantPrefinancings.reduce((sum, prefinancing) => sum + prefinancing.amount, 0);
    // totalDisbursed += prefinancingsAmount;

    // 3. Prêts employés décaissés (statut 'active' ou 'completed')
    // const grantLoans = (employeeLoans || []).filter(l => 
    //   l.grantId === grantId && (l.status === 'active' || l.status === 'completed')
    // );
    // const loansAmount = grantLoans.reduce((sum, loan) => sum + loan.amount, 0);
    // totalDisbursed += loansAmount;

    return totalDisbursed;
  };

  const getTotalDisbursedForAllGrants = () => {
    return activeGrants.reduce((total, grant) => total + getTotalDisbursed(grant.id), 0);
  };

  const formatPercentage = (rate: number) => {
    if (rate === 0) return '0%';
    if (rate < 0.01) return '< 0.01%';
    if (rate < 0.1) return rate.toFixed(2) + '%';
    if (rate < 1) return rate.toFixed(1) + '%';
    return rate.toFixed(1) + '%';
  };
  
  // Fonction pour formater les montants avec la devise dynamique
  const formatAmount = (amount: number, currencyCode?: string) => {
    const defaultCurrency = activeGrants.length > 0 
      ? activeGrants[0].currency 
      : (grants.length > 0 ? grants[0].currency : 'EUR');
    
    const currency = currencyCode || defaultCurrency;
    
    return amount.toLocaleString('fr-FR', { 
      style: 'currency', 
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).replace(/\s/g, ' '); // Assurer un espacement cohérent
  };

  // CALCULS PRINCIPAUX AVEC VALEURS RÉELLES
  const totalGrantAmount = activeGrants.reduce((sum, grant) => sum + (Number(grant.totalAmount) || 0), 0);
  const totalAllocated = subBudgetLines.reduce((sum, line) => sum + (Number(line.notifiedAmount) || 0), 0);
  const totalEngaged = subBudgetLines.reduce((sum, line) => sum + (Number(line.engagedAmount) || 0), 0);
  
  // 🎯 UTILISATION DES DÉCAISSEMENTS RÉELS
  const totalDisbursed = getTotalDisbursedForAllGrants();
  const totalAvailable = subBudgetLines.reduce((sum, line) => sum + (Number(line.availableAmount) || 0), 0);

  // 🎯 INDICATEURS — tous calculés sur le BUDGET NOTIFIÉ pour éviter les confusions
  const engagementRate = totalAllocated > 0 ? (totalEngaged / totalAllocated) * 100 : 0;
  // Taux d'exécution = décaissé ÷ budget notifié (et non ÷ engagé)
  const executionRate = totalAllocated > 0 ? (totalDisbursed / totalAllocated) * 100 : 0;
  const allocationRate = totalGrantAmount > 0 ? (totalAllocated / totalGrantAmount) * 100 : 0;

  const pendingEngagements = engagements.filter(engagement => engagement.status === 'pending');
  
  // Gestion de l'affichage des engagements récents
  const recentEngagements = showAllEngagements ? engagements : engagements.slice(0, 5);
  
  // Gestion de l'affichage des subventions
  const displayedGrants = showAllGrants ? activeGrants : activeGrants.slice(0, 3);

  const budgetLineBreakdown = budgetLines.map(budgetLine => {
    const subLines = subBudgetLines.filter(line => line.budgetLineId === budgetLine.id);
    const allocated = subLines.reduce((sum, line) => sum + (Number(line.notifiedAmount) || 0), 0);
    const engaged = subLines.reduce((sum, line) => sum + (Number(line.engagedAmount) || 0), 0);
    const available = subLines.reduce((sum, line) => sum + (Number(line.availableAmount) || 0), 0);
    
    // 🎯 Calcul du décaissement réel pour cette ligne budgétaire
    const disbursed = subLines.reduce((sum, subLine) => {
      const grant = grants.find(g => g.id === budgetLine.grantId);
      if (!grant) return sum;
      
      // Décaissement réel : échelonné déjà payé (in_progress) + direct complet (paid)
      const subLinePayments = (payments || []).filter(p =>
        p.subBudgetLineId === subLine.id && (p.status === 'paid' || p.status === 'in_progress')
      );
      const paymentsAmount = subLinePayments.reduce((s, payment) => {
        if (payment.partialPayments && payment.partialPayments.length > 0) {
          return s + payment.partialPayments.reduce((acc, pp) => acc + pp.amount, 0);
        }
        if (payment.status === 'paid') {
          return s + payment.amount;
        }
        return s;
      }, 0);

      return sum + paymentsAmount;
    }, 0);

    return {
      ...budgetLine,
      allocated,
      engaged,
      disbursed,
      available,
      engagementPercentage: allocated > 0 ? (engaged / allocated) * 100 : 0,
      executionPercentage: engaged > 0 ? (disbursed / engaged) * 100 : 0,
      availablePercentage: allocated > 0 ? (available / allocated) * 100 : 0
    };
  }).filter(category => category.allocated > 0);

  // Trier par pourcentage d'engagement (décroissant)
  const sortedBudgetLines = [...budgetLineBreakdown].sort((a, b) => b.engagementPercentage - a.engagementPercentage);
  const displayedBudgetLines = showAllBudgetLines ? sortedBudgetLines : sortedBudgetLines.slice(0, 5);

  const toggleBudgetLineExpansion = (budgetLineId: string) => {
    setExpandedBudgetLines(prev => {
      const newSet = new Set(prev);
      if (newSet.has(budgetLineId)) {
        newSet.delete(budgetLineId);
      } else {
        newSet.add(budgetLineId);
      }
      return newSet;
    });
  };

  const alertLines = subBudgetLines.filter(line => {
    const notifiedAmount = Number(line.notifiedAmount) || 0;
    const engagedAmount = Number(line.engagedAmount) || 0;
    const usageRate = notifiedAmount > 0 ? (engagedAmount / notifiedAmount) * 100 : 0;
    return usageRate > 90;
  });

  // Gestion de l'affichage des alertes
  const displayedAlerts = showAllAlerts ? alertLines : alertLines.slice(0, 3);

  // Fonction pour déterminer la couleur en fonction du pourcentage
  const getProgressBarColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-orange-500';
    if (percentage >= 50) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getStatusColor = (percentage: number) => {
    if (percentage >= 90) return 'text-red-600';
    if (percentage >= 75) return 'text-orange-600';
    if (percentage >= 50) return 'text-yellow-600';
    return 'text-green-600';
  };

  // Composant réutilisable pour les boutons d'affichage/masquage
  const ToggleButton = ({ isExpanded, onToggle, count, total, label }: { 
    isExpanded: boolean; 
    onToggle: () => void; 
    count: number; 
    total: number; 
    label: string;
  }) => (
    <button
      onClick={onToggle}
      className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg transition-all duration-200 font-medium shadow-lg hover:shadow-xl"
    >
      {isExpanded ? (
        <>
          <EyeOff className="w-4 h-4" />
          <span>Réduire</span>
          <Minus className="w-4 h-4" />
        </>
      ) : (
        <>
          <Eye className="w-4 h-4" />
          <span>{label} ({count}/{total})</span>
          <Plus className="w-4 h-4" />
        </>
      )}
    </button>
  );

  return (
    <div ref={dashboardRef} className="space-y-8 pb-8">
      {/* Header avec fond gradient et texte animé */}
      <div className="relative bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-700 rounded-3xl p-6 md:p-8 text-white shadow-2xl mx-4 md:mx-0">
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-2xl md:text-4xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white to-blue-100">
            Tableau de Bord Budgétaire
          </h1>
          <p className="text-lg md:text-xl text-blue-100 mb-6 min-h-[2rem] font-mono">
            {animatedText}
            <span className="animate-pulse">|</span>
          </p>
          
          {/* Stats rapides en ligne */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mt-6 md:mt-8">
            <div className="text-center">
              <div className="text-xl md:text-2xl font-bold text-white">{activeGrants.length}</div>
              <div className="text-blue-200 text-xs md:text-sm">Subventions</div>
            </div>
            <div className="text-center">
              <div className="text-xl md:text-2xl font-bold text-white">{formatAmount(totalGrantAmount)}</div>
              <div className="text-blue-200 text-xs md:text-sm">Budget Total</div>
            </div>
            <div className="text-center">
              <div className="text-xl md:text-2xl font-bold text-white">{formatPercentage(engagementRate)}</div>
              <div className="text-blue-200 text-xs md:text-sm">Engagé</div>
            </div>
            <div className="text-center">
              <div className="text-xl md:text-2xl font-bold text-white">{formatPercentage(executionRate)}</div>
              <div className="text-blue-200 text-xs md:text-sm">Exécuté</div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards avec design moderne */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4 md:gap-6 px-4 md:px-0">
        {/* Carte Budget Total */}
        <div
          onClick={() => onNavigate && onNavigate('grants')}
          title="Somme des budgets notifiés des subventions actives — cliquez pour la page Subventions"
          className={`bg-gradient-to-br from-white to-blue-50 rounded-2xl shadow-lg border border-blue-100 p-4 md:p-6 transition-all duration-300 ${onNavigate ? 'cursor-pointer hover:scale-105 hover:ring-2 hover:ring-blue-200' : ''}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-blue-600 uppercase tracking-wide truncate">Budget Total</p>
              <p className="text-xl md:text-2xl font-bold text-gray-900 mt-2 break-all">{formatAmount(totalGrantAmount)}</p>
              <div className="flex items-center mt-2">
                <Target className="w-4 h-4 text-blue-500 mr-1 flex-shrink-0" />
                <p className="text-sm text-gray-600 truncate">{activeGrants.length} subventions actives</p>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Budget notifié total des subventions.{onNavigate ? ' Cliquer pour voir →' : ''}</p>
            </div>
            <div className="p-2 md:p-3 bg-gradient-to-r from-blue-500 to-blue-600 rounded-2xl shadow-lg ml-3 flex-shrink-0">
              <DollarSign className="w-6 h-6 md:w-8 md:h-8 text-white" />
            </div>
          </div>
        </div>

        {/* Carte Taux d'Engagement */}
        <div
          onClick={() => onNavigate && onNavigate('engagements')}
          title="= Montant engagé ÷ Budget notifié — cliquez pour la page Engagements"
          className={`bg-gradient-to-br from-white to-green-50 rounded-2xl shadow-lg border border-green-100 p-4 md:p-6 transition-all duration-300 ${onNavigate ? 'cursor-pointer hover:scale-105 hover:ring-2 hover:ring-green-200' : ''}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-green-600 uppercase tracking-wide truncate">Taux d'Engagement</p>
              <p className="text-xl md:text-2xl font-bold text-gray-900 mt-2">{formatPercentage(engagementRate)}</p>
              <div className="flex items-center mt-2">
                <TrendingUp className="w-4 h-4 text-green-500 mr-1 flex-shrink-0" />
                <p className="text-sm text-gray-600 break-all">
                  {formatAmount(totalEngaged)} engagés
                </p>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">= Engagé ÷ Budget notifié.{onNavigate ? ' Cliquer pour voir →' : ''}</p>
            </div>
            <div className="p-2 md:p-3 bg-gradient-to-r from-green-500 to-green-600 rounded-2xl shadow-lg ml-3 flex-shrink-0">
              <BarChart3 className="w-6 h-6 md:w-8 md:h-8 text-white" />
            </div>
          </div>
        </div>

        {/* Carte Taux d'Exécution (AVEC VALEURS RÉELLES) */}
        <div
          onClick={() => onNavigate && onNavigate('tracking')}
          title="= Montant décaissé ÷ Budget notifié — cliquez pour le Tableau de suivi budgétaire"
          className={`bg-gradient-to-br from-white to-orange-50 rounded-2xl shadow-lg border border-orange-100 p-4 md:p-6 transition-all duration-300 ${onNavigate ? 'cursor-pointer hover:scale-105 hover:ring-2 hover:ring-orange-200' : ''}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-orange-600 uppercase tracking-wide truncate">Taux d'Exécution</p>
              <p className="text-xl md:text-2xl font-bold text-gray-900 mt-2">{formatPercentage(executionRate)}</p>
              <div className="flex items-center mt-2">
                <CheckCircle className="w-4 h-4 text-orange-500 mr-1 flex-shrink-0" />
                <p className="text-sm text-gray-600 break-all">
                  {formatAmount(totalDisbursed)} décaissés
                </p>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">= Décaissé ÷ Budget notifié.{onNavigate ? ' Cliquer pour voir →' : ''}</p>
            </div>
            <div className="p-2 md:p-3 bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl shadow-lg ml-3 flex-shrink-0">
              <PieChart className="w-6 h-6 md:w-8 md:h-8 text-white" />
            </div>
          </div>
        </div>

        {/* Carte Montant Disponible */}
        <div
          onClick={() => onNavigate && onNavigate('budget_planning')}
          title="Budget encore disponible (non engagé) — cliquez pour la Planification"
          className={`bg-gradient-to-br from-white to-purple-50 rounded-2xl shadow-lg border border-purple-100 p-4 md:p-6 transition-all duration-300 ${onNavigate ? 'cursor-pointer hover:scale-105 hover:ring-2 hover:ring-purple-200' : ''}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-purple-600 uppercase tracking-wide truncate">Disponible</p>
              <p className="text-xl md:text-2xl font-bold text-gray-900 mt-2 break-all">{formatAmount(totalAvailable)}</p>
              <div className="flex items-center mt-2">
                <Clock className="w-4 h-4 text-purple-500 mr-1 flex-shrink-0" />
                <p className="text-sm text-gray-600 truncate">
                  {pendingEngagements.length} en attente
                </p>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Budget non engagé restant.{onNavigate ? ' Cliquer pour voir →' : ''}</p>
            </div>
            <div className="p-2 md:p-3 bg-gradient-to-r from-purple-500 to-purple-600 rounded-2xl shadow-lg ml-3 flex-shrink-0">
              <Clock className="w-6 h-6 md:w-8 md:h-8 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Deuxième ligne : Subventions et Répartition */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 md:gap-8 px-4 md:px-0">
        {/* Subventions Actives */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-gray-50 to-white p-4 md:p-6 border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-lg md:text-xl font-bold text-gray-900 flex items-center">
              <Calendar className="w-5 h-5 md:w-6 md:h-6 mr-2 md:mr-3 text-blue-600" />
              Subventions Actives
              <span className="ml-2 bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-bold">
                {activeGrants.length}
              </span>
            </h3>
            {activeGrants.length > 3 && (
              <ToggleButton
                isExpanded={showAllGrants}
                onToggle={() => setShowAllGrants(!showAllGrants)}
                count={displayedGrants.length}
                total={activeGrants.length}
                label="Voir tout"
              />
            )}
          </div>
          <div className="p-4 md:p-6">
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {displayedGrants.map((grant, index) => {
                const disbursedAmount = getTotalDisbursed(grant.id);
                const grantBudgetLines = budgetLines.filter(line => line.grantId === grant.id);
                const totalEngaged = grantBudgetLines.reduce((sum, line) => sum + line.engagedAmount, 0);
                const notifiedGrant = Number(grant.totalAmount) || 0;
                // Décaissement effectué = décaissé ÷ budget notifié
                const executionRate = notifiedGrant > 0 ? (disbursedAmount / notifiedGrant) * 100 : 0;
                
                return (
                  <div 
                    key={grant.id} 
                    className="p-4 bg-gradient-to-r from-gray-50 to-white rounded-xl border border-gray-200 hover:border-blue-300 transition-all duration-200"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-bold text-gray-900 text-base md:text-lg break-words flex-1 mr-2">{grant.name}</h4>
                      <span className={`px-2 py-1 text-xs font-bold rounded-full ${GRANT_STATUS[grant.status].color} border flex-shrink-0`}>
                        {GRANT_STATUS[grant.status].label}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-3 font-medium break-words">{grant.grantingOrganization}</p>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs md:text-sm text-gray-500 font-mono break-all flex-1 mr-2">Réf: {grant.reference}</span>
                      <span className="font-bold text-blue-600 text-base md:text-lg flex-shrink-0 break-all ml-2">
                        {formatAmount(Number(grant.totalAmount) || 0, grant.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 font-medium mb-2">
                      <span className="break-words flex-1 mr-2">Début: {new Date(grant.startDate).toLocaleDateString('fr-FR')}</span>
                      <span className="break-words flex-1 text-right">Fin: {new Date(grant.endDate).toLocaleDateString('fr-FR')}</span>
                    </div>
                    <div className="mt-2 p-2 bg-blue-50 rounded-lg" title="Part du budget notifié déjà décaissée (Décaissé ÷ Budget notifié)">
                      <div className="flex justify-between text-sm">
                        <span className="text-blue-700 font-medium">Décaissement effectué:</span>
                        <span className="text-blue-900 font-bold">{executionRate.toFixed(2)}%</span>
                      </div>
                      <div className="flex justify-between text-xs text-blue-600">
                        <span>Décaissé: {formatAmount(disbursedAmount, grant.currency)}</span>
                        <span>Notifié: {formatAmount(notifiedGrant, grant.currency)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {activeGrants.length === 0 && (
                <div className="text-center py-8 md:py-12">
                  <Target className="w-12 h-12 md:w-16 md:h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 text-base md:text-lg font-medium">Aucune subvention active</p>
                  <p className="text-gray-400 text-sm mt-2">Configurez vos subventions pour commencer</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Répartition par Ligne Budgétaire - AMÉLIORÉE (exclue du PDF) */}
        <div data-html2canvas-ignore="true" className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-gray-50 to-white p-4 md:p-6 border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-lg md:text-xl font-bold text-gray-900 flex items-center">
              <PieChart className="w-5 h-5 md:w-6 md:h-6 mr-2 md:mr-3 text-green-600" />
              Répartition par Ligne Budgétaire
              <span className="ml-2 bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-bold">
                {sortedBudgetLines.length}
              </span>
            </h3>
            {sortedBudgetLines.length > 5 && (
              <ToggleButton
                isExpanded={showAllBudgetLines}
                onToggle={() => setShowAllBudgetLines(!showAllBudgetLines)}
                count={displayedBudgetLines.length}
                total={sortedBudgetLines.length}
                label="Voir tout"
              />
            )}
          </div>
          <div className="p-4 md:p-6">
            <div className="space-y-4 md:space-y-6 max-h-96 overflow-y-auto">
              {displayedBudgetLines.map((budgetLine) => {
                const isExpanded = expandedBudgetLines.has(budgetLine.id);
                
                return (
                  <div 
                    key={budgetLine.id}
                    className="space-y-3 p-4 bg-gray-50 rounded-xl border border-gray-200 hover:border-green-300 transition-all duration-200"
                  >
                    {/* En-tête de la ligne budgétaire - CLIQUABLE */}
                    <button 
                      onClick={() => toggleBudgetLineExpansion(budgetLine.id)}
                      className="w-full flex items-center justify-between hover:bg-gray-100 rounded-lg p-2 transition-colors"
                    >
                      <div className="flex items-center space-x-2 md:space-x-3 flex-1 min-w-0 text-left">
                        <div className={`w-2 h-2 md:w-3 md:h-3 rounded-full ${getProgressBarColor(budgetLine.engagementPercentage)} flex-shrink-0`}></div>
                        <span className={`px-2 py-1 text-xs font-bold rounded-full ${budgetLine.color} border flex-shrink-0`}>
                          {budgetLine.code}
                        </span>
                        <span className="font-bold text-gray-900 text-sm break-words flex-1">{budgetLine.name}</span>
                      </div>
                      <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
                        <span className={`text-base md:text-lg font-bold ${getStatusColor(budgetLine.engagementPercentage)}`}>
                          {budgetLine.engagementPercentage.toFixed(2)}%
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-gray-500" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-500" />
                        )}
                      </div>
                    </button>

                    {/* Barre de progression engagement */}
                    <div className="w-full bg-gray-200 rounded-full h-2 md:h-3 shadow-inner">
                      <div 
                        className={`h-2 md:h-3 rounded-full transition-all duration-1000 ease-out ${getProgressBarColor(budgetLine.engagementPercentage)} shadow-md`}
                        style={{ width: `${Math.min(budgetLine.engagementPercentage, 100)}%` }}
                      ></div>
                    </div>

                    {/* Détails financiers de base */}
                    <div className="grid grid-cols-3 gap-2 md:gap-4 text-xs">
                      <div className="text-center">
                        <p className="font-semibold text-gray-600 truncate">Engagé</p>
                        <p className="text-green-600 font-bold break-all">{formatAmount(Number(budgetLine.engaged) || 0)}</p>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-gray-600 truncate">Alloué</p>
                        <p className="text-blue-600 font-bold break-all">{formatAmount(Number(budgetLine.allocated) || 0)}</p>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-gray-600 truncate">Disponible</p>
                        <p className="text-purple-600 font-bold break-all">{formatAmount(Number(budgetLine.available) || 0)}</p>
                      </div>
                    </div>

                    {/* Section étendue avec plus de détails */}
                    {isExpanded && (
                      <div className="mt-4 p-4 bg-white rounded-lg border border-gray-200 space-y-3 animate-fadeIn">
                        <h4 className="font-bold text-gray-900 text-sm">Détails d'Exécution</h4>
                        
                        {/* Barre d'exécution réelle */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-medium text-gray-700">Taux d'exécution</span>
                            <span className="text-xs text-gray-600">{budgetLine.executionPercentage.toFixed(2)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="h-2 rounded-full bg-orange-500 transition-all duration-1000"
                              style={{ width: `${Math.min(budgetLine.executionPercentage, 100)}%` }}
                            ></div>
                          </div>
                        </div>

                        {/* Détails financiers étendus */}
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="text-center p-2 bg-orange-50 rounded-lg">
                            <p className="font-semibold text-orange-700">Décaissé </p>
                            <p className="text-orange-900 font-bold break-all">{formatAmount(Number(budgetLine.disbursed) || 0)}</p>
                          </div>
                          <div className="text-center p-2 bg-blue-50 rounded-lg">
                            <p className="font-semibold text-blue-700">Restant à décaisser</p>
                            <p className="text-blue-900 font-bold break-all">
                              {formatAmount(Math.max(0, Number(budgetLine.engaged) - Number(budgetLine.disbursed)) || 0)}
                            </p>
                          </div>
                        </div>

                        {/* Sous-lignes budgétaires */}
                        <div className="mt-3">
                          <h5 className="text-xs font-semibold text-gray-700 mb-2">Sous-lignes associées:</h5>
                          <div className="space-y-2">
                            {subBudgetLines
                              .filter(subLine => subLine.budgetLineId === budgetLine.id)
                              .map(subLine => (
                                <div key={subLine.id} className="flex justify-between items-center text-xs p-2 bg-gray-100 rounded">
                                  <span className="font-medium text-gray-800 break-words flex-1">{subLine.name}</span>
                                  <span className="text-green-700 font-bold ml-2 flex-shrink-0">
                                    {formatAmount(Number(subLine.engagedAmount) || 0)}
                                  </span>
                                </div>
                              ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {sortedBudgetLines.length === 0 && (
                <div className="text-center py-8 md:py-12">
                  <BarChart3 className="w-12 h-12 md:w-16 md:h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 text-base md:text-lg font-medium">Aucune donnée disponible</p>
                  <p className="text-gray-400 text-sm mt-2">Configurez vos lignes budgétaires</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Troisième ligne : Alertes et Engagements Récents (exclue du PDF) */}
      <div data-html2canvas-ignore="true" className="grid grid-cols-1 xl:grid-cols-2 gap-6 md:gap-8 px-4 md:px-0">
        {/* Alertes Budgétaires */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-orange-50 to-white p-4 md:p-6 border-b border-orange-100 flex justify-between items-center">
            <h3 className="text-lg md:text-xl font-bold text-gray-900 flex items-center">
              <AlertTriangle className="w-5 h-5 md:w-6 md:h-6 mr-2 md:mr-3 text-orange-500" />
              Alertes Budgétaires
              {alertLines.length > 0 && (
                <span className="ml-2 bg-orange-500 text-white px-2 py-1 rounded-full text-xs font-bold">
                  {alertLines.length}
                </span>
              )}
            </h3>
            {alertLines.length > 3 && (
              <ToggleButton
                isExpanded={showAllAlerts}
                onToggle={() => setShowAllAlerts(!showAllAlerts)}
                count={displayedAlerts.length}
                total={alertLines.length}
                label="Voir tout"
              />
            )}
          </div>
          <div className="p-4 md:p-6">
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {displayedAlerts.map((line, index) => {
                const notifiedAmount = Number(line.notifiedAmount) || 0;
                const engagedAmount = Number(line.engagedAmount) || 0;
                const usageRate = notifiedAmount > 0 ? (engagedAmount / notifiedAmount) * 100 : 0;
                return (
                  <div 
                    key={line.id} 
                    className="p-4 bg-gradient-to-r from-orange-50 to-white border border-orange-200 rounded-xl hover:shadow-md transition-all duration-200"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-2 md:space-x-3 flex-1 min-w-0">
                        <AlertTriangle className="w-4 h-4 md:w-5 md:h-5 text-orange-500 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-gray-900 break-words">{line.name}</p>
                          <p className="text-sm text-gray-600 font-mono break-all">{line.code}</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="font-bold text-orange-600 text-base md:text-lg">{usageRate.toFixed(2)}%</p>
                        <p className="text-xs text-gray-500 font-medium">utilisé</p>
                      </div>
                    </div>
                    <div className="w-full bg-orange-200 rounded-full h-2">
                      <div 
                        className="bg-orange-500 h-2 rounded-full transition-all duration-1000"
                        style={{ width: `${Math.min(usageRate, 100)}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-xs text-gray-600 mt-2 font-medium">
                      <span className="break-words flex-1 mr-2">Engagé: {formatAmount(engagedAmount)}</span>
                      <span className="break-words flex-1 text-right">Alloué: {formatAmount(notifiedAmount)}</span>
                    </div>
                  </div>
                );
              })}
              {alertLines.length === 0 && (
                <div className="text-center py-8 md:py-12">
                  <CheckCircle className="w-12 h-12 md:w-16 md:h-16 text-green-500 mx-auto mb-4" />
                  <p className="text-green-600 font-bold text-base md:text-lg mb-2">Aucune alerte budgétaire</p>
                  <p className="text-gray-500 text-sm">Tous les budgets sont sous contrôle</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Engagements Récents */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-purple-50 to-white p-4 md:p-6 border-b border-purple-100 flex justify-between items-center">
            <h3 className="text-lg md:text-xl font-bold text-gray-900 flex items-center">
              <Clock className="w-5 h-5 md:w-6 md:h-6 mr-2 md:mr-3 text-purple-600" />
              Engagements Récents
              <span className="ml-2 bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs font-bold">
                {engagements.length}
              </span>
            </h3>
            {engagements.length > 5 && (
              <ToggleButton
                isExpanded={showAllEngagements}
                onToggle={() => setShowAllEngagements(!showAllEngagements)}
                count={recentEngagements.length}
                total={engagements.length}
                label="Voir tout"
              />
            )}
          </div>
          <div className="p-4 md:p-6">
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {recentEngagements.map((engagement, index) => {
                const subBudgetLine = subBudgetLines.find(line => line.id === engagement.subBudgetLineId);
                const budgetLine = budgetLines.find(line => line.id === engagement.budgetLineId);
                const grant = grants.find(g => g.id === engagement.grantId);
                
                return (
                  <div 
                    key={engagement.id} 
                    className="p-4 bg-gradient-to-r from-gray-50 to-white rounded-xl border border-gray-200 hover:border-purple-300 transition-all duration-200"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 mb-2 break-words">{engagement.description}</p>
                        <div className="flex flex-wrap gap-1 md:gap-2 mb-2">
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium break-words max-w-full">
                            {subBudgetLine?.name}
                          </span>
                          <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full font-medium break-words max-w-full">
                            {budgetLine?.name}
                          </span>
                          <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full font-medium break-words max-w-full">
                            {grant?.name}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 font-medium">
                          {new Date(engagement.date).toLocaleDateString('fr-FR')} • {new Date(engagement.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <div className="text-right ml-2 md:ml-4 flex-shrink-0 min-w-0">
                        <p className="font-bold text-gray-900 text-base md:text-lg break-all">
                          {formatAmount(Number(engagement.amount) || 0, grant?.currency)}
                        </p>
                        <span className={`px-2 py-1 text-xs font-bold rounded-full mt-2 inline-block ${
                          engagement.status === 'approved' ? 'bg-green-100 text-green-800 border border-green-200' :
                          engagement.status === 'pending' ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' :
                          'bg-red-100 text-red-800 border border-red-200'
                        }`}>
                          {engagement.status === 'approved' ? '✓ Approuvé' :
                           engagement.status === 'pending' ? '⏳ En attente' : '✗ Rejeté'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {recentEngagements.length === 0 && (
                <div className="text-center py-8 md:py-12">
                  <FileText className="w-12 h-12 md:w-16 md:h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 text-base md:text-lg font-medium">Aucun engagement récent</p>
                  <p className="text-gray-400 text-sm mt-2">Les engagements apparaitront ici</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Styles CSS pour l'animation */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}} />
    </div>
  );
};