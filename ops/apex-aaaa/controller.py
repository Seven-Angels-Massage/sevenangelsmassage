#!/usr/bin/env python3
"""Observe or reconcile only sevenangelsmassage.com's deSEC apex AAAA RRset.

No Pages/HTTP health check is a decision input. A Cloudflare DNS outage can
withdraw this RRset; Cloudflare proxy/Pages failures while DNS works cannot.
The pinned maintenance issue overrides automatic decisions while closed.
Direct DNS probes do not perform local DNSSEC validation. See the runbook for
the single-vantage-point, polling, ownership, and cached-answer limitations.
"""

from __future__ import annotations

import argparse
import base64
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
import ipaddress
import json
import os
from pathlib import Path
import sys
import time
from typing import Callable

import dns.exception
import dns.flags
import dns.message
import dns.name
import dns.query
import dns.rcode
import dns.rdatatype
import httpx
import requests


DOMAIN = "sevenangelsmassage.com"
OWNER = dns.name.from_text(DOMAIN)
CF_NS = ("hazel.ns.cloudflare.com", "nick.ns.cloudflare.com")
DESEC_NS = ("ns1.desec.io", "ns2.desec.org")
BOOTSTRAP = {
    CF_NS[0]: ("162.159.38.157", "108.162.194.157", "172.64.34.157"),
    CF_NS[1]: ("173.245.59.213", "108.162.193.213", "172.64.33.213"),
}
# Reviewed Cloudflare IPv4 prefixes; new/unrecognized NS endpoints require review.
CF_V4 = tuple(ipaddress.ip_network(value) for value in (
    "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22",
    "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18",
    "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22",
    "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
    "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
))
DOH_RESOLVERS = ("https://dns.google/dns-query", "https://dns.quad9.net/dns-query")
CF_V6_URL = "https://www.cloudflare.com/ips-v6"
API_DOMAIN = f"https://desec.io/api/v1/domains/{DOMAIN}/"
API_RRSET = API_DOMAIN + "rrsets/@/AAAA/"
API_BULK = API_DOMAIN + "rrsets/"
MAINTENANCE_ISSUE_NUMBER = 4
MAINTENANCE_ISSUE_ID = 6669544465
MAINTENANCE_ISSUE_URL = "https://github.com/Seven-Angels-Massage/sevenangelsmassage/issues/4"
MAINTENANCE_API_URL = "https://api.github.com/repos/Seven-Angels-Massage/sevenangelsmassage/issues/4"
MAINTENANCE_RESPONSE_LIMIT = 65536
ROUNDS = 4  # Initial check plus three retries, as requested.
ROUND_INTERVAL = 5
DNS_TIMEOUT = 2.0


class ControllerError(Exception):
    """Safe-to-log error: never includes response bodies or credentials."""


class ApiError(ControllerError):
    def __init__(self, message: str, uncertain: bool = False):
        super().__init__(message)
        self.uncertain = uncertain


@dataclass(frozen=True)
class Probe:
    state: str  # healthy, down (no reply over UDP or TCP), or unknown
    records: tuple[str, ...] = ()
    detail: str = ""


@dataclass(frozen=True)
class Round:
    cloudflare: tuple[Probe, Probe]
    control_ok: bool


@dataclass(frozen=True)
class Decision:
    action: str  # sync, withdraw, hold
    records: tuple[str, ...] = ()
    reason: str = ""


@dataclass(frozen=True)
class Snapshot:
    records: tuple[str, ...]
    ttl: int
    touched: str | None = None


@dataclass(frozen=True)
class Discovery:
    addresses: tuple[str, ...] = ()
    detail: str = ""
    http_status: int | None = None
    http_version: str | None = None


@dataclass(frozen=True)
class MaintenanceState:
    state: str  # open permits automatic policy; closed withdraws; unknown holds
    detail: str = ""


