import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Divider,
  Tooltip
} from '@mui/material';
import ShapeLineIcon from '@mui/icons-material/ShapeLine';
import { Metamodel, MetaClass } from '../../models/types';

interface DiagramPaletteProps {
  metamodel: Metamodel;
  onDragStart: (metaClass: MetaClass) => void;
}

const DiagramPalette: React.FC<DiagramPaletteProps> = ({
  metamodel,
  onDragStart
}) => {
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, metaClass: MetaClass) => {
    console.log('Drag start event triggered:', { metaClass });
    
    // Try to set the drag data
    try {
      e.dataTransfer.setData('application/json', JSON.stringify({ 
        id: metaClass.id,
        name: metaClass.name
      }));
      e.dataTransfer.effectAllowed = 'copy';
    } catch (error) {
      console.error('Error setting drag data:', error);
    }
    
    // Notify parent component
    onDragStart(metaClass);
  };

  return (
    <Paper
      elevation={3}
      sx={{
        width: 250,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto'
      }}
    >
      <Box sx={{ p: 2, borderBottom: '1px solid #eee' }}>
        <Typography variant="h6">Palette</Typography>
        <Typography variant="caption" color="textSecondary">
          Drag elements to the canvas
        </Typography>
      </Box>

      <Box sx={{ p: 2 }}>
        <Typography variant="subtitle1" gutterBottom>
          {metamodel.name}
        </Typography>
        
        <Divider sx={{ my: 1 }} />
        
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {metamodel.classes
            .filter(metaClass => !metaClass.abstract) // Filter out abstract classes
            .map((metaClass) => (
            <Tooltip 
              key={metaClass.id} 
              title={`${metaClass.attributes.length} attributes, ${metaClass.references.length} references`}
              placement="right"
            >
              <div
                draggable
                onDragStart={(e) => handleDragStart(e, metaClass)}
                style={{
                  border: '1px solid #e0e0e0',
                  borderRadius: '4px',
                  marginBottom: '8px',
                  cursor: 'pointer',
                  padding: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: '#f5f5f5'
                }}
              >
                <Box sx={{ minWidth: 36, display: 'flex', alignItems: 'center' }}>
                  <ShapeLineIcon color="primary" />
                </Box>
                <Typography variant="body2">{metaClass.name}</Typography>
              </div>
            </Tooltip>
          ))}
        </Box>
        
        {metamodel.classes.filter(metaClass => !metaClass.abstract).length === 0 && (
          <Typography variant="body2" color="textSecondary" align="center" sx={{ py: 2 }}>
            {metamodel.classes.length === 0 
              ? "No classes defined in this metamodel."
              : "No concrete classes available for instantiation. All classes are abstract."
            }
          </Typography>
        )}
      </Box>
      
      <Box sx={{ p: 2, mt: 'auto', borderTop: '1px solid #eee' }}>
        <Typography variant="caption" color="textSecondary">
          Tip: Drag a class to create a new instance.
        </Typography>
      </Box>
    </Paper>
  );
};

export default DiagramPalette; 