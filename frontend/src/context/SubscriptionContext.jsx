import { useCallback, useEffect, useMemo, useState } from 'react';
import { API } from '../api';
import { useAuth } from './AuthContext';
import { SubscriptionContext } from './subscriptionState';
import { isPlatformRole } from '../platformRoles';

/**
 * SubscriptionProvider — Plan y estado de la empresa del usuario (GET /api/billing/subscription).
 * La interfaz lo usa para mostrar avisos y candados, pero NO es la protección: el backend aplica
 * el plan en cada petición (402 si no corresponde).
 */
export function SubscriptionProvider({ children }) {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const isCompanyUser = !!user && !isPlatformRole(user.role);

  const reload = useCallback(async () => {
    try {
      setSubscription(await API.billing.subscription());
    } catch {
      setSubscription(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (isCompanyUser) reload();
  }, [isCompanyUser, reload]);

  const value = useMemo(() => ({
    subscription,
    loading: isCompanyUser && !loaded,
    reload,
    // Mientras no se sabe el plan no se bloquea nada: el backend decide igualmente
    hasFeature: (feature) => !subscription || subscription.features.includes(feature),
    readOnly: !!subscription?.readOnly,
    blocked: !!subscription?.blocked,
  }), [subscription, isCompanyUser, loaded, reload]);

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}
