import { createContext, useContext } from 'react';

/** Contexto y hook del plan de la empresa (el proveedor vive en SubscriptionContext.jsx). */
export const SubscriptionContext = createContext({
  subscription: null,
  loading: false,
  reload: () => {},
  hasFeature: () => true,
  readOnly: false,
  blocked: false,
});

export const useSubscription = () => useContext(SubscriptionContext);
