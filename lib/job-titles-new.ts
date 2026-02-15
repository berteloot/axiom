/**
 * Enhanced job titles with hierarchical metadata (Function × Seniority)
 * Maintains backward compatibility with flat list approach
 */

/**
 * Seniority levels for job title classification
 */
export const SENIORITY_LEVELS = [
  "C-Suite",
  "VP/Director", 
  "Manager",
  "Individual Contributor",
  "Entry Level"
] as const;

export type SeniorityLevel = typeof SENIORITY_LEVELS[number];

/**
 * Functional areas for job title classification
 */
export const FUNCTIONAL_AREAS = [
  "Executive Leadership",
  "Technology & Engineering",
  "Product Management",
  "Operations & Supply Chain",
  "Sales & Business Development",
  "Marketing",
  "Customer Success & Support",
  "Finance & Accounting",
  "Human Resources",
  "Legal & Compliance",
  "Data & Analytics",
  "Design & UX",
  "Other"
] as const;

export type FunctionalArea = typeof FUNCTIONAL_AREAS[number];

/**
 * Enhanced job title with metadata
 */
export interface JobTitle {
  id: string;                    // Unique identifier (slugified title)
  title: string;                 // Display name
  function: FunctionalArea;      // Functional area
  seniority: SeniorityLevel;     // Seniority level
  aliases?: string[];            // Alternative names that map to this title
  keywords?: string[];           // Search keywords
}

/**
 * Helper function to generate ID from title
 */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .replace(/\(.*?\)/g, '') // Remove acronyms in parentheses
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * Helper function to determine seniority from title
 */
function inferSeniority(title: string): SeniorityLevel {
  const lower = title.toLowerCase();
  
  // C-Suite
  if (lower.includes('chief') || lower.includes('president') || 
      lower === 'managing director' || lower === 'executive director') {
    return "C-Suite";
  }
  
  // VP/Director
  if (lower.includes('vp') || lower.includes('vice president') || 
      lower.includes('director') || lower.includes('head of')) {
    return "VP/Director";
  }
  
  // Manager
  if (lower.includes('manager') || lower.includes('supervisor') || 
      lower.includes('leader') || lower === 'treasurer' || lower === 'trustee' ||
      lower.includes('controller')) {
    return "Manager";
  }
  
  // Entry Level
  if (lower.includes('intern') || (lower.includes('associate') && !lower.includes('senior')) ||
      lower.includes('coordinator') || lower.includes('clerk')) {
    return "Entry Level";
  }
  
  // Default to Individual Contributor
  return "Individual Contributor";
}

/**
 * Helper function to determine function from legacy category
 */
function mapLegacyCategoryToFunction(category: string): FunctionalArea {
  const categoryMap: Record<string, FunctionalArea> = {
    'EXECUTIVE': 'Executive Leadership',
    'SOFTWARE_DEVELOPMENT': 'Technology & Engineering',
    'PRODUCT_MANAGEMENT': 'Product Management',
    'SALES': 'Sales & Business Development',
    'MARKETING': 'Marketing',
    'DATA_ANALYTICS': 'Data & Analytics',
    'OPERATIONS': 'Operations & Supply Chain',
    'HUMAN_RESOURCES': 'Human Resources',
    'FINANCE_ACCOUNTING': 'Finance & Accounting',
    'CUSTOMER_SERVICE': 'Customer Success & Support',
    'IT_OPERATIONS': 'Technology & Engineering',
    'DESIGN_UX': 'Design & UX',
    'CONSULTING': 'Other',
    'LEGAL_COMPLIANCE': 'Legal & Compliance',
    'ADMINISTRATIVE': 'Other',
    'EDUCATION_TRAINING': 'Other',
    'ENGINEERING': 'Technology & Engineering',
    'MEDIA_CONTENT': 'Other',
    'RESEARCH': 'Data & Analytics',
    'FACILITIES_MAINTENANCE': 'Operations & Supply Chain',
    'SECURITY': 'Technology & Engineering',
    'HEALTHCARE': 'Other',
    'OTHER_PROFESSIONAL': 'Other',
  };
  
  return categoryMap[category] || 'Other';
}