def read_maintenance_state(token: str = "", session=None) -> MaintenanceState:
    """Read only the pinned issue's state; its title and body are never commands."""
    if not isinstance(token, str) or "\n" in token or "\r" in token:
        return MaintenanceState("unknown", "Invalid GitHub authentication configuration")
    headers = {"Accept": "application/vnd.github+json", "Cache-Control": "no-cache, no-store",
               "Pragma": "no-cache", "User-Agent": "sam-apex-aaaa-controller"}
    if token:
        headers["Authorization"] = "Bearer " + token
    request = session.request if session is not None else requests.request
    response = None
    started = time.monotonic()
    try:
        response = request("GET", MAINTENANCE_API_URL, headers=headers,
                           timeout=(4, 8), allow_redirects=False, verify=True, stream=True)
        if response.status_code != 200:
            return MaintenanceState("unknown", "Maintenance issue request did not return HTTP 200")
        media = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        if media not in ("application/json", "application/vnd.github+json"):
            return MaintenanceState("unknown", "Maintenance issue returned an unexpected media type")
        content = bytearray()
        # Small reads make the wall-clock budget effective even if a peer sends
        # a slow trickle instead of finishing a larger buffered chunk.
        for chunk in response.iter_content(chunk_size=1):
            if time.monotonic() - started > 15 or len(content) + len(chunk) > MAINTENANCE_RESPONSE_LIMIT:
                return MaintenanceState("unknown", "Maintenance issue response exceeded its read budget")
            content.extend(chunk)
        issue = json.loads(content)
        if (not isinstance(issue, dict) or type(issue.get("id")) is not int
                or issue["id"] != MAINTENANCE_ISSUE_ID or type(issue.get("number")) is not int
                or issue["number"] != MAINTENANCE_ISSUE_NUMBER
                or issue.get("html_url") != MAINTENANCE_ISSUE_URL
                or "pull_request" in issue or issue.get("state") not in ("open", "closed")):
            return MaintenanceState("unknown", "Maintenance issue identity or state did not match")
        return MaintenanceState(issue["state"], "Verified pinned maintenance issue")
    except (requests.RequestException, ValueError, TypeError, RecursionError):
        return MaintenanceState("unknown", "Maintenance issue could not be read safely")
    finally:
        if response is not None:
            try:
                response.close()
            except requests.RequestException:
                pass


def checked_maintenance(reader: Callable[[], MaintenanceState]) -> MaintenanceState:
    try:
        state = reader()
    except (ControllerError, requests.RequestException, ValueError, TypeError):
        return MaintenanceState("unknown", "Maintenance issue is unavailable")
    if not isinstance(state, MaintenanceState) or state.state not in ("open", "closed", "unknown"):
        return MaintenanceState("unknown", "Maintenance issue state is invalid")
    return state


def ipv6_records(values) -> tuple[str, ...]:
    if not isinstance(values, (list, tuple)) or len(values) > 32:
        raise ControllerError("Unexpected AAAA record list")
    parsed = []
    for value in values:
        if not isinstance(value, str):
            raise ControllerError("Unexpected AAAA value")
        try:
            address = ipaddress.ip_address(value)
        except ValueError as exc:
            raise ControllerError("Invalid AAAA address") from exc
        if address.version != 6 or not address.is_global or address.ipv4_mapped:
            raise ControllerError("AAAA address is not public native IPv6")
        parsed.append(address.compressed)
    return tuple(sorted(set(parsed)))


def checked_response(query, response, authoritative: bool = True):
    if not query.is_response(response) or response.question != query.question:
        raise ControllerError("DNS response does not match the question")
    if response.rcode() != dns.rcode.NOERROR:
        raise ControllerError("DNS response code: " + dns.rcode.to_text(response.rcode()))
    if authoritative and not response.flags & dns.flags.AA:
        raise ControllerError("DNS reply is not authoritative")
    if response.flags & dns.flags.TC:
        raise ControllerError("DNS reply is still truncated")
    return response


