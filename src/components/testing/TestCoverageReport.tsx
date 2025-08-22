import React, { useState } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardHeader,
  LinearProgress,
  CircularProgress,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Divider
} from '@mui/material';
import { CoverageReport } from '../../services/testCoverage.service';
import {
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Cancel as CancelIcon
} from '@mui/icons-material';

// Simple chart component to visualize coverage data
const CoverageBarChart: React.FC<{
  label: string;
  percentage: number;
  color: string;
}> = ({ label, percentage, color }) => {
  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="body2">{label}</Typography>
        <Typography variant="body2" fontWeight="bold">{percentage}%</Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={percentage}
        sx={{
          height: 10,
          borderRadius: 5,
          backgroundColor: 'rgba(0,0,0,0.1)',
          '& .MuiLinearProgress-bar': {
            backgroundColor: color,
          }
        }}
      />
    </Box>
  );
};

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`coverage-tabpanel-${index}`}
      aria-labelledby={`coverage-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ pt: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

interface TestCoverageReportProps {
  report: CoverageReport;
}

const TestCoverageReport: React.FC<TestCoverageReportProps> = ({ report }) => {
  const [currentTab, setCurrentTab] = useState(0);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  // Determine color based on coverage percentage
  const getCoverageColor = (percentage: number): string => {
    if (percentage >= 75) return '#4caf50'; // Green
    if (percentage >= 40) return '#ff9800'; // Orange
    return '#f44336'; // Red
  };

  return (
    <Box>
      <Grid container spacing={3}>
        {/* Overall coverage card */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h6" gutterBottom>
                Overall Coverage
              </Typography>
              <Box
                sx={{
                  position: 'relative',
                  display: 'inline-flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  width: 120,
                  height: 120,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(0,0,0,0.05)',
                  mb: 2
                }}
              >
                <Typography variant="h4" component="div" color={getCoverageColor(report.overallCoverage)}>
                  {`${Math.round(report.overallCoverage)}%`}
                </Typography>
                <CircularProgress
                  variant="determinate"
                  value={report.overallCoverage}
                  size={120}
                  thickness={4}
                  sx={{
                    position: 'absolute',
                    color: getCoverageColor(report.overallCoverage)
                  }}
                />
              </Box>
              <Typography variant="body2" color="textSecondary">
                Based on {report.metrics.reduce((sum, metric) => sum + metric.count, 0)} test cases
              </Typography>
              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center', gap: 1 }}>
                <Chip
                  label={`${report.metrics.reduce((sum, metric) => sum + metric.count, 0)} Covered`}
                  color="success"
                  size="small"
                  icon={<CheckCircleIcon />}
                />
                <Chip
                  label={`${report.metrics.reduce((sum, metric) => sum + (metric.total - metric.count), 0)} Not Covered`}
                  color="error"
                  size="small"
                  icon={<CancelIcon />}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Coverage metrics by category */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Coverage Metrics
              </Typography>
              
              {/* Coverage by type chart */}
              <Box sx={{ height: 250, mb: 4 }}>
                <Box sx={{ my: 2 }}>
                  <Typography variant="body2">Elements Coverage</Typography>
                  <LinearProgress
                    variant="determinate"
                    value={report.elementsCoverage.covered.length / (report.elementsCoverage.covered.length + report.elementsCoverage.notCovered.length) * 100 || 0}
                    sx={{
                      height: 20,
                      my: 1,
                      borderRadius: 1,
                      backgroundColor: 'rgba(0,0,0,0.1)',
                      '& .MuiLinearProgress-bar': {
                        backgroundColor: getCoverageColor(report.elementsCoverage.covered.length / (report.elementsCoverage.covered.length + report.elementsCoverage.notCovered.length) || 0),
                      }
                    }}
                  />
                </Box>
                
                <Box sx={{ my: 2 }}>
                  <Typography variant="body2">Attributes Coverage</Typography>
                  <LinearProgress
                    variant="determinate"
                    value={report.attributesCoverage.covered.length / (report.attributesCoverage.covered.length + report.attributesCoverage.notCovered.length) * 100 || 0}
                    sx={{
                      height: 20,
                      my: 1,
                      borderRadius: 1,
                      backgroundColor: 'rgba(0,0,0,0.1)',
                      '& .MuiLinearProgress-bar': {
                        backgroundColor: getCoverageColor(report.attributesCoverage.covered.length / (report.attributesCoverage.covered.length + report.attributesCoverage.notCovered.length) || 0),
                      }
                    }}
                  />
                </Box>
                
                <Box sx={{ my: 2 }}>
                  <Typography variant="body2">References Coverage</Typography>
                  <LinearProgress
                    variant="determinate"
                    value={report.referencesCoverage.covered.length / (report.referencesCoverage.covered.length + report.referencesCoverage.notCovered.length) * 100 || 0}
                    sx={{
                      height: 20,
                      my: 1,
                      borderRadius: 1,
                      backgroundColor: 'rgba(0,0,0,0.1)',
                      '& .MuiLinearProgress-bar': {
                        backgroundColor: getCoverageColor(report.referencesCoverage.covered.length / (report.referencesCoverage.covered.length + report.referencesCoverage.notCovered.length) || 0),
                      }
                    }}
                  />
                </Box>
                
                <Box sx={{ my: 2 }}>
                  <Typography variant="body2">Constraints Coverage</Typography>
                  <LinearProgress
                    variant="determinate"
                    value={report.constraintsCoverage.covered.length / (report.constraintsCoverage.covered.length + report.constraintsCoverage.notCovered.length) * 100 || 0}
                    sx={{
                      height: 20,
                      my: 1,
                      borderRadius: 1,
                      backgroundColor: 'rgba(0,0,0,0.1)',
                      '& .MuiLinearProgress-bar': {
                        backgroundColor: getCoverageColor(report.constraintsCoverage.covered.length / (report.constraintsCoverage.covered.length + report.constraintsCoverage.notCovered.length) || 0),
                      }
                    }}
                  />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Detailed coverage information */}
      <Box sx={{ width: '100%', mt: 3 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={currentTab} onChange={handleTabChange} aria-label="coverage tabs">
            <Tab label="Elements" id="coverage-tab-0" aria-controls="coverage-tabpanel-0" />
            <Tab label="Attributes" id="coverage-tab-1" aria-controls="coverage-tabpanel-1" />
            <Tab label="References" id="coverage-tab-2" aria-controls="coverage-tabpanel-2" />
            <Tab label="Constraints" id="coverage-tab-3" aria-controls="coverage-tabpanel-3" />
          </Tabs>
        </Box>

        {/* Elements Tab */}
        <TabPanel value={currentTab} index={0}>
          <Typography variant="subtitle1" gutterBottom>
            Elements Coverage: {report.metrics[0].percentage}%
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="subtitle2" gutterBottom>
                Covered Elements ({report.elementsCoverage.covered.length})
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell align="right">Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {report.elementsCoverage.covered.map((element) => (
                      <TableRow key={element.id}>
                        <TableCell>{element.name}</TableCell>
                        <TableCell align="right">
                          <Chip
                            icon={<CheckCircleIcon />}
                            label="Covered"
                            size="small"
                            color="success"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="subtitle2" gutterBottom>
                Uncovered Elements ({report.elementsCoverage.notCovered.length})
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell align="right">Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {report.elementsCoverage.notCovered.map((element) => (
                      <TableRow key={element.id}>
                        <TableCell>{element.name}</TableCell>
                        <TableCell align="right">
                          <Chip
                            icon={<ErrorIcon />}
                            label="Not Covered"
                            size="small"
                            color="error"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>
          </Grid>
        </TabPanel>

        {/* Attributes Tab */}
        <TabPanel value={currentTab} index={1}>
          <Typography variant="subtitle1" gutterBottom>
            Attributes Coverage: {report.metrics[1].percentage}%
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="subtitle2" gutterBottom>
                Covered Attributes ({report.attributesCoverage.covered.length})
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Class</TableCell>
                      <TableCell>Attribute</TableCell>
                      <TableCell align="right">Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {report.attributesCoverage.covered.map((attr) => (
                      <TableRow key={attr.id}>
                        <TableCell>{attr.className}</TableCell>
                        <TableCell>{attr.name}</TableCell>
                        <TableCell align="right">
                          <Chip
                            icon={<CheckCircleIcon />}
                            label="Covered"
                            size="small"
                            color="success"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="subtitle2" gutterBottom>
                Uncovered Attributes ({report.attributesCoverage.notCovered.length})
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Class</TableCell>
                      <TableCell>Attribute</TableCell>
                      <TableCell align="right">Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {report.attributesCoverage.notCovered.map((attr) => (
                      <TableRow key={attr.id}>
                        <TableCell>{attr.className}</TableCell>
                        <TableCell>{attr.name}</TableCell>
                        <TableCell align="right">
                          <Chip
                            icon={<ErrorIcon />}
                            label="Not Covered"
                            size="small"
                            color="error"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>
          </Grid>
        </TabPanel>

        {/* References Tab */}
        <TabPanel value={currentTab} index={2}>
          <Typography variant="subtitle1" gutterBottom>
            References Coverage: {report.metrics[2].percentage}%
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="subtitle2" gutterBottom>
                Covered References ({report.referencesCoverage.covered.length})
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Class</TableCell>
                      <TableCell>Reference</TableCell>
                      <TableCell align="right">Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {report.referencesCoverage.covered.map((ref) => (
                      <TableRow key={ref.id}>
                        <TableCell>{ref.className}</TableCell>
                        <TableCell>{ref.name}</TableCell>
                        <TableCell align="right">
                          <Chip
                            icon={<CheckCircleIcon />}
                            label="Covered"
                            size="small"
                            color="success"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="subtitle2" gutterBottom>
                Uncovered References ({report.referencesCoverage.notCovered.length})
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Class</TableCell>
                      <TableCell>Reference</TableCell>
                      <TableCell align="right">Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {report.referencesCoverage.notCovered.map((ref) => (
                      <TableRow key={ref.id}>
                        <TableCell>{ref.className}</TableCell>
                        <TableCell>{ref.name}</TableCell>
                        <TableCell align="right">
                          <Chip
                            icon={<ErrorIcon />}
                            label="Not Covered"
                            size="small"
                            color="error"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>
          </Grid>
        </TabPanel>

        {/* Constraints Tab */}
        <TabPanel value={currentTab} index={3}>
          <Typography variant="subtitle1" gutterBottom>
            Constraints Coverage: {report.metrics[3].percentage}%
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="subtitle2" gutterBottom>
                Covered Constraints ({report.constraintsCoverage.covered.length})
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Class</TableCell>
                      <TableCell>Constraint</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell align="right">Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {report.constraintsCoverage.covered.map((constraint) => (
                      <TableRow key={constraint.id}>
                        <TableCell>{constraint.className}</TableCell>
                        <TableCell>{constraint.name}</TableCell>
                        <TableCell>{constraint.type}</TableCell>
                        <TableCell align="right">
                          <Chip
                            icon={<CheckCircleIcon />}
                            label="Covered"
                            size="small"
                            color="success"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="subtitle2" gutterBottom>
                Uncovered Constraints ({report.constraintsCoverage.notCovered.length})
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Class</TableCell>
                      <TableCell>Constraint</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell align="right">Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {report.constraintsCoverage.notCovered.map((constraint) => (
                      <TableRow key={constraint.id}>
                        <TableCell>{constraint.className}</TableCell>
                        <TableCell>{constraint.name}</TableCell>
                        <TableCell>{constraint.type}</TableCell>
                        <TableCell align="right">
                          <Chip
                            icon={<ErrorIcon />}
                            label="Not Covered"
                            size="small"
                            color="error"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>
          </Grid>
        </TabPanel>
      </Box>

      {/* Elements coverage details */}
      <Paper sx={{ mt: 3, p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Elements Coverage ({Math.round(report.elementsCoverage.covered.length / (report.elementsCoverage.covered.length + report.elementsCoverage.notCovered.length) * 100 || 0)}%)
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle2" gutterBottom>
              Covered Elements ({report.elementsCoverage.covered.length})
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell align="right">Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.elementsCoverage.covered.map((element) => (
                    <TableRow key={element.id}>
                      <TableCell>{element.name}</TableCell>
                      <TableCell align="right">
                        <Chip
                          icon={<CheckCircleIcon />}
                          label="Covered"
                          size="small"
                          color="success"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle2" gutterBottom>
              Uncovered Elements ({report.elementsCoverage.notCovered.length})
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell align="right">Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.elementsCoverage.notCovered.map((element) => (
                    <TableRow key={element.id}>
                      <TableCell>{element.name}</TableCell>
                      <TableCell align="right">
                        <Chip
                          icon={<ErrorIcon />}
                          label="Not Covered"
                          size="small"
                          color="error"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        </Grid>
      </Paper>

      {/* Attributes coverage details */}
      <Paper sx={{ mt: 3, p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Attributes Coverage ({Math.round(report.attributesCoverage.covered.length / (report.attributesCoverage.covered.length + report.attributesCoverage.notCovered.length) * 100 || 0)}%)
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle2" gutterBottom>
              Covered Attributes ({report.attributesCoverage.covered.length})
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Class</TableCell>
                    <TableCell>Attribute</TableCell>
                    <TableCell align="right">Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.attributesCoverage.covered.map((attr) => (
                    <TableRow key={attr.id}>
                      <TableCell>{attr.className}</TableCell>
                      <TableCell>{attr.name}</TableCell>
                      <TableCell align="right">
                        <Chip
                          icon={<CheckCircleIcon />}
                          label="Covered"
                          size="small"
                          color="success"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle2" gutterBottom>
              Uncovered Attributes ({report.attributesCoverage.notCovered.length})
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Class</TableCell>
                    <TableCell>Attribute</TableCell>
                    <TableCell align="right">Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.attributesCoverage.notCovered.map((attr) => (
                    <TableRow key={attr.id}>
                      <TableCell>{attr.className}</TableCell>
                      <TableCell>{attr.name}</TableCell>
                      <TableCell align="right">
                        <Chip
                          icon={<ErrorIcon />}
                          label="Not Covered"
                          size="small"
                          color="error"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        </Grid>
      </Paper>

      {/* References coverage details */}
      <Paper sx={{ mt: 3, p: 3 }}>
        <Typography variant="h6" gutterBottom>
          References Coverage ({Math.round(report.referencesCoverage.covered.length / (report.referencesCoverage.covered.length + report.referencesCoverage.notCovered.length) * 100 || 0)}%)
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle2" gutterBottom>
              Covered References ({report.referencesCoverage.covered.length})
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Class</TableCell>
                    <TableCell>Reference</TableCell>
                    <TableCell align="right">Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.referencesCoverage.covered.map((ref) => (
                    <TableRow key={ref.id}>
                      <TableCell>{ref.className}</TableCell>
                      <TableCell>{ref.name}</TableCell>
                      <TableCell align="right">
                        <Chip
                          icon={<CheckCircleIcon />}
                          label="Covered"
                          size="small"
                          color="success"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle2" gutterBottom>
              Uncovered References ({report.referencesCoverage.notCovered.length})
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Class</TableCell>
                    <TableCell>Reference</TableCell>
                    <TableCell align="right">Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.referencesCoverage.notCovered.map((ref) => (
                    <TableRow key={ref.id}>
                      <TableCell>{ref.className}</TableCell>
                      <TableCell>{ref.name}</TableCell>
                      <TableCell align="right">
                        <Chip
                          icon={<ErrorIcon />}
                          label="Not Covered"
                          size="small"
                          color="error"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        </Grid>
      </Paper>

      {/* Constraints coverage details */}
      <Paper sx={{ mt: 3, p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Constraints Coverage ({Math.round(report.constraintsCoverage.covered.length / (report.constraintsCoverage.covered.length + report.constraintsCoverage.notCovered.length) * 100 || 0)}%)
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle2" gutterBottom>
              Covered Constraints ({report.constraintsCoverage.covered.length})
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Class</TableCell>
                    <TableCell>Constraint</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell align="right">Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.constraintsCoverage.covered.map((constraint) => (
                    <TableRow key={constraint.id}>
                      <TableCell>{constraint.className}</TableCell>
                      <TableCell>{constraint.name}</TableCell>
                      <TableCell>{constraint.type}</TableCell>
                      <TableCell align="right">
                        <Chip
                          icon={<CheckCircleIcon />}
                          label="Covered"
                          size="small"
                          color="success"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle2" gutterBottom>
              Uncovered Constraints ({report.constraintsCoverage.notCovered.length})
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Class</TableCell>
                    <TableCell>Constraint</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell align="right">Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.constraintsCoverage.notCovered.map((constraint) => (
                    <TableRow key={constraint.id}>
                      <TableCell>{constraint.className}</TableCell>
                      <TableCell>{constraint.name}</TableCell>
                      <TableCell>{constraint.type}</TableCell>
                      <TableCell align="right">
                        <Chip
                          icon={<ErrorIcon />}
                          label="Not Covered"
                          size="small"
                          color="error"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default TestCoverageReport; 