# Asset Organizer

> **AI-Powered Marketing Asset Intelligence Platform**

Asset Organizer is a Next.js application that uses AI to automatically categorize, analyze, and organize your marketing assets. Upload PDFs, images, documents, or paste text content, and let AI identify the funnel stage, target personas, pain points, and generate actionable outreach tips.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **PostgreSQL** database (or Prisma-compatible database)
- **AWS S3** bucket for file storage
- **OpenAI API** key (GPT-4)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd asset-organizer

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials

# Set up database
npm run db:push
npm run db:generate

# Run development server
npm run dev
```

Visit `http://localhost:3000` to see the application.

---

## ✨ Key Features

### 🤖 AI-Powered Analysis
- **Automatic Categorization**: AI identifies funnel stage (TOFU, MOFU, BOFU, Retention)
- **ICP Targeting**: Extracts target personas and job titles
- **Pain Cluster Identification**: Identifies strategic problems addressed
- **Outreach Tips**: Generates ready-to-use email hooks
- **Content Quality Scoring**: Rates asset actionability (1-100)
- **Atomic Snippets**: Extracts "gold nuggets" (stats, quotes, wedges)

### 🏢 Multi-Account Support
- Manage multiple companies/brands from one login
- Complete data isolation between accounts
- Easy account switching
- Role-based access (OWNER, ADMIN, MEMBER)

### 📦 Multi-Product Architecture
- Define multiple product lines per company
- AI automatically identifies which product each asset relates to
- Product-specific analysis using tailored context
- Perfect for companies with diverse portfolios

### 🎨 Brand Voice Intelligence
- Select from 80+ predefined brand voice attributes
- Organized into 12 personality categories
- Multi-select for nuanced brand personality
- AI uses brand voice for analysis and recommendations

### 📊 Strategic Dashboard
- Asset matrix view (ICP × Funnel Stage)
- Coverage score and gap analysis
- KPI tracking (total assets, critical gaps, top ICPs)
- Responsive design for mobile, tablet, and desktop

### 📁 Supported File Types
- **PDFs**: Whitepapers, case studies, reports
- **Documents**: DOCX, TXT
- **Images**: PNG, JPG, GIF, WebP
- **Spreadsheets**: CSV, XLSX (basic support)
- **Text**: Direct paste functionality

---

## 🎯 Using Brand Context & Product Lines

The Brand Context + Product Lines feature allows you to define your company's identity and products, helping the AI provide more accurate and consistent asset analysis.

### Accessing Brand Settings

Navigate to **Settings → Brand** in the application to access the Brand Context & Product Lines configuration page.

### 1️⃣ Setting Up Brand Context

Brand Context defines your company's global identity and strategic positioning. This information applies to all your assets and product lines.

**Required Fields:**
- **Brand Voice**: Select 1+ attributes that describe your communication style (e.g., Professional, Innovative, Technical)
- **Target Industries**: Select 1+ industries you serve (e.g., Healthcare, FinTech, SaaS)

**Strategic Fields (Highly Recommended):**
- **Value Proposition**: Your core promise to customers (e.g., "We help CTOs reduce cloud costs by 40% through AI-powered optimization")
- **Pain Clusters**: Core problems you solve (e.g., "Data Silos", "Manual Processes", "Compliance Risk")
  - ⭐ **Critical for AI**: The AI will use these EXACT terms when categorizing assets, ensuring consistency
- **Primary ICP Roles**: Target buyer job titles (e.g., "CTO", "VP of Marketing", "CFO")
  - ⭐ **Critical for AI**: The AI will prioritize these roles when matching assets to personas
- **Key Differentiators**: What makes you unique (e.g., "AI-Powered", "No-Code", "Enterprise Security")
- **Use Cases**: How customers use your product (e.g., "Sales Pipeline Management", "Customer Onboarding")
- **ROI Claims**: Specific metrics you can claim (e.g., "40% cost reduction", "3x faster deployment")

**Quick Start with Auto-Detect:**
1. Enter your website URL in the Brand Context form
2. Click **"Auto-Detect"**
3. The AI will scan your website and automatically fill in most fields
4. Review and adjust the detected values as needed
5. Click **"Save Brand Identity"**

### 2️⃣ Adding Product Lines

Product Lines represent specific products or categories within your company (e.g., "Cloud Services", "Analytics Platform", "Mobile App").

**Why Use Product Lines?**
- The AI automatically matches each asset to the most relevant product line
- Provides product-specific analysis using tailored context
- Essential for companies with multiple products or categories

**Creating a Product Line:**
1. Ensure Brand Context is saved first
2. Click **"Add Product Line"** in the Product Lines section
3. Fill in the form:
   - **Name** (required): e.g., "Cloud Services", "Enterprise Platform"
   - **Description** (optional): Detailed description of what this product does
   - **Value Proposition** (optional): Why customers choose THIS specific product
   - **Target Audience** (optional): Who buys THIS product specifically