def exchange(address: str, rrtype: str, timeout: float = DNS_TIMEOUT):
    query = dns.message.make_query(OWNER, rrtype, want_dnssec=True)
    query.flags &= ~dns.flags.RD
    # TCP is also attempted on UDP timeout: a runner with blocked UDP must not
    # mistake healthy authoritative DNS for an outage.
    try:
        response = dns.query.udp(query, address, timeout=timeout)
        if response.flags & dns.flags.TC:
            response = dns.query.tcp(query, address, timeout=timeout)
    except (dns.exception.Timeout, OSError):
        response = dns.query.tcp(query, address, timeout=timeout)
    return checked_response(query, response)


def answer_rrset(response, rrtype: str):
    kind = dns.rdatatype.from_text(rrtype)
    if any(rr.rdtype == dns.rdatatype.CNAME for rr in response.answer):
        raise ControllerError("Unexpected CNAME in apex response")
    matches = [rr for rr in response.answer if rr.name == OWNER and rr.rdtype == kind]
    if len(matches) > 1:
        raise ControllerError("Multiple answer RRsets for one owner and type")
    return matches[0] if matches else None


def probe_address(address: str) -> Probe:
    try:
        response = exchange(address, "AAAA")
        rrset = answer_rrset(response, "AAAA")
        if rrset is None:
            # An authoritative NODATA response is not an outage. Whether SOA is
            # healthy or not, an empty AAAA response needs manual review.
            return Probe("unknown", detail="Authoritative NOERROR without apex AAAA")
        records = ipv6_records([item.address for item in rrset])
        return Probe("healthy", records) if records else Probe("unknown", detail="Empty AAAA")
    except (dns.exception.Timeout, OSError):
        return Probe("down", detail="No authoritative reply over UDP or TCP")
    except (ControllerError, dns.exception.DNSException, ValueError, AttributeError):
        return Probe("unknown", detail="Invalid, negative, or unexpected authoritative answer")


def combine_probes(probes: list[Probe]) -> Probe:
    if probes and all(p.state == "down" for p in probes):
        return Probe("down", detail="All discovered IPv4 endpoints unreachable")
    if (probes and all(p.state == "healthy" and p.records for p in probes)
            and len({p.records for p in probes}) == 1):
        return Probe("healthy", probes[0].records)
    return Probe("unknown", detail="Incomplete, conflicting, or unexpected endpoint results")


def control_address(address: str) -> bool:
    try:
        rrset = answer_rrset(exchange(address, "SOA"), "SOA")
        return rrset is not None and len(rrset) == 1
    except (ControllerError, dns.exception.DNSException, OSError, ValueError):
        return False


