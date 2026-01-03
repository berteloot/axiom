# Quick Start: Multi-Product Setup

## 🎯 What Changed?

Your Asset Organizer now supports **multiple product lines** instead of forcing everything into one "Product Name" field.

## 🚀 Quick Setup (5 Minutes)

### Step 1: Navigate to Settings
Go to **Settings > Company Context**

### Step 2: Configure Brand Identity (Tab 1)
Fill in your company's **global** information:
- **Brand Voice**: e.g., "Professional & Data-Driven"
- **Target Industries**: Select from the dropdown (e.g., Finance, Healthcare)
- **Competitors**: Type names and press Enter (e.g., Salesforce, HubSpot)
- **Website**: Your main company URL (optional)

Click **Save Brand Identity**

### Step 3: Add Your First Product Line (Tab 2)
Click **Add Product Line** and fill in:
- **Name**: e.g., "Cloud Services" or "Marketing Platform"
- **Description**: What this product does
- **Value Proposition**: Why customers choose THIS product
- **Target Audience**: Who specifically buys THIS product

Click **Save Product Line**

### Step 4: Add More Product Lines (Optional)
Repeat Step 3 for each major product category

### Step 5: Upload Assets
Upload your marketing assets as usual. The AI will now:
1. Identify which product line each asset relates to
2. Analyze it using that specific product's context
3. Generate better, more targeted insights

---

## 📊 Example: Real Company Setup

### HubSpot-Style Setup

**Brand Identity:**
- Brand Voice: "Inbound, customer-centric, educational"
- Industries: Marketing, Sales, Customer Service
- Competitors: Salesforce, Marketo, Pardot

**Product Lines:**

1. **Marketing Hub**
   - Description: All-in-one marketing automation platform
   - Value Prop: Attract and convert leads with unified marketing tools
   - Target Audience: VPs of Marketing, CMOs at mid-market companies

2. **Sales Hub**
   - Description: CRM and sales automation tools
   - Value Prop: Close deals faster with intelligent automation
   - Target Audience: Sales Directors, VPs of Sales, CROs

3. **Service Hub**
   - Description: Customer service and support platform
   - Value Prop: Scale customer success with self-service and automation
   - Target Audience: Customer Success Managers, VPs of Support

**Result:** 
When you upload a whitepaper about "Lead Generation Best Practices", the AI:
- Identifies it's for **Marketing Hub**
- Uses Marketing Hub's value prop and ICP
- Generates outreach tip: "Mention unified marketing tools for lead conversion"

---

## 🔄 Migrating Existing Data

If you already have data in the old system:

### Option 1: Automatic Migration (Recommended)
```bash
npx tsx scripts/migrate-to-brand-context.ts
```
This automatically converts your old setup to the new structure.

### Option 2: Manual Setup
Just configure Brand Identity and Product Lines in Settings. Your old data continues to work.

---

## 💡 Pro Tips

### When to Create a Product Line?

**DO Create Product Lines for:**
- ✅ Distinct product categories (e.g., "SaaS Platform" vs "Consulting Services")
- ✅ Products with different target audiences
- ✅ Products with different value propositions

**DON'T Create Product Lines for:**
- ❌ Individual SKUs (e.g., "Model X-500-Blue")
- ❌ Minor variants of the same product
- ❌ Every single feature

**Rule of Thumb:** 
If you have "millions of products", think in **categories** (e.g., "Men's Clothing", "Home Goods") not individual items.

### How Many Product Lines?

**Optimal Range:** 2-10 product lines

**Examples:**
- **Simple SaaS**: 2-3 lines (e.g., "Core Platform", "Enterprise Edition", "Add-ons")
- **Mid-Size B2B**: 4-6 lines (e.g., "Software", "Services", "Training", "Support")
- **Large Enterprise**: 6-10 lines (major business units or categories)

### Writing Good Product Line Descriptions

**Good Examples:**
- "Cloud infrastructure platform for enterprise workloads. Provides compute, storage, and networking."
- "B2B CRM focused on small business owners. Simple, affordable, mobile-first."
- "Healthcare analytics for hospitals. HIPAA-compliant reporting and BI tools."

**Bad Examples:**
- "Software" (too vague)
- "Various products" (not specific)
- Just a product name with no description

---

## 🎯 Testing Your Setup

### Test 1: Brand Identity
1. Fill in Brand Identity tab
2. Click Save
3. Refresh page - should load correctly

### Test 2: Product Lines
1. Add 2 product lines with different focuses
2. View them in the table
3. Try deleting one

### Test 3: Asset Analysis
1. Upload an asset clearly related to one product line
2. Wait for processing
3. Check if AI identified the correct product line (future UI feature)

---

## ❓ FAQ

**Q: Do I need to use Product Lines if I only have one product?**  
A: No! The system works fine with just Brand Identity. Product Lines are optional.

**Q: What happens to my old assets after migration?**  
A: They're automatically linked to the product line created from your old profile. Nothing is lost.

**Q: Can I edit product lines after creating them?**  
A: Currently you can delete and recreate. Edit functionality is a future enhancement.

**Q: Can one asset belong to multiple product lines?**  
A: Currently, the AI picks the best match. Multi-product support is planned.

**Q: Will this break my existing setup?**  
A: No! The system is fully backward compatible. Old profiles continue to work.

---

## 📚 More Information

- **Full Architecture Details**: See `MULTI_PRODUCT_ARCHITECTURE.md`
- **Implementation Summary**: See `IMPLEMENTATION_SUMMARY.md`
- **Migration Script**: See `scripts/migrate-to-brand-context.ts`

---

## 🆘 Need Help?

Common issues and solutions:

**Issue**: Product Lines tab is empty  
**Solution**: Click "Add Product Line" to create your first one

**Issue**: AI not identifying product lines correctly  
**Solution**: Make product line descriptions more distinct and specific

**Issue**: Can't see which product line an asset matched to  
**Solution**: This UI feature is coming soon. Check database directly for now.

---

---

## 🐛 Troubleshooting

### PDF Assets Show ERROR Status

If PDFs fail to process with an ERROR status:

**Solution**: This is a known webpack bundling issue with PDF parsing. See `PDF_ERROR_FIX.md` for details.

**Quick Fix:**
1. Stop your dev server (Ctrl+C)
2. Restart: `npm run dev`
3. Click "Retry" button on the failed asset in Dashboard

### Assets Not Processing

If assets stay in PENDING or PROCESSING status:
- Check your OpenAI API key is valid (`OPENAI_API_KEY` in `.env`)
- Check server logs for errors
- Verify database connection is working

### Can't Create Product Lines

If you get "All fields are required" error:
- Make sure account is selected (check AccountSwitcher)
- Verify Brand Context is created first (in Brand Identity tab)
- Only "Name" field is required; others are optional

---

**Ready to get started?** Head to **Settings > Company Context** and set up your Brand Identity and Product Lines! 🚀

**Last Updated**: January 1, 2026  
**Version**: 2.1.1 (includes PDF processing fix)
