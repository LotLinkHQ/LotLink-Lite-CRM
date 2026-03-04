# LotLink — RV Sales Mini CRM

## BMAD
- BMAD v6.0.3 installed at `C:/Users/OBSch/_bmad/`
- Config: `C:/Users/OBSch/_bmad/core/config.yaml`
- User: Jonathan
- Output folder: `{project-root}/_bmad-output`

### BMAD Artifacts (in progress)
- Product Brief (complete): `_bmad-output/planning-artifacts/product-brief-tinyfish-2026-03-02.md`
- Project Documentation (complete): `_bmad-output/project-documentation.md`
- PRD Full V1 (complete): `_bmad-output/planning-artifacts/prd-lotlink-v1-2026-03-03.md`
  - 13 epics, 67 user stories, 4 delivery phases
  - Approach: Fix + Extend (brownfield)
  - Scope: Full V1 (not just MVP)
- 13 critical issues documented in project-documentation.md (6 security, 5 bugs, 5 architecture)

### BMAD Commands
- `/bmad-help` — next step advice
- `/bmad-brainstorming` — ideation
- `/bmad-party-mode` — multi-agent discussion
- `/bmad-review-adversarial-general` — critical review
- `/bmad-editorial-review-prose` — prose polish
- `/bmad-editorial-review-structure` — structural editing

## Tech Stack
- Expo ~52, React Native 0.76.9, React 18, expo-router ~4
- Express 4.21 + tRPC v10.45
- PostgreSQL via Drizzle ORM 0.38
- Anthropic Claude AI (matching engine + assistant)
- NativeWind (Tailwind CSS for RN)
- Deployment: Vercel, Railway, Docker