def discover_at(resolver: str, hostname: str) -> Discovery:
    query = dns.message.make_query(hostname, "A", want_dnssec=True)
    wire = base64.urlsafe_b64encode(query.to_wire()).rstrip(b"=").decode("ascii")
    status = None
    protocol = None
    try:
        # Quad9 retired DoH over HTTP/1.1 in December 2025. requests cannot
        # negotiate HTTP/2; use an HTTP/2-capable client for these DNS lookups.
        with httpx.Client(http2=True, verify=True, follow_redirects=False,
                          timeout=httpx.Timeout(6, connect=4)) as client:
            response = client.get(resolver, params={"dns": wire},
                                  headers={"Accept": "application/dns-message"})
        status = response.status_code
        protocol = response.http_version
        if status != 200:
            return Discovery(detail=f"DoH HTTP {status}", http_status=status, http_version=protocol)
        if len(response.content) > 65535:
            return Discovery(detail="DoH response exceeds DNS message size", http_status=status, http_version=protocol)
        if response.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/dns-message":
            return Discovery(detail="DoH response has unexpected media type", http_status=status, http_version=protocol)
        answer = checked_response(query, dns.message.from_wire(response.content), False)
        wanted = dns.name.from_text(hostname)
        addresses = set()
        for rrset in answer.answer:
            if rrset.name != wanted or rrset.rdtype != dns.rdatatype.A:
                continue
            for item in rrset:
                address = ipaddress.ip_address(item.address)
                if address.version != 4 or not address.is_global:
                    return Discovery(detail="Non-public nameserver IPv4 address", http_status=status, http_version=protocol)
                if hostname in CF_NS and not any(address in net for net in CF_V4):
                    return Discovery(detail="Nameserver address outside reviewed Cloudflare IPv4 prefixes", http_status=status, http_version=protocol)
                addresses.add(address.compressed)
        if not 0 < len(addresses) <= 12:
            return Discovery(detail="No usable exact-name A RRset or unexpected address count", http_status=status, http_version=protocol)
        return Discovery(tuple(sorted(addresses)), "ok", status, protocol)
    except ControllerError as exc:
        return Discovery(detail=str(exc), http_status=status, http_version=protocol)
    except (httpx.HTTPError, dns.exception.DNSException, ValueError, ImportError) as exc:
        # Exception text and HTTP bodies can contain remote input. Log only the
        # bounded exception class, never request credentials or response bodies.
        return Discovery(detail="DoH failure: " + type(exc).__name__, http_status=status, http_version=protocol)


def discover(diagnostics: dict | None = None) -> tuple[dict[str, tuple[str, ...]], bool]:
    jobs = [(hostname, resolver) for hostname in (*CF_NS, *DESEC_NS)
            for resolver in DOH_RESOLVERS]
    with ThreadPoolExecutor(max_workers=8) as pool:
        answers = list(pool.map(lambda job: discover_at(job[1], job[0]), jobs))
    endpoints = {}
    trusted_cf = True
    for index, hostname in enumerate((*CF_NS, *DESEC_NS)):
        left, right = answers[2 * index:2 * index + 2]
        agreed = bool(left.addresses) and left.addresses == right.addresses
        if hostname in CF_NS:
            endpoints[hostname] = left.addresses if agreed else BOOTSTRAP[hostname]
            trusted_cf = trusted_cf and agreed
        else:
            # A control is useful only when two independent resolvers agree on it.
            endpoints[hostname] = left.addresses if agreed else ()
        if diagnostics is not None:
            diagnostics[hostname] = {
                "agreed": agreed,
                "source": "independent-resolver agreement" if agreed else
                          "pinned fallback (observation only)" if hostname in CF_NS else "unavailable",
                "resolvers": [{"resolver": resolver, **asdict(answer)}
                              for resolver, answer in zip(DOH_RESOLVERS, (left, right))],
            }
    return endpoints, trusted_cf


def sample_round(endpoints: dict[str, tuple[str, ...]]) -> Round:
    cf_jobs = [(hostname, address) for hostname in CF_NS for address in endpoints[hostname]]
    controls = [address for hostname in DESEC_NS for address in endpoints.get(hostname, ())]
    with ThreadPoolExecutor(max_workers=16) as pool:
        cf_futures = [(host, pool.submit(probe_address, address)) for host, address in cf_jobs]
        control_futures = [pool.submit(control_address, address) for address in controls]
        grouped = {host: [] for host in CF_NS}
        for host, future in cf_futures:
            grouped[host].append(future.result())
        control_ok = any(future.result() for future in control_futures)
    return Round(tuple(combine_probes(grouped[host]) for host in CF_NS), control_ok)


def collect_rounds(endpoints, sleep: Callable[[float], None] = time.sleep) -> list[Round]:
    rounds = []
    for index in range(ROUNDS):
        if index:
            sleep(ROUND_INTERVAL)
        rounds.append(sample_round(endpoints))
    return rounds


