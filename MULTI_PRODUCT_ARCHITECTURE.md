# Multi-Product Architecture Guide

## Overview

This application now supports **multi-product companies** with a sophisticated two-layer context system that solves the problem of forcing complex product portfolios into a single "Product Name" field.

### The Problem We Solved

Previously, the system forced companies to describe their entire portfolio in a single `CompanyProfile` with one `productName` and one `productDescription`. This was broken for enterprises like:
- **Samsung** (Consumer Electronics, Mobile Devices, Enterprise Solutions, Semiconductors)
- **Large Distributors** (Thousands of SKUs across dozens of categories)
- **Platform Companies** (Multiple product lines with different ICPs)

### The Solution: Two-Layer Context

We've split company context into two distinct layers:

1. **Brand Context (Global)** - The "Umbrella"
   - Brand Voice
   - Main Competitors
   - Target Industries
   - Website URL

2. **Product Lines (Specific)** - The "Offerings"
   - Product Name
   - Description
   - Value Proposition (specific to this product)
   - Target Audience (specific to this product)

---

## Database Schema

### New Models

```prisma
// Brand Context - Global company identity (one per account)
model BrandContext {
  id               String   @id @default(cuid())
  accountId        String   @unique
  brandVoice       String   @db.Text
  competitors      String[]
  targetIndustries String[]
  websiteUrl       String?
  
  productLines ProductLine[]
}

// Product Line - Specific products/categories (many per account)
model ProductLine {
  id              String   @id @default(cuid())
  brandContextId  String
  name            String
  description     String   @db.Text
  valueProposition String  @db.Text
  specificICP     String   @db.Text
  
  assets Asset[]
}
```

### Updated Asset Model

```prisma
model Asset {
  // ... existing fields
  productLineId String? // Links to specific product line
  
  productLine ProductLine? @relation(fields: [productLineId], references: [id])
}
```

---

## AI Analysis Flow

### Two-Step AI Process

When an asset is uploaded, the AI now performs a **two-step analysis**:

#### Step 1: Product Line Identification
The AI reads the asset content and compares it against all available product lines:
```
Product Lines:
1. "Cloud Services" - Infrastructure and platform solutions
2. "Consumer Electronics" - Smart home devices and wearables
3. "Enterprise Software" - B2B productivity tools
```

The AI identifies which product line the asset belongs to based on:
- Content topics
- Use cases mentioned
- Technical terminology
- Target audience indicators

#### Step 2: Context-Specific Analysis
Once identified, the AI uses **that specific product line's context**:
- **Value Proposition** → Informs Pain Clusters
- **Target Audience** → Informs ICP Targets
- **Description** → Provides domain context

**Example:**
```
If asset is about "AWS cost optimization":
  Matched Product Line: "Cloud Services"
  Value Prop: "Reduce AWS spend by 40%"
  
  Result:
  - Pain Clusters: "Cloud Cost Management" (not generic "Efficiency")
  - ICP Targets: "VP of Engineering", "CTO" (not generic "Manager")
  - Outreach Tip: Mentions cloud savings specifically
```

---

## User Interface

### Settings Page Structure

The Settings > Company Context page now has **two tabs**:

#### Tab 1: Brand Identity
Configure your company's global attributes:
- **Brand Voice**: Your company's personality across all products
- **Target Industries**: Main industries you serve
- **Competitors**: Company-level competitors
- **Website**: Your main company website

