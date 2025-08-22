import React, { useState } from 'react';
import { 
  Button, 
  Box, 
  Typography, 
  Alert,
  CircularProgress
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { transformationService } from '../../services/transformation.service';

interface RuleFileUploaderProps {
  onRulesImported: () => void;
}

const RuleFileUploader: React.FC<RuleFileUploaderProps> = ({ onRulesImported }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const json = e.target?.result as string;
        if (!json) throw new Error('Failed to read file');
        
        // Import the rules
        const result = transformationService.importRulesFromJson(json);
        
        if (result.success) {
          setSuccess(`Successfully imported ${result.rulesImported} rule(s)`);
          // Call the callback to refresh rule lists in parent component
          onRulesImported();
        } else {
          setError(result.error || 'Failed to import rules');
        }
      } catch (err) {
        setError(`Error parsing file: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLoading(false);
      }
    };

    reader.onerror = () => {
      setLoading(false);
      setError('Failed to read file');
    };

    reader.readAsText(file);
  };

  return (
    <Box>
      <Box display="flex" alignItems="center">
        <Button
          variant="outlined"
          component="label"
          startIcon={<UploadFileIcon />}
          disabled={loading}
        >
          Upload Rules
          <input
            type="file"
            accept=".json"
            hidden
            onChange={handleFileUpload}
          />
        </Button>
        {loading && (
          <Box ml={2}>
            <CircularProgress size={24} />
          </Box>
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mt: 2 }}>
          {success}
        </Alert>
      )}
    </Box>
  );
};

export default RuleFileUploader; 