/**
 * Build job title with metadata from title string
 */
function buildJobTitle(title: string, category: string, legacyCategory?: keyof typeof LEGACY_JOB_TITLES): JobTitle {
  const id = slugify(title);
  const functionArea = legacyCategory ? mapLegacyCategoryToFunction(legacyCategory) : mapLegacyCategoryToFunction(category);
  const seniority = inferSeniority(title);
  
  // Extract acronyms for aliases
  const acronymMatch = title.match(/\(([A-Z]+)\)/);
  const aliases: string[] = [];
  if (acronymMatch) {
    aliases.push(acronymMatch[1]);
  }
  
  // Generate keywords from title
  const keywords: string[] = [];
  const words = title.toLowerCase().replace(/[()]/g, '').split(/\s+/);
  keywords.push(...words.filter(w => w.length > 2));
  
  return {
    id,
    title,
    function: functionArea,
    seniority,
    aliases: aliases.length > 0 ? aliases : undefined,
    keywords: keywords.length > 0 ? keywords : undefined,
  };
}

// Legacy structure for backward compatibility during migration
const LEGACY_JOB_TITLES = {
  // Executive & Leadership
  EXECUTIVE: [
    "Chief Executive Officer (CEO)",
    "Chief Operating Officer (COO)",
    "Chief Financial Officer (CFO)",
    "Chief Technology Officer (CTO)",
    "Chief Information Officer (CIO)",
    "Chief Marketing Officer (CMO)",
    "Chief Product Officer (CPO)",
    "Chief Data Officer (CDO)",
    "Chief Security Officer (CSO)",
    "Chief People Officer (CPO)",
    "President",
    "Vice President",
    "Managing Director",
    "Executive Director",
    "Board Member",
  ],

  // Software Development & Engineering
  SOFTWARE_DEVELOPMENT: [
    "Software Engineer",
    "Senior Software Engineer",
    "Staff Software Engineer",
    "Principal Software Engineer",
    "Software Architect",
    "Software Engineer Intern",
    "Front End Developer",
    "Back End Developer",
    "Full Stack Developer",
    "Mobile Developer",
    "DevOps Engineer",
    "Site Reliability Engineer (SRE)",
    "Data Engineer",
    "Machine Learning Engineer",
    "AI Engineer",
    "Quality Assurance Engineer",
    "QA Automation Engineer",
    "Software Test Engineer",
    "Automation Engineer",
    "System Engineer",
    "Senior System Engineer",
    "Big Data Architect",
    "Solutions Architect",
    "Cloud Architect",
    "Security Engineer",
    "Linux Engineer",
    "Network Engineer",
    "Senior Network Engineer",
  ],

  // Product & Program Management
  PRODUCT_MANAGEMENT: [
    "Product Manager",
    "Senior Product Manager",
    "Technical Product Manager",
    "Staff Technical Product Manager",
    "Product Owner",
    "Program Manager",
    "Technical Program Manager",
    "Project Manager",
    "Strategic Project Manager",
    "Project Coordinator",
    "Scrum Master",
    "Agile Coach",
  ],

  // Sales & Business Development
  SALES: [
    "Account Executive",
    "Enterprise Account Executive",
    "Account Manager",
    "Enterprise Account Manager",
    "Account Director",
    "Sales Director",
    "Sales Manager",
    "Business Development Manager",
    "Business Development Representative (BDR)",
    "Sales Development Representative (SDR)",
    "Relationship Manager",
    "Banking Relationship Manager",
    "Solutions Manager",
  ],

  // Marketing & Communications
  MARKETING: [
    "Marketing Manager",
    "Senior Marketing Manager",
    "Marketing Director",
    "Digital Marketing Manager",
    "Senior Digital Marketing Manager",
    "Content Marketing Manager",
    "Product Marketing Manager",
    "Brand Manager",
    "Campaign Manager",
    "Marketing Specialist",
    "Growth Marketing Manager",
    "Demand Generation Manager",
    "Content Strategist",
    "Communications Manager",
    "Communications Associate",
    "Public Relations Manager",
    "Social Media Manager",
  ],

  // Data & Analytics
  DATA_ANALYTICS: [
    "Data Analyst",
    "Senior Data Analyst",
    "Data Scientist",
    "Senior Data Scientist",
    "Data Science Intern",
    "Business Analyst",
    "Business Intelligence Analyst",
    "Analytics Manager",
    "Analyst",
    "Senior Business Analytics Analyst",
    "Operations Analyst",
    "Customer Insights Analyst",
    "Senior Business Process Analyst",
    "Systems Analyst",
    "Technology Analyst",
    "Financial Analyst",
    "Procurement Analyst",
  ],

  // Operations & Management
  OPERATIONS: [
    "Operations Manager",
    "Operations Director",
    "Operations Associate",
    "Site Manager",
    "Center Manager",
    "Shift Leader",
    "Manager",
    "General Manager",
    "Production Manager",
    "Supply Chain Manager",
    "Logistics Coordinator",
    "Warehouse Manager",
  ],

  // Human Resources & Recruiting
  HUMAN_RESOURCES: [
    "HR Manager",
    "HR Director",
    "Human Resources Business Partner (HRBP)",
    "Human Resources Specialist",
    "Talent Acquisition Manager",
    "Recruiter",
    "Technical Recruiter",
    "Recruiting Coordinator",
    "Recruitment Resourcer",
    "People Operations Manager",
    "Learning & Development Manager",
    "Compensation Analyst",
    "Senior Compensation Analyst",
    "Organizational Development Manager",
  ],

  // Finance & Accounting
  FINANCE_ACCOUNTING: [
    "Finance Manager",
    "Finance Director",
    "Director of Financial Planning and Analysis (FP&A)",
    "Financial Controller",
    "Accountant",
    "Senior Accountant",
    "Accounts Payable Clerk",
    "Accounts Receivable Specialist",
    "Billing Specialist",
    "Billing Analyst",
    "Senior Billing Analyst",
    "Treasurer",
    "Trustee",
    "Tax Manager",
    "Audit Manager",
  ],

  // Customer Service & Support
  CUSTOMER_SERVICE: [
    "Customer Service Manager",
    "Customer Service Representative",
    "Senior Customer Service Representative",
    "Customer Success Manager",
    "Customer Success Director",
    "Support Specialist",
    "Technical Support Specialist",
    "Customer Support Coordinator",
    "Member Services Representative",
    "Help Desk Manager",
    "Service Delivery Manager",
  ],

  // IT & Technical Support
  IT_OPERATIONS: [
    "IT Manager",
    "IT Director",
    "IT Support Specialist",
    "IT Support",
    "Helpdesk Technician",
    "Systems Administrator",
    "Network Administrator",
    "Database Administrator (DBA)",
    "Data Center Technician",
    "Infrastructure Manager",
    "IT Service Manager",
  ],

  // Design & User Experience
  DESIGN_UX: [
    "UX Designer",
    "UI Designer",
    "User Experience Designer",
    "Senior User Experience Designer",
    "User Experience Researcher",
    "User Interface Designer",
    "Product Designer",
    "Graphic Designer",
    "Visual Designer",
    "Creative Director",
    "Art Director",
  ],

  // Consulting & Advisory
  CONSULTING: [
    "Consultant",
    "Management Consultant",
    "Strategy Consultant",
    "Technical Consultant",
    "IT Consultant",
    "Business Consultant",
    "Solutions Consultant",
    "Life Science Consultant",
    "Advisory Services Manager",
  ],

  // Legal & Compliance
  LEGAL_COMPLIANCE: [
    "General Counsel",
    "Legal Director",
    "Lawyer",
    "Attorney",
    "Legal Counsel",
    "Compliance Manager",
    "Compliance Officer",
    "Risk Manager",
    "Data Protection Officer (DPO)",
    "Privacy Manager",
  ],

  // Administrative & Office Support
  ADMINISTRATIVE: [
    "Administrative Assistant",
    "Executive Assistant",
    "Office Administrator",
    "Office Manager",
    "Receptionist",
    "Administrative Coordinator",
  ],

  // Education & Training
  EDUCATION_TRAINING: [
    "Trainer",
    "Corporate Trainer",
    "Training Coordinator",
    "Training Developer",
    "Instructional Designer",
    "Learning & Development Specialist",
    "Director of Admissions",
    "Education Program Manager",
  ],

  // Engineering (Non-Software)
  ENGINEERING: [
    "Mechanical Engineer",
    "Electrical Engineer",
    "Civil Engineer",
    "Chemical Engineer",
    "Industrial Engineer",
    "Manufacturing Engineer",
    "Process Engineer",
    "Hardware Engineer",
    "Test Engineer",
    "Senior Engineering Manager",
    "Engineering Director",
    "Geological Engineer",
    "Environmental Engineer",
  ],

  // Media & Content Creation
  MEDIA_CONTENT: [
    "Content Creator",
    "Content Writer",
    "Technical Writer",
    "Copywriter",
    "Editor",
    "Writer/Editor",
    "Video Editor",
    "Cinematographer",
    "Photographer",
    "Audio Visual Engineer",
    "Producer",
    "Creative Producer",
  ],

  // Research & Development
  RESEARCH: [
    "Research Scientist",
    "Research Associate",
    "Research Manager",
    "Laboratory Supervisor",
    "Clinical Research Coordinator",
    "R&D Manager",
    "Innovation Manager",
  ],

  // Facilities & Maintenance
  FACILITIES_MAINTENANCE: [
    "Facilities Manager",
    "Maintenance Manager",
    "Maintenance Technician",
    "Equipment Technician",
    "Technician",
    "Equipment Operator",
  ],

  // Security & Safety
  SECURITY: [
    "Security Manager",
    "Director of Security",
    "Security Officer",
    "Security Analyst",
    "Information Security Manager",
    "Cybersecurity Analyst",
    "Physical Security Manager",
  ],

  // Healthcare (if applicable)
  HEALTHCARE: [
    "Chief Medical Officer (CMO)",
    "Medical Director",
    "Clinical Director",
    "Nurse Manager",
    "Healthcare Administrator",
    "Practice Manager",
  ],

  // Miscellaneous Professional Roles
  OTHER_PROFESSIONAL: [
    "Intern",
    "Associate",
    "Contractor",
    "Independent Contractor",
    "Freelancer",
    "Mentor",
    "Coach",
    "Specialist",
  ],
} as const;

