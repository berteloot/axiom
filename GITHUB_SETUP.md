# GitHub Repository Setup

Your GitHub repository: **https://github.com/berteloot/axiom.git**

## Quick Setup Commands

Run these commands in your project directory:

```bash
cd "/Users/stanislasberteloot/Projects/Nytro-Apps/Asset Organizer"

# Initialize git repository (if not already done)
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit - Asset Organizer ready for deployment"

# Add remote repository
git remote add origin https://github.com/berteloot/axiom.git

# Set main branch
git branch -M main

# Push to GitHub
git push -u origin main
```

## If Repository Already Has Content

If the GitHub repository already has commits (README, .gitignore, etc.), you may need to pull first:

```bash
# Fetch remote content
git fetch origin

# Merge with remote (if needed)
git merge origin/main --allow-unrelated-histories

# Or if you want to overwrite remote with local:
# git push -u origin main --force
```

## Verify Connection

```bash
# Check remote URL
git remote -v

# Should show:
# origin  https://github.com/berteloot/axiom.git (fetch)
# origin  https://github.com/berteloot/axiom.git (push)
```

---

After pushing to GitHub, proceed with the Render deployment steps in `DEPLOYMENT.md`.
