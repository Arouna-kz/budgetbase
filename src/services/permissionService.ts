// services/permissionService.ts
export interface Permission {
  module: string;
  actions: string[];
}

export interface RolePermissions {
  [module: string]: string[];
}

export class PermissionService {
  // Convertit les permissions du format base de données vers un format utilisable
  static normalizePermissions(permissions: Permission[]): RolePermissions {
    const normalized: RolePermissions = {};
    
    if (permissions) {
      permissions.forEach(perm => {
        normalized[perm.module] = perm.actions || [];
      });
    }
    
    return normalized;
  }

  // Vérifie une permission spécifique
  static hasPermission(permissions: RolePermissions, module: string, action: string): boolean {
    return permissions[module]?.includes(action) || false;
  }

  // Vérifie l'accès à un module
  static hasModuleAccess(permissions: RolePermissions, module: string): boolean {
    return !!permissions[module] && permissions[module].length > 0;
  }

  // Liste des modules disponibles (définition statique)
  static getAvailableModules() {
    return [
      { 
        module: 'dashboard', 
        label: 'Tableau de Bord', 
        actions: ['view'],
        description: 'Accès au tableau de bord principal'
      },
      { 
        module: 'grants', 
        label: 'Subventions', 
        actions: ['view', 'create', 'edit', 'delete'],
        description: 'Gestion des subventions'
      },
      { 
        module: 'budget_planning', 
        label: 'Planification', 
        actions: ['view', 'create', 'edit', 'delete', 'export'],
        description: 'Planification budgétaire'
      },
      { 
        module: 'tracking', 
        label: 'Budgets', 
        actions: ['view', 'create', 'edit', 'delete', 'export'],
        description: 'Planification et suivi budgétaire'
      },
      { 
        module: 'engagements', 
        label: 'Engagements', 
        actions: ['view', 'create', 'edit', 'delete', 'sign'],
        description: 'Gestion des engagements'
      },
      { 
        module: 'payments', 
        label: 'Paiements', 
        actions: ['view', 'create', 'edit', 'delete', 'sign'],
        description: 'Gestion des paiements'
      },
      { 
        module: 'treasury', 
        label: 'Trésorerie', 
        actions: ['view', 'create', 'edit', 'delete', 'export'],
        description: 'Gestion de la trésorerie'
      },
      { 
        module: 'prefinancing', 
        label: 'Préfinancements', 
        actions: ['view', 'create', 'edit', 'delete', 'sign'],
        description: 'Gestion des préfinancements'
      },
      { 
        module: 'employee_loans', 
        label: 'Prêts Employés', 
        actions: ['view', 'create', 'edit', 'delete', 'sign'],
        description: 'Gestion des prêts employés'
      },
      { 
        module: 'reports', 
        label: 'Rapports', 
        actions: ['view', 'create', 'export'],
        description: 'Génération de rapports'
      },
      { 
        module: 'users', 
        label: 'Utilisateurs', 
        actions: ['view', 'create', 'edit', 'delete'],
        description: 'Gestion des utilisateurs'
      },
      { 
        module: 'globalConfig', 
        label: 'Configuration', 
        actions: ['view', 'create', 'edit', 'delete'],
        description: "Gestion d'affichage de la subvention active"
      },
      { 
        module: 'profile', 
        label: 'Profil', 
        actions: ['view', 'edit'],
        description: 'Gestion du profil utilisateur'
      },
      { 
        module: 'bank_accounts', 
        label: 'Comptes Bancaires', 
        actions: ['view', 'create', 'edit', 'delete'],
        description: 'Gestion des comptes bancaires'
      },
      { 
        module: 'bank_transactions', 
        label: 'Transactions Bancaires', 
        actions: ['view', 'create', 'edit', 'delete', 'export'],
        description: 'Gestion des transactions bancaires'
      },
      // { 
      //   module: 'audit', 
      //   label: 'Audit', 
      //   actions: ['view', 'export'],
      //   description: 'Journal d\'audit'
      // }
    ];
  }

  // static getAvailableModules() {
  //   return [
  //     { 
  //       module: 'dashboard', 
  //       label: 'Tableau de Bord', 
  //       actions: ['view', 'export'],
  //       description: 'Accès au tableau de bord principal'
  //     },
  //     { 
  //       module: 'grants', 
  //       label: 'Subventions', 
  //       actions: ['view', 'create', 'edit', 'delete', 'approve'],
  //       description: 'Gestion des subventions'
  //     },
  //     { 
  //       module: 'budget_planning', 
  //       label: 'Planification', 
  //       actions: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
  //       description: 'Planification budgétaire'
  //     },
  //     { 
  //       module: 'tracking', 
  //       label: 'Budgets', 
  //       actions: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
  //       description: 'Planification et suivi budgétaire'
  //     },
  //     { 
  //       module: 'engagements', 
  //       label: 'Engagements', 
  //       actions: ['view', 'create', 'edit', 'delete', 'sign'],
  //       description: 'Gestion des engagements'
  //     },
  //     { 
  //       module: 'payments', 
  //       label: 'Paiements', 
  //       actions: ['view', 'create', 'edit', 'delete', 'approve', 'reconcile', 'sign'],
  //       description: 'Gestion des paiements'
  //     },
  //     { 
  //       module: 'treasury', 
  //       label: 'Trésorerie', 
  //       actions: ['view', 'create', 'edit', 'delete', 'reconcile'],
  //       description: 'Gestion de la trésorerie'
  //     },
  //     { 
  //       module: 'prefinancing', 
  //       label: 'Préfinancements', 
  //       actions: ['view', 'create', 'edit', 'delete', 'approve', 'sign'],
  //       description: 'Gestion des préfinancements'
  //     },
  //     { 
  //       module: 'employee_loans', 
  //       label: 'Prêts Employés', 
  //       actions: ['view', 'create', 'edit', 'delete', 'approve', 'sign'],
  //       description: 'Gestion des prêts employés'
  //     },
  //     { 
  //       module: 'reports', 
  //       label: 'Rapports', 
  //       actions: ['view', 'create', 'export'],
  //       description: 'Génération de rapports'
  //     },
  //     { 
  //       module: 'users', 
  //       label: 'Utilisateurs', 
  //       actions: ['view', 'create', 'edit', 'delete'],
  //       description: 'Gestion des utilisateurs'
  //     },
  //     { 
  //       module: 'globalConfig', 
  //       label: 'Configuration', 
  //       actions: ['view', 'create', 'edit', 'delete'],
  //       description: "Gestion d'affichage de la subvention active"
  //     },
  //     { 
  //       module: 'profile', 
  //       label: 'Profil', 
  //       actions: ['view', 'edit'],
  //       description: 'Gestion du profil utilisateur'
  //     },
  //     { 
  //       module: 'bank_accounts', 
  //       label: 'Comptes Bancaires', 
  //       actions: ['view', 'create', 'edit', 'delete', 'reconcile'],
  //       description: 'Gestion des comptes bancaires'
  //     },
  //     { 
  //       module: 'bank_transactions', 
  //       label: 'Transactions Bancaires', 
  //       actions: ['view', 'create', 'edit', 'delete', 'reconcile', 'export'],
  //       description: 'Gestion des transactions bancaires'
  //     },
  //     { 
  //       module: 'audit', 
  //       label: 'Audit', 
  //       actions: ['view', 'export'],
  //       description: 'Journal d\'audit'
  //     }
  //   ];
  // }

  // Récupère toutes les actions disponibles pour un module
  static getAvailableActions(module: string): string[] {
    const moduleConfig = this.getAvailableModules().find(m => m.module === module);
    return moduleConfig?.actions || [];
  }
}