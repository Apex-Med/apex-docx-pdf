# Security Policy

Apex DOCX PDF processes document archives, XML, template expressions, and data that may be hostile. The project is prerelease software and has not been presented as independently security audited.

## Supported versions

No stable release is currently supported. Security fixes are made on a best-effort basis against the current default branch while prerelease hardening continues.

| Version                     | Supported                     |
| --------------------------- | ----------------------------- |
| Current default branch      | Best effort                   |
| Published or older versions | No supported release line yet |

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability or attach a sensitive document to an issue.

Report vulnerabilities through this repository's **private GitHub security advisories**: open the repository's **Security** tab, choose **Advisories**, then choose **New draft security advisory**. This keeps the report and any reproducer private while maintainers investigate it.

Include, when available:

- the affected commit or version;
- the vulnerable entry point and expected trust boundary;
- minimal reproduction steps or a synthetic reproducer;
- impact, required attacker capabilities, and relevant resource limits;
- whether the behavior reproduces without system fonts, network access, or external office software.

Do not include real patient, customer, credential, or other confidential data. If even a private reproducer has redistribution or privacy constraints, describe those constraints before sharing it.

Maintainers will acknowledge and triage reports as capacity permits. Because this is a prerelease project, no response or remediation service-level agreement is promised. Please allow a coordinated fix and disclosure before publishing details.

## Security scope

Useful reports include archive traversal or decompression-limit bypasses, XML parser attacks, unsafe relationship handling, template path or prototype access, denial-of-service paths, data leakage, nondeterministic ambient input, and browser worker isolation failures.

Resource limits reduce risk but do not replace application-level authentication, authorization, malware scanning, tenant isolation, retention controls, or rate limiting.