#### Tab 2: Product Lines
Manage your product portfolio:
- **View**: Table of all product lines
- **Add**: Dialog to create new product lines
- **Delete**: Remove product lines (assets won't be deleted)

Each Product Line includes:
- **Name**: e.g., "Cloud Services", "Consumer Electronics"
- **Description**: What this product line offers
- **Value Proposition**: Why customers choose THIS product
- **Target Audience**: Who specifically buys THIS product

---

## API Endpoints

### Brand Context
```typescript
GET  /api/brand-context    // Fetch brand context
POST /api/brand-context    // Create/update brand context
```

### Product Lines
```typescript
GET    /api/product-lines       // Fetch all product lines
POST   /api/product-lines       // Create new product line
DELETE /api/product-lines?id=x  // Delete product line
```

---

## Migration Guide

### For Existing Deployments

We've included a migration script to convert existing `CompanyProfile` data:

```bash
npx tsx scripts/migrate-to-brand-context.ts
```

**What it does:**
1. Creates a `BrandContext` from your existing profile
2. Creates a `ProductLine` from your existing product data
3. Links all existing assets to this product line
4. Preserves all data (nothing is deleted)

**After migration:**
- Your existing setup continues to work
- You can now add additional product lines
- The AI will start using the new multi-product logic

### Manual Migration Steps

If you prefer manual migration:

1. Go to **Settings > Company Context**
2. Fill in the **Brand Identity** tab (global info)
3. Add your first **Product Line** with product-specific details
4. Add more product lines as needed

---

## Best Practices

### When to Use Product Lines

**Use Product Lines When:**
- You have distinct product categories (e.g., "SaaS Platform" vs "Professional Services")
- Different products target different ICPs
- Products have different value propositions
- You need to segment your assets by product

**Example Companies:**
- **HubSpot**: Marketing Hub, Sales Hub, Service Hub, CMS Hub
- **Adobe**: Creative Cloud, Document Cloud, Experience Cloud
- **Microsoft**: Office 365, Azure, Dynamics 365

### Defining Product Lines

**Good Product Line Names:**
- "Enterprise Cloud Platform"
- "SMB Accounting Software"
- "Healthcare Analytics"
- "Consumer Mobile Apps"

**Too Granular (Don't Do This):**
- Individual SKUs (e.g., "Model X-500-Blue")
- Every minor variant
- Feature-level categories

**Rule of Thumb:**
If you have "millions of products," think in **high-level categories** (e.g., "Men's Wear", "Home Goods", "Electronics") rather than individual items.

---

## Backward Compatibility

### Legacy Support

The system maintains **backward compatibility** with the old `CompanyProfile` model:

1. **API Routes**: `/api/company-profile` still exists and works
2. **AI Logic**: Falls back to legacy profile if no `BrandContext` exists
3. **Forms**: Old `CompanyProfileForm` component is preserved

### When to Remove Legacy Code

Once all accounts have been migrated:
1. Remove the `CompanyProfile` model from `schema.prisma`
2. Delete `/api/company-profile` route
3. Delete `CompanyProfileForm` component
4. Run `prisma migrate dev` to clean up

---

## Technical Implementation Details

### AI Prompt Engineering

The AI receives structured context for multi-product analysis:

```typescript
PRODUCT LINES WE OFFER:
Product Line ID: cuid123
Name: "Cloud Services"
Description: Infrastructure solutions for enterprises
Value Proposition: Reduce AWS costs by 40% in 3 months
Target Audience: VPs of Engineering, CTOs at Series B+ companies
---

INSTRUCTIONS:
1. Identify which product line this asset relates to
2. Return the product line ID in matchedProductLineId
3. Use that product's specific context for analysis
```

### Asset Processing

When an asset is processed:

```typescript
// lib/services/asset-processor.ts
const analysis = await analyzeAsset(text, fileType, s3Url, accountId);

await prisma.asset.update({
  data: {
    // ... other fields
    productLineId: analysis.matchedProductLineId || null,
    promptVersion: "2.0", // Multi-product support
  }
});
```

---

## Example Use Cases

### Case Study 1: Enterprise SaaS Company

**Company**: CloudOps Pro
**Product Lines**:
1. "Infrastructure Monitoring" - APM for DevOps teams
2. "Security Compliance" - SOC 2 automation
3. "Cost Optimization" - FinOps platform

**Benefit**: 
When a whitepaper about "Cloud Security Best Practices" is uploaded:
- AI identifies: "Security Compliance" product line
- Uses specific ICP: "CISOs, Security Engineers"
- Generates outreach tip: "Mention SOC 2 automation, not generic monitoring"

### Case Study 2: Multi-Brand Consumer Goods

**Company**: HealthLife Brands
**Product Lines**:
1. "Organic Supplements" - D2C vitamin line
2. "Fitness Equipment" - Home gym gear
3. "Wellness Apps" - Meditation and tracking

**Benefit**:
Assets are automatically categorized by product line, allowing:
- Product managers to find relevant materials easily
- Sales teams to filter by their specific product
- Marketing to measure content performance by line

---

## Troubleshooting

### Issue: AI not matching product lines correctly

**Solution:**
- Make product line descriptions more distinct
- Include specific keywords in descriptions
- Ensure value propositions highlight unique aspects

### Issue: Assets linked to wrong product line

**Solution:**
- Review the matched product line in asset details
- Manually update if needed (future feature)
- Refine product line descriptions to improve future matches

### Issue: Too many product lines to manage

**Solution:**
- Consolidate similar products into broader categories
- Remember: Product lines are for **AI categorization**, not inventory management
- Aim for 3-10 product lines for most companies

---

## Future Enhancements

Potential improvements to consider:

1. **Manual Product Line Override**: Let users manually assign assets to product lines
2. **Product Line Analytics**: Dashboard showing asset distribution by product line
3. **Multi-Product Line Assets**: Some assets might relate to multiple products
4. **Product Line Templates**: Pre-built templates for common industries
5. **Hierarchical Product Lines**: Support for parent/child product relationships

---

## Support

For questions or issues with the multi-product architecture:
1. Check this documentation
2. Review the migration script
3. Examine example product line configurations
4. Contact support with specific use cases

---

---

## 🔧 Known Issues & Solutions

### PDF Processing Errors

**Issue**: PDFs fail with ERROR status after upload  
**Cause**: Webpack bundling incompatibility with `pdf-parse` library  
**Solution**: See `PDF_ERROR_FIX.md` for complete fix instructions

**Quick Fix:**
```bash
# Restart dev server
npm run dev

# Then retry failed assets in Dashboard
```

### No Text Content Error

**Issue**: Assets fail with "No text content" error  
**Cause**: Text extraction failed for PDF/DOCX files  
**Solution**: 
1. Ensure `next.config.js` has proper externals configuration
2. Check file is not corrupted
3. Verify file type is supported (PDF, DOCX, TXT)

---

**Last Updated**: January 1, 2026  
**Version**: 2.1.1 (Multi-Product Support + PDF Fix)
