import React, { useState, useEffect } from 'react';
import { LogIn, Eye, EyeOff, Mail, Target, Shield, Loader2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { ResetPasswordForm } from './ResetPasswordForm';
import SignupForm from './SignupForm';
import { supabase } from '../lib/supabase';

const LoginForm: React.FC = () => {
  const { signIn, loading, error } = useAuth();
  const [showSignup, setShowSignup] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasExistingUsers, setHasExistingUsers] = useState(false);
  const [checkingUsers, setCheckingUsers] = useState(true);

  // Vérifier si nous sommes sur une page de réinitialisation de mot de passe
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      const type = params.get('type');
      if (type === 'recovery') {
        setShowResetPassword(true);
      }
    }
  }, []);

  // Vérifier si des utilisateurs existent déjà
  useEffect(() => {
    const checkExistingUsers = async () => {
      try {
        const { count, error } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true });
        
        if (!error && count && count > 0) {
          setHasExistingUsers(true);
        }
      } catch (err) {
        console.error('Erreur lors de la vérification des utilisateurs:', err);
      } finally {
        setCheckingUsers(false);
      }
    };

    checkExistingUsers();
  }, []);

  if (showForgotPassword) {
    return <ForgotPasswordForm onBack={() => setShowForgotPassword(false)} />;
  }

  if (showResetPassword) {
    return <ResetPasswordForm onBackToLogin={() => {
      setShowResetPassword(false);
      // Nettoyer l'URL
      window.location.hash = '';
    }} />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const result = await signIn(formData.email, formData.password);
      if (!result?.success) {
        // L'erreur est gérée par le hook useAuth
      }
    } catch (err) {
      console.error('Login error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (showSignup) {
    return <SignupForm onBackToLogin={() => setShowSignup(false)} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-md p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl mx-auto mb-4">
            <Target className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Budget Base</h1>
          <p className="text-gray-600">Connexion à votre espace de gestion</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center space-x-2">
                <Shield className="w-5 h-5 text-red-600" />
                <span className="text-sm text-red-700">{error}</span>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Adresse email
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

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Mot de passe
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                value={formData.password}
                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-12 transition-colors"
                placeholder="Votre mot de passe"
                required
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

          <button
            type="submit"
            disabled={isSubmitting || loading}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-xl font-medium hover:shadow-lg transform hover:scale-[1.02] transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            {isSubmitting || loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Connexion...</span>
              </>
            ) : (
              <>
                <LogIn className="w-5 h-5" />
                <span>Se connecter</span>
              </>
            )}
          </button>

          {/* <button
            type="button"
            onClick={() => setShowForgotPassword(true)}
            className="w-full text-blue-600 hover:text-blue-700 transition-colors flex items-center justify-center gap-2"
          >
            <Mail className="w-4 h-4" />
            Mot de passe oublié ?
          </button> */}
        </form>

        {/* Signup Link - Seulement affiché s'il n'y a pas d'utilisateurs existants */}
        {!hasExistingUsers && !checkingUsers && (
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Pas encore de compte ?{' '}
              <button
                onClick={() => setShowSignup(true)}
                className="text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                Créer un compte administrateur
              </button>
            </p>
          </div>
        )}

        
      </div>
    </div>
  );
};

export default LoginForm;