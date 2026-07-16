import { useMemo } from 'react';
import { Payment } from '../types';

export const useTreasuryNotification = (payments: Payment[], selectedGrantId: string) => {
  return useMemo(() => {
    // Filtrer par subvention sélectionnée
    const filtered = selectedGrantId
      ? payments.filter(p => p.grantId === selectedGrantId)
      : payments;

    // Paiements approuvés sans aucun paiement partiel
    const approvedUncashed = filtered.filter(p =>
      p.status === 'approved' &&
      (!p.partialPayments || p.partialPayments.length === 0) &&
      p.amount > 0
    );

    // Paiements en cours (partiellement payés) avec reste à payer
    const inProgress = filtered.filter(p =>
      (p.status === 'approved' || p.status === 'in_progress') &&
      p.partialPayments &&
      p.partialPayments.length > 0 &&
      (p.amount - p.partialPayments.reduce((sum, pp) => sum + pp.amount, 0)) > 0
    );

    const total = approvedUncashed.length + inProgress.length;

    return {
      approvedUncashedCount: approvedUncashed.length,
      inProgressCount: inProgress.length,
      total,
      hasNotifications: total > 0
    };
  }, [payments, selectedGrantId]);
};