/**
 * Build complete job titles database from legacy structure
 */
function buildJobTitlesDB(): JobTitle[] {
  const db: JobTitle[] = [];
  
  for (const [category, titles] of Object.entries(LEGACY_JOB_TITLES)) {
    for (const title of titles) {
      const jobTitle = buildJobTitle(title, category, category as keyof typeof LEGACY_JOB_TITLES);
      
      // Manual overrides for specific cases
      if (title === "Chief Medical Officer (CMO)") {
        jobTitle.function = "Other"; // Healthcare is "Other" per spec
        jobTitle.seniority = "C-Suite";
      } else if (title === "Board Member") {
        jobTitle.seniority = "C-Suite";
      } else if (title.includes("Intern") || title.includes("Associate") && !title.includes("Senior")) {
        jobTitle.seniority = "Entry Level";
      } else if (title.includes("Coordinator") && !title.includes("Manager")) {
        jobTitle.seniority = "Entry Level";
      } else if (title === "Scrum Master" || title === "Agile Coach" || title === "Product Owner") {
        jobTitle.seniority = "Individual Contributor";
      } else if (title === "Creative Director" || title === "Art Director") {
        jobTitle.seniority = "VP/Director";
      }
      
      db.push(jobTitle);
    }
  }
  
  return db;
}

