<!--
Sync Impact Report
- Version change: [UNSET TEMPLATE] → 1.0.0 (initial ratification)
- Modified principles: n/a (first concrete version; all five principle slots filled)
- Added sections:
  - Core Principles I–V (Dockerized Isolation, No Global Dependencies, REST API Backend,
    Reference Fidelity Priority, Reviewer-Grade Clarity)
  - Technology Stack & Environment (fills SECTION_2)
  - Verification Workflow (fills SECTION_3)
  - Governance
- Removed sections: none
- Follow-up TODOs: TODO(RATIFICATION_DATE) — confirm this is the true adoption date if the
  project has earlier undocumented history predating this file.
-->

# Multi-Series Chart Constitution

## Core Principles

### I. Dockerized, One-Command Stack
Backend and frontend MUST run as independent Docker containers with no shared runtime process.
The entire stack (backend + frontend + any supporting services) MUST start with a single command,
`make up`. Contributors and reviewers MUST be able to go from a clean checkout to a running system
with that one command, without additional manual setup steps.

**Rationale**: This is an assignment evaluated by a third party; a reviewer who cannot trivially
boot the project cannot fairly evaluate it. Independent containers also keep backend and frontend
concerns decoupled, mirroring realistic deployment topology.

### II. No Global Dependencies; Docker Is the Source of Truth
Dependencies MUST NOT be installed globally on the host system.
- Backend dependencies MUST be managed exclusively through Poetry, with an in-project virtual
  environment (`virtualenvs.in-project true`), so the environment is fully contained inside the
  project directory.
- Frontend dependencies MUST be managed exclusively through the local `node_modules` directory
  (standard npm/yarn/pnpm install scoped to the project), never installed globally.
- The final, authoritative check of whether the system works MUST always be performed by running
  the Docker containers (via `make up` or equivalent Compose invocation) — never by trusting
  locally/host-run processes as proof of correctness. Host-run processes may be used only for
  interactive development, never as the acceptance check.

**Rationale**: Global installs cause "works on my machine" drift and hide packaging bugs that
would otherwise surface in Docker. Since Docker is the deployment and evaluation target, it must
also be the verification target.

### III. Backend Is a REST API
The backend MUST expose its functionality as a REST API (resource-oriented endpoints, standard
HTTP methods and status codes, JSON payloads unless a specific endpoint has a documented reason to
differ). The frontend MUST consume the backend only through this REST API — no bypassing it via
direct database access, shared in-process state, or other side channels.

**Rationale**: A REST boundary keeps backend and frontend independently deployable (per Principle
I) and is the conventional, reviewer-legible contract expected in a Python-backend hiring
assignment.

### IV. Reference Fidelity Over Speed
When a visual design or behavioral reference is provided, matching that reference's look and
interaction behavior precisely takes priority over how quickly the code is written. Shortcuts that
save implementation time at the cost of visible deviation from the reference (spacing, colors,
states, transitions, interaction sequences, edge-case behavior) are NOT acceptable trade-offs
unless explicitly approved.

**Rationale**: The assignment is evaluated on faithful reproduction of a reference; a fast but
inaccurate implementation scores worse than a slower, precise one.

### V. Reviewer-Grade Code Clarity
Code MUST be clean and easily readable by an external reviewer who has no prior context on the
project: clear naming, small and focused functions/modules, no dead code, and structure that
reflects intent rather than clever shortcuts. Where a non-obvious choice is made, it MUST be
explained briefly (comment or commit message) rather than left implicit.

**Rationale**: This project's primary "user" is a hiring reviewer reading the code, not just an
end user running it — clarity is a first-class deliverable, not a nice-to-have.

## Technology Stack & Environment

- Backend: Python, dependency and environment management via Poetry only
  (`virtualenvs.in-project true`), exposing a REST API (Principle III).
- Frontend: Node-based, dependencies resolved into a local `node_modules` only.
- Orchestration: Docker Compose (or equivalent), with `make up` as the single entrypoint that
  brings up both containers together.
- No dependency, backend or frontend, may be installed at the OS/user level outside Poetry's
  in-project venv or the project's local `node_modules`.

## Verification Workflow

- Before any change is considered done, it MUST be verified by running the full stack via
  `make up` (or the equivalent Docker Compose command) — not by relying solely on a locally
  running dev server or interpreter.
- Visual/behavioral changes MUST be checked against the provided reference (Principle IV) as part
  of this verification, not just functional smoke-testing.
- Code intended for review MUST be re-read for clarity (Principle V) before being considered
  complete — readability is part of "done," not a separate cleanup pass.

## Governance

This constitution supersedes ad-hoc practice for this project. Any conflict between it and other
guidance (README notes, inline comments, prior habits) is resolved in favor of this document.

- **Amendments**: Proposed by documenting the change and rationale in this file; take effect once
  written here. No separate external approval process exists for this single-contributor
  assignment, but the Sync Impact Report at the top of this file MUST be updated on every change.
- **Versioning policy**: Semantic versioning for this document —
  MAJOR for backward-incompatible principle removals/redefinitions, MINOR for new principles or
  materially expanded guidance, PATCH for wording/clarification fixes.
- **Compliance review**: Before considering any feature or task complete, re-check it against the
  Core Principles above, in particular Principles I, II, and IV, which are the most likely to be
  silently skipped under time pressure.

**Version**: 1.0.0 | **Ratified**: 2026-09-15 | **Last Amended**: 2026-09-15
