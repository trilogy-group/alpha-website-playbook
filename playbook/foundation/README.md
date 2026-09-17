# Foundation

Last verified: September 17, 2026  
Owners: Matt Barge (website agent operator), Yash Chitneni (website operations)

The foundation layer answers the questions every other part of this playbook silently assumes: what alpha.school is for, who it serves, who supplies its content, who designs it, who controls what it can do, and where it came from. The page-family requirements, recipes, and ticket protocol should be derivable from these files. When a requirement cannot be traced back to something here, either the requirement is wrong or the foundation is missing a fact.

Reading order:

1. `website-charter.md`: purpose, audiences, funnel, outcomes, ownership, and the one decision rule.
2. `audience-and-messaging.md`: the ideal customer profile, the belief sequence, the questions the site must answer, proof standard, tone, and each page family's message role.
3. `control-matrix.md`: who provides content, who provides design, who controls functionality, who approves, per surface. Includes what campus and admissions staff may and may not control.
4. `origin-and-ownership.md`: what is known about how the site was built and who has held the keys, and the current ownership of every layer.
5. `design-system.md`: the visual system as observed on the live site and as declared in brand documents, with the gaps between them.
6. `information-architecture.md`: the full URL inventory by family, navigation, redirects, and content types.

Status convention used in every file:

- **Confirmed**: a named decision, a source-of-truth system, or a demonstrated live page. Citation given.
- **Observed**: measured on the live site on the stated date. True as a fact about the site, not an approved requirement.
- **Proposed**: written by the playbook maintainers to be adopted or rejected by the named approver. Not yet a rule.
- **Open question**: nobody has answered. Listed with an identifier (`Q-xx`) in `docs/questions-for-staff-2026-09-17.md`, which names who should be asked.

Nothing in this folder authorizes a production change. Requirements still enter `spec/` through pull requests.
