# Changelog

All notable changes to the Asset Organizer project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.1.1] - 2026-01-01

### 🐛 Fixed
- **PDF Processing Error**: Fixed critical webpack bundling issue with `pdf-parse` library
  - Added `serverComponentsExternalPackages` configuration to `next.config.js`
  - Externalized `pdf-parse`, `pdfjs-dist`, and `canvas` packages
  - PDFs now process correctly without "Object.defineProperty" error
  - Added retry functionality for failed assets

### ✨ Improved
- Enhanced error messages for text extraction failures
- Better logging in asset processor for debugging
- Clearer error handling in AI analysis
- Added "Retry" button visibility in Dashboard for ERROR status assets

### 📚 Documentation
- Created **PDF_ERROR_FIX.md** - Comprehensive PDF troubleshooting guide
- Updated all .md files with latest version information
- Added troubleshooting sections to all guides
- Created comprehensive **README.md** with complete feature overview
- Updated security documentation with PDF fix details

### 🔧 Technical Changes
- `next.config.js`: Added webpack externals configuration
- `lib/ai.ts`: Improved error handling for missing text content
- `lib/services/asset-processor.ts`: Enhanced logging for text extraction

### Files Changed
```
next.config.js
lib/ai.ts
lib/services/asset-processor.ts
PDF_ERROR_FIX.md (NEW)
README.md (NEW)
CHANGELOG.md (NEW)
IMPLEMENTATION_SUMMARY.md
S3_SETUP_GUIDE.md
QUICK_START_MULTI_PRODUCT.md
MULTI_PRODUCT_ARCHITECTURE.md
ACCOUNT_CREATION_GUIDE.md
RESPONSIVE_DESIGN.md
MULTI_ACCOUNT_SETUP.md
SECURITY.md
```

---

## [2.1.0] - 2026-01-01

### ✨ Added
- **Brand Voice Multi-Select**: Replaced free-text brand voice with 80+ predefined options
  - 12 personality categories (Professional, Friendly, Innovative, etc.)
  - Multi-select dropdown (2-5 attributes recommended)
  - Consistent, structured input for AI analysis
  - Created `lib/constants/brand-voices.ts` with comprehensive options

### 🔄 Changed
- Database: `brandVoice` field changed from `String` to `String[]` array
- UI: `BrandIdentityForm.tsx` now uses `MultiSelectCombobox` component
- AI: Updated prompt to handle array of brand voice attributes
- API: `/api/brand-context` handles array format

### 📚 Documentation
- Created **BRAND_VOICE_GUIDE.md** - Complete guide to brand voice options
- Updated all documentation with brand voice changes

---

## [2.0.0] - 2025-12-XX

### ✨ Added - Multi-Product Architecture
- **BrandContext Model**: Global company identity (one per account)
  - Brand voice, competitors, target industries, website
- **ProductLine Model**: Specific product categories (many per account)
  - Name, description, value proposition, target audience
- **Two-Step AI Analysis**: 
  - Step 1: Identify which product line the asset belongs to
  - Step 2: Analyze using that specific product's context
- **Product-Specific Analysis**: AI uses context from matched product line

### 🏗️ Database Changes
- Added `BrandContext` table
- Added `ProductLine` table
- Updated `Asset` table with `productLineId` foreign key
- Maintained `CompanyProfile` for backward compatibility

### 🎨 UI Components
- Created `BrandIdentityForm.tsx` - Global brand settings
- Created `ProductLineForm.tsx` - Product line creation/editing
- Created `ProductLinesManager.tsx` - Product line management table
- Updated Settings page with tabbed interface (Brand Identity + Product Lines)

### 🔧 API Endpoints
- `GET/POST /api/brand-context` - Brand context management
- `GET/POST/DELETE /api/product-lines` - Product line management
- Maintained `/api/company-profile` for backward compatibility

### 📚 Documentation
- Created **MULTI_PRODUCT_ARCHITECTURE.md**
- Created **QUICK_START_MULTI_PRODUCT.md**
- Created **IMPLEMENTATION_SUMMARY.md**
- Created migration script: `scripts/migrate-to-brand-context.ts`

### 🔄 Migration
- Automatic migration from `CompanyProfile` to new structure
- Full backward compatibility maintained
- Assets automatically linked to migrated product lines

---

## [1.5.0] - 2025-XX-XX

### ✨ Added - Multi-Account Support
- **Multiple Accounts per User**: Manage multiple companies from one login
- **Account Switching**: Easy switching between accounts with session tracking
- **Role-Based Access**: OWNER, ADMIN, MEMBER roles
- **Account Isolation**: Complete data separation between accounts
- **Account Switcher UI**: Dropdown in navigation for quick switching

### 🏗️ Database Changes
- Added `Account` model
- Added `UserAccount` join table (many-to-many with roles)
- Added `Session` table (tracks current account per user)
- Updated all models with `accountId` foreign keys
- Cascade deletes for data cleanup

### 🎨 UI Components
- Created `AccountSwitcher` component
- Created Account Management page (`/settings/accounts`)
- Created `CreateAccountForm` component
- Updated navigation with account context

