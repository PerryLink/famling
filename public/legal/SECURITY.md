# Security / privacy / abuse contact (DRAFT)

Status: **DRAFT (2026-11-17) — contact is configured; policy text is not lawyer-approved.** Not a privacy policy or user agreement; do not quote as approved.

- Security vulnerabilities: **novelnexusai@outlook.com** (do not open a public issue for exploit details).
- Privacy / personal-data requests (access, deletion, export): **novelnexusai@outlook.com**.
- Copyright/IP takedown: **novelnexusai@outlook.com** (see [TAKEDOWN.md](/legal/TAKEDOWN.md)).
- Community/abuse reports (illegal content, CSAM, threats, fraud, impersonation, malicious packs): **novelnexusai@outlook.com**.
- Illegal/harmful information in China can also be reported to [12377](https://www.12377.cn/); emergencies: **110/120**; mental-health support: **12356**.

Full policies: [docs/legal/SECURITY-AND-PRIVACY.md](/legal/SECURITY-AND-PRIVACY.md) · [docs/legal/TAKEDOWN-AND-REPORTING.md](/legal/TAKEDOWN.md) · [docs/legal/LEGAL-BASELINE.md](/legal/LEGAL-BASELINE.md) · [DECLARATIONS.md](/legal/DECLARATIONS.md).

Scope notes for this repository:

- Character/texture packs are data-only. Do not execute pack code; the runtime must reject any executable content. Never ask users to disable signature checks or consent gates — that is a violation of the project's mod/DLC terms.
- Release builds must pass `npm run legal:check -- --strict` (licence files present, uncleared TTS audio absent, no unresolved placeholders in shipped legal text). A passing gate is an engineering check, not a legal approval.
- No telemetry is enabled by default; Advisers/Pet Brief data stays local unless the user opts in. Cloud ASR/TTS/LLM, if configured by the user with their own key, sends data to that provider — disclose it before enabling and never store API keys in the frontend, logs, packs or repositories.
- TTS output is synthetic AI voice and must be labelled; enabling or changing voice settings requires fresh user confirmation. Do not use voice features to impersonate real people or officials (no voice cloning without written authorisation).
- Do not commit secrets; `.keys/`, `.env*`, `*.pem` (except the public pack key), `*.bundle`, and local backups are ignored.
- Crisis/health: this project is not an emergency service and cannot contact help on the user's behalf. In-app crisis text must refer to 110/120, trusted people and 12356.

This document is a draft and does not constitute legal advice or a compliance certification.
