import React, { useState, useEffect, useRef } from 'react';
import { 
  Box, 
  Typography, 
  TextField, 
  Button, 
  Paper, 
  CircularProgress,
  Snackbar,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  Divider,
  Chip,
  Switch,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Avatar,
  Card
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import ChatIcon from '@mui/icons-material/Chat';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import EditIcon from '@mui/icons-material/Edit';
import SendIcon from '@mui/icons-material/Send';
import { useNavigate } from 'react-router-dom';
import { aiService } from '../../services/ai.service';
import { Metamodel } from '../../models/types';

const EXAMPLE_DOMAINS = [
  {
    title: "E-commerce System",
    description: "Create a metamodel for an e-commerce system with products, customers, orders, and payments. Products should have categories, prices, and stock levels. Customers have profiles and shopping carts. Orders contain order items and have status tracking. Payments include different payment methods."
  },
  {
    title: "University Management",
    description: "Design a metamodel for university management with departments, courses, students, and faculty. Departments offer courses. Students can enroll in courses and have academic records. Faculty members teach courses and belong to departments. Courses have prerequisites and credit hours."
  },
  {
    title: "Healthcare System",
    description: "Model a healthcare system with patients, doctors, appointments, and medical records. Patients have personal information and medical history. Doctors have specializations and schedules. Appointments link patients and doctors with timestamps. Medical records document diagnoses, treatments, and prescriptions."
  },
  {
    title: "E-commerce with Constraints",
    description: "Create a metamodel for an e-commerce system with products, customers, orders, and payments. Add constraints to ensure product prices are positive, order items have valid quantities, and customer email addresses are valid. Use appropriate constraint types (OCL or JavaScript) for each validation rule."
  }
];

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  timestamp: Date;
}

// Interface for tracking changes made by AI
interface MetamodelChanges {
  addedClasses: string[];
  modifiedClasses: string[];
  addedAttributes: { className: string; attrName: string }[];
  modifiedAttributes: { className: string; attrName: string }[];
  addedReferences: { className: string; refName: string }[];
  modifiedReferences: { className: string; refName: string }[];
  addedConstraints: { className: string; constraintName: string; type: string }[];
}

