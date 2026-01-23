import React, { useState } from 'react';
import { UserPlus, Eye, EyeOff, Target, Shield, Loader2, ArrowLeft } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface SignupFormProps {
  onBackToLogin: () => void;
}

const SignupForm: React.FC<SignupFormProps> = ({ onBackToLogin }) => {
  const { signUp, loading, error } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    profession: '',
    employeeId: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      return;
    }

    if (formData.password.length < 6) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Créer le compte avec le rôle administrateur par défaut
      const result = await signUp(formData.email, formData.password, {
        firstName: formData.firstName,
        lastName: formData.lastName,
        profession: formData.profession,
        employeeId: formData.employeeId
      });

      if (result.success) {
        // L'utilisateur sera automatiquement connecté après l'inscription
      }
    } catch (err) {
      console.error('Signup error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-md p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl mx-auto mb-4">
            <Target className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">BudgetBase</h1>
          <p className="text-gray-600">Créer votre compte administrateur</p>
        </div>

        {/* Back to Login */}
        <button
          onClick={onBackToLogin}
          className="flex items-center space-x-2 text-blue-600 hover:text-blue-800 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Retour à la connexion</span>
        </button>

        {/* Signup Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center space-x-2">
                <Shield className="w-5 h-5 text-red-600" />
                <span className="text-sm text-red-700">{error}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-2">
                Prénom *
              </label>
              <input
                type="text"
                id="firstName"
                value={formData.firstName}
                onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                placeholder="Votre prénom"
                required
                disabled={isSubmitting || loading}
              />
            </div>

            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-2">
                Nom *
              </label>
              <input
                type="text"
                id="lastName"
                value={formData.lastName}
                onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                placeholder="Votre nom"
                required
                disabled={isSubmitting || loading}
              />
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Adresse email *
            </label>
            <input
              type="email"
              id="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              placeholder="votre.email@entreprise.com"
              required
              disabled={isSubmitting || loading}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="profession" className="block text-sm font-medium text-gray-700 mb-2">
                Fonction
              </label>
              <input
                type="text"
                id="profession"
                value={formData.profession}
                onChange={(e) => setFormData(prev => ({ ...prev, profession: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                placeholder="Ex: Directeur Financier"
                disabled={isSubmitting || loading}
              />
            </div>

            <div>
              <label htmlFor="employeeId" className="block text-sm font-medium text-gray-700 mb-2">
                Matricule employé
              </label>
              <input
                type="text"
                id="employeeId"
                value={formData.employeeId}
                onChange={(e) => setFormData(prev => ({ ...prev, employeeId: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                placeholder="Ex: ADMIN-001"
                disabled={isSubmitting || loading}
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Mot de passe *
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                value={formData.password}
                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-12 transition-colors"
                placeholder="Minimum 6 caractères"
                required
                minLength={6}
                disabled={isSubmitting || loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                disabled={isSubmitting || loading}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
              Confirmer le mot de passe *
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              id="confirmPassword"
              value={formData.confirmPassword}
              onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              placeholder="Confirmer votre mot de passe"
              required
              disabled={isSubmitting || loading}
            />
            {formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword && (
              <p className="text-red-500 text-sm mt-1">Les mots de passe ne correspondent pas</p>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <Shield className="w-5 h-5 text-blue-600" />
              <span className="text-sm text-blue-700 font-medium">Compte Administrateur</span>
            </div>
            <p className="text-sm text-blue-600 mt-1">
              Ce compte aura tous les privilèges d'administration sur BudgetBase
            </p>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || loading || formData.password !== formData.confirmPassword || formData.password.length < 6}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-xl font-medium hover:shadow-lg transform hover:scale-[1.02] transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            {isSubmitting || loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Création du compte...</span>
              </>
            ) : (
              <>
                <UserPlus className="w-5 h-5" />
                <span>Créer le compte administrateur</span>
              </>
            )}
          </button>
        </form>

        {/* Info */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h4 className="text-sm font-medium text-green-800 mb-2">Premier utilisateur</h4>
            <p className="text-sm text-green-700">
              En tant que premier utilisateur, vous obtiendrez automatiquement les privilèges d'administrateur 
              pour configurer BudgetBase et créer d'autres comptes utilisateurs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignupForm;