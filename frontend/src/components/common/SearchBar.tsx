import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  TextField,
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
  Chip,
  InputAdornment,
  IconButton,
  Tooltip,
  Divider,
  Popover,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import FilterListIcon from '@mui/icons-material/FilterList';
import AddIcon from '@mui/icons-material/Add';
import ClassIcon from '@mui/icons-material/Class';
import AttributionIcon from '@mui/icons-material/Attribution';
import LinkIcon from '@mui/icons-material/Link';
import RuleIcon from '@mui/icons-material/Rule';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import { SearchResult, SearchEntityType } from '../../services/common';

// Filter interface for visual query builder
interface SearchFilter {
  id: string;
  attribute: string;
  operator: '=' | '>' | '<' | '>=' | '<=' | ':';
  value: string;
  display: string;
}

interface SearchBarProps {
  onSearch: (query: string) => void;
  results: SearchResult[];
  onSelectResult: (result: SearchResult) => void;
  onHighlightAll?: (query: string) => void; // Called when Enter is pressed without selection
  placeholder?: string;
  showShortcutHint?: boolean;
  availableAttributes?: Array<{ name: string; type: string }>; // For model search, list of available attributes with types
  showFilterBuilder?: boolean; // Whether to show the visual filter builder
  onSelectGenericAttribute?: (attributeName: string, attributeType: string) => void; // Called when generic attribute is selected
}

