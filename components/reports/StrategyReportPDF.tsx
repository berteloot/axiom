import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  Image,
} from '@react-pdf/renderer';
import { ReportData, BrandContext } from '@/lib/report-analysis';

// Register fonts - Using Helvetica (built-in, reliable)
// Inter font registration removed to avoid loading issues

// Nytro brand color palette
const colors = {
  primary: '#F96E11', // Nytro brand orange
  navy: '#1e293b',
  darkGray: '#374151',
  gray: '#6b7280',
  lightGray: '#f3f4f6',
  white: '#ffffff',
  red: '#dc2626',
  green: '#059669',
  blue: '#2563eb',
};

// Styles
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica', // Fallback to Helvetica if Inter fails
    fontSize: 11,
    color: colors.navy,
  },
  coverPage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  coverTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 20,
    textAlign: 'center',
  },
  coverSubtitle: {
    fontSize: 18,
    color: colors.gray,
    marginBottom: 40,
    textAlign: 'center',
  },
  coverDate: {
    fontSize: 14,
    color: colors.darkGray,
    marginBottom: 60,
  },
  coverFooter: {
    position: 'absolute',
    bottom: 40,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 10,
    color: colors.gray,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 15,
    borderBottom: 2,
    borderBottomColor: colors.primary,
    paddingBottom: 5,
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.darkGray,
    marginBottom: 10,
    marginTop: 15,
  },
  healthScore: {
    fontSize: 48,
    fontWeight: 'bold',
    color: colors.green,
    textAlign: 'center',
    marginVertical: 20,
  },
  healthScoreLabel: {
    fontSize: 16,
    color: colors.gray,
    textAlign: 'center',
    marginBottom: 20,
  },
  metricGrid: {
    flexDirection: 'row',
    marginVertical: 15,
  },
  metricItem: {
    flex: 1,
    padding: 10,
    backgroundColor: colors.lightGray,
    marginHorizontal: 5,
    borderRadius: 5,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.navy,
    textAlign: 'center',
  },
  metricLabel: {
    fontSize: 10,
    color: colors.gray,
    textAlign: 'center',
    marginTop: 5,
  },
  table: {
    borderWidth: 1,
    borderColor: colors.lightGray,
    marginVertical: 10,
  },
  tableHeader: {
    backgroundColor: colors.primary,
    color: colors.white,
    padding: 8,
    fontWeight: 'bold',
    fontSize: 12,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.lightGray,
  },
  tableCell: {
    padding: 8,
    flex: 1,
    fontSize: 10,
  },
  tableCellHeader: {
    backgroundColor: colors.lightGray,
    fontWeight: 'bold',
  },
  gapItem: {
    marginBottom: 15,
    padding: 10,
    backgroundColor: colors.lightGray,
    borderRadius: 5,
  },
  gapTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.navy,
    marginBottom: 5,
  },
  gapDescription: {
    fontSize: 10,
    color: colors.gray,
    marginBottom: 5,
  },
  gapSeverity: {
    fontSize: 9,
    color: colors.red,
    textTransform: 'uppercase',
  },
  winItem: {
    marginBottom: 10,
    padding: 8,
    backgroundColor: '#f0fdf4',
    borderLeftWidth: 4,
    borderLeftColor: colors.green,
  },
  winText: {
    fontSize: 11,
    color: colors.darkGray,
  },
  recommendationItem: {
    marginBottom: 8,
    padding: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.lightGray,
    borderRadius: 3,
  },
  recommendationText: {
    fontSize: 10,
    color: colors.navy,
  },
  pageNumber: {
    position: 'absolute',
    bottom: 20,
    right: 40,
    fontSize: 9,
    color: colors.gray,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    fontSize: 9,
    color: colors.gray,
  },
  logo: {
    width: 200,
    height: 200, // Maintain square aspect ratio (logo is 1126x1124, nearly square)
    marginBottom: 30,
  },
  footerLogo: {
    width: 80,
    height: 26,
    marginRight: 8,
  },
  footerContainer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: 'row',
    alignItems: 'center',
    fontSize: 9,
    color: colors.gray,
  },
});