/**
 * Complete job titles database with metadata
 */
export const JOB_TITLES_DB: JobTitle[] = buildJobTitlesDB();

// ============ BACKWARD COMPATIBILITY LAYER ============

/**
 * Legacy format - flat list of title strings
 * @deprecated Use JOB_TITLES_DB for new features
 */
export const ALL_JOB_TITLES: string[] = Array.from(
  new Set(JOB_TITLES_DB.map(jt => jt.title))
).sort();

/**
 * Legacy format - titles grouped by category
 * @deprecated Use getJobTitlesByFunction for new features
 */
export const JOB_TITLES = {
  EXECUTIVE: LEGACY_JOB_TITLES.EXECUTIVE,
  SOFTWARE_DEVELOPMENT: LEGACY_JOB_TITLES.SOFTWARE_DEVELOPMENT,
  PRODUCT_MANAGEMENT: LEGACY_JOB_TITLES.PRODUCT_MANAGEMENT,
  SALES: LEGACY_JOB_TITLES.SALES,
  MARKETING: LEGACY_JOB_TITLES.MARKETING,
  DATA_ANALYTICS: LEGACY_JOB_TITLES.DATA_ANALYTICS,
  OPERATIONS: LEGACY_JOB_TITLES.OPERATIONS,
  HUMAN_RESOURCES: LEGACY_JOB_TITLES.HUMAN_RESOURCES,
  FINANCE_ACCOUNTING: LEGACY_JOB_TITLES.FINANCE_ACCOUNTING,
  CUSTOMER_SERVICE: LEGACY_JOB_TITLES.CUSTOMER_SERVICE,
  IT_OPERATIONS: LEGACY_JOB_TITLES.IT_OPERATIONS,
  DESIGN_UX: LEGACY_JOB_TITLES.DESIGN_UX,
  CONSULTING: LEGACY_JOB_TITLES.CONSULTING,
  LEGAL_COMPLIANCE: LEGACY_JOB_TITLES.LEGAL_COMPLIANCE,
  ADMINISTRATIVE: LEGACY_JOB_TITLES.ADMINISTRATIVE,
  EDUCATION_TRAINING: LEGACY_JOB_TITLES.EDUCATION_TRAINING,
  ENGINEERING: LEGACY_JOB_TITLES.ENGINEERING,
  MEDIA_CONTENT: LEGACY_JOB_TITLES.MEDIA_CONTENT,
  RESEARCH: LEGACY_JOB_TITLES.RESEARCH,
  FACILITIES_MAINTENANCE: LEGACY_JOB_TITLES.FACILITIES_MAINTENANCE,
  SECURITY: LEGACY_JOB_TITLES.SECURITY,
  HEALTHCARE: LEGACY_JOB_TITLES.HEALTHCARE,
  OTHER_PROFESSIONAL: LEGACY_JOB_TITLES.OTHER_PROFESSIONAL,
} as const;

