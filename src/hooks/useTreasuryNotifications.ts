import { useMemo } from 'react';
import { Payment } from '../types';

export const useTreasuryNotification = (payments: Payment[], selectedGrantId: string) => {
  return useMemo(() => {
    // Filtrer par subvention sélectionnée
    const filtered = selectedGrantId
      ? payments.filter(p => p.grantId === selectedGrantId)
      : payments;

    // Paiements approuvés à décaisser (directs) : hors échelonnés et sans versement partiel
    const approvedUncashed = filtered.filter(p =>
      p.status === 'approved' &&
      !p.isScheduled &&
      (!p.partialPayments || p.partialPayments.length === 0) &&
      p.amount > 0
    );

    // Paiements « en cours » (échelonnés) avec reste à payer : marqués échelonnés OU déjà partiellement payés
    const inProgress = filtered.filter(p => {
      const paid = (p.partialPayments || []).reduce((sum, pp) => sum + pp.amount, 0);
      const remaining = p.amount - paid;
      const isEchelonne = p.isScheduled || (p.partialPayments && p.partialPayments.length > 0);
      return (p.status === 'approved' || p.status === 'in_progress') && isEchelonne && remaining > 0;
    });

    const total = approvedUncashed.length + inProgress.length;

    return {
      approvedUncashedCount: approvedUncashed.length,
      inProgressCount: inProgress.length,
      total,
      hasNotifications: total > 0
    };
  }, [payments, selectedGrantId]);
};