### 🔧 API Changes
- `GET /api/accounts` - List user's accounts
- `POST /api/accounts` - Create new account
- `GET /api/accounts/current` - Get current account
- `POST /api/accounts/switch` - Switch accounts
- All existing APIs now filter by `accountId`

### 📁 S3 Organization
- Files organized by account: `accounts/{accountId}/uploads/{uuid}.{ext}`
- Better isolation and cleanup capabilities

### 📚 Documentation
- Created **MULTI_ACCOUNT_SETUP.md**
- Created **ACCOUNT_CREATION_GUIDE.md**

---

## [1.0.0] - 2025-XX-XX

### ✨ Initial Release

#### Core Features
- **AI-Powered Asset Analysis**:
  - Automatic funnel stage identification (TOFU, MOFU, BOFU, Retention)
  - ICP target extraction
  - Pain cluster identification
  - Outreach tip generation
  - Content quality scoring (1-100)
  - Atomic snippet extraction (stats, quotes, wedges)

- **File Support**:
  - PDF documents (whitepapers, case studies)
  - DOCX/DOC documents
  - Images (PNG, JPG, GIF, WebP)
  - Text files and direct text paste
  - Basic CSV/XLSX support

- **Dashboard & Analytics**:
  - Asset matrix view (ICP × Funnel Stage)
  - KPI cards (total assets, coverage score, top ICP, critical gaps)
  - Strategy view vs Library view tabs
  - Mobile-responsive design

- **Asset Management**:
  - Upload via drag-and-drop or file picker
  - Direct text paste functionality
  - Asset review and approval workflow
  - Status tracking (PENDING, PROCESSING, PROCESSED, ERROR, APPROVED)

#### Technical Stack
- **Framework**: Next.js 14 (App Router)
- **Database**: PostgreSQL + Prisma ORM
- **Storage**: AWS S3 with presigned URLs
- **AI**: OpenAI GPT-4 (Structured Outputs with Zod)
- **UI**: Tailwind CSS + Radix UI components
- **Forms**: React Hook Form + Zod validation

#### Infrastructure
- S3 bucket setup with CORS configuration
- PostgreSQL database with Prisma migrations
- Environment variable configuration
- Text extraction from PDFs and documents

### 📚 Documentation
- Created **S3_SETUP_GUIDE.md**
- Created **RESPONSIVE_DESIGN.md**
- Created **SECURITY.md**

---

## Version History Summary

- **2.1.1** (2026-01-01): PDF processing fix, comprehensive documentation update
- **2.1.0** (2026-01-01): Brand voice multi-select feature
- **2.0.0** (2025-12-XX): Multi-product architecture overhaul
- **1.5.0** (2025-XX-XX): Multi-account support
- **1.0.0** (2025-XX-XX): Initial release

---

## Upgrade Notes

### Upgrading to 2.1.1
**PDF Fix**: Restart your development server to apply webpack configuration changes.
```bash
# Stop server (Ctrl+C)
npm run dev
```
Use "Retry" button on failed PDF assets in Dashboard.

### Upgrading to 2.1.0
**Brand Voice**: Existing text-based brand voices need to be converted to multi-select.
1. Go to Settings > Company Context > Brand Identity
2. Select 2-5 attributes that match your old description
3. Save changes

### Upgrading to 2.0.0
**Multi-Product**: Run migration script to convert existing data.
```bash
npx tsx scripts/migrate-to-brand-context.ts
```
Or manually configure Brand Identity and Product Lines in Settings.

### Upgrading to 1.5.0
**Multi-Account**: Database schema update required.
```bash
npm run db:push
npm run db:generate
```
First user and account need to be created manually or via API.

---

## Known Issues

### Current
- None! PDF processing issue from 2.1.0 has been fixed in 2.1.1

### Resolved
- ✅ **PDF uploads failing** (Fixed in 2.1.1): Webpack bundling issue resolved
- ✅ **Brand voice too generic** (Fixed in 2.1.0): Multi-select with 80+ options
- ✅ **Multi-product companies not supported** (Fixed in 2.0.0): Product lines architecture

---

## Future Roadmap

### Planned Features
- [ ] Manual product line override for assets
- [ ] Filter assets by product line in Dashboard
- [ ] Product line analytics and distribution charts
- [ ] Bulk operations (export, reassign, delete)
- [ ] Team collaboration and sharing
- [ ] Asset expiry notifications
- [ ] API access for integrations
- [ ] Dark mode support
- [ ] Advanced search and filtering
- [ ] Asset templates and snippets library

### Under Consideration
- [ ] Multi-product line assets (one asset, multiple products)
- [ ] Product line hierarchy (parent/child relationships)
- [ ] Asset version control and history
- [ ] AI-powered content gap suggestions
- [ ] Integration with CMS platforms
- [ ] Slack/Teams notifications
- [ ] Custom AI prompts per account

---

## Contributors

This is a private project developed for Nytro Apps.

---

**For detailed information about each release, see the corresponding documentation files in the repository.**