def decide(rounds: list[Round], trusted_bootstrap: bool) -> Decision:
    if not trusted_bootstrap:
        return Decision("hold", reason="Independent resolver agreement unavailable; fallback is observation-only")
    if len(rounds) != ROUNDS:
        return Decision("hold", reason="Incomplete sampling window")
    replies = [probe for sample in rounds for probe in sample.cloudflare]
    if (len(replies) == 2 * ROUNDS and all(p.state == "healthy" and p.records for p in replies)
            and len({p.records for p in replies}) == 1):
        return Decision("sync", replies[0].records,
                        "Both Cloudflare authorities agree in all four rounds")
    if (len(replies) == 2 * ROUNDS and all(p.state == "down" for p in replies)
            and all(sample.control_ok for sample in rounds)):
        return Decision("withdraw", reason="Cloudflare endpoints unreachable in all four rounds; independent deSEC SOA controls succeeded")
    return Decision("hold", reason="Partial, changing, or uncertain DNS health; retain current deSEC AAAA")


def fetch_cf_ipv6_ranges() -> tuple:
    try:
        response = requests.get(CF_V6_URL, timeout=(4, 6), allow_redirects=False, verify=True)
        if response.status_code != 200 or len(response.content) > 16384:
            raise ControllerError("Cloudflare IPv6 prefix list unavailable; publishing held")
        lines = response.text.splitlines()
        if not 1 <= len(lines) <= 64:
            raise ControllerError("Unexpected Cloudflare IPv6 prefix list")
        networks = tuple(ipaddress.ip_network(line.strip()) for line in lines if line.strip())
        if not networks or any(net.version != 6 or not net.is_global or net.prefixlen < 16 for net in networks):
            raise ControllerError("Invalid Cloudflare IPv6 prefix list")
        return networks
    except (requests.RequestException, ValueError) as exc:
        raise ControllerError("Cloudflare IPv6 prefix list unavailable; publishing held") from exc


def validate_publish(records: tuple[str, ...], networks: tuple) -> tuple[str, ...]:
    normalized = ipv6_records(records)
    if not normalized or not networks:
        raise ControllerError("Publishing requires a nonempty validated Cloudflare AAAA set")
    if any(not any(ipaddress.ip_address(value) in net for net in networks) for value in normalized):
        raise ControllerError("An observed AAAA address is outside Cloudflare's published IPv6 ranges")
    return normalized


def target_ttl(minimum) -> int:
    if type(minimum) is not int or not 1 <= minimum <= 86400:
        raise ControllerError("Invalid or missing deSEC minimum_ttl")
    return max(300, minimum)


def assert_patch_scope(payload):
    if not isinstance(payload, list) or len(payload) != 1 or not isinstance(payload[0], dict):
        raise ControllerError("Scope guard: exactly one apex AAAA RRset is permitted")
    item = payload[0]
    if (set(item) - {"subname", "type", "records", "ttl"}
            or item.get("subname") != "" or item.get("type") != "AAAA"):
        raise ControllerError("Scope guard: only this domain's apex AAAA is permitted")
    ipv6_records(item.get("records"))
    if item["records"]:
        if "ttl" not in item or target_ttl(item["ttl"]) != item["ttl"]:
            raise ControllerError("Scope guard: valid explicit TTL is required")


