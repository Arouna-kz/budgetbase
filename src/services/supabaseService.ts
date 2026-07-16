import { supabase, handleSupabaseError } from '../lib/supabase';
import { 
  Grant, 
  BudgetLine, 
  SubBudgetLine, 
  Engagement, 
  Payment, 
  BankAccount, 
  BankTransaction, 
  Prefinancing, 
  EmployeeLoan,
  PartialPayment
} from '../types';
import { User, UserRole } from '../types/user';

// Grants Service
export const grantsService = {
  async getAll(): Promise<Grant[]> {
    try {
      const { data, error } = await supabase
        .from('grants')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data.map(grant => ({
        id: grant.id,
        name: grant.name,
        reference: grant.reference,
        grantingOrganization: grant.granting_organization,
        year: grant.year,
        currency: grant.currency as Grant['currency'],
        plannedAmount: grant.planned_amount,
        totalAmount: grant.total_amount,
        startDate: grant.start_date,
        endDate: grant.end_date,
        status: grant.status as Grant['status'],
        description: grant.description,
        bankAccount: grant.bank_account as Grant['bankAccount'],
        created_at: grant.created_at
      }));
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async create(grant: Omit<Grant, 'id'>): Promise<Grant> {
    try {
      const { data, error } = await supabase
        .from('grants')
        .insert({
          name: grant.name,
          reference: grant.reference,
          granting_organization: grant.grantingOrganization,
          year: grant.year,
          currency: grant.currency,
          planned_amount: grant.plannedAmount,
          total_amount: grant.totalAmount,
          start_date: grant.startDate,
          end_date: grant.endDate,
          status: grant.status,
          description: grant.description,
          bank_account: grant.bankAccount as any
        })
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        name: data.name,
        reference: data.reference,
        grantingOrganization: data.granting_organization,
        year: data.year,
        currency: data.currency as Grant['currency'],
        plannedAmount: data.planned_amount,
        totalAmount: data.total_amount,
        startDate: data.start_date,
        endDate: data.end_date,
        status: data.status as Grant['status'],
        description: data.description,
        bankAccount: data.bank_account as Grant['bankAccount']
      };
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async update(id: string, updates: Partial<Grant>): Promise<void> {
    try {
      const { error } = await supabase
        .from('grants')
        .update({
          ...(updates.name && { name: updates.name }),
          ...(updates.reference && { reference: updates.reference }),
          ...(updates.grantingOrganization && { granting_organization: updates.grantingOrganization }),
          ...(updates.year && { year: updates.year }),
          ...(updates.currency && { currency: updates.currency }),
          ...(updates.plannedAmount !== undefined && { planned_amount: updates.plannedAmount }),
          ...(updates.totalAmount !== undefined && { total_amount: updates.totalAmount }),
          ...(updates.startDate && { start_date: updates.startDate }),
          ...(updates.endDate && { end_date: updates.endDate }),
          ...(updates.status && { status: updates.status }),
          ...(updates.description !== undefined && { description: updates.description }),
          ...(updates.bankAccount !== undefined && { bank_account: updates.bankAccount as any }),
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
    }
  },

  async delete(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('grants')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
    }
  }
};

// Budget Lines Service
export const budgetLinesService = {
  async getAll(): Promise<BudgetLine[]> {
    try {
      const { data, error } = await supabase
        .from('budget_lines')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data.map(line => ({
        id: line.id,
        grantId: line.grant_id,
        code: line.code,
        name: line.name,
        plannedAmount: line.planned_amount,
        notifiedAmount: line.notified_amount,
        engagedAmount: line.engaged_amount,
        availableAmount: line.available_amount,
        description: line.description,
        color: line.color
      }));
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async create(budgetLine: Omit<BudgetLine, 'id'>): Promise<BudgetLine> {
    try {
      const { data, error } = await supabase
        .from('budget_lines')
        .insert({
          grant_id: budgetLine.grantId,
          code: budgetLine.code,
          name: budgetLine.name,
          planned_amount: budgetLine.plannedAmount,
          notified_amount: budgetLine.notifiedAmount,
          engaged_amount: budgetLine.engagedAmount,
          available_amount: budgetLine.availableAmount,
          description: budgetLine.description,
          color: budgetLine.color
        })
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        grantId: data.grant_id,
        code: data.code,
        name: data.name,
        plannedAmount: data.planned_amount,
        notifiedAmount: data.notified_amount,
        engagedAmount: data.engaged_amount,
        availableAmount: data.available_amount,
        description: data.description,
        color: data.color
      };
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async update(id: string, updates: Partial<BudgetLine>): Promise<void> {
    try {
      const { error } = await supabase
        .from('budget_lines')
        .update({
          ...(updates.grantId && { grant_id: updates.grantId }),
          ...(updates.code && { code: updates.code }),
          ...(updates.name && { name: updates.name }),
          ...(updates.plannedAmount !== undefined && { planned_amount: updates.plannedAmount }),
          ...(updates.notifiedAmount !== undefined && { notified_amount: updates.notifiedAmount }),
          ...(updates.engagedAmount !== undefined && { engaged_amount: updates.engagedAmount }),
          ...(updates.availableAmount !== undefined && { available_amount: updates.availableAmount }),
          ...(updates.description !== undefined && { description: updates.description }),
          ...(updates.color && { color: updates.color }),
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
    }
  },

  async delete(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('budget_lines')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
    }
  }
};

// Sub Budget Lines Service
export const subBudgetLinesService = {
  async getAll(): Promise<SubBudgetLine[]> {
    try {
      const { data, error } = await supabase
        .from('sub_budget_lines')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data.map(line => ({
        id: line.id,
        grantId: line.grant_id,
        budgetLineId: line.budget_line_id,
        code: line.code,
        name: line.name,
        plannedAmount: line.planned_amount,
        notifiedAmount: line.notified_amount,
        engagedAmount: line.engaged_amount,
        availableAmount: line.available_amount,
        description: line.description
      }));
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async create(subBudgetLine: Omit<SubBudgetLine, 'id'>): Promise<SubBudgetLine> {
    try {
      const { data, error } = await supabase
        .from('sub_budget_lines')
        .insert({
          grant_id: subBudgetLine.grantId,
          budget_line_id: subBudgetLine.budgetLineId,
          code: subBudgetLine.code,
          name: subBudgetLine.name,
          planned_amount: subBudgetLine.plannedAmount,
          notified_amount: subBudgetLine.notifiedAmount,
          engaged_amount: subBudgetLine.engagedAmount,
          available_amount: subBudgetLine.availableAmount,
          description: subBudgetLine.description
        })
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        grantId: data.grant_id,
        budgetLineId: data.budget_line_id,
        code: data.code,
        name: data.name,
        plannedAmount: data.planned_amount,
        notifiedAmount: data.notified_amount,
        engagedAmount: data.engaged_amount,
        availableAmount: data.available_amount,
        description: data.description
      };
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async update(id: string, updates: Partial<SubBudgetLine>): Promise<void> {
    try {
      const { error } = await supabase
        .from('sub_budget_lines')
        .update({
          ...(updates.grantId && { grant_id: updates.grantId }),
          ...(updates.budgetLineId && { budget_line_id: updates.budgetLineId }),
          ...(updates.code && { code: updates.code }),
          ...(updates.name && { name: updates.name }),
          ...(updates.plannedAmount !== undefined && { planned_amount: updates.plannedAmount }),
          ...(updates.notifiedAmount !== undefined && { notified_amount: updates.notifiedAmount }),
          ...(updates.engagedAmount !== undefined && { engaged_amount: updates.engagedAmount }),
          ...(updates.availableAmount !== undefined && { available_amount: updates.availableAmount }),
          ...(updates.description !== undefined && { description: updates.description }),
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
    }
  },

  async delete(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('sub_budget_lines')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
    }
  }
};

// Engagements Service
export const engagementsService = {
  async getAll(): Promise<Engagement[]> {
    try {
      const { data, error } = await supabase
        .from('engagements')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data.map(engagement => ({
        id: engagement.id,
        grantId: engagement.grant_id,
        budgetLineId: engagement.budget_line_id,
        subBudgetLineId: engagement.sub_budget_line_id,
        engagementNumber: engagement.engagement_number,
        amount: engagement.amount,
        description: engagement.description,
        supplier: engagement.supplier,
        quoteReference: engagement.quote_reference,
        invoiceNumber: engagement.invoice_number,
        date: engagement.date,
        status: engagement.status as Engagement['status'],
        approvals: engagement.approvals as Engagement['approvals']
      }));
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async create(engagement: Omit<Engagement, 'id'>): Promise<Engagement> {
    try {
      const { data, error } = await supabase
        .from('engagements')
        .insert({
          grant_id: engagement.grantId,
          budget_line_id: engagement.budgetLineId,
          sub_budget_line_id: engagement.subBudgetLineId,
          engagement_number: engagement.engagementNumber,
          amount: engagement.amount,
          description: engagement.description,
          supplier: engagement.supplier,
          quote_reference: engagement.quoteReference,
          invoice_number: engagement.invoiceNumber,
          date: engagement.date,
          status: engagement.status,
          approvals: engagement.approvals as any
        })
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        grantId: data.grant_id,
        budgetLineId: data.budget_line_id,
        subBudgetLineId: data.sub_budget_line_id,
        engagementNumber: data.engagement_number,
        amount: data.amount,
        description: data.description,
        supplier: data.supplier,
        quoteReference: data.quote_reference,
        invoiceNumber: data.invoice_number,
        date: data.date,
        status: data.status as Engagement['status'],
        approvals: data.approvals as Engagement['approvals']
      };
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async update(id: string, updates: Partial<Engagement>): Promise<void> {
    try {
      const { error } = await supabase
        .from('engagements')
        .update({
          ...(updates.grantId && { grant_id: updates.grantId }),
          ...(updates.budgetLineId && { budget_line_id: updates.budgetLineId }),
          ...(updates.subBudgetLineId && { sub_budget_line_id: updates.subBudgetLineId }),
          ...(updates.engagementNumber && { engagement_number: updates.engagementNumber }),
          ...(updates.amount !== undefined && { amount: updates.amount }),
          ...(updates.description && { description: updates.description }),
          ...(updates.supplier !== undefined && { supplier: updates.supplier }),
          ...(updates.quoteReference !== undefined && { quote_reference: updates.quoteReference }),
          ...(updates.invoiceNumber !== undefined && { invoice_number: updates.invoiceNumber }),
          ...(updates.date && { date: updates.date }),
          ...(updates.status && { status: updates.status }),
          ...(updates.approvals !== undefined && { approvals: updates.approvals as any }),
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
    }
  },

  async delete(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('engagements')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
    }
  }
};

// Payments Service
export const paymentsService = {
  async getAll(): Promise<Payment[]> {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data.map(payment => ({
        id: payment.id,
        paymentNumber: payment.payment_number,
        grantId: payment.grant_id,
        budgetLineId: payment.budget_line_id,
        subBudgetLineId: payment.sub_budget_line_id,
        engagementId: payment.engagement_id,
        amount: payment.amount,
        date: payment.date,
        supplier: payment.supplier,
        description: payment.description,
        paymentMethod: payment.payment_method as Payment['paymentMethod'],
        checkNumber: payment.check_number,
        bankReference: payment.bank_reference,
        invoiceNumber: payment.invoice_number,
        invoiceAmount: payment.invoice_amount,
        quoteReference: payment.quote_reference,
        deliveryNote: payment.delivery_note,
        purchaseOrderNumber: payment.purchase_order_number,
        serviceAcceptance: payment.service_acceptance,
        controlNotes: payment.control_notes,
        status: payment.status as Payment['status'],
        cashedDate: payment.cashed_date,
        approvals: payment.approvals as Payment['approvals'],
        partialPayments: payment.partial_payments || [],        // <-- ajout
        remainingAmount: payment.remaining_amount || 0          // <-- ajout

      }));
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async create(payment: Omit<Payment, 'id'>): Promise<Payment> {
    try {
      const { data, error } = await supabase
        .from('payments')
        .insert({
          payment_number: payment.paymentNumber,
          grant_id: payment.grantId,
          budget_line_id: payment.budgetLineId,
          sub_budget_line_id: payment.subBudgetLineId,
          engagement_id: payment.engagementId,
          amount: payment.amount,
          date: payment.date,
          supplier: payment.supplier,
          description: payment.description,
          payment_method: payment.paymentMethod,
          check_number: payment.checkNumber,
          bank_reference: payment.bankReference,
          invoice_number: payment.invoiceNumber,
          invoice_amount: payment.invoiceAmount,
          quote_reference: payment.quoteReference,
          delivery_note: payment.deliveryNote,
          purchase_order_number: payment.purchaseOrderNumber,
          service_acceptance: payment.serviceAcceptance,
          control_notes: payment.controlNotes,
          status: payment.status,
          cashed_date: payment.cashedDate,
          approvals: payment.approvals as any
        })
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        paymentNumber: data.payment_number,
        grantId: data.grant_id,
        budgetLineId: data.budget_line_id,
        subBudgetLineId: data.sub_budget_line_id,
        engagementId: data.engagement_id,
        amount: data.amount,
        date: data.date,
        supplier: data.supplier,
        description: data.description,
        paymentMethod: data.payment_method as Payment['paymentMethod'],
        checkNumber: data.check_number,
        bankReference: data.bank_reference,
        invoiceNumber: data.invoice_number,
        invoiceAmount: data.invoice_amount,
        quoteReference: data.quote_reference,
        deliveryNote: data.delivery_note,
        purchaseOrderNumber: data.purchase_order_number,
        serviceAcceptance: data.service_acceptance,
        controlNotes: data.control_notes,
        status: data.status as Payment['status'],
        cashedDate: data.cashed_date,
        approvals: data.approvals as Payment['approvals']
      };
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async update(id: string, updates: Partial<Payment>): Promise<void> {
    try {
      const { error } = await supabase
        .from('payments')
        .update({
          ...(updates.paymentNumber && { payment_number: updates.paymentNumber }),
          ...(updates.grantId && { grant_id: updates.grantId }),
          ...(updates.budgetLineId && { budget_line_id: updates.budgetLineId }),
          ...(updates.subBudgetLineId && { sub_budget_line_id: updates.subBudgetLineId }),
          ...(updates.engagementId && { engagement_id: updates.engagementId }),
          ...(updates.amount !== undefined && { amount: updates.amount }),
          ...(updates.date && { date: updates.date }),
          ...(updates.supplier && { supplier: updates.supplier }),
          ...(updates.description && { description: updates.description }),
          ...(updates.paymentMethod && { payment_method: updates.paymentMethod }),
          ...(updates.checkNumber !== undefined && { check_number: updates.checkNumber }),
          ...(updates.bankReference !== undefined && { bank_reference: updates.bankReference }),
          ...(updates.invoiceNumber && { invoice_number: updates.invoiceNumber }),
          ...(updates.invoiceAmount !== undefined && { invoice_amount: updates.invoiceAmount }),
          ...(updates.quoteReference !== undefined && { quote_reference: updates.quoteReference }),
          ...(updates.deliveryNote !== undefined && { delivery_note: updates.deliveryNote }),
          ...(updates.purchaseOrderNumber !== undefined && { purchase_order_number: updates.purchaseOrderNumber }),
          ...(updates.serviceAcceptance !== undefined && { service_acceptance: updates.serviceAcceptance }),
          ...(updates.controlNotes !== undefined && { control_notes: updates.controlNotes }),
          ...(updates.status && { status: updates.status }),
          ...(updates.cashedDate !== undefined && { cashed_date: updates.cashedDate }),
          ...(updates.approvals !== undefined && { approvals: updates.approvals as any }),
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
    }
  },

  async delete(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('payments')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
    }
  },

   // Nouvelle fonction pour créer un paiement partiel
  async addPartialPayment(paymentId: string, partialPayment: Omit<PartialPayment, 'id'>): Promise<Payment> {
    // 1. Récupérer le paiement
    const { data: existing, error: fetchError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .single();
    if (fetchError) throw fetchError;

    // existing contient bien `partial_payments` (colonne de la table), mais TS ne le sait pas
    const currentPartialPayments = (existing as any).partial_payments || [];
    const newPartialPayment = {
      ...partialPayment,
      id: `pp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    };
    const updatedPartialPayments = [...currentPartialPayments, newPartialPayment];

    const totalPaid = updatedPartialPayments.reduce((sum, pp) => sum + pp.amount, 0);
    const remaining = existing.amount - totalPaid;
    let newStatus = existing.status;
    if (remaining <= 0) newStatus = 'paid';
    else if (totalPaid > 0) newStatus = 'in_progress';

    // 2. Mettre à jour la base
    const { data, error } = await supabase
      .from('payments')
      .update({
        partial_payments: updatedPartialPayments,
        status: newStatus,
      })
      .eq('id', paymentId)
      .select()
      .single();

    if (error) throw error;

    // 3. Retourner l'objet avec partialPayments (camelCase) pour la partie frontend
    return { ...data, partialPayments: data.partial_payments || [] };
  },

  // Nouvelle fonction pour obtenir le montant restant
  async getRemainingAmount(paymentId: string): Promise<number> {
    const { data, error } = await supabase
      .from('payments')
      .select('amount, partial_payments')   // ← ici
      .eq('id', paymentId)
      .single();

    if (error) throw error;

    const partialPayments = data.partial_payments || [];
    const totalPaid = partialPayments.reduce((sum: number, pp: any) => sum + pp.amount, 0);
    return data.amount - totalPaid;
  }
};

// Users Service
export const usersService = {
  async getAll(): Promise<User[]> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data.map(user => ({
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        profession: user.profession,
        employeeId: user.employee_id,
        roleId: user.role_id,
        isActive: user.is_active,
        lastLogin: user.last_login,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
        createdBy: user.created_by
      }));
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async create(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    try {
      const { data, error } = await supabase
        .from('users')
        .insert({
          id: user.id, // L'ID vient de auth.users
          email: user.email,
          first_name: user.firstName,
          last_name: user.lastName,
          profession: user.profession,
          employee_id: user.employeeId,
          role_id: user.roleId,
          is_active: user.isActive,
          created_by: user.createdBy
        })
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        email: data.email,
        firstName: data.first_name,
        lastName: data.last_name,
        profession: data.profession,
        employeeId: data.employee_id,
        roleId: data.role_id,
        isActive: data.is_active,
        lastLogin: data.last_login,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        createdBy: data.created_by
      };
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async update(id: string, updates: Partial<User>): Promise<User> {
    try {

      const { data, error } = await supabase
        .from('users')
        .update({
          email: updates.email,
          first_name: updates.firstName,
          last_name: updates.lastName,
          profession: updates.profession,
          employee_id: updates.employeeId,
          role_id: updates.roleId,
          is_active: updates.isActive,
          last_login: updates.lastLogin,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Supabase error details:', error);
        throw new Error(`Failed to update user: ${error.message}`);
      }

      if (!data) {
        throw new Error('No data returned from update operation');
      }

      return {
        id: data.id,
        email: data.email,
        firstName: data.first_name,
        lastName: data.last_name,
        profession: data.profession,
        employeeId: data.employee_id,
        roleId: data.role_id,
        isActive: data.is_active,
        lastLogin: data.last_login,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        createdBy: data.created_by
      };
    } catch (error) {
      console.error('Error in usersService.update:', error);
      throw error;
    }
  },
  
  async delete(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  }
};

// Roles Service
export const rolesService = {
  async getAll(): Promise<UserRole[]> {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Error loading roles from Supabase, using default roles:', error);
        // Fallback vers les rôles par défaut
        return DEFAULT_ROLES;
      }

      return data.map(role => ({
        id: role.id,
        name: role.name,
        code: role.code,
        description: role.description,
        permissions: role.permissions as any,
        color: role.color,
        isActive: role.is_active,
        createdAt: role.created_at,
        updatedAt: role.updated_at
      }));
    } catch (error) {
      console.warn('Error loading roles, using default roles:', error);
      return DEFAULT_ROLES;
    }
  },

  async create(role: Omit<UserRole, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserRole> {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .insert({
          name: role.name,
          code: role.code,
          description: role.description,
          permissions: role.permissions as any,
          color: role.color,
          is_active: role.isActive
        })
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        name: data.name,
        code: data.code,
        description: data.description,
        permissions: data.permissions as any,
        color: data.color,
        isActive: data.is_active,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      };
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async update(id: string, updates: Partial<UserRole>): Promise<void> {
    try {
      const { error } = await supabase
        .from('user_roles')
        .update({
          ...(updates.name && { name: updates.name }),
          ...(updates.code && { code: updates.code }),
          ...(updates.description && { description: updates.description }),
          ...(updates.permissions && { permissions: updates.permissions as any }),
          ...(updates.color && { color: updates.color }),
          ...(updates.isActive !== undefined && { is_active: updates.isActive }),
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
    }
  },

  async delete(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
    }
  }
};


// Bank Accounts Service
// export const bankAccountsService = {
//   async getAll(): Promise<BankAccount[]> {
//     try {
//       const { data, error } = await supabase
//         .from('bank_accounts')
//         .select('*')
//         .order('created_at', { ascending: false });

//       if (error) throw error;

//       return data.map(account => ({
//         id: account.id,
//         name: account.name,
//         accountNumber: account.account_number,
//         bankName: account.bank_name,
//         balance: account.balance,
//         lastUpdateDate: account.last_update_date
//       }));
//     } catch (error) {
//       handleSupabaseError(error);
//       return [];
//     }
//   },

//   async create(account: Omit<BankAccount, 'id'>): Promise<BankAccount> {
//     try {
//       // Vérifier d'abord si le numéro de compte existe déjà
//       const { data: existingAccount, error: checkError } = await supabase
//         .from('bank_accounts')
//         .select('account_number')
//         .eq('account_number', account.accountNumber)
//         .maybeSingle();

//       if (checkError && checkError.code !== 'PGRST116') {
//         // PGRST116 = no rows found, ce qui est normal
//         throw checkError;
//       }

//       // Si un compte avec ce numéro existe déjà, lancer une erreur
//       if (existingAccount) {
//         throw new Error(`Un compte bancaire avec le numéro ${account.accountNumber} existe déjà`);
//       }

//       // Si aucun compte n'existe avec ce numéro, procéder à l'insertion
//       const { data, error } = await supabase
//         .from('bank_accounts')
//         .insert({
//           name: account.name,
//           account_number: account.accountNumber,
//           bank_name: account.bankName,
//           balance: account.balance || 0,
//           last_update_date: account.lastUpdateDate || new Date().toISOString()
//         })
//         .select()
//         .single();

//       if (error) throw error;

//       return {
//         id: data.id,
//         name: data.name,
//         accountNumber: data.account_number,
//         bankName: data.bank_name,
//         balance: data.balance,
//         lastUpdateDate: data.last_update_date
//       };
//     } catch (error) {
//       handleSupabaseError(error);
//       throw error;
//     }
//   },

//   async update(id: string, updates: Partial<BankAccount>): Promise<void> {
//     try {
//       // Si on tente de mettre à jour le numéro de compte, vérifier qu'il n'existe pas déjà
//       if (updates.accountNumber) {
//         const { data: existingAccount, error: checkError } = await supabase
//           .from('bank_accounts')
//           .select('id, account_number')
//           .eq('account_number', updates.accountNumber)
//           .neq('id', id) // Exclure le compte actuel de la vérification
//           .maybeSingle();

//         if (checkError && checkError.code !== 'PGRST116') {
//           throw checkError;
//         }

//         if (existingAccount) {
//           throw new Error(`Un compte bancaire avec le numéro ${updates.accountNumber} existe déjà`);
//         }
//       }

//       const { error } = await supabase
//         .from('bank_accounts')
//         .update({
//           ...(updates.name && { name: updates.name }),
//           ...(updates.accountNumber && { account_number: updates.accountNumber }),
//           ...(updates.bankName && { bank_name: updates.bankName }),
//           ...(updates.balance !== undefined && { balance: updates.balance }),
//           ...(updates.lastUpdateDate && { last_update_date: updates.lastUpdateDate }),
//           updated_at: new Date().toISOString()
//         })
//         .eq('id', id);

//       if (error) throw error;
//     } catch (error) {
//       handleSupabaseError(error);
//     }
//   },

//   async delete(id: string): Promise<void> {
//     try {
//       const { error } = await supabase
//         .from('bank_accounts')
//         .delete()
//         .eq('id', id);

//       if (error) throw error;
//     } catch (error) {
//       handleSupabaseError(error);
//     }
//   },

//   async getByAccountNumber(accountNumber: string): Promise<BankAccount | null> {
//     try {
//       const { data, error } = await supabase
//         .from('bank_accounts')
//         .select('*')
//         .eq('account_number', accountNumber)
//         .maybeSingle();

//       if (error) throw error;

//       if (!data) return null;

//       return {
//         id: data.id,
//         name: data.name,
//         accountNumber: data.account_number,
//         bankName: data.bank_name,
//         balance: data.balance,
//         lastUpdateDate: data.last_update_date
//       };
//     } catch (error) {
//       handleSupabaseError(error);
//       return null;
//     }
//   }
// };

// Bank Transactions Service
export const bankTransactionsService = {
  async getAll(): Promise<BankTransaction[]> {
    try {
      const { data, error } = await supabase
        .from('bank_transactions')
        .select('*')
        .order('date', { ascending: false });

      if (error) throw error;

      return data.map(transaction => ({
        id: transaction.id,
        grantId: transaction.grant_id,  // ← CHANGEMENT ICI : utiliser grant_id
        date: transaction.date,
        description: transaction.description,
        amount: transaction.amount,
        type: transaction.type as 'credit' | 'debit',
        reference: transaction.reference
      }));
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async create(transaction: Omit<BankTransaction, 'id'>): Promise<BankTransaction> {
    try {
      const { data, error } = await supabase
        .from('bank_transactions')
        .insert({
          grant_id: transaction.grantId,  // ← CHANGEMENT ICI : utiliser grant_id
          date: transaction.date,
          description: transaction.description,
          amount: transaction.amount,
          type: transaction.type,
          reference: transaction.reference
        })
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        grantId: data.grant_id,  // ← CHANGEMENT ICI : utiliser grant_id
        date: data.date,
        description: data.description,
        amount: data.amount,
        type: data.type as 'credit' | 'debit',
        reference: data.reference
      };
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('bank_transactions')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
    }
  }
  
};

// Prefinancings Service
export const prefinancingsService = {
  async getAll(): Promise<Prefinancing[]> {
    try {
      const { data, error } = await supabase
        .from('prefinancings')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data.map(prefinancing => ({
        id: prefinancing.id,
        prefinancingNumber: prefinancing.prefinancing_number,
        grantId: prefinancing.grant_id,
        budgetLineId: prefinancing.budget_line_id,
        subBudgetLineId: prefinancing.sub_budget_line_id,
        amount: prefinancing.amount,
        date: prefinancing.date,
        expectedRepaymentDate: prefinancing.expected_repayment_date,
        purpose: prefinancing.purpose as Prefinancing['purpose'],
        targetBankAccount: prefinancing.target_bank_account,
        targetGrant: prefinancing.target_grant,
        expenses: prefinancing.expenses as any,
        status: prefinancing.status as Prefinancing['status'],
        repayments: prefinancing.repayments as any,
        description: prefinancing.description,
        approvals: prefinancing.approvals as any
      }));
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async create(prefinancing: Omit<Prefinancing, 'id'>): Promise<Prefinancing> {
    try {
      const { data, error } = await supabase
        .from('prefinancings')
        .insert({
          prefinancing_number: prefinancing.prefinancingNumber,
          grant_id: prefinancing.grantId,
          budget_line_id: prefinancing.budgetLineId,
          sub_budget_line_id: prefinancing.subBudgetLineId,
          amount: prefinancing.amount,
          date: prefinancing.date,
          expected_repayment_date: prefinancing.expectedRepaymentDate,
          purpose: prefinancing.purpose,
          target_bank_account: prefinancing.targetBankAccount,
          target_grant: prefinancing.targetGrant,
          expenses: prefinancing.expenses as any,
          status: prefinancing.status,
          repayments: prefinancing.repayments as any,
          description: prefinancing.description,
          approvals: prefinancing.approvals as any
        })
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        prefinancingNumber: data.prefinancing_number,
        grantId: data.grant_id,
        budgetLineId: data.budget_line_id,
        subBudgetLineId: data.sub_budget_line_id,
        amount: data.amount,
        date: data.date,
        expectedRepaymentDate: data.expected_repayment_date,
        purpose: data.purpose as Prefinancing['purpose'],
        targetBankAccount: data.target_bank_account,
        targetGrant: data.target_grant,
        expenses: data.expenses as any,
        status: data.status as Prefinancing['status'],
        repayments: data.repayments as any,
        description: data.description,
        approvals: data.approvals as any
      };
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async update(id: string, updates: Partial<Prefinancing>): Promise<void> {
    try {
      const { error } = await supabase
        .from('prefinancings')
        .update({
          ...(updates.prefinancingNumber && { prefinancing_number: updates.prefinancingNumber }),
          ...(updates.grantId && { grant_id: updates.grantId }),
          ...(updates.budgetLineId !== undefined && { budget_line_id: updates.budgetLineId }),
          ...(updates.subBudgetLineId !== undefined && { sub_budget_line_id: updates.subBudgetLineId }),
          ...(updates.amount !== undefined && { amount: updates.amount }),
          ...(updates.date && { date: updates.date }),
          ...(updates.expectedRepaymentDate && { expected_repayment_date: updates.expectedRepaymentDate }),
          ...(updates.purpose && { purpose: updates.purpose }),
          ...(updates.targetBankAccount !== undefined && { target_bank_account: updates.targetBankAccount }),
          ...(updates.targetGrant !== undefined && { target_grant: updates.targetGrant }),
          ...(updates.expenses !== undefined && { expenses: updates.expenses as any }),
          ...(updates.status && { status: updates.status }),
          ...(updates.repayments !== undefined && { repayments: updates.repayments as any }),
          ...(updates.description && { description: updates.description }),
          ...(updates.approvals !== undefined && { approvals: updates.approvals as any }),
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
    }
  },

  async delete(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('prefinancings')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
    }
  }
};

// Employee Loans Service
export const employeeLoansService = {
  async getAll(): Promise<EmployeeLoan[]> {
    try {
      const { data, error } = await supabase
        .from('employee_loans')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data.map(loan => ({
        id: loan.id,
        loanNumber: loan.loan_number,
        grantId: loan.grant_id,
        budgetLineId: loan.budget_line_id,
        subBudgetLineId: loan.sub_budget_line_id,
        employee: loan.employee as any,
        amount: loan.amount,
        date: loan.date,
        expectedRepaymentDate: loan.expected_repayment_date,
        description: loan.description,
        repaymentSchedule: loan.repayment_schedule as any,
        repayments: loan.repayments as any,
        status: loan.status as EmployeeLoan['status'],
        approvals: loan.approvals as any
      }));
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async create(loan: Omit<EmployeeLoan, 'id'>): Promise<EmployeeLoan> {
    try {
      const { data, error } = await supabase
        .from('employee_loans')
        .insert({
          loan_number: loan.loanNumber,
          grant_id: loan.grantId,
          budget_line_id: loan.budgetLineId,
          sub_budget_line_id: loan.subBudgetLineId,
          employee: loan.employee as any,
          amount: loan.amount,
          date: loan.date,
          expected_repayment_date: loan.expectedRepaymentDate,
          description: loan.description,
          repayment_schedule: loan.repaymentSchedule as any,
          repayments: loan.repayments as any,
          status: loan.status,
          approvals: loan.approvals as any
        })
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        loanNumber: data.loan_number,
        grantId: data.grant_id,
        budgetLineId: data.budget_line_id,
        subBudgetLineId: data.sub_budget_line_id,
        employee: data.employee as any,
        amount: data.amount,
        date: data.date,
        expectedRepaymentDate: data.expected_repayment_date,
        description: data.description,
        repaymentSchedule: data.repayment_schedule as any,
        repayments: data.repayments as any,
        status: data.status as EmployeeLoan['status'],
        approvals: data.approvals as any
      };
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async update(id: string, updates: Partial<EmployeeLoan>): Promise<void> {
    try {
      const { error } = await supabase
        .from('employee_loans')
        .update({
          ...(updates.loanNumber && { loan_number: updates.loanNumber }),
          ...(updates.grantId && { grant_id: updates.grantId }),
          ...(updates.budgetLineId !== undefined && { budget_line_id: updates.budgetLineId }),
          ...(updates.subBudgetLineId !== undefined && { sub_budget_line_id: updates.subBudgetLineId }),
          ...(updates.employee !== undefined && { employee: updates.employee as any }),
          ...(updates.amount !== undefined && { amount: updates.amount }),
          ...(updates.date && { date: updates.date }),
          ...(updates.expectedRepaymentDate && { expected_repayment_date: updates.expectedRepaymentDate }),
          ...(updates.description && { description: updates.description }),
          ...(updates.repaymentSchedule !== undefined && { repayment_schedule: updates.repaymentSchedule as any }),
          ...(updates.repayments !== undefined && { repayments: updates.repayments as any }),
          ...(updates.status && { status: updates.status }),
          ...(updates.approvals !== undefined && { approvals: updates.approvals as any }),
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
    }
  },

  async delete(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('employee_loans')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
    }
  }

};

// App Settings Service
export const appSettingsService = {
  async get(key: string): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', key)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows returned
      
      return data?.value || null;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  async set(key: string, value: any): Promise<void> {
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          key,
          value,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'key'
        });

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
    }
  }
};