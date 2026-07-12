# OrderVora Claude Development Rules

This file defines the standard workflow for AI agents working on OrderVora.

## Before Starting Any Task

Always read:

1. PROJECT_MEMORY.md
2. ROADMAP.md
3. RELEASE_NOTES.md

Understand the current sprint and existing decisions before changing code.

## Core Rules

- Do not repeat completed work.
- Continue from the latest committed state.
- Preserve existing working functionality.
- Avoid unnecessary architecture changes.
- Check existing implementations before creating new ones.
- Prefer improving existing components over duplicating them.

## Git Workflow

Before coding:
- Confirm current branch.
- Review existing PRs and recent commits.
- Do not create duplicate implementations.

Before finishing:
- Run required verification.
- Update documentation.
- Explain changes clearly.

## Sprint Rules

At the start of every sprint:
- Read project memory files.
- Confirm sprint scope.
- List completed vs remaining tasks.

At the end of every sprint:
- Update PROJECT_MEMORY.md.
- Update ROADMAP.md.
- Update RELEASE_NOTES.md.

## Design Rules

OrderVora uses a premium SaaS design direction:

- Mobile first.
- Warm cream backgrounds.
- Soft black typography.
- Gold/bronze accents.
- Clean spacing.
- Premium animations.
- Avoid generic templates.

Figma is the visual source of truth.

## Product Rules

OrderVora is a multi-business operating platform.

Supported business types may include:
- Restaurant
- Coffee Shop
- Deli
- Vape Shop
- Convenience Store
- Grocery
- Bakery
- Pizza
- Retail
- Other

## Development Priority

Priority order:

1. Production stability.
2. Existing feature completion.
3. User experience improvements.
4. New features.

## AI Agent Instructions

When blocked:
- Explain the blocker.
- Do not silently change architecture.
- Do not remove features to make tests pass.

When completing work:
- Provide files changed.
- Provide tests executed.
- Provide remaining risks.