class DeSEC:
    def __init__(self, token: str, session=None, sleep: Callable[[float], None] = time.sleep):
        if not token or "\n" in token or "\r" in token:
            raise ControllerError("A dedicated DESEC_APEX_AAAA_TOKEN is required")
        self.session = session or requests.Session()
        self.token = token
        self.sleep = sleep

    def request(self, method: str, url: str, payload=None):
        if method == "GET":
            if url not in (API_DOMAIN, API_RRSET) or payload is not None:
                raise ControllerError("Scope guard rejected API read")
        elif method == "PATCH" and url == API_BULK:
            assert_patch_scope(payload)
        else:
            raise ControllerError("Scope guard rejected API operation")
        attempts = 2 if method == "GET" else 1
        for attempt in range(attempts):
            try:
                response = self.session.request(method, url,
                    headers={"Authorization": "Token " + self.token, "Accept": "application/json"},
                    json=payload, timeout=(5, 10), allow_redirects=False, verify=True)
            except requests.RequestException as exc:
                if attempt + 1 < attempts:
                    self.sleep(1)
                    continue
                raise ApiError("deSEC API transport failure", uncertain=method == "PATCH") from exc
            status = response.status_code
            if status in (502, 503, 504) and attempt + 1 < attempts:
                self.sleep(1)
                continue
            if method == "GET" and url == API_RRSET and status == 404:
                return None
            if status == 429:
                raise ApiError("deSEC API rate-limited (429); no retry in this run")
            if status not in (200, 201, 204):
                raise ApiError(f"deSEC API returned HTTP {status}; stopping", uncertain=method == "PATCH" and status >= 500)
            if status == 204:
                return None
            try:
                return response.json()
            except (ValueError, requests.JSONDecodeError) as exc:
                raise ApiError("deSEC API returned invalid JSON", uncertain=method == "PATCH") from exc
        raise ApiError("deSEC API retry budget exhausted")

    def minimum_ttl(self) -> int:
        domain = self.request("GET", API_DOMAIN)
        if not isinstance(domain, dict) or domain.get("name") != DOMAIN:
            raise ControllerError("deSEC returned an unexpected domain")
        return target_ttl(domain.get("minimum_ttl"))

    def snapshot(self) -> Snapshot | None:
        rrset = self.request("GET", API_RRSET)
        if rrset is None:
            return None
        if (not isinstance(rrset, dict) or rrset.get("subname") != ""
                or rrset.get("type") != "AAAA" or rrset.get("domain", DOMAIN) != DOMAIN):
            raise ControllerError("deSEC returned an unexpected RRset")
        ttl = rrset.get("ttl")
        if type(ttl) is not int or not 1 <= ttl <= 86400:
            raise ControllerError("deSEC returned an invalid RRset TTL")
        touched = rrset.get("touched")
        if touched is not None and not isinstance(touched, str):
            raise ControllerError("deSEC returned an invalid RRset revision")
        return Snapshot(ipv6_records(rrset.get("records")), ttl, touched)

    def replace(self, records: tuple[str, ...], ttl: int):
        item = {"subname": "", "type": "AAAA", "records": list(records)}
        if records:
            item["ttl"] = ttl
        return self.request("PATCH", API_BULK, [item])


def matches(snapshot: Snapshot | None, records: tuple[str, ...], ttl: int) -> bool:
    if not records:
        return snapshot is None
    return snapshot is not None and snapshot.records == records and snapshot.ttl == ttl


