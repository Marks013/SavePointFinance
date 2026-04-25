export type BillingFeatureFlags = {
  whatsappAssistant: boolean;
  automation: boolean;
  pdfExport: boolean;
};

export type BillingLimits = {
  users: number | null;
  accounts: number | null;
  cards: number | null;
};

export type BillingProfileSnapshot = {
  role: "admin" | "member";
  isPlatformAdmin: boolean;
  sharing?: {
    canManage?: boolean;
  };
  tenant?: {
    name?: string;
  };
  license: {
    plan: string;
    planLabel: string;
    status: string;
    statusLabel: string;
    features: BillingFeatureFlags;
    limits: BillingLimits;
  };
};

export type BillingOverview = {
  plan: {
    name: string;
    code: string;
    status: string;
    statusLabel: string;
    features: BillingFeatureFlags;
    limits: BillingLimits;
  };
  subscription: {
    provider: string | null;
    status: string;
    statusLabel: string;
    subscribed: boolean;
    cancelAtPeriodEnd: boolean;
    canceledAt: string | null;
    currentPeriodEnd: string | null;
    trialEndsAt: string | null;
    checkoutUrl: string | null;
    portalUrl: string | null;
    canCheckout: boolean;
    canManage: boolean;
    canCancel: boolean;
    canUpdateCard: boolean;
  };
  permissions: {
    canManageBilling: boolean;
    isAccountAdmin: boolean;
    isPlatformAdmin: boolean;
  };
};

export type BillingActionResponse = {
  url?: string | null;
  message?: string;
  billing?: Partial<BillingOverview>;
};
