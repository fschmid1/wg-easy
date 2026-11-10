export type PortalUser = {
  id: number;
  username: string;
  name: string;
  email: string | null;
};

export type GrantState = 'issued' | 'delivered' | 'connected';

export type GrantSummary = {
  id: number;
  name: string;
  state: GrantState;
  ipv4Address: string;
  ipv6Address: string | null;
  createdAt: string;
  /** Milliseconds since the Unix epoch. */
  downloadDeadline: number;
  /** Milliseconds since the Unix epoch. */
  connectDeadline: number;
  /** Milliseconds since the Unix epoch. */
  expiresAt: number;
  revealed: boolean;
  connected: boolean;
  currentSession: boolean;
};

export type GrantListResponse = {
  user: PortalUser;
  grantsAllowed: number;
  grants: GrantSummary[];
};
