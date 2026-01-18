'use client';

import React, { useMemo, useState, useRef } from 'react';
import { pdf } from '@react-pdf/renderer';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FileText, Loader2, FileDown, ChevronDown } from 'lucide-react';
import { Asset } from '@/lib/types';
import { BrandContext, generateReportData } from '@/lib/report-analysis';
import StrategyReportPDF from './StrategyReportPDF';
import { generateWordDocument } from './StrategyReportWord';

interface DownloadReportButtonProps {
  assets: Asset[];
  brandContext?: BrandContext;
  clientName?: string;
  className?: string;
}

const DownloadReportButton: React.FC<DownloadReportButtonProps> = ({
  assets,
  brandContext,
  clientName,
  className,
}) => {
  const [generatingWord, setGeneratingWord] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const pdfLinkRef = useRef<HTMLAnchorElement>(null);
  const { data: session } = useSession();
  
  // Get user name from session
  const userName = session?.user?.name || session?.user?.email || 'Unknown User';
  
  // Generate report data
  const reportData = useMemo(() => {
    return generateReportData(assets, brandContext, userName);
  }, [assets, brandContext, userName]);

  // Generate filename with timestamp
  const filename = useMemo(() => {
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const clientPrefix = clientName ? `${clientName.replace(/\s+/g, '_')}_` : '';
    return `${clientPrefix}Asset_Strategy_Report_${timestamp}`;
  }, [clientName]);

  const handlePDFDownload = async () => {
    setGeneratingPDF(true);
    try {
      const blob = await pdf(
        <StrategyReportPDF reportData={reportData} clientName={clientName} brandContext={brandContext} userName={userName} />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generating PDF:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Error generating PDF: ${errorMessage}. Please check the console for details.`);
    } finally {
      setGeneratingPDF(false);
    }
  };

  const handleWordDownload = async () => {
    setGeneratingWord(true);
    try {
      await generateWordDocument(reportData, clientName, brandContext, userName);
    } catch (error) {
      console.error('Error generating Word document:', error);
      alert('Error generating Word document. Please try again.');
    } finally {
      setGeneratingWord(false);
    }
  };

  const isLoading = generatingPDF || generatingWord;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="lg"
          disabled={isLoading}
          className={`min-h-[44px] gap-2 ${className || ''}`}
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <FileDown className="h-4 w-4" />
              Download Report
              <ChevronDown className="h-4 w-4" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={isLoading}
          onSelect={(e) => {
            e.preventDefault();
            handlePDFDownload();
          }}
        >
          {generatingPDF ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating PDF...
            </>
          ) : (
            <>
              <FileText className="h-4 w-4 mr-2" />
              Download as PDF
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={isLoading}
          onSelect={(e) => {
            e.preventDefault();
            handleWordDownload();
          }}
        >
          {generatingWord ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating Word...
            </>
          ) : (
            <>
              <FileText className="h-4 w-4 mr-2" />
              Download as Word
            </>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
      <a ref={pdfLinkRef} style={{ display: 'none' }} />
    </DropdownMenu>
  );
};

export default DownloadReportButton;