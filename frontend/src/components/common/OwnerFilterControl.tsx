import React, { useEffect, useState } from 'react';
import { Autocomplete, Box, TextField } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { useOwnerFilter } from '../../contexts/OwnerFilterContext';
import { adminService } from '../../services/core';

/**
 * Admin-only global filter that restricts every asset listing to the selected
 * owners. Renders nothing for non-admins, so it has no effect for them.
 */
const OwnerFilterControl: React.FC = () => {
  const { user } = useAuth();
  const { selectedOwnerEmails, setSelectedOwnerEmails } = useOwnerFilter();
  const [emails, setEmails] = useState<string[]>([]);
  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    adminService
      .getUsers({ pageSize: 100 })
      .then(res => {
        if (!cancelled) setEmails(res.users.map(u => u.email));
      })
      .catch(() => {
        /* If the user list can't load, the filter just stays empty (shows all). */
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  if (!isAdmin) return null;

  return (
    <Box sx={{ px: 2, py: 1 }}>
      <Autocomplete
        multiple
        size="small"
        options={emails}
        value={selectedOwnerEmails}
        onChange={(_, value) => setSelectedOwnerEmails(value)}
        limitTags={1}
        renderInput={params => (
          <TextField {...params} label="Filter by owner" placeholder="All users" />
        )}
      />
    </Box>
  );
};

export default OwnerFilterControl;
