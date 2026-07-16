import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Edit, Trash2, Users, Shield, Eye, EyeOff, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Search, Menu, X } from 'lucide-react';
import { showSuccess, showError, showWarning, showValidationError, confirmDelete } from '../utils/alerts';
import { User, UserRole, DEFAULT_ROLES, USER_STATUS, Permission, PermissionAction } from '../types/user';
import { usersService } from '../services/supabaseService';
import { PermissionService } from '../services/permissionService';
import { usePermissions } from '../hooks/usePermissions';
import { adminService } from '../services/adminService';

interface UserManagerProps {
  users: User[];
  roles: UserRole[];
  currentUser: User;
  onAddUser: (user: User) => void;
  onUpdateUser: (id: string, updates: Partial<User>) => void;
  onDeleteUser: (id: string) => void;
  onAddRole: (role: Omit<UserRole, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateRole: (id: string, updates: Partial<UserRole>) => void;
  onDeleteRole: (id: string) => void;
}

interface PermissionSelection {
  id: string;
  name: string;
  module: string;
  actions: PermissionAction[];
  selectedActions: string[];
}

type UserSortField = 'firstName' | 'lastName' | 'email' | 'profession' | 'role' | 'status' | 'lastLogin';
type RoleSortField = 'name' | 'code' | 'usersCount' | 'permissionsCount' | 'status';
type SortDirection = 'asc' | 'desc';

const UserManager: React.FC<UserManagerProps> = ({
  users,
  roles,
  currentUser,
  onAddUser,
  onUpdateUser,
  onDeleteUser,
  onAddRole,
  onUpdateRole,
  onDeleteRole
}) => {

  if (roles === undefined) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement des rôles...</p>
        </div>
      </div>
    );
  }
  // États principaux
  const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users');
  const [showUserForm, setShowUserForm] = useState(false);
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingRole, setEditingRole] = useState<UserRole | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // États pour la modification du mot de passe
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [passwordFormData, setPasswordFormData] = useState({
    newPassword: '',
    confirmPassword: ''
  });

  // États pour la pagination et tri
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [userSortField, setUserSortField] = useState<UserSortField>('firstName');
  const [roleSortField, setRoleSortField] = useState<RoleSortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [isMobileView, setIsMobileView] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // États pour les formulaires
  const [userFormData, setUserFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    profession: '',
    employeeId: '',
    roleId: '',
    password: '',
    confirmPassword: '',
    isActive: true
  });

  const [roleFormData, setRoleFormData] = useState({
    name: '',
    code: '',
    description: '',
    color: 'bg-blue-100 text-blue-700',
    isActive: true,
    permissionSelections: [] as PermissionSelection[]
  });

  // États pour la logique signataire
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [isSignatoryRole, setIsSignatoryRole] = useState(false);

  // Vérification des permissions
  const { hasPermission, hasModuleAccess, loading: permissionsLoading } = usePermissions();

  // Définition des permissions
  const canViewUsers = hasPermission('users', 'view');
  const canCreateUsers = hasPermission('users', 'create');
  const canEditUsers = hasPermission('users', 'edit');
  const canDeleteUsers = hasPermission('users', 'delete');
  const canViewRoles = hasPermission('users', 'view');
  const canCreateRoles = hasPermission('users', 'create');
  const canEditRoles = hasPermission('users', 'edit');
  const canDeleteRoles = hasPermission('users', 'delete');

  // Options pour les signataires
  const signatoryFunctions = [
    'Coordinateur de la Subvention',
    'Comptable',
    'Coordonnateur National'
  ];

  // Détection de la taille d'écran
  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobileView(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setShowMobileMenu(false);
      }
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Vérifier si le rôle sélectionné a la permission signataire
  useEffect(() => {
    if (userFormData.roleId) {
      const role = roles.find(r => r.id === userFormData.roleId);
      setSelectedRole(role || null);
      
      if (role) {
        const hasSignPermission = role.permissions.some(permission => 
          permission.actions.includes('sign')
        );
        setIsSignatoryRole(hasSignPermission);
        
        if (hasSignPermission && !signatoryFunctions.includes(userFormData.profession)) {
          setUserFormData(prev => ({ ...prev, profession: '' }));
        }
      } else {
        setIsSignatoryRole(false);
      }
    } else {
      setSelectedRole(null);
      setIsSignatoryRole(false);
    }
  }, [userFormData.roleId, roles]);

  // Réinitialiser les formulaires
  const resetUserForm = () => {
    setUserFormData({
      email: '',
      firstName: '',
      lastName: '',
      profession: '',
      employeeId: '',
      roleId: '',
      password: '',
      confirmPassword: '',
      isActive: true
    });
    setPasswordFormData({
      newPassword: '',
      confirmPassword: ''
    });
    setShowUserForm(false);
    setEditingUser(null);
    setShowPasswordChange(false);
    setShowPassword(false);
    setSelectedRole(null);
    setIsSignatoryRole(false);
  };

  const resetRoleForm = () => {
    setRoleFormData({
      name: '',
      code: '',
      description: '',
      color: 'bg-blue-100 text-blue-700',
      isActive: true,
      permissionSelections: []
    });
    setShowRoleForm(false);
    setEditingRole(null);
  };

  // Gestion de la modification du mot de passe
  const handlePasswordChange = async (e: React.FormEvent) => {
  e.preventDefault();
  
  if (!canEditUsers) {
    showError('Permission refusée', 'Vous n\'avez pas la permission de modifier les mots de passe');
    return;
  }

  if (!editingUser) {
    showError('Erreur', 'Aucun utilisateur sélectionné');
    return;
  }

  if (!passwordFormData.newPassword || !passwordFormData.confirmPassword) {
    showValidationError('Champs manquants', 'Veuillez remplir tous les champs du mot de passe');
    return;
  }

  if (passwordFormData.newPassword !== passwordFormData.confirmPassword) {
    showValidationError('Mots de passe différents', 'Les mots de passe saisis ne correspondent pas');
    return;
  }

  if (passwordFormData.newPassword.length < 6) {
    showValidationError('Mot de passe trop court', 'Le mot de passe doit contenir au moins 6 caractères');
    return;
  }

  setLoading(true);

  try {
    // Utiliser le service admin au lieu de supabase.auth.admin directement
    await adminService.updateUserPassword(editingUser.id, passwordFormData.newPassword);

    showSuccess('Succès', 'Mot de passe modifié avec succès');
    setShowPasswordChange(false);
    setPasswordFormData({
      newPassword: '',
      confirmPassword: ''
    });
  } catch (error: any) {
    console.error('Error updating password:', error);
    
    // Gestion d'erreurs plus spécifique
    if (error.message.includes('not allowed') || error.status === 403) {
      showError(
        'Permission insuffisante', 
        'Votre compte n\'a pas les permissions nécessaires pour modifier les mots de passe. Contactez l\'administrateur système.'
      );
    } else {
      showError('Erreur', error.message || 'Une erreur est survenue lors de la modification du mot de passe');
    }
  } finally {
    setLoading(false);
  }
};

  // Gestion de la soumission des formulaires
  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!canCreateUsers && !editingUser) {
      showError('Permission refusée', 'Vous n\'avez pas la permission de créer des utilisateurs');
      return;
    }

    if (!canEditUsers && editingUser) {
      showError('Permission refusée', 'Vous n\'avez pas la permission de modifier des utilisateurs');
      return;
    }

    setLoading(true);
    
    if (!userFormData.email || !userFormData.firstName || !userFormData.lastName || !userFormData.roleId) {
      showValidationError('Champs obligatoires manquants', 'Veuillez remplir tous les champs marqués d\'un astérisque (*)');
      setLoading(false);
      return;
    }

    if (isSignatoryRole && !userFormData.profession) {
      showValidationError('Fonction requise', 'Pour un rôle signataire, vous devez sélectionner une fonction');
      setLoading(false);
      return;
    }

    if (!editingUser && (!userFormData.password || userFormData.password !== userFormData.confirmPassword)) {
      showValidationError('Mots de passe différents', 'Les mots de passe saisis ne correspondent pas');
      setLoading(false);
      return;
    }

    try {
      if (editingUser) {
        const updatedUser = await usersService.update(editingUser.id, {
          email: userFormData.email,
          firstName: userFormData.firstName,
          lastName: userFormData.lastName,
          profession: userFormData.profession,
          employeeId: userFormData.employeeId,
          roleId: userFormData.roleId,
          isActive: userFormData.isActive
        });
        
        onUpdateUser(editingUser.id, updatedUser);
        showSuccess('Succès', 'Utilisateur modifié avec succès');
      } else {
        // Utiliser adminService pour créer l'utilisateur SANS connexion automatique
        try {
          const newUser = await adminService.createUser({
            email: userFormData.email,
            password: userFormData.password,
            user_metadata: {
              first_name: userFormData.firstName,
              last_name: userFormData.lastName,
              profession: userFormData.profession
            },
            email_confirm: true
          });

          if (!newUser.user) throw new Error('Erreur lors de la création du compte auth');

          const newUserId = newUser.user.id;

          const newUserData = {
            id: newUserId,
            email: userFormData.email,
            firstName: userFormData.firstName,
            lastName: userFormData.lastName,
            profession: userFormData.profession,
            employeeId: userFormData.employeeId,
            roleId: userFormData.roleId,
            isActive: userFormData.isActive,
            createdBy: currentUser.id
          };

          const createdUser = await usersService.create(newUserData);
          onAddUser(createdUser);
          
          showSuccess('Succès', 'Utilisateur créé avec succès. L\'utilisateur pourra se connecter avec ses identifiants.');
        } catch (authError: any) {
          console.error('Error creating user with admin service:', authError);
          
          // Fallback sécurisé - NE PAS utiliser signUp qui connecte automatiquement
          showError(
            'Erreur de création', 
            'Impossible de créer le compte utilisateur. Vérifiez que la clé de service Supabase est configurée correctement.'
          );
        }
      }

      resetUserForm();
    } catch (error: any) {
      console.error('Error in user operation:', error);
      showError('Erreur', error.message || 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!canCreateRoles && !editingRole) {
      showError('Permission refusée', 'Vous n\'avez pas la permission de créer des rôles');
      return;
    }

    if (!canEditRoles && editingRole) {
      showError('Permission refusée', 'Vous n\'avez pas la permission de modifier des rôles');
      return;
    }

    if (!roleFormData.name || !roleFormData.code || !roleFormData.description) {
      showValidationError('Champs obligatoires manquants', 'Veuillez remplir le nom, le code et la description du rôle');
      return;
    }

    const permissions = roleFormData.permissionSelections
      .filter(selection => selection.selectedActions.length > 0)
      .map(selection => ({
        module: selection.module,
        actions: selection.selectedActions
      }));

    if (editingRole) {
      onUpdateRole(editingRole.id, {
        name: roleFormData.name,
        code: roleFormData.code,
        description: roleFormData.description,
        color: roleFormData.color,
        isActive: roleFormData.isActive,
        permissions: permissions,
        updatedAt: new Date().toISOString()
      });
    } else {
      onAddRole({
        name: roleFormData.name,
        code: roleFormData.code,
        description: roleFormData.description,
        color: roleFormData.color,
        isActive: roleFormData.isActive,
        permissions: permissions
      });
    }

    resetRoleForm();
  };

  // Gestion du tri
  const handleUserSort = (field: UserSortField) => {
    if (userSortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setUserSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const handleRoleSort = (field: RoleSortField) => {
    if (roleSortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setRoleSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const SortIcon = ({ field, type }: { field: UserSortField | RoleSortField, type: 'users' | 'roles' }) => {
    const currentSortField = type === 'users' ? userSortField : roleSortField;
    if (currentSortField !== field) return <ChevronUp className="w-3 h-3 sm:w-4 sm:h-4 opacity-30" />;
    return sortDirection === 'asc' ? 
      <ChevronUp className="w-3 h-3 sm:w-4 sm:h-4" /> : 
      <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4" />;
  };

  // Préparation des données avec calculs
  const usersWithRoles = useMemo(() => {
    return users.map(user => {
      const userRole = roles.find(role => role.id === user.roleId);
      return {
        ...user,
        roleName: userRole?.name || 'Rôle supprimé',
        roleColor: userRole?.color || 'bg-gray-100 text-gray-700',
        isSignatory: userRole ? userRole.permissions.some(p => p.actions.includes('sign')) : false
      };
    });
  }, [users, roles]);

  const rolesWithStats = useMemo(() => {
    return roles.map(role => {
      const usersWithRole = users.filter(user => user.roleId === role.id);
      const isSignatory = role.permissions.some(p => p.actions.includes('sign'));
      
      return {
        ...role,
        usersCount: usersWithRole.length,
        permissionsCount: role.permissions.length,
        isSignatory
      };
    });
  }, [roles, users]);

  // Filtrage et tri des données
  const filteredAndSortedUsers = useMemo(() => {
  let filtered = usersWithRoles.filter(user => {
    // Vérification de sécurité pour chaque propriété
    const firstName = user.firstName || '';
    const lastName = user.lastName || '';
    const email = user.email || '';
    const profession = user.profession || '';
    const roleName = user.roleName || '';
    const searchTermLower = searchTerm.toLowerCase();

    return (
      firstName.toLowerCase().includes(searchTermLower) ||
      lastName.toLowerCase().includes(searchTermLower) ||
      email.toLowerCase().includes(searchTermLower) ||
      profession.toLowerCase().includes(searchTermLower) ||
      roleName.toLowerCase().includes(searchTermLower)
    );
  });

  // Tri avec vérifications
  filtered.sort((a, b) => {
    let aValue: any, bValue: any;

    switch (userSortField) {
      case 'firstName':
      case 'lastName':
      case 'email':
      case 'profession':
        aValue = (a[userSortField] || '').toLowerCase();
        bValue = (b[userSortField] || '').toLowerCase();
        break;
      case 'role':
        aValue = (a.roleName || '').toLowerCase();
        bValue = (b.roleName || '').toLowerCase();
        break;
      case 'status':
        aValue = a.isActive;
        bValue = b.isActive;
        break;
      case 'lastLogin':
        aValue = a.lastLogin ? new Date(a.lastLogin).getTime() : 0;
        bValue = b.lastLogin ? new Date(b.lastLogin).getTime() : 0;
        break;
      default:
        aValue = a[userSortField] || '';
        bValue = b[userSortField] || '';
    }

    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  return filtered;
}, [usersWithRoles, searchTerm, userSortField, sortDirection]);

  const filteredAndSortedRoles = useMemo(() => {
    let filtered = rolesWithStats.filter(role =>
      role.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      role.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      role.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Tri
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;

      switch (roleSortField) {
        case 'name':
        case 'code':
          aValue = a[roleSortField]?.toLowerCase() || '';
          bValue = b[roleSortField]?.toLowerCase() || '';
          break;
        case 'usersCount':
        case 'permissionsCount':
          aValue = a[roleSortField];
          bValue = b[roleSortField];
          break;
        case 'status':
          aValue = a.isActive;
          bValue = b.isActive;
          break;
        default:
          aValue = a[roleSortField];
          bValue = b[roleSortField];
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [rolesWithStats, searchTerm, roleSortField, sortDirection]);

  // Pagination
  const currentData = activeTab === 'users' ? filteredAndSortedUsers : filteredAndSortedRoles;
  const totalPages = Math.ceil(currentData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedData = currentData.slice(startIndex, startIndex + itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeTab]);

  // Fonctions d'édition
  const startEditUser = (user: User) => {
    if (!canEditUsers) {
      showError('Permission refusée', 'Vous n\'avez pas la permission de modifier des utilisateurs');
      return;
    }

    const userRole = roles.find(role => role.id === user.roleId);
    const isSignatory = userRole ? userRole.permissions.some(p => p.actions.includes('sign')) : false;
    
    setEditingUser(user);
    setUserFormData({
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profession: user.profession || '',
      employeeId: user.employeeId || '',
      roleId: user.roleId,
      password: '',
      confirmPassword: '',
      isActive: user.isActive
    });
    
    // Réinitialiser le formulaire de mot de passe
    setPasswordFormData({
      newPassword: '',
      confirmPassword: ''
    });
    setShowPasswordChange(false);
    
    setSelectedRole(userRole || null);
    setIsSignatoryRole(isSignatory);
    setShowUserForm(true);
  };

  const startEditRole = (role: UserRole) => {
    if (!canEditRoles) {
      showError('Permission refusée', 'Vous n\'avez pas la permission de modifier des rôles');
      return;
    }

    const permissionSelections: PermissionSelection[] = PermissionService.getAvailableModules().map(moduleConfig => {
      const rolePermission = role.permissions.find(p => p.module === moduleConfig.module);
      
      return {
        id: moduleConfig.module,
        name: moduleConfig.label,
        module: moduleConfig.module,
        actions: moduleConfig.actions,
        selectedActions: rolePermission ? rolePermission.actions : []
      };
    });

    setEditingRole(role);
    setRoleFormData({
      name: role.name,
      code: role.code,
      description: role.description,
      color: role.color,
      isActive: role.isActive,
      permissionSelections
    });
    setShowRoleForm(true);
  };

  
  
  // Correction pour User
  const handleDeleteUser = async (user: User) => { // <-- AJOUTER ASYNC
      if (!canDeleteUsers) {
        showError('Permission refusée', 'Vous n\'avez pas la permission de supprimer des utilisateurs');
        return;
      }
      if (user.id === currentUser.id) {
        showError('Action impossible', 'Vous ne pouvez pas supprimer votre propre compte');
        return;
      }

      // RÉÉCRIRE CETTE PARTIE
      const confirmed = await confirmDelete(
        'Supprimer l\'utilisateur',
        `Êtes-vous sûr de vouloir supprimer l'utilisateur ${user.firstName} ${user.lastName} ?`
      );

      if (confirmed) {
          onDeleteUser(user.id);
          // Ajoutez un showSuccess ici si vous le souhaitez
      } else {
          console.log('Suppression utilisateur annulée');
      }
  };

  // Correction pour Role
const handleDeleteRole = async (role: UserRole) => {
  if (!canDeleteRoles) {
    showError('Permission refusée', 'Vous n\'avez pas la permission de supprimer des rôles');
    return;
  }

  // CORRECTION : Calculer usersWithRole ici
  const usersWithRole = users.filter(user => user.roleId === role.id);
  
  if (usersWithRole.length > 0) {
    showError('Action impossible', `Ce rôle est assigné à ${usersWithRole.length} utilisateur(s). Vous ne pouvez pas le supprimer.`);
    return;
  }

  // RÉÉCRITURE de la confirmation
  const confirmed = await confirmDelete(
    'Supprimer le rôle',
    `Êtes-vous sûr de vouloir supprimer le rôle ${role.name} ?`
  );

  if (confirmed) {
    onDeleteRole(role.id);
    // Ajoutez un showSuccess ici si vous le souhaitez
  } else {
    console.log('Suppression rôle annulée');
  }
};


  // Options de couleurs
  const colorOptions = [
    { value: 'bg-red-100 text-red-700', label: 'Rouge', preview: 'bg-red-100' },
    { value: 'bg-blue-100 text-blue-700', label: 'Bleu', preview: 'bg-blue-100' },
    { value: 'bg-green-100 text-green-700', label: 'Vert', preview: 'bg-green-100' },
    { value: 'bg-yellow-100 text-yellow-700', label: 'Jaune', preview: 'bg-yellow-100' },
    { value: 'bg-purple-100 text-purple-700', label: 'Violet', preview: 'bg-purple-100' },
    { value: 'bg-pink-100 text-pink-700', label: 'Rose', preview: 'bg-pink-100' },
    { value: 'bg-indigo-100 text-indigo-700', label: 'Indigo', preview: 'bg-indigo-100' },
    { value: 'bg-orange-100 text-orange-700', label: 'Orange', preview: 'bg-orange-100' }
  ];

  // Initialisation des permissions du formulaire de rôle
  useEffect(() => {
    if (showRoleForm && !editingRole && roleFormData.permissionSelections.length === 0) {
      const initialPermissionSelections: PermissionSelection[] = PermissionService.getAvailableModules().map(module => ({
        id: module.module,
        name: module.label,
        module: module.module,
        actions: module.actions,
        selectedActions: []
      }));
      
      setRoleFormData(prev => ({ ...prev, permissionSelections: initialPermissionSelections }));
    }
  }, [showRoleForm, editingRole]);

  // Vérification des permissions de module
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

  if (!hasModuleAccess('users') && !hasModuleAccess('roles')) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Accès non autorisé</h2>
          <p className="text-gray-500">Vous n'avez pas les permissions nécessaires pour accéder à ce module.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-4">
      {/* Header Mobile */}
      <div className="lg:hidden">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Gestion des Utilisateurs</h2>
            <p className="text-sm text-gray-600 mt-1">Administration centralisée</p>
          </div>
          <button
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="p-2 bg-gray-100 rounded-lg"
          >
            {showMobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Menu mobile */}
        {showMobileMenu && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 mb-4">
            <div className="space-y-3">
              {canCreateRoles && (
                <button
                  onClick={() => setShowRoleForm(true)}
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-2 rounded-xl font-medium flex items-center justify-center space-x-2"
                >
                  <Shield className="w-4 h-4" />
                  <span>Nouveau Rôle</span>
                </button>
              )}
              {canCreateUsers && (
                <button
                  onClick={() => setShowUserForm(true)}
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2 rounded-xl font-medium flex items-center justify-center space-x-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nouvel Utilisateur</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Header Desktop */}
      <div className="hidden lg:flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gestion des Utilisateurs</h2>
          <p className="text-gray-600 mt-1">Administration centralisée des utilisateurs et des rôles</p>
        </div>
        <div className="flex space-x-3">
          {canCreateRoles && (
            <button
              onClick={() => setShowRoleForm(true)}
              className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-2 rounded-xl font-medium hover:shadow-lg transform hover:scale-[1.02] transition-all duration-200 flex items-center space-x-2"
            >
              <Shield className="w-4 h-4" />
              <span>Nouveau Rôle</span>
            </button>
          )}
          {canCreateUsers && (
            <button
              onClick={() => setShowUserForm(true)}
              className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2 rounded-xl font-medium hover:shadow-lg transform hover:scale-[1.02] transition-all duration-200 flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Nouvel Utilisateur</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {canViewUsers && (
              <button
                onClick={() => setActiveTab('users')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'users'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Users className="w-4 h-4" />
                  <span>Utilisateurs ({users.length})</span>
                </div>
              </button>
            )}
            {canViewRoles && (
              <button
                onClick={() => setActiveTab('roles')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'roles'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Shield className="w-4 h-4" />
                  <span>Rôles ({roles.length})</span>
                </div>
              </button>
            )}
          </nav>
        </div>

        <div className="p-4 sm:p-6">
          {/* Barre de recherche et pagination */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
            <div className="relative w-full sm:w-auto">
              <Search className="w-3 h-3 sm:w-4 sm:h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full text-sm"
              />
            </div>

            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <select
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(Number(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              >
                <option value="5">5 lignes</option>
                <option value="10">10 lignes</option>
                <option value="20">20 lignes</option>
                <option value="50">50 lignes</option>
              </select>
            </div>
          </div>

          {activeTab === 'users' && canViewUsers && (
            <div className="space-y-4">
              {filteredAndSortedUsers.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                    <Users className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun utilisateur</h3>
                  <p className="text-gray-500 mb-4">Commencez par créer votre premier utilisateur</p>
                  {canCreateUsers && (
                    <button
                      onClick={() => setShowUserForm(true)}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                    >
                      Créer un utilisateur
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Version mobile */}
                  {isMobileView ? (
                    <div className="space-y-3">
                      {paginatedData.map((user) => (
                        <div key={user.id} className="bg-gray-50 rounded-lg p-3 border">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-1">
                                <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center">
                                  <span className="text-white font-medium text-xs">
                                    {/* {user.firstName?.charAt(0)}{user.lastName?.charAt(0)} */}
                                  </span>
                                </div>
                                <div>
                                  <h4 className="font-semibold text-gray-900 text-sm">
                                    {user.firstName} {user.lastName}
                                  </h4>
                                  <p className="text-xs text-gray-600 truncate">{user.email}</p>
                                </div>
                              </div>
                            </div>
                            <span className={`text-xs px-2 py-1 rounded-full ${user.isActive ? USER_STATUS.active.color : USER_STATUS.inactive.color}`}>
                              {user.isActive ? USER_STATUS.active.label : USER_STATUS.inactive.label}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                            <div>
                              <span className="text-gray-600">Fonction:</span>
                              <p className="font-medium truncate">{user.profession || 'Non spécifiée'}</p>
                            </div>
                            <div>
                              <span className="text-gray-600">Rôle:</span>
                              <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${user.roleColor}`}>
                                {user.roleName}
                              </span>
                            </div>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-xs text-gray-500">
                              Dern. connexion: {user.lastLogin 
                                ? new Date(user.lastLogin).toLocaleDateString('fr-FR')
                                : 'Jamais'
                              }
                            </span>
                            <div className="flex space-x-1">
                              {canEditUsers && (
                                <>
                                  <button
                                    onClick={() => startEditUser(user)}
                                    className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                  >
                                    <Edit className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      startEditUser(user);
                                      setShowPasswordChange(true);
                                    }}
                                    className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                                    title="Modifier le mot de passe"
                                  >
                                    <Shield className="w-3 h-3" />
                                  </button>
                                </>
                              )}
                              {canDeleteUsers && user.id !== currentUser.id && (
                                <button
                                  onClick={() => handleDeleteUser(user)}
                                  className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Version desktop */
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleUserSort('firstName')}>
                              <div className="flex items-center space-x-1">
                                <span>Utilisateur</span>
                                <SortIcon field="firstName" type="users" />
                              </div>
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleUserSort('profession')}>
                              <div className="flex items-center space-x-1">
                                <span>Fonction</span>
                                <SortIcon field="profession" type="users" />
                              </div>
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleUserSort('role')}>
                              <div className="flex items-center space-x-1">
                                <span>Rôle</span>
                                <SortIcon field="role" type="users" />
                              </div>
                            </th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleUserSort('status')}>
                              <div className="flex items-center justify-center space-x-1">
                                <span>Statut</span>
                                <SortIcon field="status" type="users" />
                              </div>
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleUserSort('lastLogin')}>
                              <div className="flex items-center space-x-1">
                                <span>Dernière connexion</span>
                                <SortIcon field="lastLogin" type="users" />
                              </div>
                            </th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {paginatedData.map(user => (
                            <tr key={user.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <div className="flex items-center space-x-3">
                                  <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center">
                                    <span className="text-white font-medium text-xs">
                                      {/* {user.firstName?.charAt(0)}{user?.lastName.charAt(0)} */}
                                    </span>
                                  </div>
                                  <div>
                                    <div className="text-sm font-medium text-gray-900">
                                      {user.firstName} {user.lastName}
                                    </div>
                                    <div className="text-sm text-gray-500">{user.email}</div>
                                    {user.employeeId && (
                                      <div className="text-xs text-gray-400">ID: {user.employeeId}</div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-500">
                                {user.profession || 'Non spécifiée'}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${user.roleColor}`}>
                                  {user.roleName}
                                </span>
                                {user.isSignatory && (
                                  <span className="inline-block ml-1 px-1 py-0.5 text-xs bg-green-100 text-green-800 rounded">
                                    Signataire
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                                  user.isActive ? USER_STATUS.active.color : USER_STATUS.inactive.color
                                }`}>
                                  {user.isActive ? USER_STATUS.active.label : USER_STATUS.inactive.label}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-500">
                                {user.lastLogin 
                                  ? new Date(user.lastLogin).toLocaleDateString('fr-FR')
                                  : 'Jamais connecté'
                                }
                              </td>
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center justify-center space-x-1">
                                  {canEditUsers && (
                                    <>
                                      <button
                                        onClick={() => startEditUser(user)}
                                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                        title="Modifier"
                                      >
                                        <Edit className="w-4 h-4" />
                                      </button>
                                     
                                    </>
                                  )}
                                  {canDeleteUsers && user.id !== currentUser.id && (
                                    <button
                                      onClick={() => handleDeleteUser(user)}
                                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                      title="Supprimer"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'roles' && canViewRoles && (
            <div className="space-y-4">
              {filteredAndSortedRoles.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                    <Shield className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun rôle</h3>
                  <p className="text-gray-500 mb-4">Commencez par créer votre premier rôle</p>
                  {canCreateRoles && (
                    <button
                      onClick={() => setShowRoleForm(true)}
                      className="bg-purple-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors"
                    >
                      Créer un rôle
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Version mobile */}
                  {isMobileView ? (
                    <div className="space-y-3">
                      {paginatedData.map((role) => (
                        <div key={role.id} className="bg-gray-50 rounded-lg p-3 border">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-1">
                                <div className="p-1 bg-gradient-to-r from-purple-600 to-pink-600 rounded">
                                  <Shield className="w-3 h-3 text-white" />
                                </div>
                                <div>
                                  <h4 className="font-semibold text-gray-900 text-sm">{role.name}</h4>
                                  <p className="text-xs text-gray-600">{role.code}</p>
                                </div>
                              </div>
                            </div>
                            <span className={`text-xs px-2 py-1 rounded-full ${role.color}`}>
                              {role.isActive ? 'Actif' : 'Inactif'}
                            </span>
                          </div>
                          
                          <p className="text-xs text-gray-600 mb-2 line-clamp-2">{role.description}</p>

                          <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                            <div>
                              <span className="text-gray-600">Utilisateurs:</span>
                              <p className="font-medium">{role.usersCount}</p>
                            </div>
                            <div>
                              <span className="text-gray-600">Permissions:</span>
                              <p className="font-medium">{role.permissionsCount}</p>
                            </div>
                          </div>

                          {role.isSignatory && (
                            <span className="inline-block mb-2 px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded-full">
                              Rôle Signataire
                            </span>
                          )}

                          <div className="flex justify-end space-x-1">
                            {canEditRoles && (
                              <button
                                onClick={() => startEditRole(role)}
                                className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              >
                                <Edit className="w-3 h-3" />
                              </button>
                            )}
                            {canDeleteRoles && role.usersCount === 0 && (
                              <button
                                onClick={() => handleDeleteRole(role)}
                                className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Version desktop */
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {paginatedData.map(role => (
                        <div key={role.id} className="bg-gray-50 rounded-xl p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center space-x-3">
                              <div className="p-2 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg">
                                <Shield className="w-4 h-4 text-white" />
                              </div>
                              <div>
                                <h3 className="font-semibold text-gray-900">{role.name}</h3>
                                <p className="text-sm text-gray-600">{role.code}</p>
                                {role.isSignatory && (
                                  <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                                    Signataire
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            <div className="flex items-center space-x-1">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${role.color}`}>
                                {role.isActive ? 'Actif' : 'Inactif'}
                              </span>
                              {canEditRoles && (
                                <button
                                  onClick={() => startEditRole(role)}
                                  className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                >
                                  <Edit className="w-3 h-3" />
                                </button>
                              )}
                              {canDeleteRoles && role.usersCount === 0 && (
                                <button
                                  onClick={() => handleDeleteRole(role)}
                                  className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Supprimer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>

                          <p className="text-sm text-gray-600 mb-3">{role.description}</p>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-gray-700">Utilisateurs assignés</span>
                              <span className="text-sm font-bold text-blue-600">{role.usersCount}</span>
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-gray-700">Permissions</span>
                              <span className="text-sm font-bold text-purple-600">{role.permissionsCount}</span>
                            </div>

                            {role.permissions.length > 0 && (
                              <div className="mt-2">
                                <p className="text-xs font-medium text-gray-600 mb-1">Modules autorisés :</p>
                                <div className="flex flex-wrap gap-1">
                                  {[...new Set(role.permissions.map(p => p.module))].slice(0, 3).map(module => (
                                    <span key={module} className="px-2 py-0.5 text-xs bg-white text-gray-600 rounded border">
                                      {module}
                                    </span>
                                  ))}
                                  {[...new Set(role.permissions.map(p => p.module))].length > 3 && (
                                    <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-500 rounded">
                                      +{[...new Set(role.permissions.map(p => p.module))].length - 3}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Pagination */}
          {currentData.length > 0 && totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-gray-200">
              <div className="text-xs sm:text-sm text-gray-700">
                Lignes {startIndex + 1}-{Math.min(startIndex + itemsPerPage, currentData.length)} sur {currentData.length}
              </div>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="p-2 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                
                <div className="flex space-x-1">
                  {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 3) pageNum = i + 1;
                    else if (currentPage === 1) pageNum = i + 1;
                    else if (currentPage === totalPages) pageNum = totalPages - 2 + i;
                    else pageNum = currentPage - 1 + i;

                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`px-3 py-1 rounded text-xs ${
                          currentPage === pageNum
                            ? 'bg-blue-600 text-white'
                            : 'border border-gray-300'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="p-2 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal formulaire utilisateur */}
      {showUserForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {editingUser ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}
            </h3>
            
            <form onSubmit={handleUserSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Prénom *
                  </label>
                  <input
                    type="text"
                    value={userFormData.firstName}
                    onChange={(e) => setUserFormData(prev => ({ ...prev, firstName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Ex: Jean"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nom *
                  </label>
                  <input
                    type="text"
                    value={userFormData.lastName}
                    onChange={(e) => setUserFormData(prev => ({ ...prev, lastName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Ex: Dupont"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email *
                </label>
                <input
                  type="email"
                  value={userFormData.email}
                  onChange={(e) => setUserFormData(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Ex: jean.dupont@entreprise.com"
                  required
                />
              </div>

              {/* CHAMP RÔLE AVANT LA FONCTION */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rôle *
                </label>
                <select
                  value={userFormData.roleId}
                  onChange={(e) => setUserFormData(prev => ({ ...prev, roleId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Sélectionner un rôle</option>
                  {roles.filter(role => role.isActive).map(role => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
                {selectedRole && isSignatoryRole && (
                  <p className="text-xs text-green-600 mt-1">
                    ✅ Ce rôle a des permissions de signature
                  </p>
                )}
              </div>

              {/* CHAMP FONCTION CONDITIONNEL */}
              {isSignatoryRole ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fonction *
                  </label>
                  <select
                    value={userFormData.profession}
                    onChange={(e) => setUserFormData(prev => ({ ...prev, profession: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="">Sélectionner une fonction</option>
                    {signatoryFunctions.map(func => (
                      <option key={func} value={func}>
                        {func}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Pour les rôles signataires, la fonction est obligatoire
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fonction
                  </label>
                  <input
                    type="text"
                    value={userFormData.profession}
                    onChange={(e) => setUserFormData(prev => ({ ...prev, profession: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Ex: Développeur"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Matricule employé
                </label>
                <input
                  type="text"
                  value={userFormData.employeeId}
                  onChange={(e) => setUserFormData(prev => ({ ...prev, employeeId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Ex: EMP-2024-001"
                />
              </div>

              {/* Section modification du mot de passe pour l'admin */}
              {editingUser && (
                <div className="border-t border-gray-200 pt-4">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-medium text-gray-700">Modifier le mot de passe</h4>
                    <button
                      type="button"
                      onClick={() => setShowPasswordChange(!showPasswordChange)}
                      className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                    >
                      {showPasswordChange ? 'Masquer' : 'Modifier le mot de passe'}
                    </button>
                  </div>

                  {showPasswordChange && (
                    <div className="bg-blue-50 rounded-lg p-4 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Nouveau mot de passe *
                          </label>
                          <div className="relative">
                            <input
                              type={showPassword ? 'text' : 'password'}
                              value={passwordFormData.newPassword}
                              onChange={(e) => setPasswordFormData(prev => ({ ...prev, newPassword: e.target.value }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                              placeholder="Nouveau mot de passe"
                              required
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Confirmer le mot de passe *
                          </label>
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={passwordFormData.confirmPassword}
                            onChange={(e) => setPasswordFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Confirmer le mot de passe"
                            required
                          />
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={handlePasswordChange}
                          disabled={loading}
                          className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 text-sm"
                        >
                          {loading ? 'Modification...' : 'Mettre à jour le mot de passe'}
                        </button>
                      </div>

                      <div className="text-xs text-blue-600 bg-blue-100 rounded p-2">
                        <strong>Note :</strong> Le mot de passe doit contenir au moins 6 caractères. L'utilisateur devra utiliser ce nouveau mot de passe pour ses prochaines connexions.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!editingUser && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Mot de passe *
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={userFormData.password}
                        onChange={(e) => setUserFormData(prev => ({ ...prev, password: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                        placeholder="Mot de passe"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Confirmer le mot de passe *
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={userFormData.confirmPassword}
                      onChange={(e) => setUserFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Confirmer le mot de passe"
                      required
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={userFormData.isActive}
                    onChange={(e) => setUserFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Compte actif</span>
                </label>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={resetUserForm}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                  disabled={loading}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                  disabled={loading}
                >
                  {loading ? 'Traitement...' : editingUser ? 'Modifier' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal formulaire rôle */}
      {showRoleForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {editingRole ? 'Modifier le rôle' : 'Nouveau rôle'}
            </h3>
            
            <form onSubmit={handleRoleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nom du rôle *
                  </label>
                  <input
                    type="text"
                    value={roleFormData.name}
                    onChange={(e) => setRoleFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Ex: Responsable Financier"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Code *
                  </label>
                  <input
                    type="text"
                    value={roleFormData.code}
                    onChange={(e) => setRoleFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Ex: FINANCE_MANAGER"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description *
                </label>
                <textarea
                  value={roleFormData.description}
                  onChange={(e) => setRoleFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                  placeholder="Description du rôle et de ses responsabilités..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Couleur d'affichage
                </label>
                <div className="grid grid-cols-4 gap-3">
                  {colorOptions.map(color => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => setRoleFormData(prev => ({ ...prev, color: color.value }))}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        roleFormData.color === color.value 
                          ? 'border-blue-500 ring-2 ring-blue-200' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className={`w-full h-8 rounded ${color.preview} mb-2`}></div>
                      <span className="text-xs text-gray-600">{color.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Permissions
                </label>
                <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg p-4 space-y-4">
                  {roleFormData.permissionSelections.map(permission => (
                    <div key={permission.id} className="bg-gray-50 rounded-lg p-4">
                      <label className="flex items-start space-x-3">
                        <input
                          type="checkbox"
                          checked={permission.selectedActions.length > 0}
                          onChange={(e) => {
                            const newPermissionSelections = [...roleFormData.permissionSelections];
                            const index = newPermissionSelections.findIndex(p => p.id === permission.id);
                            
                            if (e.target.checked) {
                              newPermissionSelections[index].selectedActions = [...permission.actions];
                            } else {
                              newPermissionSelections[index].selectedActions = [];
                            }
                            
                            setRoleFormData(prev => ({ ...prev, permissionSelections: newPermissionSelections }));
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mt-1"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900">{permission.name}</div>
                          <div className="text-xs text-gray-500">Module: {permission.module}</div>
                          
                          <div className="mt-2 space-y-2">
                            <div className="text-xs font-medium text-gray-700">Actions:</div>
                            <div className="flex flex-wrap gap-2">
                              {permission.actions.map(action => (
                                <label key={action} className="flex items-center space-x-1 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={permission.selectedActions.includes(action)}
                                    onChange={(e) => {
                                      const newPermissionSelections = [...roleFormData.permissionSelections];
                                      const permissionIndex = newPermissionSelections.findIndex(p => p.id === permission.id);
                                      
                                      if (e.target.checked) {
                                        newPermissionSelections[permissionIndex].selectedActions = [
                                          ...newPermissionSelections[permissionIndex].selectedActions,
                                          action
                                        ];
                                      } else {
                                        newPermissionSelections[permissionIndex].selectedActions = 
                                          newPermissionSelections[permissionIndex].selectedActions.filter(a => a !== action);
                                      }
                                      
                                      setRoleFormData(prev => ({ ...prev, permissionSelections: newPermissionSelections }));
                                    }}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    disabled={!permission.selectedActions.length && !permission.selectedActions.includes(action)}
                                  />
                                  <span className="text-gray-600">
                                    {(({ view: 'Voir', create: 'Créer', edit: 'Modifier', delete: 'Supprimer', sign: 'Signer', approve: 'Approuver', validate: 'Valider', export: 'Exporter' } as Record<string, string>)[action]) || action}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={roleFormData.isActive}
                    onChange={(e) => setRoleFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Rôle actif</span>
                </label>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={resetRoleForm}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-purple-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors"
                >
                  {editingRole ? 'Modifier' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManager;