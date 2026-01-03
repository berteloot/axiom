# Brand Context + Product Lines API Reference

Quick reference for the Brand Context and Product Lines API endpoints.

---

## 🌐 Base URL

All endpoints are relative to your application's base URL:
- Development: `http://localhost:3000`
- Production: `https://your-domain.com`

---

## 🔐 Authentication

All endpoints require authentication via Next-Auth session cookie.

**Required Header**:
```
Cookie: next-auth.session-token=<your-token>
```

---

## 📍 Endpoints

### Brand Context

#### `GET /api/brand-context`

Get the current account's brand context and product lines.

**Response 200**:
```json
{
  "brandContext": {
    "id": "clx123",
    "accountId": "acc456",
    "brandVoice": ["Professional", "Technical"],
    "competitors": ["Competitor A"],
    "targetIndustries": ["SaaS", "FinTech"],
    "websiteUrl": "https://example.com",
    "valueProposition": "We help CTOs...",
    "painClusters": ["Cloud Cost Overruns"],
    "keyDifferentiators": ["AI-Powered"],
    "primaryICPRoles": ["CTO", "VP of Engineering"],
    "useCases": ["Cost Optimization"],
    "roiClaims": ["40% cost reduction"],
    "createdAt": "2025-01-02T10:00:00.000Z",
    "updatedAt": "2025-01-02T10:00:00.000Z"
  },
  "productLines": [
    {
      "id": "pl789",
      "brandContextId": "clx123",
      "name": "AWS Cost Optimizer",
      "description": "AI-powered AWS cost reduction tool",
      "valueProposition": "Save 40% on AWS spend",
      "specificICP": "CTOs and DevOps teams",
      "createdAt": "2025-01-02T10:00:00.000Z",
      "updatedAt": "2025-01-02T10:00:00.000Z"
    }
  ]
}
```

**Response 200** (no brand context):
```json
{
  "brandContext": null,
  "productLines": []
}
```

**Errors**:
- `400`: No account selected
- `500`: Server error

---

#### `POST /api/brand-context`

Create a new brand context for the current account.

**Request Body**:
```json
{
  "brandVoice": ["Professional", "Technical"],           // Required: min 1, max 10
  "targetIndustries": ["SaaS", "FinTech"],              // Required: min 1, max 10
  "websiteUrl": "https://example.com",                  // Optional: valid URL or null
  "valueProposition": "We help CTOs...",                // Optional: max 500 chars
  "painClusters": ["Cloud Cost Overruns"],              // Optional: max 10
  "keyDifferentiators": ["AI-Powered"],                 // Optional: max 10
  "primaryICPRoles": ["CTO", "VP of Engineering"],      // Optional: max 10
  "useCases": ["Cost Optimization"],                    // Optional: max 20
  "roiClaims": ["40% cost reduction"],                  // Optional: max 10
  "competitors": ["Competitor A"]                       // Optional: max 20
}
```

**Response 201**:
```json
{
  "brandContext": { /* ... brand context object ... */ }
}
```

**Errors**:
- `400`: Validation failed, brand context already exists, or no account selected
- `500`: Server error

---

#### `PATCH /api/brand-context`

Update an existing brand context. Only provided fields will be updated (partial update).

**Request Body** (all fields optional):
```json
{
  "brandVoice": ["Professional", "Technical", "Innovative"],
  "painClusters": ["Cloud Cost Overruns", "Lack of Visibility"],
  "roiClaims": ["50% cost reduction", "15 hours saved per week"]
}
```

**Response 200**:
```json
{
  "brandContext": { /* ... updated brand context object ... */ }
}
```

**Errors**:
- `400`: Validation failed or no account selected
- `404`: Brand context not found (use POST to create)
- `500`: Server error

---

### Product Lines

#### `GET /api/product-lines`

Get all product lines for the current account's brand context.

**Response 200**:
```json
{
  "brandContext": { /* ... brand context object ... */ },
  "productLines": [
    {
      "id": "pl789",
      "brandContextId": "clx123",
      "name": "AWS Cost Optimizer",
      "description": "AI-powered AWS cost reduction tool",
      "valueProposition": "Save 40% on AWS spend",
      "specificICP": "CTOs and DevOps teams",
      "createdAt": "2025-01-02T10:00:00.000Z",
      "updatedAt": "2025-01-02T10:00:00.000Z"
    }
  ]
}
```

**Errors**:
- `400`: No account selected
- `500`: Server error

---

#### `POST /api/product-lines`

Create a new product line under the current account's brand context.

**Request Body**:
```json
{
  "name": "AWS Cost Optimizer",                         // Required: max 100 chars
  "description": "AI-powered AWS cost reduction tool",  // Optional: max 1000 chars
  "valueProposition": "Save 40% on AWS spend",          // Optional: max 1000 chars
  "specificICP": "CTOs and DevOps teams"                // Optional: max 1000 chars
}
```

**Response 201**:
```json
{
  "productLine": {
    "id": "pl789",
    "brandContextId": "clx123",
    "name": "AWS Cost Optimizer",
    "description": "AI-powered AWS cost reduction tool",
    "valueProposition": "Save 40% on AWS spend",
    "specificICP": "CTOs and DevOps teams",
    "createdAt": "2025-01-02T10:00:00.000Z",
    "updatedAt": "2025-01-02T10:00:00.000Z"
  }
}
```

**Errors**:
- `400`: Validation failed, brand context doesn't exist, duplicate name, or no account selected
- `500`: Server error

---

#### `PATCH /api/product-lines/[id]`

Update an existing product line. Only provided fields will be updated (partial update).

**URL Parameters**:
- `id`: Product line ID (e.g., `pl789`)