// ============ NEW UTILITY FUNCTIONS ============

/**
 * Get all job titles for a specific function
 */
export function getJobTitlesByFunction(fn: FunctionalArea): JobTitle[] {
  return JOB_TITLES_DB.filter(jt => jt.function === fn);
}

/**
 * Get all job titles for a specific seniority level
 */
export function getJobTitlesBySeniority(seniority: SeniorityLevel): JobTitle[] {
  return JOB_TITLES_DB.filter(jt => jt.seniority === seniority);
}

/**
 * Get job titles grouped by function
 */
export function getJobTitlesGroupedByFunction(): Record<FunctionalArea, JobTitle[]> {
  return FUNCTIONAL_AREAS.reduce((acc, fn) => {
    acc[fn] = getJobTitlesByFunction(fn);
    return acc;
  }, {} as Record<FunctionalArea, JobTitle[]>);
}

/**
 * Get job titles grouped by seniority
 */
export function getJobTitlesGroupedBySeniority(): Record<SeniorityLevel, JobTitle[]> {
  return SENIORITY_LEVELS.reduce((acc, level) => {
    acc[level] = getJobTitlesBySeniority(level);
    return acc;
  }, {} as Record<SeniorityLevel, JobTitle[]>);
}

/**
 * Build the 2D matrix (Function × Seniority)
 */
