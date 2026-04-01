# AGENTS.md
Rules for all Codex and AI agent sessions on this project.

## File Placement Rules
- All tests go in /tests/[unit|integration|components|e2e|security]
- All .md reports and documentation go in /docs
- All seed and utility scripts go in /scripts
- Never create .md files in root except: README.md, CODEXTESTING.md, SECURITY_TESTING.md, AGENTS.md
- Never leave temp, draft, backup, or debug files in the repo

## Test Rules
- Always run the relevant test suite after writing or moving tests
- Never finish a session with failing tests
- Never finish a session with unresolved Critical or High findings
- Always fix broken import paths immediately after moving files

## Session Rules
- Always read CODEXTESTING.md and SECURITY_TESTING.md before starting any testing session
- Always read AGENTS.md before starting any session
- Run npm run test:all at the end of every session

<!-- gitnexus:start -->
# GitNexus MCP

This project is indexed by GitNexus as **AMS With Backend** (3320 symbols, 11486 relationships, 243 execution flows).

## Always Start Here

1. **Read `gitnexus://repo/{name}/context`** — codebase overview + check index freshness
2. **Match your task to a skill below** and **read that skill file**
3. **Follow the skill's workflow and checklist**

> If step 1 warns the index is stale, run `npx gitnexus analyze` in the terminal first.

## Skills

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
