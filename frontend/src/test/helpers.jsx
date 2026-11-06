import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { AuthContext } from '../context/AuthContext';
import { SubscriptionProvider } from '../context/SubscriptionContext';
import * as apiModule from '../api';

export const sub = (over = {}) => ({
  planCode: 'PRO', planName: 'Pro', status: 'ACTIVE', billingCycle: 'MONTHLY', complimentary: false,
  trialEndsAt: null, trialDaysLeft: null, currentPeriodEnd: null, graceEndsAt: null,
  readOnly: false, blocked: false, features: ['REPORTS', 'PREDICTIONS'], maxUsers: 5, maxProducts: 3000,
  usage: { users: 2, products: 40 }, ...over,
});

/** Renderiza con sesión y con el plan de la empresa simulado. */
export function renderWithPlan(ui, { subscription = sub(), role = 'ADMIN', route = '/' } = {}) {
  vi.spyOn(apiModule.API.billing, 'subscription').mockResolvedValue(subscription);
  const user = { id: 1, username: 'ana', email: 'ana@empresa.com', role, organizationId: 1 };
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthContext.Provider value={{ user, isAdmin: () => role === 'ADMIN', isLoggedIn: () => true, login: vi.fn(), logout: vi.fn() }}>
        <SubscriptionProvider>{ui}</SubscriptionProvider>
      </AuthContext.Provider>
    </MemoryRouter>
  );
}
