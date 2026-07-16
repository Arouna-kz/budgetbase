# Documentation Technique - BudgetBase
## Plateforme de Gestion Budgétaire

### Version 1.0 - Architecture et Implémentation

---

## Table des Matières

1. [Architecture Générale](#architecture-générale)
2. [Stack Technologique](#stack-technologique)
3. [Base de Données](#base-de-données)
4. [Authentification et Sécurité](#authentification-et-sécurité)
5. [Structure du Code](#structure-du-code)
6. [Services et API](#services-et-api)
7. [Gestion d'État](#gestion-détat)
8. [Interface Utilisateur](#interface-utilisateur)
9. [Déploiement](#déploiement)
10. [Maintenance et Monitoring](#maintenance-et-monitoring)

---

## Architecture Générale

### Vue d'Ensemble

BudgetBase est une application web moderne construite selon une architecture client-serveur avec les caractéristiques suivantes :

- **Frontend** : Application React TypeScript avec Vite
- **Backend** : Supabase (PostgreSQL + API REST automatique)
- **Authentification** : Supabase Auth avec RLS (Row Level Security)
- **Stockage** : Base de données PostgreSQL hébergée sur Supabase
- **Déploiement** : Application statique déployable sur CDN

### Principes Architecturaux

1. **Séparation des Responsabilités** : Logique métier séparée de l'interface
2. **Modularité** : Composants réutilisables et services indépendants
3. **Sécurité par Design** : RLS et validation côté serveur
4. **Performance** : Optimisations de rendu et requêtes
5. **Maintenabilité** : Code structuré et documenté

---

## Stack Technologique

### Frontend

```typescript
// Technologies principales
React 18.3.1          // Framework UI
TypeScript 5.5.3      // Typage statique
Vite 5.4.2           // Build tool et dev server
Tailwind CSS 3.4.1   // Framework CSS utilitaire

// Librairies complémentaires
Lucide React 0.344.0  // Icônes
SweetAlert2 11.22.5   // Alertes et modales
html2canvas 1.4.1     // Capture d'écran
jsPDF 3.0.2          // Génération PDF
```

### Backend et Services

```typescript
// Backend as a Service
Supabase 2.57.2       // BaaS complet
PostgreSQL 15         // Base de données
PostgREST            // API REST automatique
GoTrue               // Service d'authentification

// Sécurité
Row Level Security    // Sécurité au niveau des lignes
JWT Tokens           // Authentification stateless
HTTPS/TLS            // Chiffrement transport
```

### Outils de Développement

```typescript
ESLint 9.9.1         // Linting JavaScript/TypeScript
Prettier             // Formatage de code
TypeScript ESLint    // Règles TypeScript spécifiques
Autoprefixer         // Préfixes CSS automatiques
PostCSS              // Traitement CSS
```

---

## Base de Données

### Schéma Conceptuel

La base de données suit un modèle relationnel normalisé avec les entités principales :

```sql
-- Hiérarchie des données budgétaires
grants (subventions)
  ├── budget_lines (lignes budgétaires)
      ├── sub_budget_lines (sous-lignes budgétaires)
          ├── engagements
              ├── payments

-- Gestion des utilisateurs
user_roles (rôles)
  ├── users (utilisateurs)

-- Gestion bancaire
bank_accounts (comptes bancaires)
  ├── bank_transactions (transactions)

-- Modules spécialisés
prefinancings (préfinancements)
employee_loans (prêts employés)
app_settings (paramètres application)
```

=========================================DEBUT PRECONFIGURATION==============================================

======================================================================================
### Tables Principales
======================================================================================

### Script SQL de Création

Vous pouvez exécuter ce script directement dans l'éditeur SQL de votre tableau de bord Supabase.

-- ============================================================
-- SCRIPT DE CRÉATION DES TABLES - VERSION V2
-- (Sans bank_accounts, avec bank_transactions liées aux grants)
-- ============================================================

-- 1. Activation de l'extension pour les UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 2. TABLE: app_settings (Indépendante)
-- ============================================================
CREATE TABLE public.app_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    value JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. TABLE: user_roles (Indépendante)
-- ============================================================
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
    color TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 4. TABLE: users (Dépend de user_roles)
-- ============================================================
CREATE TABLE public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    profession TEXT,
    employee_id TEXT,
    role_id UUID NOT NULL REFERENCES public.user_roles(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login TIMESTAMPTZ,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 5. TABLE: grants (Indépendante, contient les infos bancaires en JSON)
-- ============================================================
CREATE TABLE public.grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    reference TEXT NOT NULL,
    granting_organization TEXT NOT NULL,
    year INTEGER NOT NULL,
    currency TEXT NOT NULL,
    planned_amount NUMERIC,
    total_amount NUMERIC NOT NULL,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL,
    description TEXT,
    bank_account JSONB, -- Stocke les infos bancaires directement dans le grant
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 6. TABLE: bank_transactions (LIÉE DIRECTEMENT AUX GRANTS)
-- ============================================================
CREATE TABLE public.bank_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grant_id UUID NOT NULL REFERENCES public.grants(id) ON DELETE CASCADE,
    date TIMESTAMPTZ NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
    reference TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 7. TABLE: budget_lines (Dépend de grants)
-- ============================================================
CREATE TABLE public.budget_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grant_id UUID NOT NULL REFERENCES public.grants(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    planned_amount NUMERIC NOT NULL DEFAULT 0,
    notified_amount NUMERIC NOT NULL DEFAULT 0,
    engaged_amount NUMERIC NOT NULL DEFAULT 0,
    available_amount NUMERIC NOT NULL DEFAULT 0,
    description TEXT,
    color TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 8. TABLE: sub_budget_lines (Dépend de budget_lines et grants)
-- ============================================================
CREATE TABLE public.sub_budget_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grant_id UUID NOT NULL REFERENCES public.grants(id),
    budget_line_id UUID NOT NULL REFERENCES public.budget_lines(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    planned_amount NUMERIC NOT NULL DEFAULT 0,
    notified_amount NUMERIC NOT NULL DEFAULT 0,
    engaged_amount NUMERIC NOT NULL DEFAULT 0,
    available_amount NUMERIC NOT NULL DEFAULT 0,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 9. TABLE: engagements (Dépend de sub_budget_lines, budget_lines, grants)
-- ============================================================
CREATE TABLE public.engagements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grant_id UUID NOT NULL REFERENCES public.grants(id),
    budget_line_id UUID NOT NULL REFERENCES public.budget_lines(id),
    sub_budget_line_id UUID NOT NULL REFERENCES public.sub_budget_lines(id),
    engagement_number TEXT NOT NULL,
    amount NUMERIC NOT NULL DEFAULT 0,
    description TEXT NOT NULL,
    supplier TEXT,
    quote_reference TEXT,
    invoice_number TEXT,
    date TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL,
    approvals JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 10. TABLE: payments (Dépend de engagements et autres)
-- ============================================================
CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_number TEXT NOT NULL,
    grant_id UUID NOT NULL REFERENCES public.grants(id),
    budget_line_id UUID NOT NULL REFERENCES public.budget_lines(id),
    sub_budget_line_id UUID NOT NULL REFERENCES public.sub_budget_lines(id),
    engagement_id UUID NOT NULL REFERENCES public.engagements(id),
    amount NUMERIC NOT NULL DEFAULT 0,
    date TIMESTAMPTZ NOT NULL,
    supplier TEXT NOT NULL,
    description TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    check_number TEXT,
    bank_reference TEXT,
    invoice_number TEXT NOT NULL,
    invoice_amount NUMERIC NOT NULL DEFAULT 0,
    quote_reference TEXT,
    delivery_note TEXT,
    purchase_order_number TEXT,
    service_acceptance BOOLEAN NOT NULL DEFAULT false,
    control_notes TEXT,
    status TEXT NOT NULL,
    cashed_date TIMESTAMPTZ,
    approvals JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 11. TABLE: prefinancings (Dépend de grants)
-- ============================================================
CREATE TABLE public.prefinancings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prefinancing_number TEXT NOT NULL,
    grant_id UUID NOT NULL REFERENCES public.grants(id),
    budget_line_id UUID REFERENCES public.budget_lines(id),
    sub_budget_line_id UUID REFERENCES public.sub_budget_lines(id),
    amount NUMERIC NOT NULL DEFAULT 0,
    date TIMESTAMPTZ NOT NULL,
    expected_repayment_date TIMESTAMPTZ NOT NULL,
    purpose TEXT NOT NULL,
    target_bank_account TEXT,
    target_grant TEXT,
    expenses JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL,
    repayments JSONB,
    description TEXT NOT NULL,
    approvals JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 12. TABLE: employee_loans (Dépend de grants)
-- ============================================================
CREATE TABLE public.employee_loans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_number TEXT NOT NULL,
    grant_id UUID NOT NULL REFERENCES public.grants(id),
    budget_line_id UUID REFERENCES public.budget_lines(id),
    sub_budget_line_id UUID REFERENCES public.sub_budget_lines(id),
    employee JSONB NOT NULL,
    amount NUMERIC NOT NULL DEFAULT 0,
    date TIMESTAMPTZ NOT NULL,
    expected_repayment_date TIMESTAMPTZ NOT NULL,
    description TEXT NOT NULL,
    repayment_schedule JSONB NOT NULL DEFAULT '[]'::jsonb,
    repayments JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL,
    approvals JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEX POUR OPTIMISER LES PERFORMANCES
-- ============================================================

-- Index pour bank_transactions
CREATE INDEX idx_bank_transactions_grant_id ON public.bank_transactions(grant_id);
CREATE INDEX idx_bank_transactions_date ON public.bank_transactions(date);

-- Index pour budget_lines
CREATE INDEX idx_budget_lines_grant_id ON public.budget_lines(grant_id);

-- Index pour sub_budget_lines
CREATE INDEX idx_sub_budget_lines_grant_id ON public.sub_budget_lines(grant_id);
CREATE INDEX idx_sub_budget_lines_budget_line_id ON public.sub_budget_lines(budget_line_id);

-- Index pour engagements
CREATE INDEX idx_engagements_grant_id ON public.engagements(grant_id);
CREATE INDEX idx_engagements_budget_line_id ON public.engagements(budget_line_id);
CREATE INDEX idx_engagements_sub_budget_line_id ON public.engagements(sub_budget_line_id);

-- Index pour payments
CREATE INDEX idx_payments_grant_id ON public.payments(grant_id);
CREATE INDEX idx_payments_engagement_id ON public.payments(engagement_id);

-- Index pour prefinancings
CREATE INDEX idx_prefinancings_grant_id ON public.prefinancings(grant_id);

-- Index pour employee_loans
CREATE INDEX idx_employee_loans_grant_id ON public.employee_loans(grant_id);

-- Index pour users
CREATE INDEX idx_users_role_id ON public.users(role_id);
CREATE INDEX idx_users_email ON public.users(email);

=======================================================================
Script RLS et Triggers (Juste après l'exécution de la commande qui suit celle de la création des tables)
=======================================================================

-- ============================================================
-- 1. CRÉATION DE LA FONCTION DE MISE À JOUR
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- ============================================================
-- 2. APPLICATION RLS + TRIGGER POUR CHAQUE TABLE
-- ============================================================

-- Table: app_settings
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for users" ON public.app_settings FOR ALL USING (true);
CREATE TRIGGER update_app_settings_modtime BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Table: user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for users" ON public.user_roles FOR ALL USING (true);
CREATE TRIGGER update_user_roles_modtime BEFORE UPDATE ON public.user_roles FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Table: users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for users" ON public.users FOR ALL USING (true);
CREATE TRIGGER update_users_modtime BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Table: grants
ALTER TABLE public.grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for users" ON public.grants FOR ALL USING (true);
CREATE TRIGGER update_grants_modtime BEFORE UPDATE ON public.grants FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Table: bank_transactions
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for users" ON public.bank_transactions FOR ALL USING (true);
CREATE TRIGGER update_bank_transactions_modtime BEFORE UPDATE ON public.bank_transactions FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Table: budget_lines
ALTER TABLE public.budget_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for users" ON public.budget_lines FOR ALL USING (true);
CREATE TRIGGER update_budget_lines_modtime BEFORE UPDATE ON public.budget_lines FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Table: sub_budget_lines
ALTER TABLE public.sub_budget_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for users" ON public.sub_budget_lines FOR ALL USING (true);
CREATE TRIGGER update_sub_budget_lines_modtime BEFORE UPDATE ON public.sub_budget_lines FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Table: engagements
ALTER TABLE public.engagements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for users" ON public.engagements FOR ALL USING (true);
CREATE TRIGGER update_engagements_modtime BEFORE UPDATE ON public.engagements FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Table: payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for users" ON public.payments FOR ALL USING (true);
CREATE TRIGGER update_payments_modtime BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Table: prefinancings
ALTER TABLE public.prefinancings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for users" ON public.prefinancings FOR ALL USING (true);
CREATE TRIGGER update_prefinancings_modtime BEFORE UPDATE ON public.prefinancings FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Table: employee_loans
ALTER TABLE public.employee_loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for users" ON public.employee_loans FOR ALL USING (true);
CREATE TRIGGER update_employee_loans_modtime BEFORE UPDATE ON public.employee_loans FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();


=================================================================================
### Insertion du Rôle Administrateur (Accès Total)
=================================================================================

INSERT INTO public.user_roles (name, code, description, color, permissions)
VALUES (
  'Administrateur',
  'ADMIN',
  'Accès complet à toutes les fonctionnalités du système',
  '#0F172A',
  '[
    {"module": "dashboard", "actions": ["view"]},
    {"module": "grants", "actions": ["view", "create", "edit", "delete"]},
    {"module": "budget_planning", "actions": ["view", "create", "edit", "delete", "export"]},
    {"module": "tracking", "actions": ["view", "create", "edit", "delete", "export"]},
    {"module": "engagements", "actions": ["view", "create", "edit", "delete", "sign"]},
    {"module": "payments", "actions": ["view", "create", "edit", "delete", "sign"]},
    {"module": "treasury", "actions": ["view", "create", "edit", "delete", "export"]},
    {"module": "prefinancing", "actions": ["view", "create", "edit", "delete", "sign"]},
    {"module": "employee_loans", "actions": ["view", "create", "edit", "delete", "sign"]},
    {"module": "reports", "actions": ["view", "create", "export"]},
    {"module": "users", "actions": ["view", "create", "edit", "delete"]},
    {"module": "globalConfig", "actions": ["view", "create", "edit", "delete"]},
    {"module": "profile", "actions": ["view", "edit"]},
    {"module": "bank_accounts", "actions": ["view", "create", "edit", "delete"]},
    {"module": "bank_transactions", "actions": ["view", "create", "edit", "delete", "export"]}
  ]'::jsonb
);



=========================================FIN PRECONFIGURATION==============================================





### Sécurité des Données (RLS)

Chaque table implémente Row Level Security avec des politiques spécifiques :

```sql
-- Exemple pour la table users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Politique : Les utilisateurs peuvent lire leurs propres données
CREATE POLICY "Users can read own data"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Politique : Le service role peut tout gérer
CREATE POLICY "Service role can manage all users"
  ON users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

### Triggers et Fonctions

#### Mise à jour automatique des montants

```sql
-- Fonction pour recalculer les montants engagés
CREATE OR REPLACE FUNCTION update_budget_amounts()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculer les montants de la sous-ligne budgétaire
  UPDATE sub_budget_lines 
  SET 
    engaged_amount = (
      SELECT COALESCE(SUM(amount), 0) 
      FROM engagements 
      WHERE sub_budget_line_id = NEW.sub_budget_line_id 
        AND status IN ('approved', 'paid')
    ),
    available_amount = notified_amount - engaged_amount
  WHERE id = NEW.sub_budget_line_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger sur les engagements
CREATE TRIGGER update_amounts_on_engagement
  AFTER INSERT OR UPDATE OR DELETE ON engagements
  FOR EACH ROW
  EXECUTE FUNCTION update_budget_amounts();
```

---

## Authentification et Sécurité

### Architecture d'Authentification

```typescript
// Flow d'authentification
1. Connexion utilisateur → Supabase Auth
2. Génération JWT token → Stockage sécurisé
3. Validation token → Chaque requête API
4. Chargement profil → Base de données users
5. Application permissions → Contrôle d'accès
```

### Gestion des Sessions

```typescript
// Configuration Supabase Auth
const supabase = createClient(url, key, {
  auth: {
    autoRefreshToken: true,    // Renouvellement automatique
    persistSession: true,      // Persistance entre sessions
    detectSessionInUrl: true   // Détection liens email
  }
});
```

### Politiques de Sécurité

1. **Authentification obligatoire** : Toutes les routes protégées
2. **Autorisation granulaire** : Permissions par module et action
3. **Validation côté serveur** : RLS PostgreSQL
4. **Chiffrement** : HTTPS obligatoire
5. **Audit trail** : Traçabilité complète des actions

---

## Structure du Code

### Organisation des Fichiers

```
src/
├── components/           # Composants React
│   ├── Dashboard.tsx    # Tableau de bord
│   ├── GrantManager.tsx # Gestion subventions
│   ├── BudgetPlanning.tsx
│   ├── BudgetTracking.tsx
│   ├── EngagementManager.tsx
│   ├── PaymentManager.tsx
│   ├── TreasuryManager.tsx
│   ├── UserManager.tsx
│   └── ...
├── hooks/               # Hooks React personnalisés
│   └── useAuth.ts      # Gestion authentification
├── lib/                # Configuration et utilitaires
│   ├── supabase.ts     # Client Supabase
│   └── database.types.ts # Types TypeScript générés
├── services/           # Services API
│   └── supabaseService.ts # Abstraction Supabase
├── types/              # Définitions TypeScript
│   ├── index.ts        # Types métier
│   └── user.ts         # Types utilisateurs
├── utils/              # Utilitaires
│   ├── alerts.ts       # Gestion des alertes
│   ├── storage.ts      # Persistance locale
│   └── print.ts        # Utilitaires impression
└── App.tsx             # Composant principal
```

### Patterns de Développement

#### 1. Composants Fonctionnels avec Hooks

```typescript
const GrantManager: React.FC<GrantManagerProps> = ({
  grants,
  onAddGrant,
  onUpdateGrant,
  onDeleteGrant
}) => {
  const [showForm, setShowForm] = useState(false);
  const [editingGrant, setEditingGrant] = useState<Grant | null>(null);
  
  // Logique du composant...
  
  return (
    // JSX du composant...
  );
};
```

#### 2. Services avec Gestion d'Erreurs

```typescript
export const grantsService = {
  async create(grant: Omit<Grant, 'id'>): Promise<Grant> {
    try {
      const { data, error } = await supabase
        .from('grants')
        .insert(transformToDatabase(grant))
        .select()
        .single();

      if (error) throw error;
      return transformFromDatabase(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  }
};
```

#### 3. Hooks Personnalisés

```typescript
export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Initialisation et écoute des changements d'auth
  }, []);
  
  return { user, loading, signIn, signOut, hasPermission };
};
```

---

## Services et API

### Architecture des Services

Les services encapsulent toute la logique d'accès aux données :

```typescript
// Structure type d'un service
interface ServiceInterface<T> {
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | null>;
  create(item: Omit<T, 'id'>): Promise<T>;
  update(id: string, updates: Partial<T>): Promise<void>;
  delete(id: string): Promise<void>;
}
```

### Transformation des Données

```typescript
// Transformation base de données ↔ application
const transformFromDatabase = (dbData: any): Grant => ({
  id: dbData.id,
  name: dbData.name,
  reference: dbData.reference,
  grantingOrganization: dbData.granting_organization, // snake_case → camelCase
  totalAmount: dbData.total_amount,
  // ...
});

const transformToDatabase = (appData: Grant): any => ({
  name: appData.name,
  reference: appData.reference,
  granting_organization: appData.grantingOrganization, // camelCase → snake_case
  total_amount: appData.totalAmount,
  // ...
});
```

### Gestion des Erreurs

```typescript
export const handleSupabaseError = (error: any) => {
  console.error('Supabase error:', error);
  
  // Gestion spécifique des erreurs de contrainte
  if (error.code === '23505') {
    const constraint = error.details?.constraint;
    switch (constraint) {
      case 'users_email_key':
        throw new Error('Cet email est déjà utilisé');
      case 'grants_reference_key':
        throw new Error('Cette référence existe déjà');
      default:
        throw new Error('Une valeur en double existe déjà');
    }
  }
  
  // Autres codes d'erreur PostgreSQL
  if (error.code === '42501') throw new Error('Permission refusée');
  if (error.code === '42P01') throw new Error('Table non trouvée');
  
  throw error;
};
```

---

## Gestion d'État

### État Local avec useState

```typescript
// État des formulaires
const [formData, setFormData] = useState({
  name: '',
  amount: '',
  description: ''
});

// État des modales
const [showModal, setShowModal] = useState(false);
const [editingItem, setEditingItem] = useState<Item | null>(null);
```

### État Global avec Context (si nécessaire)

```typescript
// Contexte d'authentification
const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const authState = useAuth();
  
  return (
    <AuthContext.Provider value={authState}>
      {children}
    </AuthContext.Provider>
  );
};
```

### Synchronisation avec Supabase

```typescript
// Écoute des changements en temps réel
useEffect(() => {
  const subscription = supabase
    .channel('budget_changes')
    .on('postgres_changes', 
      { event: '*', schema: 'public', table: 'engagements' },
      (payload) => {
        // Mettre à jour l'état local
        handleRealtimeUpdate(payload);
      }
    )
    .subscribe();

  return () => subscription.unsubscribe();
}, []);
```

---

## Interface Utilisateur

### Système de Design

#### Couleurs

```css
/* Palette principale */
--blue-600: #2563eb;      /* Actions principales */
--purple-600: #9333ea;    /* Actions secondaires */
--green-600: #16a34a;     /* Succès/validation */
--orange-600: #ea580c;    /* Alertes */
--red-600: #dc2626;       /* Erreurs/suppression */
--gray-600: #4b5563;      /* Texte secondaire */
```

#### Composants Réutilisables

```typescript
// Bouton avec gradient
const GradientButton: React.FC<ButtonProps> = ({ children, variant, ...props }) => (
  <button
    className={`
      bg-gradient-to-r font-medium px-4 py-2 rounded-xl
      hover:shadow-lg transform hover:scale-[1.02] 
      transition-all duration-200 flex items-center space-x-2
      ${variant === 'primary' ? 'from-blue-600 to-purple-600 text-white' : ''}
      ${variant === 'success' ? 'from-green-600 to-blue-600 text-white' : ''}
    `}
    {...props}
  >
    {children}
  </button>
);
```

#### Responsive Design

```typescript
// Breakpoints Tailwind utilisés
sm: '640px'   // Mobile large
md: '768px'   // Tablette
lg: '1024px'  // Desktop
xl: '1280px'  // Large desktop

// Exemple d'utilisation
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
  {/* Contenu responsive */}
</div>
```

### Gestion des Formulaires

```typescript
// Pattern de formulaire standard
const FormComponent: React.FC = () => {
  const [formData, setFormData] = useState(initialState);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.name) newErrors.name = 'Le nom est obligatoire';
    if (!formData.amount || formData.amount <= 0) {
      newErrors.amount = 'Le montant doit être positif';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    
    try {
      await service.create(formData);
      showSuccess('Élément créé avec succès');
      resetForm();
    } catch (error) {
      showError('Erreur lors de la création');
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      {/* Champs du formulaire */}
    </form>
  );
};
```

---

## Déploiement

### Configuration de Production

#### Variables d'Environnement

```bash
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Application
VITE_APP_NAME=BudgetBase
VITE_APP_VERSION=1.0.0
```

#### Build de Production

```bash
# Installation des dépendances
npm install

# Build optimisé
npm run build

# Aperçu local du build
npm run preview
```

### Optimisations de Performance

#### Code Splitting

```typescript
// Lazy loading des composants
const GrantManager = lazy(() => import('./components/GrantManager'));
const PaymentManager = lazy(() => import('./components/PaymentManager'));

// Utilisation avec Suspense
<Suspense fallback={<LoadingSpinner />}>
  <GrantManager />
</Suspense>
```

#### Optimisation des Requêtes

```typescript
// Sélection spécifique des colonnes
const { data } = await supabase
  .from('grants')
  .select('id, name, reference, total_amount') // Seulement les colonnes nécessaires
  .eq('status', 'active');

// Pagination pour les grandes listes
const { data } = await supabase
  .from('engagements')
  .select('*')
  .range(0, 49) // 50 premiers éléments
  .order('created_at', { ascending: false });
```

### Monitoring et Logs

```typescript
// Logging structuré
const logger = {
  info: (message: string, data?: any) => {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, data);
  },
  error: (message: string, error?: any) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error);
    // Envoi vers service de monitoring en production
  }
};
```

---

## Maintenance et Monitoring

### Migrations de Base de Données

```sql
-- Structure des migrations Supabase
-- Fichier: supabase/migrations/YYYYMMDD_description.sql

/*
  # Description de la migration
  
  1. Nouvelles tables
     - table_name: description
  
  2. Modifications
     - Ajout de colonnes
     - Modification de contraintes
  
  3. Sécurité
     - Nouvelles politiques RLS
*/

-- SQL de la migration
CREATE TABLE IF NOT EXISTS new_table (...);
ALTER TABLE existing_table ADD COLUMN IF NOT EXISTS new_column TEXT;
```

### Sauvegarde et Récupération

```bash
# Sauvegarde automatique Supabase
# - Sauvegardes quotidiennes automatiques
# - Rétention de 7 jours pour le plan gratuit
# - Point-in-time recovery disponible

# Sauvegarde manuelle
pg_dump "postgresql://..." > backup_$(date +%Y%m%d).sql
```

### Monitoring des Performances

```typescript
// Métriques à surveiller
interface PerformanceMetrics {
  responseTime: number;        // Temps de réponse API
  errorRate: number;          // Taux d'erreur
  activeUsers: number;        // Utilisateurs actifs
  databaseConnections: number; // Connexions DB
  memoryUsage: number;        // Utilisation mémoire
}

// Alertes automatiques
const alerts = {
  responseTime: { threshold: 2000, action: 'notify_admin' },
  errorRate: { threshold: 5, action: 'escalate' },
  databaseConnections: { threshold: 80, action: 'scale_up' }
};
```

### Mise à Jour et Versioning

```json
// package.json - Gestion des versions
{
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "type-check": "tsc --noEmit",
    "lint": "eslint src --ext .ts,.tsx",
    "test": "vitest"
  }
}
```

---

## Sécurité et Conformité

### Chiffrement des Données

- **En transit** : HTTPS/TLS 1.3
- **Au repos** : Chiffrement AES-256 (Supabase)
- **Mots de passe** : Hachage bcrypt avec salt

### Audit et Conformité

```sql
-- Table d'audit automatique
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL, -- INSERT, UPDATE, DELETE
  old_values JSONB,
  new_values JSONB,
  user_id UUID,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger d'audit
CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (table_name, operation, old_values, new_values, user_id)
  VALUES (TG_TABLE_NAME, TG_OP, to_jsonb(OLD), to_jsonb(NEW), auth.uid());
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
```

### Protection contre les Attaques

1. **SQL Injection** : Requêtes paramétrées (Supabase)
2. **XSS** : Échappement automatique React
3. **CSRF** : Tokens JWT avec expiration
4. **Rate Limiting** : Limitation des requêtes par utilisateur
5. **Validation** : Côté client et serveur

---

## Tests et Qualité

### Tests Unitaires

```typescript
// Exemple de test avec Vitest
import { describe, it, expect, vi } from 'vitest';
import { grantsService } from '../services/supabaseService';

describe('grantsService', () => {
  it('should create a grant successfully', async () => {
    const mockGrant = {
      name: 'Test Grant',
      reference: 'TEST-2024-001',
      totalAmount: 100000,
      currency: 'EUR' as const
    };
    
    const result = await grantsService.create(mockGrant);
    expect(result.id).toBeDefined();
    expect(result.name).toBe(mockGrant.name);
  });
});
```

### Tests d'Intégration

```typescript
// Test de bout en bout
describe('Budget Planning Flow', () => {
  it('should create budget line and sub-lines', async () => {
    // 1. Créer une subvention
    const grant = await grantsService.create(mockGrant);
    
    // 2. Créer une ligne budgétaire
    const budgetLine = await budgetLinesService.create({
      grantId: grant.id,
      code: 'TEST-PERS',
      name: 'Personnel Test',
      plannedAmount: 50000
    });
    
    // 3. Créer une sous-ligne
    const subBudgetLine = await subBudgetLinesService.create({
      grantId: grant.id,
      budgetLineId: budgetLine.id,
      code: 'TEST-PERS-001',
      name: 'Développeur',
      plannedAmount: 25000
    });
    
    expect(subBudgetLine.budgetLineId).toBe(budgetLine.id);
  });
});
```

### Qualité du Code

```typescript
// Configuration ESLint
export default {
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended'
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    'prefer-const': 'error'
  }
};
```

---

## Performance et Optimisation

### Optimisations Frontend

```typescript
// Mémorisation des composants coûteux
const ExpensiveComponent = React.memo(({ data }) => {
  return <ComplexVisualization data={data} />;
});

// Optimisation des re-rendus
const useOptimizedState = (initialValue: any[]) => {
  const [state, setState] = useState(initialValue);
  
  const updateState = useCallback((newValue: any[]) => {
    setState(prev => {
      if (JSON.stringify(prev) === JSON.stringify(newValue)) {
        return prev; // Éviter les re-rendus inutiles
      }
      return newValue;
    });
  }, []);
  
  return [state, updateState];
};
```

### Optimisations Base de Données

```sql
-- Index pour les requêtes fréquentes
CREATE INDEX idx_engagements_grant_id ON engagements(grant_id);
CREATE INDEX idx_engagements_status ON engagements(status);
CREATE INDEX idx_payments_engagement_id ON payments(engagement_id);

-- Index composites pour les requêtes complexes
CREATE INDEX idx_sub_budget_lines_grant_budget 
  ON sub_budget_lines(grant_id, budget_line_id);
```

---

## Évolutions Futures

### Roadmap Technique

**Version 1.1**
- Notifications en temps réel (WebSockets)
- Export Excel natif
- API REST publique

**Version 1.2**
- Application mobile (React Native)
- Synchronisation hors ligne
- Workflow avancé

**Version 2.0**
- Intelligence artificielle (prédictions budgétaires)
- Intégrations ERP
- Multi-tenant

### Extensibilité

```typescript
// Plugin system pour extensions
interface BudgetBasePlugin {
  name: string;
  version: string;
  initialize: (app: BudgetBaseApp) => void;
  routes?: Route[];
  components?: ComponentMap;
}

// Enregistrement de plugins
const registerPlugin = (plugin: BudgetBasePlugin) => {
  plugins.set(plugin.name, plugin);
  plugin.initialize(app);
};
```

---

## Annexes Techniques

### Configuration Supabase

```sql
-- Configuration RLS globale
ALTER DATABASE postgres SET row_security = on;

-- Fonctions utilitaires
CREATE OR REPLACE FUNCTION auth.uid() 
RETURNS UUID AS $$
  SELECT auth.jwt() ->> 'sub'::UUID;
$$ LANGUAGE sql STABLE;
```

### Scripts de Déploiement

```bash
#!/bin/bash
# deploy.sh

echo "🚀 Déploiement BudgetBase"

# Vérifications pré-déploiement
npm run type-check
npm run lint
npm run test

# Build de production
npm run build

# Déploiement
echo "📦 Upload des fichiers..."
# Commandes de déploiement spécifiques à votre hébergeur

echo "✅ Déploiement terminé"
```

### Monitoring et Alertes

```typescript
// Configuration monitoring
const monitoring = {
  performance: {
    threshold: 2000, // ms
    action: 'log_slow_query'
  },
  errors: {
    threshold: 10, // erreurs/minute
    action: 'notify_admin'
  },
  users: {
    concurrent_limit: 100,
    action: 'scale_resources'
  }
};
```

---

*Cette documentation technique est maintenue à jour avec chaque version. Dernière mise à jour : Version 1.0 - Janvier 2025*