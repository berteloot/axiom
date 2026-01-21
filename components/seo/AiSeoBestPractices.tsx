"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Sparkles, 
  ChevronDown, 
  FileText, 
  Heading, 
  Code, 
  Shield, 
  TrendingUp,
  CheckCircle2,
  Lightbulb,
  Zap
} from "lucide-react";

export function AiSeoBestPractices() {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    formatting: true,
    structure: false,
    technical: false,
    strategy: false,
  });

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <Card className="border-blue-200 bg-gradient-to-br from-blue-50/50 to-indigo-50/30 shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-100 p-2">
            <Sparkles className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-xl sm:text-2xl text-gray-900 flex items-center gap-2">
              AI SEO Best Practices Guide
              <Badge variant="outline" className="ml-2 border-blue-300 text-blue-700 bg-blue-50">
                2024-2025
              </Badge>
            </CardTitle>
            <CardDescription className="mt-2 text-sm text-gray-600">
              Optimize your content for AI search engines (Google SGE, ChatGPT, Perplexity) with these proven formatting and structure tips
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Content Formatting & Structure */}
        <Collapsible 
          open={openSections.formatting} 
          onOpenChange={() => toggleSection("formatting")}
        >
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-white/80 p-4 hover:bg-white transition-colors border border-blue-100">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-purple-100 p-1.5">
                <FileText className="h-4 w-4 text-purple-600" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-gray-900">Content Formatting & Structure</h3>
                <p className="text-xs text-gray-500 mt-0.5">Lead with answers, use question headings, short paragraphs</p>
              </div>
            </div>
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${openSections.formatting ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 space-y-3">
            <div className="bg-white/60 rounded-lg p-4 space-y-3 border border-purple-100">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm text-gray-900">Lead with the Answer</p>
                  <p className="text-xs text-gray-600 mt-1">Provide a concise 2-4 sentence summary at the top. AI models favor content where answers appear early.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm text-gray-900">Question-Based Headings (H2, H3)</p>
                  <p className="text-xs text-gray-600 mt-1">Use "What is X?", "How do I Y?", "Why does Z?" format. Helps match natural-language queries.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm text-gray-900">Clear Heading Hierarchy</p>
                  <p className="text-xs text-gray-600 mt-1">One H1 per page. Use H2s for main sections, H3s for subsections. Don't skip levels.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm text-gray-900">Short Paragraphs & Lists</p>
                  <p className="text-xs text-gray-600 mt-1">Aim for 2-3 sentences per paragraph. Use bulleted/numbered lists for tips and steps. Tables for comparisons.</p>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Content Strategy */}
        <Collapsible 
          open={openSections.strategy} 
          onOpenChange={() => toggleSection("strategy")}
        >
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-white/80 p-4 hover:bg-white transition-colors border border-blue-100">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-green-100 p-1.5">
                <TrendingUp className="h-4 w-4 text-green-600" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-gray-900">Content Strategy & Voice</h3>
                <p className="text-xs text-gray-500 mt-0.5">Conversational language, entity-rich content, original insights</p>
              </div>
            </div>
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${openSections.strategy ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 space-y-3">
            <div className="bg-white/60 rounded-lg p-4 space-y-3 border border-green-100">
              <div className="flex items-start gap-3">
                <Lightbulb className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm text-gray-900">Conversational & Natural Language</p>
                  <p className="text-xs text-gray-600 mt-1">Write how users speak. Use "why/how" and "what are" formats. AI search picks up answer intent better.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Lightbulb className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm text-gray-900">Entity-Rich Content</p>
                  <p className="text-xs text-gray-600 mt-1">Include names, tools, frameworks, people, places. Internal linking between entity pages builds authority.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Lightbulb className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm text-gray-900">Human Value & Original Insights</p>
                  <p className="text-xs text-gray-600 mt-1">First-hand experience, case studies, anecdotes. Merely rewriting existing content won't work as well.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Lightbulb className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm text-gray-900">Frequent Summary Blocks</p>
                  <p className="text-xs text-gray-600 mt-1">Add mini Q&A or summary blocks underneath headings. Easy for AI to extract exactly.</p>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Technical & Trust Elements */}
        <Collapsible 
          open={openSections.technical} 
          onOpenChange={() => toggleSection("technical")}
        >
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-white/80 p-4 hover:bg-white transition-colors border border-blue-100">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-orange-100 p-1.5">
                <Code className="h-4 w-4 text-orange-600" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-gray-900">Technical & Trust Elements</h3>
                <p className="text-xs text-gray-500 mt-0.5">Schema markup, structured data, website health, trust signals</p>
              </div>
            </div>
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${openSections.technical ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 space-y-3">
            <div className="bg-white/60 rounded-lg p-4 space-y-3 border border-orange-100">
              <div className="flex items-start gap-3">
                <Zap className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm text-gray-900">Schema Markup & Structured Data</p>
                  <p className="text-xs text-gray-600 mt-1">Use Article, FAQPage, HowTo, Review, VideoObject schema. Helps AI identify content type.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Zap className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm text-gray-900">Content Freshness</p>
                  <p className="text-xs text-gray-600 mt-1">Regularly update content (stats, examples). Include "Published / Updated" dates to help AI detect freshness.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Zap className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm text-gray-900">Website Health & Performance</p>
                  <p className="text-xs text-gray-600 mt-1">Fast load times, mobile-first design, clean HTML, accessible content. AI favors sites that perform well.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-indigo-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm text-gray-900">Trust Signals & Branding</p>
                  <p className="text-xs text-gray-600 mt-1">Author bio with credentials, transparent sourcing, clear contact info, HTTPS, reviews, consistent branding.</p>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Quick Formatting Cheatsheet */}
        <Collapsible 
          open={openSections.structure} 
          onOpenChange={() => toggleSection("structure")}
        >
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-white/80 p-4 hover:bg-white transition-colors border border-blue-100">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-indigo-100 p-1.5">
                <Heading className="h-4 w-4 text-indigo-600" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-gray-900">Quick Formatting Cheatsheet</h3>
                <p className="text-xs text-gray-500 mt-0.5">Template structure for AI-optimized content</p>
              </div>
            </div>
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${openSections.structure ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <div className="bg-white/60 rounded-lg p-4 space-y-2 border border-indigo-100">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <p className="font-semibold text-gray-900">✓ Intro</p>
                  <p className="text-gray-600">Short summary block (2-4 sentences). Use "Key Takeaways" or "What you'll learn."</p>
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-gray-900">✓ Headings</p>
                  <p className="text-gray-600">H2s that are actual questions; H3s for subparts. Labels like "FAQ", "How To", "Common Mistakes."</p>
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-gray-900">✓ Within Sections</p>
                  <p className="text-gray-600">Start with one-sentence answer; follow with supporting detail. Use lists or steps.</p>
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-gray-900">✓ After Major Sections</p>
                  <p className="text-gray-600">Include mini-summary or "In summary" blocks.</p>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <p className="font-semibold text-gray-900">✓ End with FAQ Section</p>
                  <p className="text-gray-600">Use common user questions, short and direct answers. Highlight original content: author bio, case studies, quotes, unique images or data.</p>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <div className="pt-2 border-t border-blue-200">
          <p className="text-xs text-gray-500 text-center">
            💡 <strong>Tip:</strong> Format your content with these practices before running the audit to maximize your AI SEO score!
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