const AIMetamodelGenerator: React.FC = () => {
  const [domainDescription, setDomainDescription] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [generatedMetamodelId, setGeneratedMetamodelId] = useState<string | null>(null);
  const [editingMode, setEditingMode] = useState<boolean>(false);
  const [lastChanges, setLastChanges] = useState<MetamodelChanges | null>(null);
  const [alert, setAlert] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info' | 'warning';
  }>({
    open: false,
    message: '',
    severity: 'info'
  });
  
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Scroll to bottom of chat when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const handleGenerateMetamodel = async () => {
    if (!aiService.hasAI()) {
      setAlert({
        open: true,
        message: 'AI service is not properly initialized',
        severity: 'error'
      });
      return;
    }

    if (!domainDescription.trim()) {
      setAlert({
        open: true,
        message: 'Please provide a domain description',
        severity: 'warning'
      });
      return;
    }

    setIsSubmitting(true);
    
    // Add user message to chat history
    const userMessage: ChatMessage = {
      role: 'user',
      content: domainDescription,
      timestamp: new Date()
    };
    
    setChatHistory(prev => [...prev, userMessage]);
    
    try {
      // If in editing mode and we have a metamodel ID, update the existing metamodel
      const result = await aiService.generateMetamodel(
        domainDescription,
        editingMode && generatedMetamodelId ? generatedMetamodelId : undefined
      );
      
      // Add AI response to chat history
      const aiMessage: ChatMessage = {
        role: 'ai',
        content: aiService.getLastAIResponse(),
        timestamp: new Date()
      };
      
      // Store changes for highlighting if we're updating a metamodel
      if (result.changes) {
        setLastChanges(result.changes);
        
        // Add summary of changes to the AI response
        const changeSummary = generateChangeSummary(result.changes);
        if (changeSummary) {
          aiMessage.content += '\n\n' + changeSummary;
        }
      } else {
        setLastChanges(null);
      }
      
      setChatHistory(prev => [...prev, aiMessage]);
      
      if (result.metamodel) {
        setGeneratedMetamodelId(result.metamodel.id);
        
        setAlert({
          open: true,
          message: editingMode 
            ? `Metamodel "${result.metamodel.name}" updated successfully` 
            : `Metamodel "${result.metamodel.name}" generated successfully`,
          severity: 'success'
        });
        
        // Enable editing mode for future interactions
        setEditingMode(true);
      } else {
        setAlert({
          open: true,
          message: result.error || 'Failed to generate metamodel',
          severity: 'error'
        });
      }
    } catch (error) {
      console.error('Error generating metamodel:', error);
      setAlert({
        open: true,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'error'
      });
    } finally {
      setIsSubmitting(false);
      setDomainDescription('');  // Clear input field after sending
    }
  };

  const handleCloseAlert = () => {
    setAlert({
      ...alert,
      open: false
    });
  };

  const handleExampleClick = (example: string) => {
    setDomainDescription(example);
  };
  
  const openMetamodelInNewTab = () => {
    if (generatedMetamodelId) {
      // Convert changes to a URL-friendly format
      let url = `/metamodels/${generatedMetamodelId}`;
      
      // If we have changes to highlight, add them as query parameters
      if (lastChanges && editingMode) {
        // Create a simplified version with just what we need
        const highlightData = {
          classes: [...lastChanges.addedClasses, ...lastChanges.modifiedClasses],
          attrs: [...lastChanges.addedAttributes, ...lastChanges.modifiedAttributes]
            .map(a => `${a.className}.${a.attrName}`),
          refs: [...lastChanges.addedReferences, ...lastChanges.modifiedReferences]
            .map(r => `${r.className}.${r.refName}`),
          constraints: lastChanges.addedConstraints
            .map(c => `${c.className}.${c.constraintName}`)
        };
        
        // Convert to URL params only if there's something to highlight
        const hasChanges = Object.values(highlightData).some(arr => arr.length > 0);
        if (hasChanges) {
          const encodedChanges = encodeURIComponent(JSON.stringify(highlightData));
          url += `?highlight=${encodedChanges}`;
        }
      }
      
      window.open(url, '_blank');
    }
  };
  
  const handleEditingModeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setEditingMode(event.target.checked);
  };
  
  const startNewMetamodel = () => {
    setGeneratedMetamodelId(null);
    setChatHistory([]);
    setEditingMode(false);
    setLastChanges(null);
    setAlert({
      open: true,
      message: 'Started a new conversation',
      severity: 'info'
    });
  };

  // Generate a human-readable summary of the changes made by the AI
  const generateChangeSummary = (changes: MetamodelChanges): string => {
    const parts: string[] = [];
    
    if (changes.addedClasses.length > 0) {
      parts.push(`Added ${changes.addedClasses.length} new class${
        changes.addedClasses.length > 1 ? 'es' : ''
      }: ${changes.addedClasses.join(', ')}`);
    }
    
    if (changes.modifiedClasses.length > 0) {
      parts.push(`Modified ${changes.modifiedClasses.length} class${
        changes.modifiedClasses.length > 1 ? 'es' : ''
      }: ${changes.modifiedClasses.join(', ')}`);
    }
    
    if (changes.addedAttributes.length > 0) {
      parts.push(`Added ${changes.addedAttributes.length} attribute${
        changes.addedAttributes.length > 1 ? 's' : ''
      }`);
    }
    
    if (changes.modifiedAttributes.length > 0) {
      parts.push(`Modified ${changes.modifiedAttributes.length} attribute${
        changes.modifiedAttributes.length > 1 ? 's' : ''
      }`);
    }
    
    if (changes.addedReferences.length > 0) {
      parts.push(`Added ${changes.addedReferences.length} reference${
        changes.addedReferences.length > 1 ? 's' : ''
      }`);
    }
    
    if (changes.modifiedReferences.length > 0) {
      parts.push(`Modified ${changes.modifiedReferences.length} reference${
        changes.modifiedReferences.length > 1 ? 's' : ''
      }`);
    }
    
    if (changes.addedConstraints.length > 0) {
      const oclCount = changes.addedConstraints.filter(c => c.type === 'ocl').length;
      const jsCount = changes.addedConstraints.filter(c => c.type === 'javascript').length;
      
      parts.push(`Added ${changes.addedConstraints.length} constraint${
        changes.addedConstraints.length > 1 ? 's' : ''
      }${oclCount && jsCount ? ` (${oclCount} OCL, ${jsCount} JavaScript)` : ''}`);
    }
    
    if (parts.length === 0) {
      return '';
    }
    
    return `**Changes Summary:**\n${parts.map(p => `- ${p}`).join('\n')}`;
  };

  return (
    <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Paper 
        elevation={0} 
        sx={{ 
          p: 3, 
          borderRadius: '12px', 
          backgroundColor: 'background.paper',
          border: '1px solid',
          borderColor: 'grey.200',
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          mb: 2 
        }}>
          <Typography 
            variant="h5" 
            sx={{ 
              fontWeight: 600, 
              color: 'text.primary',
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}
          >
            <SmartToyIcon color="primary" />
            AI Metamodel Generator
          </Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {generatedMetamodelId && (
              <>
                <FormControlLabel
                  control={
                    <Switch
                      checked={editingMode}
                      onChange={handleEditingModeChange}
                      color="primary"
                      size="small"
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <EditIcon fontSize="small" sx={{ mr: 0.5 }} />
                      <Typography variant="body2">Edit Mode</Typography>
                    </Box>
                  }
                />
                <Button 
                  variant="outlined" 
                  startIcon={<OpenInNewIcon />}
                  onClick={openMetamodelInNewTab}
                  size="small"
                >
                  Open
                </Button>
                <Button
                  variant="outlined"
                  color="secondary"
                  size="small"
                  onClick={startNewMetamodel}
                >
                  New
                </Button>
              </>
            )}
          </Box>
        </Box>
        
        <Divider sx={{ mb: 2 }} />
        
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, flexGrow: 1 }}>
          <Box 
            sx={{ 
              display: 'grid', 
              gridTemplateColumns: { xs: '1fr', md: '280px 1fr' },
              gap: 2,
              flexGrow: 1,
              height: '100%'
            }}
          >
            {/* Left sidebar */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Card variant="outlined" sx={{ borderRadius: '8px' }}>
                <Box sx={{ p: 2 }}>
                  <Typography 
                    variant="subtitle1" 
                    sx={{ 
                      fontWeight: 600, 
                      display: 'flex', 
                      alignItems: 'center',
                      gap: 1,
                      mb: 1
                    }}
                  >
                    <LightbulbIcon fontSize="small" color="warning" />
                    Example Domains
                  </Typography>
                  <List dense sx={{ pt: 0 }}>
                    {EXAMPLE_DOMAINS.map((example, index) => (
                      <ListItem 
                        key={index} 
                        disablePadding
                        sx={{ mb: 0.5 }}
                      >
                        <ListItemButton
                          onClick={() => handleExampleClick(example.description)}
                          sx={{ 
                            borderRadius: '6px',
                            py: 0.75,
                          }}
                        >
                          <ListItemText 
                            primary={example.title} 
                            primaryTypographyProps={{ fontWeight: 500, fontSize: '0.875rem' }}
                          />
                        </ListItemButton>
                      </ListItem>
                    ))}
                  </List>
                </Box>
              </Card>
              
              <Card variant="outlined" sx={{ borderRadius: '8px' }}>
                <Box sx={{ p: 2 }}>
                  <Typography 
                    variant="subtitle1" 
                    sx={{ 
                      fontWeight: 600, 
                      display: 'flex', 
                      alignItems: 'center',
                      gap: 1,
                      mb: 1
                    }}
                  >
                    <LightbulbIcon fontSize="small" color="info" />
                    Constraint Support
                  </Typography>
                  <List dense sx={{ pl: 2, listStyleType: 'disc' }}>
                    <ListItem sx={{ display: 'list-item', p: 0, mb: 0.5 }}>
                      <Typography variant="body2">
                        Mention 'constraints' in your prompt
                      </Typography>
                    </ListItem>
                    <ListItem sx={{ display: 'list-item', p: 0, mb: 0.5 }}>
                      <Typography variant="body2">
                        Specify what constraints you need
                      </Typography>
                    </ListItem>
                    <ListItem sx={{ display: 'list-item', p: 0, mb: 0.5 }}>
                      <Typography variant="body2">
                        AI will choose OCL or JavaScript
                      </Typography>
                    </ListItem>
                  </List>
                </Box>
              </Card>
            </Box>
            
            {/* Chat area */}
            <Box sx={{ 
              display: 'flex', 
              flexDirection: 'column', 
              height: '100%', 
              minHeight: '500px',
              border: '1px solid',
              borderColor: 'grey.200',
              borderRadius: '12px',
              backgroundColor: 'grey.50'
            }}>
              {/* Chat header */}
              <Box sx={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center', 
                p: 2,
                borderBottom: '1px solid',
                borderColor: 'grey.200',
                backgroundColor: 'background.paper'
              }}>
                <Typography variant="subtitle1" sx={{ 
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1
                }}>
                  <ChatIcon color="primary" fontSize="small" />
                  Conversation
                </Typography>
                
                {generatedMetamodelId && (
                  <Chip 
                    label={editingMode ? `Editing: ${generatedMetamodelId}` : `Metamodel: ${generatedMetamodelId}`} 
                    color="primary" 
                    size="small"
                    variant="outlined" 
                    icon={editingMode ? <EditIcon /> : <SmartToyIcon />}
                  />
                )}
              </Box>
              
              {/* Chat messages */}
              <Box 
                ref={chatContainerRef}
                sx={{ 
                  flexGrow: 1, 
                  overflowY: 'auto', 
                  p: 2, 
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2
                }}
              >
                {chatHistory.length === 0 && (
                  <Box sx={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    gap: 2,
                    color: 'grey.500',
                    textAlign: 'center',
                    p: 3
                  }}>
                    <SmartToyIcon sx={{ fontSize: '3rem', color: 'grey.300' }} />
                    <Typography variant="h6" color="grey.600">
                      AI Metamodel Assistant
                    </Typography>
                    <Typography variant="body2" color="grey.500" sx={{ maxWidth: '500px' }}>
                      Describe the domain you want to model or select an example from the sidebar.
                      The AI will generate a complete metamodel based on your description.
                    </Typography>
                  </Box>
                )}
                
                {chatHistory.map((message, index) => (
                  <Box 
                    key={index}
                    sx={{ 
                      display: 'flex', 
                      alignItems: 'flex-start',
                      gap: 1.5,
                      alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '85%'
                    }}
                  >
                    {message.role === 'ai' && (
                      <Avatar 
                        sx={{ 
                          bgcolor: 'primary.main',
                          width: 32,
                          height: 32
                        }}
                      >
                        <SmartToyIcon sx={{ fontSize: '1.2rem' }} />
                      </Avatar>
                    )}
                    
                    <Paper 
                      elevation={0}
                      sx={{ 
                        p: 2, 
                        bgcolor: message.role === 'user' ? 'primary.50' : 'background.paper',
                        borderRadius: message.role === 'user' 
                          ? '12px 12px 0 12px' 
                          : '12px 12px 12px 0',
                        border: '1px solid',
                        borderColor: message.role === 'user' ? 'primary.100' : 'grey.200'
                      }}
                    >
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          whiteSpace: 'pre-wrap',
                          '& pre': { 
                            overflowX: 'auto',
                            backgroundColor: 'grey.100',
                            p: 1,
                            borderRadius: 1,
                            fontSize: '0.8rem'
                          },
                          '& code': {
                            backgroundColor: 'grey.100',
                            padding: '2px 4px',
                            borderRadius: '4px',
                            fontSize: '0.8rem'
                          }
                        }}
                      >
                        {message.content}
                      </Typography>
                    </Paper>
                    
                    {message.role === 'user' && (
                      <Avatar 
                        sx={{ 
                          bgcolor: 'grey.200',
                          color: 'text.primary',
                          width: 32,
                          height: 32
                        }}
                      >
                        <PersonIcon sx={{ fontSize: '1.2rem' }} />
                      </Avatar>
                    )}
                  </Box>
                ))}
                
                {isSubmitting && (
                  <Box sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 1.5, 
                    alignSelf: 'flex-start',
                    maxWidth: '85%'
                  }}>
                    <Avatar 
                      sx={{ 
                        bgcolor: 'primary.main',
                        width: 32,
                        height: 32
                      }}
                    >
                      <SmartToyIcon sx={{ fontSize: '1.2rem' }} />
                    </Avatar>
                    
                    <Paper 
                      elevation={0}
                      sx={{ 
                        p: 2, 
                        bgcolor: 'background.paper',
                        borderRadius: '12px 12px 12px 0',
                        border: '1px solid',
                        borderColor: 'grey.200',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1
                      }}
                    >
                      <CircularProgress size={16} />
                      <Typography variant="body2">
                        {editingMode ? 'Updating metamodel...' : 'Generating metamodel...'}
                      </Typography>
                    </Paper>
                  </Box>
                )}
              </Box>
              
              {/* Chat input */}
              <Box sx={{ 
                p: 2, 
                borderTop: '1px solid',
                borderColor: 'grey.200',
                backgroundColor: 'background.paper'
              }}>
                <TextField
                  fullWidth
                  placeholder={
                    editingMode 
                      ? "Describe changes or additions to the metamodel..." 
                      : "Describe the domain you want to model..."
                  }
                  multiline
                  maxRows={4}
                  value={domainDescription}
                  onChange={(e) => setDomainDescription(e.target.value)}
                  disabled={isSubmitting}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '8px',
                      backgroundColor: 'background.paper'
                    }
                  }}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton 
                          onClick={handleGenerateMetamodel}
                          disabled={isSubmitting || !domainDescription.trim()}
                          color="primary"
                          edge="end"
                        >
                          {isSubmitting ? <CircularProgress size={20} /> : <SendIcon />}
                        </IconButton>
                      </InputAdornment>
                    )
                  }}
                />
              </Box>
            </Box>
          </Box>
        </Box>
      </Paper>
      
      <Snackbar 
        open={alert.open} 
        autoHideDuration={6000} 
        onClose={handleCloseAlert}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          onClose={handleCloseAlert} 
          severity={alert.severity}
          variant="filled"
          sx={{ borderRadius: '8px' }}
        >
          {alert.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default AIMetamodelGenerator; 