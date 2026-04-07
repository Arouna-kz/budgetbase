import Swal from 'sweetalert2';

// Configuration par défaut pour SweetAlert2
const defaultConfig = {
  customClass: {
    popup: 'rounded-2xl shadow-2xl',
    title: 'text-xl font-bold text-gray-900',
    content: 'text-gray-600',
    confirmButton: 'bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-xl font-medium hover:shadow-lg transform hover:scale-[1.02] transition-all duration-200',
    cancelButton: 'bg-gray-100 text-gray-700 px-6 py-3 rounded-xl font-medium hover:bg-gray-200 transition-colors',
    denyButton: 'bg-red-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-red-700 transition-colors'
  },
  buttonsStyling: false,
  showClass: {
    popup: 'animate__animated animate__fadeInDown animate__faster'
  },
  hideClass: {
    popup: 'animate__animated animate__fadeOutUp animate__faster'
  }
};

// Messages de succès
export const showSuccess = (title: string, text?: string) => {
  return Swal.fire({
    ...defaultConfig,
    icon: 'success',
    title,
    text,
    timer: 3000,
    timerProgressBar: true,
    showConfirmButton: false,
    toast: true,
    position: 'top-end',
    customClass: {
      ...defaultConfig.customClass,
      popup: 'rounded-xl shadow-lg bg-white border-l-4 border-green-500'
    }
  });
};

// Messages d'erreur
export const showError = (title: string, text?: string) => {
  return Swal.fire({
    ...defaultConfig,
    icon: 'error',
    title,
    text,
    confirmButtonText: 'Compris',
    customClass: {
      ...defaultConfig.customClass,
      confirmButton: 'bg-red-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-red-700 transition-colors'
    }
  });
};

// Messages d'avertissement
export const showWarning = (title: string, text?: string) => {
  return Swal.fire({
    ...defaultConfig,
    icon: 'warning',
    title,
    text,
    confirmButtonText: 'Compris',
    customClass: {
      ...defaultConfig.customClass,
      confirmButton: 'bg-orange-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-orange-700 transition-colors'
    }
  });
};

// Messages d'information
export const showInfo = (title: string, text?: string) => {
  return Swal.fire({
    ...defaultConfig,
    icon: 'info',
    title,
    text,
    confirmButtonText: 'Compris',
    timer: 4000,
    timerProgressBar: true,
    showConfirmButton: true
  });
};

// Confirmation de suppression
export const confirmDelete = async (title: string, text?: string): Promise<boolean> => {
  try {
    const result = await Swal.fire({
      ...defaultConfig,
      icon: 'warning',
      title,
      text: text || 'Cette action est irréversible.',
      showCancelButton: true,
      confirmButtonText: 'Oui, supprimer',
      cancelButtonText: 'Annuler',
      reverseButtons: true,
      customClass: {
        ...defaultConfig.customClass,
        confirmButton: 'bg-red-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-red-700 transition-colors',
        cancelButton: 'bg-gray-100 text-gray-700 px-6 py-3 rounded-xl font-medium hover:bg-gray-200 transition-colors'
      }
    });
    
    // Debug: Vérifiez ce que retourne SweetAlert2
    console.log("SweetAlert2 result:", result);
    console.log("isConfirmed:", result?.isConfirmed);
    console.log("value:", result?.value);
    
    // Retourner explicitement true/false
    return result?.isConfirmed === true;
  } catch (error) {
    console.error("Error in confirmDelete:", error);
    return false;
  }
};

// Confirmation générale
export const confirmAction = (title: string, text?: string, confirmText: string = 'Confirmer') => {
  return Swal.fire({
    ...defaultConfig,
    icon: 'question',
    title,
    text,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: 'Annuler',
    reverseButtons: true
  });
};

// Validation de formulaire
export const showValidationError = (title: string, text?: string) => {
  return Swal.fire({
    ...defaultConfig,
    icon: 'error',
    title,
    text,
    confirmButtonText: 'Corriger',
    customClass: {
      ...defaultConfig.customClass,
      confirmButton: 'bg-blue-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-blue-700 transition-colors'
    }
  });
};

// Toast de notification rapide
export const showToast = (title: string, icon: 'success' | 'error' | 'warning' | 'info' = 'info') => {
  return Swal.fire({
    toast: true,
    position: 'top-end',
    icon,
    title,
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    customClass: {
      popup: 'rounded-xl shadow-lg bg-white',
      title: 'text-sm font-medium'
    }
  });
};

// Chargement avec progression
export const showLoading = (title: string = 'Chargement...') => {
  return Swal.fire({
    title,
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    customClass: {
      popup: 'rounded-2xl shadow-2xl',
      title: 'text-lg font-medium text-gray-900'
    },
    didOpen: () => {
      Swal.showLoading();
    }
  });
};

// Fermer le chargement
export const closeLoading = () => {
  Swal.close();
};