// Créez un nouveau fichier src/hooks/useAvailableEngagementsNotification.ts
import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';

export const useAvailableEngagementsNotification = (
  availableEngagementsCount: number
) => {
  const { userProfile } = useAuth();
  const [showNotification, setShowNotification] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);

  useEffect(() => {
    if (userProfile) {
      const userProfession = userProfile.profession || '';
      const isComptable = userProfession === 'Comptable';
      
      if (isComptable && availableEngagementsCount > 0) {
        setShowNotification(true);
        setNotificationCount(availableEngagementsCount);
      } else {
        setShowNotification(false);
        setNotificationCount(0);
      }
    }
  }, [userProfile, availableEngagementsCount]);

  return {
    showNotification,
    notificationCount,
    isComptable: userProfile?.profession === 'Comptable'
  };
};