def reconcile(api: DeSEC | None, initial: Snapshot | None, decision: Decision,
              ttl: int | None, apply: bool, *, maintenance: MaintenanceState | None = None,
              maintenance_reader: Callable[[], MaintenanceState] | None = None) -> dict:
    result = {"decision": asdict(decision), "mode": "apply" if apply else "observe",
              "target_ttl": ttl, "changed": False, "api_verified": False,
              "initial_api_state": asdict(initial) if initial else None,
              "initial_api_state_known": api is not None}
    if decision.action == "hold":
        result["result"] = "held"
        return result
    if decision.action not in ("sync", "withdraw"):
        raise ControllerError("Unknown reconciliation action")
    if (maintenance is None or maintenance.state not in ("open", "closed")
            or (maintenance.state == "closed" and decision.action != "withdraw")):
        result.update(result="held: maintenance state does not permit this decision",
                      decision=asdict(Decision("hold", reason="Verified maintenance state required")))
        return result
    records = decision.records if decision.action == "sync" else ()
    if not apply:
        result["result"] = "would change" if api is None or not matches(initial, records, ttl) else "already matches"
        return result
    if api is None or ttl is None:
        raise ControllerError("Apply requires a configured deSEC client and validated TTL")
    # The API does not expose a documented compare-and-swap for RRsets. This
    # catches observed races, but exclusive ownership is still mandatory.
    current = api.snapshot()
    if current != initial:
        result["result"] = "held: RRset changed during sampling; another writer may be active"
        return result
    if matches(current, records, ttl):
        result.update(result="already matches", api_verified=True)
        return result
    latest = checked_maintenance(maintenance_reader) if maintenance_reader else MaintenanceState("unknown")
    result["maintenance_recheck"] = asdict(latest)
    if latest.state != maintenance.state or latest.state not in ("open", "closed"):
        result.update(result="held: maintenance issue changed or could not be rechecked",
                      decision=asdict(Decision("hold", reason="Maintenance changed or is unknown before write")))
        return result
    # GitHub and deSEC cannot commit atomically. A change after this final check
    # is corrected by the next serialized job reading the current issue state.
    api.replace(records, ttl)
    # Do not automatically retry writes: an ambiguous result may already have
    # committed. A later scheduled run will safely re-read and reconcile.
    try:
        after = api.snapshot()
    except ControllerError as exc:
        raise ApiError("Write returned success but API verification failed; inspect current state before retrying", uncertain=True) from exc
    if not matches(after, records, ttl):
        raise ApiError("Write returned success but deSEC API state differs; inspect competing writers", uncertain=True)
    result.update(result="changed; deSEC API state verified", changed=True, api_verified=True)
    return result


def publication_status(endpoints, records: tuple[str, ...]) -> dict[str, str]:
    result = {}
    for hostname in DESEC_NS:
        addresses = endpoints.get(hostname, ())
        checks = []
        for address in addresses:
            try:
                rrset = answer_rrset(exchange(address, "AAAA"), "AAAA")
                observed = () if rrset is None else ipv6_records([item.address for item in rrset])
                checks.append("matches" if observed == records else "different/pending")
            except (ControllerError, dns.exception.DNSException, OSError, ValueError):
                checks.append("unreachable/unknown")
        result[hostname] = ", ".join(sorted(set(checks))) if checks else "address discovery unavailable"
    return result


def run(apply: bool = False, environ=None, *, maintenance_only: bool = False,
        maintenance_reader: Callable[[], MaintenanceState] | None = None) -> dict:
    env = os.environ if environ is None else environ
    reader = maintenance_reader or (lambda: read_maintenance_state(env.get("GITHUB_TOKEN", "")))
    maintenance = checked_maintenance(reader)
    context = {"domain": DOMAIN, "rrtype": "AAAA", "subname": "",
               "maintenance": {**asdict(maintenance), "issue_url": MAINTENANCE_ISSUE_URL},
               "maintenance_only": maintenance_only}
    if maintenance.state == "unknown" or (maintenance_only and maintenance.state != "closed"):
        reason = ("Maintenance issue is unavailable or invalid; hold without DNS probes"
                  if maintenance.state == "unknown" else
                  "Maintenance-only invocation found the issue open; no automatic sync is allowed")
        result = reconcile(None, None, Decision("hold", reason=reason), None, apply)
        result.update(context, trusted_bootstrap=False, rounds=[], bootstrap_diagnostics={})
        return result
    token = env.get("DESEC_APEX_AAAA_TOKEN", "")
    if apply and (not token or env.get("EXCLUSIVE_APEX_AAAA_OWNER", "").lower() != "true"):
        raise ControllerError("Apply requires DESEC_APEX_AAAA_TOKEN and EXCLUSIVE_APEX_AAAA_OWNER=true after the Worker exemption is deployed")
    api = DeSEC(token) if token else None
    # Read before the sampling window, and check again just before mutation.
    ttl = api.minimum_ttl() if api else None
    initial = api.snapshot() if api else None
    discovery_diagnostics = {}
    if maintenance.state == "closed":
        endpoints, trusted, rounds = {}, False, []
        decision = Decision("withdraw", reason="Maintenance issue is closed; keep apex AAAA withdrawn")
    else:
        endpoints, trusted = discover(discovery_diagnostics)
        rounds = collect_rounds(endpoints)
        decision = decide(rounds, trusted)
    if decision.action == "sync":
        try:
            validate_publish(decision.records, fetch_cf_ipv6_ranges())
        except ControllerError as exc:
            decision = Decision("hold", reason=str(exc))
    result = reconcile(api, initial, decision, ttl, apply,
                       maintenance=maintenance, maintenance_reader=reader)
    result.update(context, trusted_bootstrap=trusted,
                  rounds=[asdict(sample) for sample in rounds],
                  bootstrap_diagnostics=discovery_diagnostics)
    if result["changed"]:
        result["authoritative_checks"] = (publication_status(endpoints, decision.records)
                                           if maintenance.state == "open" else
                                           {"maintenance": "DNS probes skipped; deletion verified through deSEC API"})
    return result


