# deSEC apex AAAA controller

This controller manages exactly one DNS resource record set:

```text
Provider: deSEC
Domain:   sevenangelsmassage.com
Subname:  empty string (the zone apex)
Type:     AAAA
```

Cloudflare, `www`, IPv4 A records, HTTPS records, DNSKEYs, DS records, and the
existing Google Cloud VM are outside its write scope. It does not call the
Cloudflare API and needs no Cloudflare token. It runs on GitHub's standard
`ubuntu-24.04` hosted runner in this public repository.

## Decision policy

This implements Nathan's DNS-based policy. Cloudflare Pages is deliberately not
a condition for the apex AAAA: the apex currently uses a proxied Netlify origin,
and `www` delivery is managed separately.

The [manual control issue](https://github.com/Seven-Angels-Massage/sevenangelsmassage/issues/4)
overrides automatic DNS health decisions. A closed issue requests certificate
maintenance and prevents automatic restoration; an open issue permits automatic
control. If the controller cannot verify the issue's current state, it holds the
record instead of guessing.

| Observations | Action |
| --- | --- |
| Manual control issue is closed | Withdraw deSEC apex AAAA and keep it absent, even while Cloudflare DNS is healthy. |
| Both assigned Cloudflare nameservers consistently return the same valid public AAAA set | Synchronize that complete set to deSEC. |
| All tested Cloudflare authoritative endpoints are consistently unreachable, while independent deSEC DNS controls work | Withdraw deSEC's apex AAAA. |
| Partial outage, inconsistent answers, an unavailable probe network, or other ambiguous evidence | Hold the existing record and report the uncertainty. |
| Recovery consistently confirmed | Restore freshly retrieved addresses. |

One invocation takes an initial observation and three retries, with five-second
pauses between observations. Four matching observations are required for a
change. Network timeouts add to the fifteen seconds spent waiting. These checks
come from one GitHub runner, not four independent geographic locations.

The workflow requests a run at minutes 2, 7, 12, ... 57 of each hour. GitHub's
native minimum is five minutes, and scheduled jobs may start late or be dropped.
This is best-effort automation, not a one-minute monitoring service or a
guaranteed five-minute recovery system.

## One-tap control during Netlify SSL/TLS renewal

Bookmark [IPv6 control, issue #4](https://github.com/Seven-Angels-Massage/sevenangelsmassage/issues/4).
While signed in to GitHub and viewing that page:

| One action | Requested behavior |
| --- | --- |
| Tap **Close issue** | Remove only deSEC's apex AAAA and keep automatic restoration paused. |
| Tap **Reopen issue** after renewal | Allow automatic control again; restore current AAAA only after the Cloudflare DNS checks pass and live mode is enabled. |

Closing starts a deletion-only workflow without waiting for the next scheduled
run. It requires the restricted token and ownership guard, but it can remove the
record even when automatic mode is set to `observe`. A late close event cannot
restore AAAA if the issue has already reopened. Reopening respects the global
`APEX_AAAA_MODE` and `APEX_AAAA_PAUSED` settings.

The job may queue, so the issue state records your requested mode, not proof of
completed deletion. Check the latest
[controller run](https://github.com/Seven-Angels-Massage/sevenangelsmassage/actions/workflows/apex-aaaa.yml)
for the verified deSEC API result. Wait out the prior AAAA TTL before expecting
cached IPv6 answers to disappear. Cloudflare's generated AAAA and proxy settings
remain separate; deleting deSEC's AAAA alone does not guarantee certificate renewal.

All controller jobs share one queue and read current issue state, including
immediately before a write. Unrelated issue events do not enter that queue.
Issue title, body, comments, and labels are not executed or interpreted as commands.
Keep this issue in this repository and avoid automatic PR-closing references to it.

## Observation mode

The default is observation only. No token is needed to observe authoritative DNS:

```bash
python -m pip install -r ops/apex-aaaa/requirements.txt
python ops/apex-aaaa/controller.py
```

The checks workflow runs unit tests and a public DNS observation on the proposed
changes without receiving any deSEC secret. Its logs and job summary explain the
observations and proposed action.

Nameserver addresses are independently resolved through Google and Quad9 using
DNS over HTTPS with HTTP/2 support. The report shows each resolver's transport
and result, so a failed lookup is distinguishable from failed authoritative DNS.

## Before enabling writes

### 1. Give this controller exclusive ownership of apex AAAA

The `cf-to-desec-sync` Worker originally included AAAA in its managed types and
deleted records that were absent from Cloudflare's DNS
management API. Cloudflare's automatically generated proxy AAAA answers are not
ordinary API records. Without an exclusion, the Worker would delete the record
that this controller creates.

The exclusion in `worker-apex-aaaa-exclusion.patch` was deployed and verified on
November 29, 2026 (Philippine time), together with this plain-text binding:

```text
PAUSE_APEX_AAAA_SYNC=true
```

This removes only apex AAAA from the Worker's comparison and write plans. It does
not alter `PAUSE_WWW_SYNC` or any other record's ownership. Review the current
Worker source before reapplying the patch after a future Worker replacement.
The deployed source, existing bindings, and other settings were verified.

Worker version: `84c0ad80-b3a4-4ba5-b972-e0e5ff0ebf9e`.
Previous version for rollback: `cabc84fb-4f73-4ede-b682-d41ec3687d40`.
The exclusion is a prerequisite; its deployment alone does not enable GitHub
writes or create a deSEC AAAA record.

Only after the exclusion is deployed and verified, set this GitHub repository
variable under Settings > Secrets and variables > Actions > Variables:

```text
EXCLUSIVE_APEX_AAAA_OWNER=true
```

The controller refuses live writes without that assertion. It does not itself
deploy or configure the Worker.

### 2. Create a restricted deSEC token

Use a new token named `GitHub apex AAAA controller`. Do not give it permission to
create domains, delete domains, or manage tokens. Create it with
`auto_policy: true`, which makes deSEC create a restrictive default policy as part
of token creation. Then add only the specific apex-AAAA allowance. Its final
write policies must be:

```json
[
  {"domain": null, "subname": null, "type": null, "perm_write": false},
  {"domain": "sevenangelsmassage.com", "subname": "", "type": "AAAA", "perm_write": true}
]
```

Verify the automatic deny-by-default policy before adding the specific allow
policy. A token without restrictive policies may be broader than intended. deSEC allows token
holders to read DNS record data even when write permissions are restricted.

Store the token's secret value in this repository's Actions secret:

```text
DESEC_APEX_AAAA_TOKEN
```

Never put the secret in a committed file, issue, pull request, or workflow log.

#### One-time credential setup from Windows 11

[Set-DeSECSecret.ps1](./Set-DeSECSecret.ps1) automates this token creation and stores the secret directly
in GitHub using the official GitHub CLI. It does not write DNS records. It leaves
the controller in observation mode for the final authenticated check.

1. Install GitHub CLI if needed (`winget install --id GitHub.cli --exact`), then
   open a fresh PowerShell terminal and run
   `gh auth login --hostname github.com --web --git-protocol https`.
2. In [deSEC's token dashboard](https://desec.io/tokens), create a temporary setup
   token with **Can manage tokens** enabled. Leave domain creation and deletion
   off. A maximum age of one hour is sufficient for setup. This temporary token
   stays on your PC and is not sent to GitHub.
3. Review `Set-DeSECSecret.ps1`, then run it in PowerShell. Paste the temporary
   token only into its masked prompt. The helper refuses to overwrite an existing
   `DESEC_APEX_AAAA_TOKEN` secret and verifies the new token's policy before saving.
4. After success, delete the temporary setup token in deSEC. Keep the newly
   created production token; GitHub needs it for the controller.

The helper checks GitHub access before creating credentials, sends the production
secret through standard input rather than command-line arguments, and never
prints either token. If setup fails, its message distinguishes revoked tokens
from credentials that were already saved and need attention. It also sets
`EXCLUSIVE_APEX_AAAA_OWNER=true` for the Worker exemption verified above and
`APEX_AAAA_MODE=observe`; it does not enable live DNS writes.

The ordinary deSEC token checkboxes do not provide the exact RRset restriction.
The helper configures that restriction through the documented policy API.

### 3. Verify an observation on GitHub

After the workflow is on the default branch, open Actions > deSEC apex AAAA
controller > Run workflow. Leave `apply` unchecked. Confirm that the report sees
the expected authorities and addresses. If the runner cannot reach authoritative
DNS, fix that observation problem before enabling writes; do not reinterpret it
as a Cloudflare outage.

### 4. Enable the controller

For one live reconciliation, select `apply` in Run workflow on `main`.
For scheduled live reconciliations, set this repository variable:

```text
APEX_AAAA_MODE=apply
```

With this variable absent or set to `observe`, scheduled runs cannot change DNS.
The controller checks the current record immediately before a write, sends only
the exact apex AAAA change, and verifies the API's resulting record state.
API verification is not a claim that every authoritative node or resolver has
already received the change.

The TTL is chosen using deSEC's domain minimum; Cloudflare's observed positive
TTL cannot override deSEC's minimum. A 900-second minimum means a previously
cached AAAA can remain usable for roughly 15 minutes after withdrawal, even if
the GitHub job succeeds immediately. Negative caching can also delay restored
IPv6 answers.

## Pause and rollback

Set `APEX_AAAA_PAUSED=true` to skip automatic and ordinary manual controller jobs.
An explicit **Close issue** maintenance request can still remove AAAA. Disable
the workflow if all controller execution must stop.
An already running job can finish: cancel it explicitly if necessary. Pausing
does not remove an existing AAAA record. To return to the original no-AAAA state,
pause the controller, remove only the apex AAAA at deSEC, and verify the answer.
Keep the Worker exclusion enabled until record ownership is deliberately handed
back. Never re-enable two writers for the same RRset.

## Operational limits

- A DNS-only health policy does not detect every Cloudflare proxy, TLS, HTTP, or
  IPv6 routing outage. Healthy authoritative DNS can coexist with a failed web
  service. This controller must not be described as an end-to-end IPv6 monitor.
- AAAA records can be queried over IPv4. A GitHub runner's inability to open IPv6
  connections does not establish that Cloudflare's IPv6 service has failed.
- Withdrawing at deSEC cannot erase Cloudflare's own generated AAAA answers,
  cached answers, or addresses in a DNS HTTPS record's `ipv6hint` parameter.
  HTTPS records are intentionally outside this controller's write scope.
- During a withdrawal, DNSViz may again show AAAA at Cloudflare and signed
  NODATA at deSEC. This is an expected consequence of the chosen policy.
- Adding AAAA does not fix the separate CDS and NSEC3PARAM notices observed in
  the earlier DNSViz report.
- GitHub may disable scheduled workflows in public repositories after 60 days
  without repository activity. Check that the schedule remains active.
- This workflow uses standard public-repository runners, no larger runner, no
  VM, no paid plan, and no uploaded artifacts. It checks out only the controller
  path and reads DNS/API responses, not website assets. GitHub's current public
  runner compute policy is free; general service limits still apply.

## Verification

```bash
python -m unittest discover -s ops/apex-aaaa -p 'test_*.py' -v
```

Tests cover the decision states and the boundary that restricts every write to
the single permitted RRset. Outage tests use simulated responses; production
records should not be deleted merely to test the code.

The initial [GitHub-hosted DNS validation run](https://github.com/Seven-Angels-Massage/sevenangelsmassage/actions/runs/46175166756)
passed 42 tests and completed a usable public DNS observation: both independent
resolvers agreed on nameserver addresses, both Cloudflare authorities returned
the same IPv6 set in all four rounds, and the deSEC DNS controls succeeded.
The current suite additionally covers the manual maintenance switch and the
Windows credential helper's success and partial-failure paths without real
credentials or DNS writes.

## References

- [GitHub scheduled workflow limits](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [deSEC RRset API](https://desec.readthedocs.io/en/latest/dns/rrsets.html)
- [deSEC token policies](https://desec.readthedocs.io/en/latest/auth/tokens.html#token-scoping-policies)
- [deSEC domain minimum TTL](https://desec.readthedocs.io/en/latest/dns/domains.html)
- [Cloudflare proxy behavior](https://developers.cloudflare.com/dns/proxy-status/)
- [DNS negative caching](https://www.rfc-editor.org/rfc/rfc2308.html)
