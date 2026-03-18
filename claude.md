# Property Sentinel — Claude Code Context

## Project
propertysentinel.io — Chicago property intelligence and compliance monitoring platform.
Built by James, licensed CPA, sole developer. Pre-revenue, pre-launch.
Part of City Logical LLC (Illinois Series LLC).

## Tech Stack
- Frontend: Next.js (App Router), deployed on Vercel
- Backend: Python workers on Railway
- Database: Supabase (PostgreSQL)
- Styling: Plain CSS with CSS variables — no Tailwind, no component libraries

## Design System
- Navy: #0f2744 (primary), #1a3a5c (mid), #234872 (light)
- Cream: #f2f0eb (background), #e8e4dc (dark)
- Red: #c0392b (alerts, open status)
- Amber: #b7791f (warnings, moderate)
- Green: #2d6a4f (resolved, good status)
- Serif: Playfair Display (headings, brand)
- Sans: Inter (body, UI)
- Mono: DM Mono (labels, codes, data)

## Key Design Principles
- Minimal formatting — no excessive borders, shadows, or decoration
- Data-forward — let the numbers speak
- Navy header bars on cards, cream backgrounds on body
- Status badges: red=open, amber=warning, green=resolved, blue=info
- Monospace for all SR numbers, dates, codes, and data labels

## Current Pages
- Property page: /[address] — 311 complaints, violations, permits, health score
- More pages TBD

## Database Tables (Supabase)
- complaints_311: 13M+ rows, Worker A syncs every 15 min
- assessed_values: 14M rows, 2017-2025
- property_chars_residential: 2022-2025
- parcel_universe: 2025-2026, address resolution
- building_violations: DOB violations
- building_permits: permit history

## address resolution
- /api/resolve-address queries parcel_universe.address_normalized
- Returns PIN + sibling addresses for multi-address buildings
- All data queries fan out by PIN after resolution

## What We're Building Now
- About page with Know Your Building card
- Example signal cards (311 alert, STR complaint, tax analysis, property profile)
- Navigation and site structure

## Never Do
- Never modify the Railway worker files
- Never run migrations against production Supabase without explicit instruction
- Never install Tailwind or any CSS framework
- Never use localStorage or sessionStorage
- Always match the existing design system exactly

## Extended Context
For technical architecture details: docs/claude/TECHNICAL.md
For product and pricing details: docs/claude/PRODUCTS.md

Read these files when working on features that touch the database,
workers, or product-specific UI copy.