import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../../services/core';

const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Invalid reset link. Please request a new password reset.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #3641f5 0%, #465fff 50%, #2a31d8 100%)',
        padding: 2,
      }}
    >
      <Card sx={{ maxWidth: 440, width: '100%', borderRadius: 3, boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)' }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Typography variant="h4" fontWeight="bold" color="primary.main">
              Reset Password
            </Typography>
          </Box>

          {success ? (
            <>
              <Alert severity="success" sx={{ mb: 3 }}>
                Your password has been reset successfully!
              </Alert>
              <Button fullWidth variant="contained" onClick={() => navigate('/')}
                sx={{
                  py: 1.5, borderRadius: 2, textTransform: 'none', fontSize: '1rem', fontWeight: 600,
                  background: 'linear-gradient(135deg, #3641f5 0%, #465fff 100%)',
                  '&:hover': { background: 'linear-gradient(135deg, #2a31d8 0%, #3641f5 100%)' },
                }}
              >
                Go to Login
              </Button>
            </>
          ) : (
            <>
              {error && (
                <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
                  {error}
                </Alert>
              )}

              {!token && (
                <Alert severity="warning" sx={{ mb: 3 }}>
                  Invalid reset link. Please request a new password reset.
                </Alert>
              )}

              <form onSubmit={handleSubmit}>
                <TextField
                  fullWidth
                  label="New Password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  margin="normal"
                  autoComplete="new-password"
                  autoFocus
                  disabled={isLoading || !token}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowPassword(!showPassword)} edge="end" disabled={isLoading}>
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />

                <TextField
                  fullWidth
                  label="Confirm New Password"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  margin="normal"
                  autoComplete="new-password"
                  disabled={isLoading || !token}
                />

                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  size="large"
                  disabled={isLoading || !token}
                  startIcon={isLoading ? <CircularProgress size={20} color="inherit" /> : null}
                  sx={{
                    mt: 3, mb: 2, py: 1.5, borderRadius: 2, textTransform: 'none',
                    fontSize: '1rem', fontWeight: 600,
                    background: 'linear-gradient(135deg, #3641f5 0%, #465fff 100%)',
                    '&:hover': { background: 'linear-gradient(135deg, #2a31d8 0%, #3641f5 100%)' },
                  }}
                >
                  {isLoading ? 'Resetting...' : 'Reset Password'}
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default ResetPasswordPage;