export function getJobTitleMatrix(): Record<FunctionalArea, Record<SeniorityLevel, JobTitle[]>> {
  const matrix = {} as Record<FunctionalArea, Record<SeniorityLevel, JobTitle[]>>;
  
  for (const fn of FUNCTIONAL_AREAS) {
    matrix[fn] = {} as Record<SeniorityLevel, JobTitle[]>;
    for (const level of SENIORITY_LEVELS) {
      matrix[fn][level] = JOB_TITLES_DB.filter(
        jt => jt.function === fn && jt.seniority === level
      );
    }
  }
  
  return matrix;
}

/**
 * Legacy search function - returns string[] for backward compatibility
 * @deprecated Use searchJobTitlesDB for new features
 */
export function searchJobTitles(query: string): string[] {
  const lowerQuery = query.toLowerCase();
  return ALL_JOB_TITLES.filter(title => 
    title.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Enhanced search job titles with fuzzy matching (includes aliases and keywords)
 * Returns JobTitle[] with metadata
 */
export function searchJobTitlesDB(query: string): JobTitle[] {
  const lowerQuery = query.toLowerCase();
  return JOB_TITLES_DB.filter(jt => 
    jt.title.toLowerCase().includes(lowerQuery) ||
    jt.aliases?.some(alias => alias.toLowerCase().includes(lowerQuery)) ||
    jt.keywords?.some(kw => kw.toLowerCase().includes(lowerQuery))
  );
}

/**
 * Find a job title by ID
 */
export function getJobTitleById(id: string): JobTitle | undefined {
  return JOB_TITLES_DB.find(jt => jt.id === id);
}

/**
 * Find a job title by exact title string (for backward compatibility)
 */
export function getJobTitleByTitle(title: string): JobTitle | undefined {
  return JOB_TITLES_DB.find(
    jt => jt.title === title || jt.aliases?.includes(title)
  );
}

/**
 * Normalize a free-form title to a standard job title
 * Returns the best match or undefined
 */
export function normalizeJobTitle(input: string): JobTitle | undefined {
  const lower = input.toLowerCase().trim();
  
  // Exact match
  const exact = JOB_TITLES_DB.find(
    jt => jt.title.toLowerCase() === lower || 
          jt.aliases?.some(a => a.toLowerCase() === lower)
  );
  if (exact) return exact;
  
  // Partial match with scoring
  const candidates = JOB_TITLES_DB.map(jt => {
    let score = 0;
    if (jt.title.toLowerCase().includes(lower)) score += 10;
    if (jt.aliases?.some(a => a.toLowerCase().includes(lower))) score += 8;
    if (jt.keywords?.some(k => lower.includes(k))) score += 5;
    return { jobTitle: jt, score };
  }).filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score);
  
  return candidates[0]?.jobTitle;
}

/**
 * Legacy function - get job titles by category
 * @deprecated Use getJobTitlesByFunction for new features
 */
export function getJobTitlesByCategory(category: keyof typeof JOB_TITLES): readonly string[] {
  return JOB_TITLES[category];
}
