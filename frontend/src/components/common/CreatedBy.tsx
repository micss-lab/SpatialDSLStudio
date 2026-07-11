import React from 'react';
import { Typography, TypographyProps } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { ResourceOwnership, resolveOwnerEmail } from '../../services/common/ownership';

export type { ResourceOwnership } from '../../services/common/ownership';
export { resolveOwnerEmail } from '../../services/common/ownership';

interface CreatedByProps extends ResourceOwnership {
  variant?: TypographyProps['variant'];
}

/** Inline "Created by {email}" label for an asset's properties/listing. */
const CreatedBy: React.FC<CreatedByProps> = ({ isOwner, ownerEmail, variant = 'caption' }) => {
  const { user } = useAuth();
  const email = resolveOwnerEmail({ isOwner, ownerEmail }, user?.email);
  if (!email) return null;
  const label = email === user?.email ? `${email} (you)` : email;
  return (
    <Typography
      variant={variant}
      component="span"
      color="text.secondary"
      sx={{ display: 'block' }}
      noWrap
    >
      Created by {label}
    </Typography>
  );
};

export default CreatedBy;
