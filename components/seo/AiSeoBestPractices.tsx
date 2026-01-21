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
              Make your content easy to extract, clearly attributable, and demonstrably trustworthy. Focus on good SEO fundamentals and helpful, people-first content.
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
                  <p className="text-xs text-gray-600 mt-1">Start with a 2-4 sentence direct answer that matches the primary query. Make answers easy to extract and verify.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm text-gray-900">Precise Question-Based Headings</p>
                  <p className="text-xs text-gray-600 mt-1">Use question-led headings, but make them specific. Good: "What is X?" Better: "What is X in B2B SaaS lead scoring?" Reduces ambiguity and improves match quality.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm text-gray-900">Extractable Content Blocks</p>
                  <p className="text-xs text-gray-600 mt-1">Structure as: 1 sentence answer, 3-6 bullets of supporting detail, one example (numbers or scenario). Makes it easier for systems to identify the right passage.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm text-gray-900">Use Tables Correctly</p>
                  <p className="text-xs text-gray-600 mt-1">Use real HTML tables (not images) for tabular data. Include a caption, use column headers (&lt;th&gt;), consistent units, and focus on one decision or comparison per table.</p>
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
                <Shield className="h-5 w-5 text-indigo-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm text-gray-900">Demonstrate E-E-A-T Explicitly</p>
                  <p className="text-xs text-gray-600 mt-1">Add named authors with credentials, cite primary sources for facts/numbers, separate observations from inferences. Google emphasizes people-first content and E-E-A-T signals.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Lightbulb className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm text-gray-900">Avoid "Scaled Filler"</p>
                  <p className="text-xs text-gray-600 mt-1">If using AI to generate content, add real value: analysis, original examples, proprietary data, or strong editorial review. Mass-producing low-value pages can violate spam policies.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Lightbulb className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm text-gray-900">Content That Wins Citations</p>
                  <p className="text-xs text-gray-600 mt-1">AI answer engines disproportionately cite content that looks like it has a right to exist. Show expertise, experience, and trustworthiness clearly.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm text-gray-900">FAQs: Content Yes, Schema Carefully</p>
                  <p className="text-xs text-gray-600 mt-1">Include FAQ sections for users and long-tail coverage. Note: FAQPage schema eligibility is now limited to well-known government and health sites. For most commercial sites, keep the FAQ content, skip the markup.</p>
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
                  <p className="font-medium text-sm text-gray-900">Strategic Structured Data</p>
                  <p className="text-xs text-gray-600 mt-1">Prioritize durable, business-relevant schema: Organization, Person, Article, BreadcrumbList, Product, Review (when applicable), VideoObject. HowTo only for true step-by-step tasks. FAQPage only if eligible.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Zap className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm text-gray-900">Freshness & Maintenance</p>
                  <p className="text-xs text-gray-600 mt-1">Show visible "Updated on" dates when you materially update content. Quarterly refresh for pages tied to tools, pricing, regulations, or fast-moving categories. Prune or consolidate thin pages.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Zap className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm text-gray-900">SEO Fundamentals</p>
                  <p className="text-xs text-gray-600 mt-1">AI features rely on normal search eligibility. Ensure fast load times, mobile-first design, clean HTML, accessible content, proper indexing, and snippet eligibility.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-indigo-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm text-gray-900">Evidence & Attribution</p>
                  <p className="text-xs text-gray-600 mt-1">Include author box with credentials, cite primary sources, show methodology, provide editorial policy explaining how you test, update, and correct content.</p>
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
            <div className="bg-white/60 rounded-lg p-4 space-y-3 border border-indigo-100">
              <div className="space-y-2.5 text-xs">
                <div className="flex items-start gap-2">
                  <span className="font-bold text-indigo-600">1.</span>
                  <div>
                    <p className="font-semibold text-gray-900">H1: Exact topic</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-indigo-600">2.</span>
                  <div>
                    <p className="font-semibold text-gray-900">Answer block (2-4 sentences)</p>
                    <p className="text-gray-600 mt-0.5">Direct, quotable, no throat-clearing. Matches primary query.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-indigo-600">3.</span>
                  <div>
                    <p className="font-semibold text-gray-900">Key takeaways (3-6 bullets)</p>
                    <p className="text-gray-600 mt-0.5">Practical and specific.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-indigo-600">4.</span>
                  <div>
                    <p className="font-semibold text-gray-900">Main sections (H2 as questions)</p>
                    <p className="text-gray-600 mt-0.5">Each starts with one-sentence answer, then bullets/steps/table/example.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-indigo-600">5.</span>
                  <div>
                    <p className="font-semibold text-gray-900">Proof section</p>
                    <p className="text-gray-600 mt-0.5">Sources, methodology, screenshots, or mini case study.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-indigo-600">6.</span>
                  <div>
                    <p className="font-semibold text-gray-900">FAQ section (plain content)</p>
                    <p className="text-gray-600 mt-0.5">5-8 real questions from sales calls, support tickets, or Search Console queries.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-indigo-600">7.</span>
                  <div>
                    <p className="font-semibold text-gray-900">Author box + editorial policy</p>
                    <p className="text-gray-600 mt-0.5">How you test, update, and correct content.</p>
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <div className="pt-2 border-t border-blue-200">
          <p className="text-xs text-gray-500 text-center">
            💡 <strong>Remember:</strong> There are no special "AI SEO" tricks. Focus on helpful, reliable, people-first content that's easy to extract and clearly attributable. Good SEO fundamentals win.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
