import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { ResourceOwnership, resolveOwnerEmail } from '../services/common/ownership';

interface OwnerFilterContextValue {
  /** Owner emails to restrict listings to. Empty means "show all". */
  selectedOwnerEmails: string[];
  setSelectedOwnerEmails: (emails: string[]) => void;
}

// Defaults to "no filter" so components (and tests) work without a provider.
const OwnerFilterContext = createContext<OwnerFilterContextValue>({
  selectedOwnerEmails: [],
  setSelectedOwnerEmails: () => {},
});

export const OwnerFilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedOwnerEmails, setSelectedOwnerEmails] = useState<string[]>([]);
  const value = useMemo(
    () => ({ selectedOwnerEmails, setSelectedOwnerEmails }),
    [selectedOwnerEmails]
  );
  return <OwnerFilterContext.Provider value={value}>{children}</OwnerFilterContext.Provider>;
};

export const useOwnerFilter = (): OwnerFilterContextValue => useContext(OwnerFilterContext);

/**
 * Predicate that keeps only resources owned by the selected owners. When no
 * owner is selected it keeps everything, so non-admin users are unaffected.
 */
export const useOwnerFilterMatcher = (): ((resource: ResourceOwnership) => boolean) => {
  const { selectedOwnerEmails } = useOwnerFilter();
  const { user } = useAuth();
  return useCallback(
    (resource: ResourceOwnership) => {
      if (selectedOwnerEmails.length === 0) return true;
      const email = resolveOwnerEmail(resource, user?.email);
      return email !== undefined && selectedOwnerEmails.includes(email);
    },
    [selectedOwnerEmails, user?.email]
  );
};
