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
