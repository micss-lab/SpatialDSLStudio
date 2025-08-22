import React from 'react';
import { Button, Tooltip } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { transformationService } from '../../services/transformation.service';

type RuleDownloadButtonProps = {
  ruleId?: string;
  tooltip?: string;
  variant?: 'text' | 'outlined' | 'contained';
  color?: 'primary' | 'secondary' | 'success' | 'error' | 'info' | 'warning';
  size?: 'small' | 'medium' | 'large';
  label?: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

const RuleDownloadButton: React.FC<RuleDownloadButtonProps> = ({
  ruleId,
  tooltip = 'Download rule as JSON',
  variant = 'contained',
  color = 'primary',
  size = 'small',
  label = 'Download JSON',
  onClick,
}) => {
  const handleDownload = (event: React.MouseEvent<HTMLButtonElement>) => {
    // If a custom onClick handler is provided, call it first
    if (onClick) {
      onClick(event);
    }
    
    if (ruleId) {
      // Download specific rule
      const success = transformationService.downloadRuleAsJsonFile(ruleId);
      if (!success) {
        console.error(`Failed to download rule ${ruleId}`);
      }
    } else {
      // Download all rules
      const success = transformationService.downloadAllRulesAsJsonFile();
      if (!success) {
        console.error('Failed to download all rules');
      }
    }
  };

  return (
    <Tooltip title={tooltip}>
      <Button
        variant={variant}
        color={color}
        size={size}
        startIcon={<DownloadIcon />}
        onClick={handleDownload}
      >
        {label}
      </Button>
    </Tooltip>
  );
};

export default RuleDownloadButton; 