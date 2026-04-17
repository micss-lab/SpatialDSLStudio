import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Link,
  InputAdornment,
  IconButton,
  Divider,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  Login as LoginIcon,
  PersonAdd as RegisterIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

type AuthMode = 'login' | 'register';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, register, error, clearError, isLoading, registrationSuccess, clearRegistrationSuccess } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Handle registration success - switch to login mode
  useEffect(() => {
    if (registrationSuccess) {
      setSuccessMessage('Account created successfully! Please sign in.');
      setMode('login');
      setPassword('');
      setConfirmPassword('');
      clearRegistrationSuccess();
    }
  }, [registrationSuccess, clearRegistrationSuccess]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalError(null);
    setSuccessMessage(null);

    // Validation
    if (!email.trim()) {
      setLocalError('Email is required');
      return;
    }

    if (!password) {
      setLocalError('Password is required');
      return;
    }

    if (mode === 'register') {
      if (password.length < 6) {
        setLocalError('Password must be at least 6 characters');
        return;
      }
      if (password !== confirmPassword) {
        setLocalError('Passwords do not match');
        return;
      }
    }

    try {
      if (mode === 'login') {
        await login(email.trim(), password);
      } else {
        await register(email.trim(), password);
      }
    } catch (err) {
      // Error is already handled in context
    }
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    clearError();
    setLocalError(null);
    setSuccessMessage(null);
    setConfirmPassword('');
  };

  const displayError = localError || error;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: 'var(--color-gray-50)',
        backgroundImage:
          'radial-gradient(1000px 420px at -12% -20%, rgba(70, 95, 255, 0.14) 0%, rgba(70, 95, 255, 0) 72%), radial-gradient(800px 360px at 110% 115%, rgba(54, 65, 245, 0.08) 0%, rgba(54, 65, 245, 0) 72%)',
        padding: 2,
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          backgroundImage:
            'linear-gradient(rgba(16, 24, 40, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(16, 24, 40, 0.03) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
          opacity: 0.35,
        },
      }}
    >
      <Card
        sx={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 440,
          width: '100%',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'grey.200',
          boxShadow: '0 14px 28px rgba(16, 24, 40, 0.12)',
        }}
      >
        <CardContent sx={{ p: 4 }}>
          {/* Title */}
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Typography variant="h4" fontWeight="bold" color="text.primary" sx={{ mb: 0.5 }}>
              {mode === 'login' ? 'Spatial DSL Studio' : 'Create your account'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {mode === 'login' ? 'Sign in to start working on your models.' : 'Use your email and password to get started.'}
            </Typography>
          </Box>

          {/* Success Alert */}
          {successMessage && (
            <Alert 
              severity="success" 
              sx={{ mb: 3 }} 
              icon={<CheckCircleIcon />}
              onClose={() => setSuccessMessage(null)}
            >
              {successMessage}
            </Alert>
          )}

          {/* Error Alert */}
          {displayError && (
            <Alert severity="error" sx={{ mb: 3 }} onClose={() => {
              clearError();
              setLocalError(null);
            }}>
              {displayError}
            </Alert>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              margin="normal"
              autoComplete="email"
              autoFocus
              disabled={isLoading}
              sx={{
                '& .MuiOutlinedInput-root': {
                  '&:hover fieldset': {
                    borderColor: 'primary.main',
                  },
                },
              }}
            />

            <TextField
              fullWidth
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              margin="normal"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              disabled={isLoading}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                      disabled={isLoading}
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            {mode === 'register' && (
              <TextField
                fullWidth
                label="Confirm Password"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                margin="normal"
                autoComplete="new-password"
                disabled={isLoading}
              />
            )}

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={isLoading}
              startIcon={isLoading ? <CircularProgress size={20} color="inherit" /> : 
                (mode === 'login' ? <LoginIcon /> : <RegisterIcon />)}
              sx={{
                mt: 3,
                mb: 2,
                py: 1.5,
                borderRadius: 2,
                textTransform: 'none',
                fontSize: '1rem',
                fontWeight: 600,
                backgroundColor: 'primary.main',
                boxShadow: 'none',
                '&:hover': {
                  backgroundColor: 'primary.dark',
                  boxShadow: 'none',
                },
              }}
            >
              {isLoading
                ? (mode === 'login' ? 'Signing in...' : 'Creating account...')
                : (mode === 'login' ? 'Sign In' : 'Create Account')}
            </Button>
          </form>

          {mode === 'login' && (
            <Box sx={{ textAlign: 'right', mt: 1 }}>
              <Link
                component="button"
                type="button"
                variant="body2"
                onClick={() => navigate('/forgot-password')}
                sx={{ fontWeight: 500, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
              >
                Forgot password?
              </Link>
            </Box>
          )}

          <Divider sx={{ my: 2 }}>
            <Typography variant="body2" color="text.secondary">
              or
            </Typography>
          </Divider>

          {/* Switch Mode */}
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <Link
                component="button"
                type="button"
                variant="body2"
                onClick={switchMode}
                sx={{
                  fontWeight: 600,
                  textDecoration: 'none',
                  '&:hover': {
                    textDecoration: 'underline',
                  },
                }}
              >
                {mode === 'login' ? 'Create Account' : 'Sign in'}
              </Link>
            </Typography>
          </Box>

        </CardContent>
      </Card>
    </Box>
  );
};

export default LoginPage;