def write_summary(result: dict):
    print(json.dumps(result, indent=2))
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not path:
        return
    decision = result.get("decision", {})
    lines = ["## Apex AAAA controller", "", f"- Mode: `{result.get('mode', 'unknown')}`",
             f"- Scope: `{DOMAIN}` apex `AAAA` only",
             f"- Result: {result.get('result', 'unknown')}",
             f"- Decision: `{decision.get('action', 'hold')}` — {decision.get('reason', '')}",
             f"- Target TTL: `{result.get('target_ttl')}` (unknown without API access)",
             "", "Cloudflare Pages and HTTP status are not decision inputs."]
    if result.get("maintenance"):
        state = result["maintenance"]["state"]
        lines += ["", f"- Maintenance control: `{state}` — [issue #{MAINTENANCE_ISSUE_NUMBER}]({MAINTENANCE_ISSUE_URL})",
                  "- A closed issue requests withdrawal; an open issue permits the configured automatic policy."]
    if result.get("bootstrap_diagnostics"):
        lines += ["", "### Nameserver discovery", "",
                  "| Nameserver | Provider | Result | Protocol | Agreement |",
                  "| --- | --- | --- | --- | --- |"]
        for hostname, diagnostic in result["bootstrap_diagnostics"].items():
            for source in diagnostic["resolvers"]:
                provider = "Google" if source["resolver"] == DOH_RESOLVERS[0] else "Quad9"
                lines.append(f"| `{hostname}` | {provider} | {source['detail']} | {source['http_version'] or 'unknown'} | {diagnostic['agreed']} |")
    if result.get("changed"):
        lines += ["", "API state was verified. Recursive caches may still retain previous answers.",
                  "Authoritative checks: `" + json.dumps(result.get("authoritative_checks", {})) + "`"]
    lines += ["", "No local DNSSEC validation or global outage/propagation guarantee is claimed.", ""]
    with Path(path).open("a", encoding="utf-8") as stream:
        stream.write("\n".join(lines))


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Permit the single deSEC apex AAAA mutation")
    parser.add_argument("--maintenance-only", action="store_true",
                        help="Withdraw only if the maintenance issue is currently closed; never automatically sync")
    args = parser.parse_args(argv)
    try:
        write_summary(run(args.apply, maintenance_only=args.maintenance_only))
        return 0
    except ControllerError as exc:
        uncertain = isinstance(exc, ApiError) and exc.uncertain
        write_summary({"mode": "apply" if args.apply else "observe",
                       "result": "error; a write may have committed" if uncertain else "held: " + str(exc),
                       "decision": {"action": "hold", "reason": str(exc)},
                       "write_may_have_occurred": uncertain})
        return 1 if args.apply else 0


if __name__ == "__main__":
    sys.exit(main())
