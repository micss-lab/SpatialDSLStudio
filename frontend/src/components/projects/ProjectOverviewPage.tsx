import React from 'react';
import { Link } from 'react-router-dom';
import { Box, Button, Card, CardContent, Container, Grid, Stack, Typography } from '@mui/material';
import SchemaIcon from '@mui/icons-material/Schema';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ModelTrainingIcon from '@mui/icons-material/ModelTraining';
import DesignServicesIcon from '@mui/icons-material/DesignServices';
import { useProject } from '../../contexts/ProjectContext';

export const ProjectOverviewPage: React.FC = () => {
  const { project } = useProject();
  const base = `/projects/${project.id}`;
  const counts = project.artifactCounts;
  const sections = [
    { label: 'Metamodels', count: counts?.metamodels || 0, path: 'metamodels', icon: <SchemaIcon color="primary" /> },
    { label: 'Models', count: counts?.models || 0, path: 'models', icon: <ModelTrainingIcon color="primary" /> },
    { label: 'Viewpoints', count: counts?.viewpoints || 0, path: 'viewpoints', icon: <AccountTreeIcon color="primary" /> },
    { label: 'Views', count: counts?.views || 0, path: 'views', icon: <DesignServicesIcon color="primary" /> },
  ];

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} mb={4}>
        <Box>
          <Typography variant="h4" gutterBottom>{project.name}</Typography>
          <Typography color="text.secondary">{project.description || 'Project workspace'}</Typography>
        </Box>
        <Button component={Link} to={`${base}/settings`} variant="outlined">Project settings</Button>
      </Stack>

      <Grid container spacing={2}>
        {sections.map(section => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={section.label}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardContent>
                {section.icon}
                <Typography variant="h4" sx={{ mt: 2 }}>{section.count}</Typography>
                <Typography color="text.secondary" gutterBottom>{section.label}</Typography>
                <Button component={Link} to={`${base}/${section.path}`} size="small">Open</Button>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Container>
  );
};