4. Click **"Save Product Line"**

**Note**: Only the Name field is required. You can add descriptions later to improve AI matching accuracy.

### 3️⃣ How AI Uses This Information

When you upload an asset, the AI automatically:

1. **Matches to Product Line**: 
   - Analyzes content to determine which product line it relates to
   - Returns ONLY valid product line IDs (no hallucination)
   - Uses product-specific context for analysis

2. **Applies Strategic Context**:
   - **Pain Clusters**: Uses your defined pain clusters FIRST, ensuring consistent tagging
   - **ICP Roles**: Prioritizes your primary ICP roles when identifying target personas
   - **Differentiators**: Extracts competitive wedges that align with your key differentiators
   - **ROI Claims**: Identifies metrics that match your known ROI claims

3. **Provides Consistent Categorization**:
   - Assets addressing the same pain get tagged with the SAME terminology
   - Assets targeting the same persona get matched to the SAME role title
   - This makes filtering and finding assets much more reliable

### 4️⃣ Best Practices

✅ **Do:**
- Fill in Pain Clusters and Primary ICP Roles for best results
- Use the Auto-Detect feature to save time
- Keep product line names clear and distinct
- Update your Brand Context as your positioning evolves

❌ **Avoid:**
- Creating duplicate product lines with similar names
- Leaving Brand Context empty (AI falls back to generic analysis)
- Using vague pain clusters like "Efficiency" (be specific: "Operational Inefficiency")

### 5️⃣ Editing & Managing

- **Edit Brand Context**: Update any field and click "Save Brand Identity"
- **Edit Product Line**: Click the pencil icon in the Product Lines table
- **Delete Product Line**: Click the trash icon (assets linked to it will keep their data, but lose the product line association)

### 6️⃣ Example Setup

**Company**: CloudOptimize (Cloud Cost Management Platform)

**Brand Context:**
- Brand Voice: Professional, Data-Driven, Technical
- Industries: SaaS, FinTech, E-commerce
- Value Proposition: "We help CTOs reduce cloud costs by 40% through AI-powered optimization"
- Pain Clusters: "Cloud Cost Overruns", "Manual Infrastructure Management", "Lack of Visibility"
- Primary ICP Roles: "CTO", "VP of Engineering", "DevOps Manager"
- Key Differentiators: "AI-Powered", "Real-Time Monitoring", "No-Code"
- ROI Claims: "40% cost reduction", "10 hours saved per week", "99.9% uptime"

**Product Lines:**
1. **AWS Cost Optimizer**
   - Description: AI-powered AWS cost reduction tool
   - Value Prop: Save 40% on AWS spend with zero config
   - Target Audience: CTOs and DevOps teams at AWS-heavy companies

2. **Multi-Cloud Dashboard**
   - Description: Unified visibility across AWS, Azure, GCP
   - Value Prop: Single pane of glass for all cloud spending
   - Target Audience: Enterprise engineering leaders with multi-cloud environments

---

## 📚 Documentation

### Getting Started
- **[Quick Start: Multi-Product](./QUICK_START_MULTI_PRODUCT.md)** - 5-minute setup guide
- **[S3 Setup Guide](./S3_SETUP_GUIDE.md)** - AWS S3 bucket configuration
- **[Account Creation Guide](./ACCOUNT_CREATION_GUIDE.md)** - Multi-account infrastructure

### Architecture & Features
- **[Multi-Product Architecture](./MULTI_PRODUCT_ARCHITECTURE.md)** - Detailed architecture docs
- **[Brand Voice Guide](./BRAND_VOICE_GUIDE.md)** - Brand voice options and usage
- **[Multi-Account Setup](./MULTI_ACCOUNT_SETUP.md)** - Multi-tenancy implementation
- **[Implementation Summary](./IMPLEMENTATION_SUMMARY.md)** - Complete feature list

### Design & Security
- **[Responsive Design](./RESPONSIVE_DESIGN.md)** - Mobile-first design patterns
- **[Security Notes](./SECURITY.md)** - API keys and security best practices

### Troubleshooting
- **[PDF Error Fix](./PDF_ERROR_FIX.md)** - ⚠️ Important: PDF upload troubleshooting

---

## 🔧 Common Issues

### PDF Uploads Fail with ERROR Status

**Symptom**: PDFs show ERROR status after upload  
**Cause**: Webpack bundling incompatibility with `pdf-parse` library

**Solution:**
1. Stop your dev server (Ctrl+C)
2. Restart: `npm run dev`
3. Click "Retry" button on failed assets in Dashboard

See **[PDF_ERROR_FIX.md](./PDF_ERROR_FIX.md)** for detailed troubleshooting.

### Assets Stuck in PENDING/PROCESSING

- ✅ Check your `OPENAI_API_KEY` in `.env`
- ✅ Check server logs for errors
- ✅ Verify database connection

### Can't Create Product Lines