const SearchBar: React.FC<SearchBarProps> = ({
  onSearch,
  results,
  onSelectResult,
  onHighlightAll,
  placeholder = 'Search metamodel... (Try: class:Person, attr:name)',
  showShortcutHint = true,
  availableAttributes = [],
  showFilterBuilder = false,
  onSelectGenericAttribute
}) => {
  const [query, setQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  
  // Filter builder state
  const [filters, setFilters] = useState<SearchFilter[]>([]);
  const [filterAnchorEl, setFilterAnchorEl] = useState<null | HTMLElement>(null);
  const [newFilterAttribute, setNewFilterAttribute] = useState('');
  const [newFilterOperator, setNewFilterOperator] = useState<'=' | '>' | '<' | '>=' | '<=' | ':'>(':');
  const [newFilterValue, setNewFilterValue] = useState('');
  const [newFilterAttributeType, setNewFilterAttributeType] = useState<string>('string');
  const [selectedGenericAttribute, setSelectedGenericAttribute] = useState<{name: string, type: string} | null>(null);
  
  // Get available operators based on attribute type
  const getAvailableOperators = (attributeType: string): Array<'=' | '>' | '<' | '>=' | '<=' | ':'> => {
    const lowerType = attributeType.toLowerCase();
    
    if (lowerType === 'boolean') {
      return ['=', ':'];
    } else if (lowerType === 'number' || lowerType === 'integer' || lowerType === 'int' || lowerType === 'float' || lowerType === 'double') {
      return [':', '=', '>', '<', '>=', '<='];
    } else {
      // String and other types
      return [':', '='];
    }
  };

  // Handle clear
  const handleClear = () => {
    setQuery('');
    setShowResults(false);
    setFilters([]);
    setSelectedGenericAttribute(null);
    onSearch('');
    inputRef.current?.focus();
  };
  
  // Build query from filters
  const buildQueryFromFilters = (activeFilters: SearchFilter[], textQuery: string = '') => {
    const filterStrings = activeFilters.map(f => {
      if (f.operator === ':') {
        return `${f.attribute}:${f.value}`;
      } else {
        return `${f.attribute}${f.operator}${f.value}`;
      }
    });
    
    const parts = [textQuery, ...filterStrings].filter(p => p.trim());
    return parts.join(' ');
  };
  
  // Handle adding a filter
  const handleAddFilter = () => {
    if (!newFilterAttribute || !newFilterValue) return;
    
    const displayOperator = newFilterOperator === ':' ? 'contains' : newFilterOperator;
    const newFilter: SearchFilter = {
      id: `${Date.now()}`,
      attribute: newFilterAttribute,
      operator: newFilterOperator,
      value: newFilterValue,
      display: `${newFilterAttribute} ${displayOperator} ${newFilterValue}`
    };
    
    const updatedFilters = [...filters, newFilter];
    setFilters(updatedFilters);
    
    // Build and execute search with new filter
    const fullQuery = buildQueryFromFilters(updatedFilters, query);
    onSearch(fullQuery);
    
    // Highlight all matching results on canvas
    if (onHighlightAll) {
      onHighlightAll(fullQuery);
    }
    
    // Reset filter form
    setNewFilterAttribute('');
    setNewFilterOperator(':');
    setNewFilterValue('');
    setSelectedGenericAttribute(null);
    setFilterAnchorEl(null);
  };
  
  // Handle removing a filter
  const handleRemoveFilter = (filterId: string) => {
    const updatedFilters = filters.filter(f => f.id !== filterId);
    setFilters(updatedFilters);
    
    // Build and execute search without this filter
    const fullQuery = buildQueryFromFilters(updatedFilters, query);
    onSearch(fullQuery);
  };
  
  // Handle text input change (updates search but keeps filters)
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setQuery(value);
    setSelectedIndex(-1);
    
    // Build full query with filters
    const fullQuery = buildQueryFromFilters(filters, value);
    onSearch(fullQuery);
    setShowResults(true);
  };

  // Handle result selection
  const handleSelectResult = (result: SearchResult) => {
    // If it's a generic attribute, save it and show Add Filter button (don't auto-open)
    if (result.type === 'generic-attribute' && showFilterBuilder && result.metadata.attributeName) {
      const attrType = result.metadata.attributeType || 'string';
      setSelectedGenericAttribute({
        name: result.metadata.attributeName,
        type: attrType
      });
      setNewFilterAttribute(result.metadata.attributeName);
      setNewFilterAttributeType(attrType);
      const availableOps = getAvailableOperators(attrType);
      setNewFilterOperator(availableOps[0]);
      setShowResults(false);
      setQuery('');
      return;
    }
    
    // For regular results, trigger the selection (highlighting)
    onSelectResult(result);
    setShowResults(false);
    setQuery('');
  };

  // Handle keyboard navigation
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!showResults || results.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setSelectedIndex(prev => (prev + 1) % results.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setSelectedIndex(prev => (prev - 1 + results.length) % results.length);
        break;
      case 'Enter':
        event.preventDefault();
        // Only select if user has navigated to an item (not at default position)
        if (selectedIndex >= 0 && results[selectedIndex]) {
          handleSelectResult(results[selectedIndex]);
        } else if (query.trim() && onHighlightAll) {
          // User pressed Enter without selecting - highlight all results
          onHighlightAll(query);
          setShowResults(false);
        }
        break;
      case 'Escape':
        event.preventDefault();
        setShowResults(false);
        break;
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current && showResults) {
      const selectedElement = resultsRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selectedElement?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex, showResults]);

  // Close results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (resultsRef.current && !resultsRef.current.contains(event.target as Node) &&
          inputRef.current && !inputRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);



  // Get icon for entity type
  const getEntityIcon = (type: SearchEntityType) => {
    switch (type) {
      case 'class':
        return <ClassIcon fontSize="small" />;
      case 'attribute':
      case 'generic-attribute':
        return <AttributionIcon fontSize="small" />;
      case 'reference':
      case 'generic-reference':
        return <LinkIcon fontSize="small" />;
      case 'constraint':
        return <RuleIcon fontSize="small" />;
      case 'instance':
      case 'element':
        return <AccountTreeIcon fontSize="small" />;
    }
  };

  // Get color for entity type
  const getEntityColor = (type: SearchEntityType): 'primary' | 'success' | 'warning' | 'secondary' | 'info' => {
    switch (type) {
      case 'class':
        return 'primary';
      case 'attribute':
      case 'generic-attribute':
        return 'success';
      case 'reference':
      case 'generic-reference':
        return 'warning';
      case 'constraint':
        return 'secondary';
      case 'instance':
      case 'element':
        return 'info';
    }
  };

  return (
    <Box sx={{ position: 'relative', width: '100%' }}>
      {/* Active Filters */}
      {filters.length > 0 && (
        <Box sx={{ mb: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {filters.map(filter => (
            <Chip
              key={filter.id}
              label={filter.display}
              size="small"
              onDelete={() => handleRemoveFilter(filter.id)}
              color="primary"
              variant="outlined"
            />
          ))}
        </Box>
      )}
      
      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
        <TextField
          fullWidth
          size="small"
          placeholder={placeholder}
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => query && setShowResults(true)}
          inputRef={inputRef}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                {query && (
                  <IconButton size="small" onClick={handleClear}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                )}
              </InputAdornment>
            )
          }}
          sx={{
            backgroundColor: 'white',
            '& .MuiOutlinedInput-root': {
              '&:hover fieldset': {
                borderColor: 'primary.main',
              }
            }
          }}
        />
        
        {showFilterBuilder && selectedGenericAttribute && (
          <Tooltip title={`Add Filter for ${selectedGenericAttribute.name}`}>
            <Button
              size="small"
              variant="contained"
              color="primary"
              startIcon={<FilterListIcon fontSize="small" />}
              onClick={(e) => setFilterAnchorEl(e.currentTarget)}
              sx={{
                minWidth: 'auto',
                px: 1.5,
                py: 0.5,
                fontSize: '0.8rem',
                whiteSpace: 'nowrap'
              }}
            >
              Add Filter
            </Button>
          </Tooltip>
        )}
      </Box>

      {/* Search Results Dropdown */}
      {showResults && results.length > 0 && (
        <Paper
          ref={resultsRef}
          elevation={8}
          sx={{
            position: 'absolute',
            top: '100%',
            left: 0,
            minWidth: 350,
            mt: 1,
            maxHeight: 400,
            overflow: 'auto',
            zIndex: 2000,
            border: '1px solid',
            borderColor: 'divider'
          }}
        >
          <Box sx={{ p: 1, backgroundColor: 'grey.50' }}>
            <Typography variant="caption" color="text.secondary">
              {results.length} result{results.length !== 1 ? 's' : ''} found
            </Typography>
          </Box>
          <Divider />
          <List dense sx={{ p: 0 }}>
            {results.map((result, index) => (
              <ListItem
                key={result.id}
                disablePadding
                data-index={index}
              >
                <ListItemButton
                  selected={index === selectedIndex}
                  onClick={() => handleSelectResult(result)}
                  sx={{
                    py: 1.5,
                    '&.Mui-selected': {
                      backgroundColor: 'primary.light',
                      '&:hover': {
                        backgroundColor: 'primary.light',
                      }
                    }
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                    <Box sx={{ color: `${getEntityColor(result.type)}.main` }}>
                      {getEntityIcon(result.type)}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" noWrap>
                        {result.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {result.metadata.path.join(' › ')}
                      </Typography>
                      {result.metadata.targetClassName && (
                        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                          → {result.metadata.targetClassName}
                        </Typography>
                      )}
                    </Box>
                    <Chip
                      size="small"
                      label={result.type}
                      color={getEntityColor(result.type)}
                      sx={{ fontSize: '0.7rem', height: 20 }}
                    />
                  </Box>
                </ListItemButton>
              </ListItem>
            ))}
          </List>
          <Divider />
          <Box sx={{ p: 1, backgroundColor: 'grey.50' }}>
            <Typography variant="caption" color="text.secondary">
              ↑↓ Navigate • Enter Select • Esc Close
            </Typography>
          </Box>
        </Paper>
      )}

      {/* No Results */}
      {showResults && query && results.length === 0 && (
        <Paper
          elevation={8}
          sx={{
            position: 'absolute',
            top: '100%',
            left: 0,
            minWidth: 350,
            mt: 1,
            p: 3,
            zIndex: 2000,
            textAlign: 'center'
          }}
        >
          <Typography variant="body2" color="text.secondary">
            No results found for "{query}"
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Try: class:Name, attr:attribute, ref:reference, constraint:name
          </Typography>
        </Paper>
      )}
      
      {/* Filter Builder Popover */}
      <Popover
        open={Boolean(filterAnchorEl)}
        anchorEl={filterAnchorEl}
        onClose={() => {
          setFilterAnchorEl(null);
          setNewFilterAttribute('');
          setNewFilterOperator('=');
          setNewFilterValue('');
        }}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        <Box sx={{ p: 2, minWidth: 300 }}>
          <Typography variant="subtitle2" gutterBottom>
            Add Filter
          </Typography>
          
          <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
            <InputLabel>Attribute</InputLabel>
            <Select
              value={newFilterAttribute}
              onChange={(e) => {
                const attrName = e.target.value;
                setNewFilterAttribute(attrName);
                
                // Update attribute type and reset operator to first available
                if (attrName === 'type') {
                  setNewFilterAttributeType('string');
                  setNewFilterOperator(':');
                } else {
                  const attr = availableAttributes.find(a => a.name === attrName);
                  const attrType = attr?.type || 'string';
                  setNewFilterAttributeType(attrType);
                  const availableOps = getAvailableOperators(attrType);
                  setNewFilterOperator(availableOps[0]);
                }
              }}
              label="Attribute"
            >
              <MenuItem value="type">Type</MenuItem>
              {availableAttributes?.map(attr => (
                <MenuItem key={attr.name} value={attr.name}>
                  {attr.name} ({attr.type})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
            <InputLabel>Operator</InputLabel>
            <Select
              value={newFilterOperator}
              onChange={(e) => setNewFilterOperator(e.target.value as '=' | '>' | '<' | '>=' | '<=' | ':')}
              label="Operator"
            >
              {getAvailableOperators(newFilterAttributeType).map(op => {
                const labels: Record<string, string> = {
                  ':': 'Contains (:)',
                  '=': 'Equals (=)',
                  '>': 'Greater than (>)',
                  '<': 'Less than (<)',
                  '>=': 'Greater or equal (≥)',
                  '<=': 'Less or equal (≤)'
                };
                return (
                  <MenuItem key={op} value={op}>{labels[op]}</MenuItem>
                );
              })}
            </Select>
          </FormControl>
          
          <TextField
            fullWidth
            size="small"
            label="Value"
            value={newFilterValue}
            onChange={(e) => setNewFilterValue(e.target.value)}
            sx={{ mb: 1.5 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newFilterAttribute && newFilterValue) {
                handleAddFilter();
              }
            }}
          />
          
          <Button
            fullWidth
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddFilter}
            disabled={!newFilterAttribute || !newFilterValue}
          >
            Add Filter
          </Button>
        </Box>
      </Popover>
    </Box>
  );
};

export default SearchBar;