interface StrategyReportPDFProps {
  reportData: ReportData;
  clientName?: string;
  brandContext?: BrandContext;
}

// Cover Page Component
const CoverPage: React.FC<{ reportData: ReportData; clientName?: string }> = ({ reportData, clientName }) => (
  <Page size="A4" style={styles.page}>
    <View style={styles.coverPage}>
      <Image
        src="/logo_Nytro_color.png"
        style={styles.logo}
      />
      <Text style={styles.coverTitle}>Asset Strategy Audit</Text>
      <Text style={styles.coverSubtitle}>
        {clientName || 'Client'} Content Library Analysis
      </Text>
      <Text style={styles.coverDate}>
        Generated: {new Date(reportData.generatedAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
      </Text>
    </View>
    <View style={styles.footerContainer}>
      <Image
        src="/logo_Nytro_color.png"
        style={styles.footerLogo}
      />
      <Text>Generated by Nytro.ai • Professional Content Strategy Analysis</Text>
    </View>
  </Page>
);

// Executive Summary Page Component
const ExecutiveSummaryPage: React.FC<{ reportData: ReportData }> = ({ reportData }) => (
  <Page size="A4" style={styles.page}>
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Executive Summary</Text>

      <View style={{ textAlign: 'center', marginVertical: 20 }}>
        <Text style={styles.healthScore}>{reportData.healthScore}%</Text>
        <Text style={styles.healthScoreLabel}>Content Health Score</Text>
      </View>

      <View style={styles.metricGrid}>
        <View style={styles.metricItem}>
          <Text style={styles.metricValue}>{reportData.inventoryBreakdown.total}</Text>
          <Text style={styles.metricLabel}>Total Assets</Text>
        </View>
        <View style={styles.metricItem}>
          <Text style={styles.metricValue}>{reportData.coverageHeatmap.totalPersonas}</Text>
          <Text style={styles.metricLabel}>Target Personas</Text>
        </View>
        <View style={styles.metricItem}>
          <Text style={styles.metricValue}>{reportData.coverageHeatmap.totalGaps}</Text>
          <Text style={styles.metricLabel}>Coverage Gaps</Text>
        </View>
      </View>

      <Text style={styles.subsectionTitle}>Top Strategic Wins</Text>
      {reportData.strategicWins.slice(0, 3).map((win, index) => (
        <View key={index} style={styles.winItem}>
          <Text style={styles.winText}>✓ {win}</Text>
        </View>
      ))}

      <Text style={styles.subsectionTitle}>Critical Gaps Requiring Attention</Text>
      {[
        ...reportData.gapAnalysis.criticalGaps.slice(0, 2),
        ...reportData.gapAnalysis.contentGaps.slice(0, 1),
      ].map((gap, index) => (
        <View key={index} style={styles.gapItem}>
          <Text style={styles.gapTitle}>{gap.title}</Text>
          <Text style={styles.gapDescription}>{gap.description}</Text>
          <Text style={styles.gapSeverity}>{gap.severity.toUpperCase()} PRIORITY</Text>
        </View>
      ))}
    </View>

    <Text style={styles.pageNumber} render={({ pageNumber }) => `${pageNumber}`} />
    <View style={styles.footerContainer}>
      <Image
        src="/logo_Nytro_color.png"
        style={styles.footerLogo}
      />
      <Text>Generated by Nytro.ai</Text>
    </View>
  </Page>
);

// Funnel Health Page Component
const FunnelHealthPage: React.FC<{ reportData: ReportData }> = ({ reportData }) => (
  <Page size="A4" style={styles.page}>
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Deep Dive - Funnel Health</Text>

      <Text style={{ marginBottom: 15, fontSize: 12, color: colors.darkGray }}>
        Distribution of content assets across the customer journey stages
      </Text>

      <View style={styles.table}>
        <View style={styles.tableRow}>
          <Text style={[styles.tableCell, styles.tableCellHeader]}>Funnel Stage</Text>
          <Text style={[styles.tableCell, styles.tableCellHeader]}>Assets</Text>
          <Text style={[styles.tableCell, styles.tableCellHeader]}>Percentage</Text>
          <Text style={[styles.tableCell, styles.tableCellHeader]}>Status</Text>
        </View>
        {Object.entries(reportData.inventoryBreakdown.byStage).map(([stage, count]) => {
          const percentage = reportData.inventoryBreakdown.total > 0
            ? Math.round((count / reportData.inventoryBreakdown.total) * 100)
            : 0;
          const status = stage === 'BOFU_DECISION' && percentage < 10 ? '⚠️ Low' : '✓ Good';

          return (
            <View key={stage} style={styles.tableRow}>
              <Text style={styles.tableCell}>{stage.replace('_', ' ')}</Text>
              <Text style={styles.tableCell}>{count}</Text>
              <Text style={styles.tableCell}>{percentage}%</Text>
              <Text style={styles.tableCell}>{status}</Text>
            </View>
          );
        })}
      </View>

      <Text style={styles.subsectionTitle}>Asset Type Distribution</Text>
      <View style={styles.table}>
        <View style={styles.tableRow}>
          <Text style={[styles.tableCell, styles.tableCellHeader]}>Asset Type</Text>
          <Text style={[styles.tableCell, styles.tableCellHeader]}>Count</Text>
        </View>
        {Object.entries(reportData.inventoryBreakdown.byAssetType).map(([type, count]) => (
          <View key={type} style={styles.tableRow}>
            <Text style={styles.tableCell}>{type}</Text>
            <Text style={styles.tableCell}>{count}</Text>
          </View>
        ))}
      </View>
    </View>

    <Text style={styles.pageNumber} render={({ pageNumber }) => `${pageNumber}`} />
    <View style={styles.footerContainer}>
      <Image
        src="/logo_Nytro_color.png"
        style={styles.footerLogo}
      />
      <Text>Generated by Nytro.ai</Text>
    </View>
  </Page>
);

// Persona Coverage Page Component
const PersonaCoveragePage: React.FC<{ reportData: ReportData }> = ({ reportData }) => (
  <Page size="A4" style={styles.page}>
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Deep Dive - Persona Coverage</Text>

      <Text style={{ marginBottom: 15, fontSize: 12, color: colors.darkGray }}>
        Content coverage heatmap showing which personas have assets at each funnel stage
      </Text>

      <View style={styles.table}>
        <View style={styles.tableRow}>
          <Text style={[styles.tableCell, styles.tableCellHeader]}>Persona</Text>
          <Text style={[styles.tableCell, styles.tableCellHeader]}>TOFU</Text>
          <Text style={[styles.tableCell, styles.tableCellHeader]}>MOFU</Text>
          <Text style={[styles.tableCell, styles.tableCellHeader]}>BOFU</Text>
          <Text style={[styles.tableCell, styles.tableCellHeader]}>Retention</Text>
          <Text style={[styles.tableCell, styles.tableCellHeader]}>Coverage</Text>
        </View>
        {Object.entries(reportData.coverageHeatmap.personaCoverage).map(([persona, stages]) => {
          const coveredStages = Object.values(stages).filter(count => count > 0).length;
          const totalStages = Object.keys(stages).length;
          const coveragePercent = Math.round((coveredStages / totalStages) * 100);

          return (
            <View key={persona} style={styles.tableRow}>
              <Text style={styles.tableCell}>{persona}</Text>
              <Text style={styles.tableCell}>{stages.TOFU_AWARENESS > 0 ? stages.TOFU_AWARENESS : '—'}</Text>
              <Text style={styles.tableCell}>{stages.MOFU_CONSIDERATION > 0 ? stages.MOFU_CONSIDERATION : '—'}</Text>
              <Text style={styles.tableCell}>{stages.BOFU_DECISION > 0 ? stages.BOFU_DECISION : '—'}</Text>
              <Text style={styles.tableCell}>{stages.RETENTION > 0 ? stages.RETENTION : '—'}</Text>
              <Text style={styles.tableCell}>{coveragePercent}%</Text>
            </View>
          );
        })}
      </View>

      <Text style={styles.subsectionTitle}>Neglected Personas</Text>
      {Object.entries(reportData.coverageHeatmap.personaCoverage)
        .filter(([, stages]) => Object.values(stages).every(count => count === 0))
        .map(([persona]) => (
          <View key={persona} style={styles.gapItem}>
            <Text style={styles.gapTitle}>{persona}</Text>
            <Text style={styles.gapDescription}>No content assets found for this persona</Text>
            <Text style={styles.gapSeverity}>CRITICAL GAP</Text>
          </View>
        ))}
    </View>

    <Text style={styles.pageNumber} render={({ pageNumber }) => `${pageNumber}`} />
    <View style={styles.footerContainer}>
      <Image
        src="/logo_Nytro_color.png"
        style={styles.footerLogo}
      />
      <Text>Generated by Nytro.ai</Text>
    </View>
  </Page>
);

// Brand Identity Page Component
const BrandIdentityPage: React.FC<{ brandContext?: BrandContext; clientName?: string }> = ({ brandContext, clientName }) => (
  <Page size="A4" style={styles.page}>
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Company Overview</Text>

      <Text style={{ marginBottom: 15, fontSize: 12, color: colors.darkGray }}>
        Understanding {clientName || 'the organization'} before analyzing content strategy
      </Text>

      {brandContext?.valueProposition && (
        <View style={{ marginBottom: 20 }}>
          <Text style={styles.subsectionTitle}>Value Proposition</Text>
          <Text style={{ fontSize: 11, color: colors.darkGray, lineHeight: 1.5 }}>
            {brandContext.valueProposition}
          </Text>
        </View>
      )}

      {brandContext?.painClusters && brandContext.painClusters.length > 0 && (
        <View style={{ marginBottom: 20 }}>
          <Text style={styles.subsectionTitle}>Problems We Solve</Text>
          {brandContext.painClusters.map((pain, index) => (
            <View key={index} style={{ flexDirection: 'row', marginBottom: 5 }}>
              <Text style={{ fontSize: 11, color: colors.darkGray }}>• </Text>
              <Text style={{ fontSize: 11, color: colors.darkGray, flex: 1 }}>{pain}</Text>
            </View>
          ))}
        </View>
      )}

      {brandContext?.primaryICPRoles && brandContext.primaryICPRoles.length > 0 && (
        <View style={{ marginBottom: 20 }}>
          <Text style={styles.subsectionTitle}>Key Decision Makers</Text>
          <Text style={{ fontSize: 11, color: colors.darkGray, marginBottom: 8 }}>
            Primary buyer personas and job titles:
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {brandContext.primaryICPRoles.map((role, index) => (
              <View key={index} style={{ backgroundColor: colors.lightGray, padding: 6, margin: 2, borderRadius: 3 }}>
                <Text style={{ fontSize: 10, color: colors.navy }}>{role}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {brandContext?.targetIndustries && brandContext.targetIndustries.length > 0 && (
        <View style={{ marginBottom: 20 }}>
          <Text style={styles.subsectionTitle}>Target Industries</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {brandContext.targetIndustries.map((industry, index) => (
              <View key={index} style={{ backgroundColor: colors.lightGray, padding: 6, margin: 2, borderRadius: 3 }}>
                <Text style={{ fontSize: 10, color: colors.navy }}>{industry}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {brandContext?.useCases && brandContext.useCases.length > 0 && (
        <View style={{ marginBottom: 20 }}>
          <Text style={styles.subsectionTitle}>How Customers Use Our Solutions</Text>
          {brandContext.useCases.slice(0, 3).map((useCase, index) => (
            <View key={index} style={{ flexDirection: 'row', marginBottom: 5 }}>
              <Text style={{ fontSize: 11, color: colors.darkGray }}>• </Text>
              <Text style={{ fontSize: 11, color: colors.darkGray, flex: 1 }}>{useCase}</Text>
            </View>
          ))}
        </View>
      )}

      {brandContext?.keyDifferentiators && brandContext.keyDifferentiators.length > 0 && (
        <View style={{ marginBottom: 20 }}>
          <Text style={styles.subsectionTitle}>What Makes Us Different</Text>
          {brandContext.keyDifferentiators.map((differentiator, index) => (
            <View key={index} style={{ flexDirection: 'row', marginBottom: 5 }}>
              <Text style={{ fontSize: 11, color: colors.green }}>✓ </Text>
              <Text style={{ fontSize: 11, color: colors.darkGray, flex: 1 }}>{differentiator}</Text>
            </View>
          ))}
        </View>
      )}

      {!brandContext && (
        <View style={{ padding: 20, backgroundColor: colors.lightGray, borderRadius: 5 }}>
          <Text style={{ fontSize: 11, color: colors.gray, textAlign: 'center' }}>
            Brand context not configured. Complete your brand profile in Settings → Brand to see this overview.
          </Text>
        </View>
      )}
    </View>

    <Text style={styles.pageNumber} render={({ pageNumber }) => `${pageNumber}`} />
    <View style={styles.footerContainer}>
      <Image
        src="/logo_Nytro_color.png"
        style={styles.footerLogo}
      />
      <Text>Generated by Nytro.ai</Text>
    </View>
  </Page>
);

// Action Plan Page Component
const ActionPlanPage: React.FC<{ reportData: ReportData }> = ({ reportData }) => (
  <Page size="A4" style={styles.page}>
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Action Plan</Text>

      <Text style={{ marginBottom: 15, fontSize: 12, color: colors.darkGray }}>
        Prioritized recommendations to improve your content strategy
      </Text>

      <Text style={styles.subsectionTitle}>Recommended Assets to Create</Text>
      {reportData.recommendations.map((recommendation, index) => (
        <View key={index} style={styles.recommendationItem}>
          <Text style={styles.recommendationText}>
            {index + 1}. {recommendation}
          </Text>
        </View>
      ))}

      <Text style={styles.subsectionTitle}>Implementation Priority</Text>
      <View style={{ marginTop: 15 }}>
        <Text style={{ fontSize: 11, color: colors.darkGray, marginBottom: 10 }}>
          1. Address critical gaps (missing personas) - High impact, immediate action needed
        </Text>
        <Text style={{ fontSize: 11, color: colors.darkGray, marginBottom: 10 }}>
          2. Improve BOFU content coverage - Essential for conversion optimization
        </Text>
        <Text style={{ fontSize: 11, color: colors.darkGray, marginBottom: 10 }}>
          3. Address unmentioned pain points - Fill content gaps in existing personas
        </Text>
        <Text style={{ fontSize: 11, color: colors.darkGray }}>
          4. Optimize and refresh existing content - Maintain quality and relevance
        </Text>
      </View>
    </View>

    <Text style={styles.pageNumber} render={({ pageNumber }) => `${pageNumber}`} />
    <View style={styles.footerContainer}>
      <Image
        src="/logo_Nytro_color.png"
        style={styles.footerLogo}
      />
      <Text>Generated by Nytro.ai</Text>
    </View>
  </Page>
);

// Main PDF Document Component
const StrategyReportPDF: React.FC<StrategyReportPDFProps> = ({ reportData, clientName, brandContext }) => (
  <Document>
    <CoverPage reportData={reportData} clientName={clientName} />
    <ExecutiveSummaryPage reportData={reportData} />
    <BrandIdentityPage brandContext={brandContext} clientName={clientName} />
    <FunnelHealthPage reportData={reportData} />
    <PersonaCoveragePage reportData={reportData} />
    <ActionPlanPage reportData={reportData} />
  </Document>
);

export default StrategyReportPDF;