/**
 * Comprehensive Brand Voice Options
 * Based on marketing best practices and industry standards
 */

export const BRAND_VOICES = [
  // Professional & Authoritative
  "Professional",
  "Authoritative",
  "Expert",
  "Academic",
  "Technical",
  "Formal",
  "Corporate",
  
  // Friendly & Approachable
  "Friendly",
  "Conversational",
  "Casual",
  "Warm",
  "Approachable",
  "Personable",
  "Relatable",
  
  // Innovative & Forward-Thinking
  "Innovative",
  "Cutting-Edge",
  "Forward-Thinking",
  "Visionary",
  "Progressive",
  "Disruptive",
  "Bold",
  
  // Trustworthy & Reliable
  "Trustworthy",
  "Reliable",
  "Dependable",
  "Transparent",
  "Honest",
  "Ethical",
  "Responsible",
  
  // Energetic & Dynamic
  "Energetic",
  "Dynamic",
  "Enthusiastic",
  "Passionate",
  "Vibrant",
  "Exciting",
  "Lively",
  
  // Calm & Reassuring
  "Calm",
  "Reassuring",
  "Supportive",
  "Empathetic",
  "Caring",
  "Nurturing",
  "Patient",
  
  // Playful & Creative
  "Playful",
  "Creative",
  "Quirky",
  "Witty",
  "Humorous",
  "Fun",
  "Lighthearted",
  
  // Sophisticated & Elegant
  "Sophisticated",
  "Elegant",
  "Refined",
  "Premium",
  "Luxurious",
  "Exclusive",
  "High-End",
  
  // Direct & No-Nonsense
  "Direct",
  "Straightforward",
  "Concise",
  "No-Nonsense",
  "Matter-of-Fact",
  "Clear",
  "Efficient",
  
  // Inspirational & Motivational
  "Inspirational",
  "Motivational",
  "Empowering",
  "Uplifting",
  "Encouraging",
  "Positive",
  "Aspirational",
  
  // Data-Driven & Analytical
  "Data-Driven",
  "Analytical",
  "Logical",
  "Objective",
  "Evidence-Based",
  "Metrics-Focused",
  "Results-Oriented",
  
  // Customer-Centric
  "Customer-Centric",
  "Service-Oriented",
  "Solution-Focused",
  "Helpful",
  "Responsive",
  "Accommodating",
  "Consultative",
] as const;

export type BrandVoice = typeof BRAND_VOICES[number];

// Helper function to get description for each brand voice
export function getBrandVoiceDescription(voice: string): string {
  const descriptions: Record<string, string> = {
    "Professional": "Business-like, polished, and industry-appropriate",
    "Authoritative": "Commanding expertise and respect",
    "Expert": "Deep knowledge and specialized expertise",
    "Academic": "Scholarly and research-focused",
    "Technical": "Precise technical terminology and details",
    "Formal": "Traditional, structured communication",
    "Corporate": "Enterprise-level, process-oriented",
    
    "Friendly": "Warm and welcoming tone",
    "Conversational": "Natural, everyday language",
    "Casual": "Relaxed and informal",
    "Warm": "Kind and caring communication",
    "Approachable": "Easy to connect with",
    "Personable": "Human and relatable",
    "Relatable": "Easy to identify with",
    
    "Innovative": "Forward-thinking and groundbreaking",
    "Cutting-Edge": "Latest technology and trends",
    "Forward-Thinking": "Future-focused perspective",
    "Visionary": "Big-picture thinking",
    "Progressive": "Advancing and evolving",
    "Disruptive": "Challenging the status quo",
    "Bold": "Confident and daring",
    
    "Trustworthy": "Reliable and honest",
    "Reliable": "Consistent and dependable",
    "Dependable": "Always there when needed",
    "Transparent": "Open and clear communication",
    "Honest": "Truthful and straightforward",
    "Ethical": "Principled and moral",
    "Responsible": "Accountable and conscientious",
  };
  
  return descriptions[voice] || "";
}