- ✅ Ensure an account is selected (AccountSwitcher)
- ✅ Create Brand Identity first (Settings > Brand Identity tab)
- ✅ Only "Name" field is required; others are optional

---

## 🛠️ Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: PostgreSQL + Prisma ORM
- **Storage**: AWS S3
- **AI**: OpenAI GPT-4 (Structured Outputs)
- **Styling**: Tailwind CSS + Radix UI
- **Forms**: React Hook Form + Zod validation
- **Text Extraction**: pdf-parse, mammoth

---

## 📋 Environment Variables

Create a `.env` file with the following variables:

```env
# Database (PostgreSQL)
DATABASE_URL="postgresql://user:password@localhost:5432/dbname"

# OpenAI API
OPENAI_API_KEY="sk-..."

# AWS S3
AWS_REGION="us-east-1"
AWS_ACCESS_KEY_ID="AKIA..."
AWS_SECRET_ACCESS_KEY="..."
AWS_S3_BUCKET_NAME="your-bucket-name"

# Jina AI Reader (for website auto-detection feature)
# Get your free API key at https://jina.ai/reader/
# Includes 10M free tokens for non-commercial use
JINA_API_KEY="jina_..."

# DataForSEO (for keyword research - optional)
# Get your credentials from https://dataforseo.com/
DATAFORSEO_LOGIN="your_login"
DATAFORSEO_PASSWORD="your_password"
```

⚠️ **Important**: Never use `NEXT_PUBLIC_` prefix for sensitive keys!

---

## 🚦 Available Scripts

```bash
# Development
npm run dev              # Start dev server (http://localhost:3000)
npm run build            # Build for production
npm run start            # Start production server

# Database
npm run db:generate      # Generate Prisma client
npm run db:push          # Push schema to database (no migration)
npm run db:migrate       # Create migration and apply
npm run db:studio        # Open Prisma Studio GUI

# Testing & Verification
npm run test:s3          # Test S3 connection
npm run db:verify-permissions  # Check database permissions
npm run db:setup         # Initialize database
```

---

## 📱 Responsive Design

The application is fully optimized for:
- **Mobile**: 320px+ (touch-friendly, 44px+ touch targets)
- **Tablet**: 768px+ (optimized layouts)
- **Desktop**: 1024px+ (full features)

All components follow Apple HIG and Material Design guidelines.

---

## 🔐 Security

- ✅ All API keys server-side only (never exposed to client)
- ✅ Environment variables in `.gitignore`
- ✅ No `NEXT_PUBLIC_` prefix on sensitive keys
- ✅ Proper CORS configuration for S3
- ✅ Account-level data isolation

See **[SECURITY.md](./SECURITY.md)** for detailed security guidelines.

---

## 🎯 Use Cases

### SaaS Companies
- Organize product documentation by product line
- Identify content gaps in your funnel
- Generate personalized outreach for different ICPs

### Marketing Agencies
- Manage assets for multiple clients (multi-account)
- Quickly find relevant content for campaigns
- Extract key stats and quotes for proposals

### Enterprise Marketing Teams
- Centralize all marketing collateral
- Track coverage across product portfolio
- Ensure brand consistency across teams

### Sales Enablement
- Find the right asset for each deal stage
- Get AI-generated outreach tips
- Identify which personas each asset targets

---

## 📊 Roadmap

### Current Version: 2.1.1 (Jan 1, 2026)
- ✅ Multi-product architecture
- ✅ Brand voice multi-select (80+ options)
- ✅ Multi-account support
- ✅ AI-powered asset analysis
- ✅ PDF processing fix
- ✅ Responsive design

### Future Enhancements
- [ ] Manual product line override for assets
- [ ] Filter assets by product line
- [ ] Product line analytics dashboard
- [ ] Bulk operations (reassign, export)
- [ ] Team collaboration features
- [ ] API access for integrations
- [ ] Dark mode support

---

## 🤝 Contributing

This is a private project. For questions or issues:
1. Check the documentation files in this repository
2. Review **[PDF_ERROR_FIX.md](./PDF_ERROR_FIX.md)** for common issues
3. Contact the development team

---

## 📄 License

Private and proprietary.

---

## 📞 Support

For technical support:
1. **Documentation**: Check the guides in this repository
2. **Common Issues**: See troubleshooting sections in each guide
3. **PDF Issues**: **[PDF_ERROR_FIX.md](./PDF_ERROR_FIX.md)**
4. **Database Issues**: **[ACCOUNT_CREATION_GUIDE.md](./ACCOUNT_CREATION_GUIDE.md)**
5. **S3 Issues**: **[S3_SETUP_GUIDE.md](./S3_SETUP_GUIDE.md)**

---

## 🙏 Acknowledgments

Built with:
- Next.js
- OpenAI GPT-4
- Prisma
- AWS S3
- Tailwind CSS
- Radix UI
- And many other amazing open-source libraries

---

**Version**: 2.1.1  
**Last Updated**: January 1, 2026  
**Status**: ✅ Production Ready