**Request Body** (all fields optional):
```json
{
  "name": "AWS Cost Optimizer Pro",
  "description": "Updated description",
  "valueProposition": "New value prop"
}
```

**Response 200**:
```json
{
  "productLine": { /* ... updated product line object ... */ }
}
```

**Errors**:
- `400`: Validation failed, duplicate name, or no account selected
- `403`: Unauthorized (product line belongs to different account)
- `404`: Product line not found
- `500`: Server error

---

#### `DELETE /api/product-lines/[id]`

Delete a product line. Assets linked to this product line will keep their data, but `productLineId` will be set to null.

**URL Parameters**:
- `id`: Product line ID (e.g., `pl789`)

**Response 200**:
```json
{
  "success": true
}
```

**Errors**:
- `403`: Unauthorized (product line belongs to different account)
- `404`: Product line not found
- `500`: Server error

---

## 📋 Validation Rules

### Brand Context

| Field | Type | Required | Min | Max | Notes |
|-------|------|----------|-----|-----|-------|
| `brandVoice` | `string[]` | ✅ Yes | 1 | 10 | Brand voice attributes |
| `targetIndustries` | `string[]` | ✅ Yes | 1 | 10 | Industries served |
| `websiteUrl` | `string` | ❌ No | - | - | Must be valid URL |
| `valueProposition` | `string` | ❌ No | - | 500 | Core promise |
| `painClusters` | `string[]` | ❌ No | 0 | 10 | Problems solved |
| `keyDifferentiators` | `string[]` | ❌ No | 0 | 10 | Unique selling points |
| `primaryICPRoles` | `string[]` | ❌ No | 0 | 10 | Target buyer roles |
| `useCases` | `string[]` | ❌ No | 0 | 20 | How customers use product |
| `roiClaims` | `string[]` | ❌ No | 0 | 10 | Specific metrics |
| `competitors` | `string[]` | ❌ No | 0 | 20 | Main competitors |

### Product Line

| Field | Type | Required | Min | Max | Notes |
|-------|------|----------|-----|-----|-------|
| `name` | `string` | ✅ Yes | 1 | 100 | Product line name |
| `description` | `string` | ❌ No | - | 1000 | Product description |
| `valueProposition` | `string` | ❌ No | - | 1000 | Why buy THIS product |
| `specificICP` | `string` | ❌ No | - | 1000 | Who buys THIS product |

---

## 🔄 Common Workflows

### 1. Initial Setup

```bash
# Step 1: Create brand context
POST /api/brand-context
{
  "brandVoice": ["Professional", "Technical"],
  "targetIndustries": ["SaaS"],
  "painClusters": ["Cloud Cost Overruns"],
  "primaryICPRoles": ["CTO"]
}

# Step 2: Add product lines
POST /api/product-lines
{
  "name": "AWS Cost Optimizer"
}

POST /api/product-lines
{
  "name": "Multi-Cloud Dashboard"
}
```

### 2. Update Brand Strategy

```bash
# Update pain clusters and ICP roles
PATCH /api/brand-context
{
  "painClusters": ["Cloud Cost Overruns", "Lack of Visibility", "Manual Processes"],
  "primaryICPRoles": ["CTO", "VP of Engineering", "DevOps Manager"]
}
```

### 3. Manage Product Lines

```bash
# Get all product lines
GET /api/product-lines

# Update a product line
PATCH /api/product-lines/pl789
{
  "valueProposition": "Updated value prop"
}

# Delete a product line
DELETE /api/product-lines/pl789
```

---

## 🧪 cURL Examples

### Create Brand Context

```bash
curl -X POST http://localhost:3000/api/brand-context \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_TOKEN" \
  -d '{
    "brandVoice": ["Professional", "Technical"],
    "targetIndustries": ["SaaS", "FinTech"],
    "painClusters": ["Cloud Cost Overruns"],
    "primaryICPRoles": ["CTO", "VP of Engineering"]
  }'
```

### Update Brand Context

```bash
curl -X PATCH http://localhost:3000/api/brand-context \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_TOKEN" \
  -d '{
    "roiClaims": ["50% cost reduction", "15 hours saved per week"]
  }'
```

### Create Product Line

```bash
curl -X POST http://localhost:3000/api/product-lines \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_TOKEN" \
  -d '{
    "name": "AWS Cost Optimizer",
    "description": "AI-powered AWS cost reduction tool"
  }'
```

### Delete Product Line

```bash
curl -X DELETE http://localhost:3000/api/product-lines/pl789 \
  -H "Cookie: next-auth.session-token=YOUR_TOKEN"
```

---

## 🚨 Error Handling

All endpoints return JSON error responses:

```json
{
  "error": "Error message here",
  "details": [  // Optional: only for validation errors
    {
      "path": ["brandVoice"],
      "message": "Array must contain at least 1 element(s)"
    }
  ]
}
```

**Common Error Codes**:
- `400`: Bad request (validation, duplicates, missing required data)
- `401`: Unauthorized (future enhancement)
- `403`: Forbidden (wrong account)
- `404`: Not found
- `500`: Server error

---

## 📝 Notes

1. **Account Scoping**: All operations are automatically scoped to the authenticated user's current account
2. **Partial Updates**: PATCH endpoints only update provided fields
3. **Duplicate Prevention**: Product line names must be unique within a brand context
4. **Cascade Deletes**: Deleting a product line sets `productLineId` to `null` on linked assets (doesn't delete assets)
5. **AI Integration**: The AI automatically uses brand context and constrains product line IDs to valid values

---

## 🔗 Related Documentation

- [Implementation Guide](./BRAND_CONTEXT_IMPLEMENTATION.md)
- [User Guide (README)](./README.md#-using-brand-context--product-lines)
- [Manual Migration](./prisma/manual-migrations/add-product-line-unique-constraint.sql)
