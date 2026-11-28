"""Focused safety tests. No external requests and no DNS mutations are made."""

import json
import unittest
from unittest.mock import Mock, patch

import dns.exception
import dns.flags
import dns.message
import dns.rcode
import dns.rrset
import httpx
import requests

import controller as c


AAAA = ("2606:4700:3030::6815:1", "2606:4700:3031::ac43:1")
OTHER_AAAA = ("2606:4700:3030::6815:2",)
NETWORKS = (c.ipaddress.ip_network("2606:4700::/32"),)
HEALTHY = c.Probe("healthy", AAAA)
DOWN = c.Probe("down")
UNKNOWN = c.Probe("unknown")
ISSUE_OPEN = c.MaintenanceState("open")
ISSUE_CLOSED = c.MaintenanceState("closed")


def rounds(left=HEALTHY, right=HEALTHY, control=True):
    return [c.Round((left, right), control) for _ in range(c.ROUNDS)]


def api_rrset(records=AAAA, ttl=900, touched="one"):
    return {"domain": c.DOMAIN, "subname": "", "type": "AAAA",
            "records": list(records), "ttl": ttl, "touched": touched}


class Response:
    def __init__(self, status, body=None):
        self.status_code = status
        self.body = body

    def json(self):
        return self.body


class Session:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def request(self, method, url, **kwargs):
        self.calls.append((method, url, kwargs))
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def maintenance_issue(state="open", **changes):
    return {"id": c.MAINTENANCE_ISSUE_ID, "number": c.MAINTENANCE_ISSUE_NUMBER,
            "html_url": c.MAINTENANCE_ISSUE_URL, "state": state, **changes}


class MaintenanceResponse:
    def __init__(self, status=200, body=None, raw=None, media="application/json"):
        self.status_code = status
        self.headers = {"content-type": media}
        self.content = raw if raw is not None else json.dumps(body).encode()
        self.closed = False

    def iter_content(self, chunk_size):
        for offset in range(0, len(self.content), chunk_size):
            yield self.content[offset:offset + chunk_size]

    def close(self):
        self.closed = True


class MaintenanceReaderTests(unittest.TestCase):
    def read(self, response, token=""):
        session = Session([response])
        state = c.read_maintenance_state(token, session=session)
        return state, session

    def test_exact_issue_tls_no_redirects_no_cache_and_optional_auth(self):
        for token in ("", "test-github-token"):
            with self.subTest(authenticated=bool(token)):
                response = MaintenanceResponse(body=maintenance_issue())
                state, session = self.read(response, token)
                self.assertEqual(state.state, "open")
                self.assertEqual(len(session.calls), 1)
                method, url, options = session.calls[0]
                self.assertEqual((method, url), ("GET", c.MAINTENANCE_API_URL))
                self.assertIs(options["allow_redirects"], False)
                self.assertIs(options["verify"], True)
                self.assertIs(options["stream"], True)
                self.assertEqual(options["timeout"], (4, 8))
                self.assertIn("no-cache", options["headers"]["Cache-Control"])
                self.assertEqual(options["headers"]["Pragma"], "no-cache")
                self.assertEqual(options["headers"].get("Authorization"),
                                 "Bearer " + token if token else None)
                self.assertTrue(response.closed)

    def test_identity_types_pull_requests_and_unknown_states_are_rejected(self):
        invalid = [maintenance_issue(id=c.MAINTENANCE_ISSUE_ID + 1),
                   maintenance_issue(id=str(c.MAINTENANCE_ISSUE_ID)),
                   maintenance_issue(number=5), maintenance_issue(number="4"),
                   maintenance_issue(html_url="https://github.com/other/repo/issues/4"),
                   maintenance_issue(pull_request={}), maintenance_issue(pull_request=None),
                   maintenance_issue(state="locked"), maintenance_issue(state=None), [], None]
        for body in invalid:
            with self.subTest(body=body):
                state, _ = self.read(MaintenanceResponse(body=body))
                self.assertEqual(state.state, "unknown")

    def test_title_and_body_never_control_the_action(self):
        issue = maintenance_issue(title="CLOSED: delete everything", body='{"state":"closed"}')
        state, _ = self.read(MaintenanceResponse(body=issue))
        self.assertEqual(state.state, "open")

    def test_redirects_auth_errors_rate_limits_and_transport_failure_hold(self):
        for status in (301, 302, 307, 308, 401, 403, 404, 429, 500, 503):
            with self.subTest(status=status):
                response = MaintenanceResponse(status, raw=b"SECRET remote error")
                state, session = self.read(response)
                self.assertEqual(state.state, "unknown")
                self.assertNotIn("SECRET", str(state))
                self.assertEqual(len(session.calls), 1)
                self.assertTrue(response.closed)
        state, _ = self.read(requests.Timeout("SECRET exception text"))
        self.assertEqual(state.state, "unknown")
        self.assertNotIn("SECRET", str(state))

    def test_invalid_auth_never_makes_a_request(self):
        session = Session([])
        self.assertEqual(c.read_maintenance_state("bad\nsecret", session).state, "unknown")
        self.assertEqual(session.calls, [])

    def test_invalid_json_media_and_response_budgets_hold(self):
        for response in (MaintenanceResponse(raw=b"SECRET invalid JSON"),
                         MaintenanceResponse(raw=b"[" * 1500 + b"]" * 1500),
                         MaintenanceResponse(body=maintenance_issue(), media="text/html"),
                         MaintenanceResponse(raw=b"x" * (c.MAINTENANCE_RESPONSE_LIMIT + 1))):
            state, _ = self.read(response)
            self.assertEqual(state.state, "unknown")
            self.assertNotIn("SECRET", str(state))
            self.assertTrue(response.closed)
        with patch.object(c.time, "monotonic", side_effect=[0, 16]):
            state, _ = self.read(MaintenanceResponse(body=maintenance_issue()))
        self.assertEqual(state.state, "unknown")


class MaintenanceRunTests(unittest.TestCase):
    def setUp(self):
        self.api = Mock()
        self.api.minimum_ttl.return_value = 900
        self.api.snapshot.return_value = None
        self.env = {"DESEC_APEX_AAAA_TOKEN": "test-token", "EXCLUSIVE_APEX_AAAA_OWNER": "true"}
        self.boundaries = {}
        for name, value in (("DeSEC", self.api), ("read_maintenance_state", ISSUE_OPEN),
                            ("discover", ({}, True)), ("collect_rounds", rounds()),
                            ("fetch_cf_ipv6_ranges", NETWORKS), ("publication_status", {})):
            stub = patch.object(c, name, return_value=value)
            self.boundaries[name] = stub.start()
            self.addCleanup(stub.stop)

    def assert_no_dns_probes(self):
        for name in ("discover", "collect_rounds", "fetch_cf_ipv6_ranges", "publication_status"):
            self.boundaries[name].assert_not_called()

    def test_closed_issue_withdraws_even_when_dns_would_be_healthy(self):
        present = c.Snapshot(AAAA, 900, "one")
        self.api.snapshot.side_effect = [present, present, None]
        reader = Mock(return_value=ISSUE_CLOSED)
        result = c.run(True, self.env, maintenance_reader=reader)
        self.assertEqual(result["decision"]["action"], "withdraw")
        self.assertTrue(result["changed"])
        self.assertTrue(result["api_verified"])
        self.assertEqual(result["maintenance"]["state"], "closed")
        self.assertEqual(result["rounds"], [])
        self.assertEqual(reader.call_count, 2)
        self.api.replace.assert_called_once_with((), 900)
        self.assert_no_dns_probes()

    def test_scheduled_run_does_not_restore_aaaa_while_issue_stays_closed(self):
        result = c.run(True, self.env, maintenance_reader=lambda: ISSUE_CLOSED)
        self.assertEqual(result["decision"]["action"], "withdraw")
        self.assertEqual(result["result"], "already matches")
        self.assertFalse(result["changed"])
        self.api.replace.assert_not_called()
        self.assert_no_dns_probes()

    def test_closed_observe_run_plans_withdrawal_without_probes_or_writes(self):
        result = c.run(False, {}, maintenance_reader=lambda: ISSUE_CLOSED)
        self.assertEqual(result["decision"]["action"], "withdraw")
        self.assertEqual(result["result"], "would change")
        self.boundaries["DeSEC"].assert_not_called()
        self.assert_no_dns_probes()

    def test_stale_closed_event_cannot_auto_sync_when_issue_is_now_open(self):
        result = c.run(True, {}, maintenance_only=True, maintenance_reader=lambda: ISSUE_OPEN)
        self.assertEqual(result["decision"]["action"], "hold")
        self.assertIn("no automatic sync", result["decision"]["reason"])
        self.assertFalse(result["changed"])
        self.boundaries["DeSEC"].assert_not_called()
        self.assert_no_dns_probes()

    def test_unknown_invalid_or_unavailable_issue_holds_before_any_api_or_dns_probes(self):
        for state in (c.MaintenanceState("unknown"), c.MaintenanceState("invalid"),
                      {"state": "closed"}, requests.Timeout("SECRET failure")):
            with self.subTest(state=type(state).__name__):
                reader = Mock(side_effect=state) if isinstance(state, Exception) else Mock(return_value=state)
                result = c.run(True, {}, maintenance_reader=reader)
                self.assertEqual(result["decision"]["action"], "hold")
                self.assertEqual(result["maintenance"]["state"], "unknown")
                self.assertFalse(result["changed"])
                self.assertNotIn("SECRET", str(result))
                self.boundaries["DeSEC"].assert_not_called()
                self.assert_no_dns_probes()

    def test_issue_changes_or_becomes_unavailable_immediately_before_write_hold(self):
        for initial_state, latest in ((ISSUE_OPEN, ISSUE_CLOSED), (ISSUE_CLOSED, ISSUE_OPEN),
                                     (ISSUE_OPEN, c.MaintenanceState("unknown")),
                                     (ISSUE_CLOSED, requests.Timeout("SECRET failure"))):
            with self.subTest(initial=initial_state.state, latest=type(latest).__name__):
                self.api.reset_mock()
                present = c.Snapshot(AAAA, 900, "one") if initial_state.state == "closed" else None
                self.api.snapshot.side_effect = [present, present]
                reader = Mock(side_effect=[initial_state, latest])
                result = c.run(True, self.env, maintenance_reader=reader)
                self.assertEqual(result["decision"]["action"], "hold")
                self.assertIn("before write", result["decision"]["reason"])
                self.assertFalse(result["changed"])
                self.assertEqual(reader.call_count, 2)
                self.api.replace.assert_not_called()
                self.assertNotIn("SECRET", str(result))

    def test_issue_read_precedes_desec_and_dns_probes_and_receives_optional_token(self):
        events = []
        self.boundaries["read_maintenance_state"].side_effect = lambda token: events.append("issue") or ISSUE_OPEN
        self.boundaries["DeSEC"].side_effect = lambda token: events.append("deSEC") or self.api
        self.boundaries["discover"].side_effect = lambda diagnostics: events.append("DNS") or ({}, True)
        c.run(False, {**self.env, "GITHUB_TOKEN": "test-github-token"})
        self.assertEqual(events, ["issue", "deSEC", "DNS"])
        self.boundaries["read_maintenance_state"].assert_called_once_with("test-github-token")

    def test_direct_reconcile_requires_valid_initial_and_rechecked_maintenance(self):
        for kwargs in ({}, {"maintenance": ISSUE_CLOSED}, {"maintenance": ISSUE_OPEN}):
            with self.subTest(kwargs=kwargs):
                self.api.reset_mock()
                result = c.reconcile(self.api, None, c.Decision("sync", AAAA), 900, True, **kwargs)
                self.assertEqual(result["decision"]["action"], "hold")
                self.api.replace.assert_not_called()

    def test_cli_forwards_maintenance_only_without_enabling_apply_implicitly(self):
        for options, apply in ((["--maintenance-only"], False),
                               (["--apply", "--maintenance-only"], True)):
            with self.subTest(options=options), patch.object(c, "run", return_value={}) as run, \
                    patch.object(c, "write_summary"):
                self.assertEqual(c.main(options), 0)
                run.assert_called_once_with(apply, maintenance_only=True)


class DecisionTests(unittest.TestCase):
    def test_all_healthy_syncs_even_without_control(self):
        self.assertEqual(c.decide(rounds(control=False), True).action, "sync")

    def test_confirmed_outage_with_controls_withdraws(self):
        decision = c.decide(rounds(DOWN, DOWN), True)
        self.assertEqual(decision.action, "withdraw")
        self.assertEqual(decision.records, ())

    def test_one_provider_or_endpoint_healthy_holds(self):
        self.assertEqual(c.decide(rounds(HEALTHY, DOWN), True).action, "hold")
        self.assertEqual(c.combine_probes([HEALTHY, DOWN]).state, "unknown")

    def test_local_probe_outage_cannot_withdraw(self):
        self.assertEqual(c.decide(rounds(DOWN, DOWN, control=False), True).action, "hold")

    def test_one_failed_control_prevents_withdrawal(self):
        samples = rounds(DOWN, DOWN)
        samples[-1] = c.Round((DOWN, DOWN), False)
        self.assertEqual(c.decide(samples, True).action, "hold")

    def test_mixed_rounds_hold(self):
        samples = rounds(DOWN, DOWN)
        samples[-1] = c.Round((HEALTHY, HEALTHY), True)
        self.assertEqual(c.decide(samples, True).action, "hold")

    def test_addresses_changing_between_rounds_hold(self):
        samples = rounds()
        samples[-1] = c.Round((c.Probe("healthy", OTHER_AAAA),) * 2, True)
        self.assertEqual(c.decide(samples, True).action, "hold")

    def test_conflicting_authorities_or_empty_answers_hold(self):
        self.assertEqual(c.decide(rounds(HEALTHY, c.Probe("healthy", OTHER_AAAA)), True).action, "hold")
        self.assertEqual(c.decide(rounds(c.Probe("healthy"), c.Probe("healthy")), True).action, "hold")
        self.assertEqual(c.decide(rounds(UNKNOWN, UNKNOWN), True).action, "hold")

    def test_stale_bootstrap_and_incomplete_window_hold(self):
        self.assertEqual(c.decide(rounds(DOWN, DOWN), False).action, "hold")
        self.assertEqual(c.decide(rounds(), False).action, "hold")
        self.assertEqual(c.decide(rounds()[:3], True).action, "hold")

    def test_initial_check_plus_three_retries_five_seconds_apart(self):
        sleep = Mock()
        with patch.object(c, "sample_round", return_value=rounds()[0]) as sample:
            result = c.collect_rounds({}, sleep)
        self.assertEqual(len(result), 4)
        self.assertEqual(sample.call_count, 4)
        self.assertEqual([call.args for call in sleep.call_args_list], [(5,), (5,), (5,)])


class DNSTests(unittest.TestCase):
    def answer(self, kind="AAAA"):
        query = dns.message.make_query(c.OWNER, kind, want_dnssec=True)
        query.flags &= ~dns.flags.RD
        response = dns.message.make_response(query)
        response.flags |= dns.flags.AA
        if kind == "AAAA":
            response.answer.append(dns.rrset.from_text(c.DOMAIN, 300, "IN", "AAAA", *AAAA))
        return query, response

    def test_reject_non_authoritative_wrong_question_and_negative_answers(self):
        query, response = self.answer()
        response.flags &= ~dns.flags.AA
        with self.assertRaises(c.ControllerError):
            c.checked_response(query, response)
        response.flags |= dns.flags.AA
        response.set_rcode(dns.rcode.SERVFAIL)
        with self.assertRaises(c.ControllerError):
            c.checked_response(query, response)
        response.set_rcode(dns.rcode.NOERROR)
        response.id ^= 1
        with self.assertRaises(c.ControllerError):
            c.checked_response(query, response)

    def test_aaaa_no_data_is_unknown_not_outage(self):
        _, response = self.answer()
        response.answer = []
        with patch.object(c, "exchange", return_value=response):
            self.assertEqual(c.probe_address("162.159.38.157").state, "unknown")

    def test_cname_and_private_ipv6_rejected(self):
        _, response = self.answer()
        response.answer.append(dns.rrset.from_text(c.DOMAIN, 300, "IN", "CNAME", "elsewhere.example."))
        with self.assertRaises(c.ControllerError):
            c.answer_rrset(response, "AAAA")
        for records in (("::1",), ("fd00::1",), ("192.0.2.1",), ("::ffff:8.8.8.8",)):
            with self.subTest(records=records), self.assertRaises(c.ControllerError):
                c.ipv6_records(records)

    def test_udp_timeout_tries_tcp_before_marking_down(self):
        _, response = self.answer()
        with patch.object(c.dns.query, "udp", side_effect=dns.exception.Timeout), \
                patch.object(c.dns.query, "tcp", return_value=response) as tcp, \
                patch.object(c, "checked_response", return_value=response):
            c.exchange("162.159.38.157", "AAAA")
        tcp.assert_called_once()

    def test_both_transport_timeouts_are_down(self):
        with patch.object(c, "exchange", side_effect=dns.exception.Timeout):
            self.assertEqual(c.probe_address("162.159.38.157").state, "down")

    def test_non_cloudflare_ipv6_cannot_be_published(self):
        self.assertEqual(c.validate_publish(AAAA, NETWORKS), AAAA)
        with self.assertRaises(c.ControllerError):
            c.validate_publish(("2001:4860:4860::8888",), NETWORKS)


class DiscoveryTests(unittest.TestCase):
    def doh_response(self, address="162.159.38.157"):
        query = dns.message.make_query(c.CF_NS[0], "A", want_dnssec=True)
        answer = dns.message.make_response(query)
        answer.answer.append(dns.rrset.from_text(c.CF_NS[0] + ".", 300, "IN", "A", address))
        return query, answer

    def call_discovery(self, response, query=None, failure=None):
        with patch.object(c.httpx, "Client") as constructor, \
                patch.object(c.requests, "get", side_effect=AssertionError("DoH must not use HTTP/1.1 requests")):
            client = constructor.return_value.__enter__.return_value
            client.get.return_value = response
            client.get.side_effect = failure
            if query is None:
                result = c.discover_at(c.DOH_RESOLVERS[1], c.CF_NS[0])
            else:
                with patch.object(c.dns.message, "make_query", return_value=query):
                    result = c.discover_at(c.DOH_RESOLVERS[1], c.CF_NS[0])
            settings = constructor.call_args.kwargs
        return result, settings

    def test_quad9_discovery_negotiates_http2_and_parses_wire_dns(self):
        query, answer = self.doh_response()
        response = httpx.Response(200, content=answer.to_wire(),
                                  headers={"Content-Type": "application/dns-message"},
                                  extensions={"http_version": b"HTTP/2"})
        result, settings = self.call_discovery(response, query)
        self.assertEqual(result.addresses, ("162.159.38.157",))
        self.assertEqual(result.http_version, "HTTP/2")
        self.assertEqual(result.detail, "ok")
        self.assertIs(settings["http2"], True)
        self.assertIs(settings["verify"], True)
        self.assertIs(settings["follow_redirects"], False)

    def test_http_protocol_rejection_is_diagnostic_and_not_trusted(self):
        response = httpx.Response(505, text="untrusted remote body SECRET", extensions={"http_version": b"HTTP/1.1"})
        result, _ = self.call_discovery(response)
        self.assertEqual(result.addresses, ())
        self.assertEqual(result.http_status, 505)
        self.assertEqual(result.http_version, "HTTP/1.1")
        self.assertEqual(result.detail, "DoH HTTP 505")
        self.assertNotIn("SECRET", str(result))

    def test_doh_message_mismatch_is_diagnostic_and_rejected(self):
        query, answer = self.doh_response()
        answer.id ^= 1
        response = httpx.Response(200, content=answer.to_wire(),
                                  headers={"Content-Type": "application/dns-message"})
        result, _ = self.call_discovery(response, query)
        self.assertEqual(result.addresses, ())
        self.assertIn("does not match", result.detail)

    def test_non_dns_media_type_and_non_cloudflare_endpoint_are_rejected(self):
        result, _ = self.call_discovery(httpx.Response(200, text="not DNS", headers={"Content-Type": "text/html"}))
        self.assertEqual(result.addresses, ())
        self.assertIn("media type", result.detail)
        query, answer = self.doh_response("8.8.8.8")
        response = httpx.Response(200, content=answer.to_wire(), headers={"Content-Type": "application/dns-message"})
        result, _ = self.call_discovery(response, query)
        self.assertEqual(result.addresses, ())
        self.assertIn("outside reviewed Cloudflare", result.detail)

    def test_transport_diagnostic_does_not_include_exception_text(self):
        result, _ = self.call_discovery(None, failure=httpx.ConnectError("secret-token in remote exception"))
        self.assertEqual(result.addresses, ())
        self.assertEqual(result.detail, "DoH failure: ConnectError")
        self.assertNotIn("secret-token", str(result))

    def test_provider_agreement_still_required_and_diagnostics_show_failure(self):
        def answer(resolver, hostname):
            if resolver == c.DOH_RESOLVERS[1]:
                return c.Discovery(detail="DoH HTTP 505", http_status=505, http_version="HTTP/1.1")
            values = tuple(sorted(c.BOOTSTRAP.get(hostname, ("45.54.76.1",))))
            return c.Discovery(values, "ok", 200, "HTTP/2")
        diagnostics = {}
        with patch.object(c, "discover_at", side_effect=answer):
            endpoints, trusted = c.discover(diagnostics)
        self.assertFalse(trusted)
        self.assertEqual(endpoints[c.CF_NS[0]], c.BOOTSTRAP[c.CF_NS[0]])
        self.assertEqual(endpoints[c.DESEC_NS[0]], ())
        self.assertFalse(diagnostics[c.CF_NS[0]]["agreed"])
        self.assertEqual(diagnostics[c.CF_NS[0]]["resolvers"][1]["http_status"], 505)
        self.assertEqual(c.decide(rounds(DOWN, DOWN), trusted).action, "hold")

    def test_success_requires_address_agreement_not_identical_http_metadata(self):
        def answer(resolver, hostname):
            values = tuple(sorted(c.BOOTSTRAP.get(hostname, ("45.54.76.1",))))
            protocol = "HTTP/1.1" if resolver == c.DOH_RESOLVERS[0] else "HTTP/2"
            return c.Discovery(values, "ok", 200, protocol)
        diagnostics = {}
        with patch.object(c, "discover_at", side_effect=answer):
            endpoints, trusted = c.discover(diagnostics)
        self.assertTrue(trusted)
        self.assertEqual(endpoints[c.CF_NS[0]], tuple(sorted(c.BOOTSTRAP[c.CF_NS[0]])))
        self.assertEqual(endpoints[c.DESEC_NS[0]], ("45.54.76.1",))
        self.assertTrue(diagnostics[c.CF_NS[0]]["agreed"])

    def test_conflicting_successful_providers_remain_untrusted(self):
        def answer(resolver, hostname):
            values = ("162.159.38.157",) if resolver == c.DOH_RESOLVERS[0] else ("172.64.34.157",)
            return c.Discovery(values, "ok", 200, "HTTP/2")
        with patch.object(c, "discover_at", side_effect=answer):
            _, trusted = c.discover({})
        self.assertFalse(trusted)


class APITests(unittest.TestCase):
    def client(self, *responses):
        session = Session(responses)
        return c.DeSEC("test-token", session=session, sleep=Mock()), session

    def test_scope_guard_rejects_other_names_types_and_bulk_records(self):
        api, session = self.client()
        invalid = [
            [{"subname": "www", "type": "AAAA", "records": []}],
            [{"subname": "", "type": "A", "records": []}],
            [{"subname": "@", "type": "AAAA", "records": []}],
            [{"subname": "", "type": "AAAA", "records": []}] * 2,
            [{"subname": "", "type": "AAAA", "records": [], "domain": "other.example"}],
        ]
        for payload in invalid:
            with self.subTest(payload=payload), self.assertRaises(c.ControllerError):
                api.request("PATCH", c.API_BULK, payload)
        with self.assertRaises(c.ControllerError):
            api.request("DELETE", c.API_DOMAIN)
        with self.assertRaises(c.ControllerError):
            api.request("GET", "https://example.com/")
        self.assertEqual(session.calls, [])

    def test_api_404_means_absent_only_at_exact_rrset_endpoint(self):
        api, _ = self.client(Response(404))
        self.assertIsNone(api.snapshot())
        api, _ = self.client(Response(404))
        with self.assertRaises(c.ApiError):
            api.minimum_ttl()

    def test_401_403_and_redirects_are_not_absence(self):
        for status in (401, 403, 301, 302, 307, 308):
            with self.subTest(status=status):
                api, session = self.client(Response(status))
                with self.assertRaises(c.ApiError):
                    api.snapshot()
                self.assertEqual(len(session.calls), 1)
                self.assertIs(session.calls[0][2]["allow_redirects"], False)
                self.assertIs(session.calls[0][2]["verify"], True)

    def test_429_stops_without_retry(self):
        api, session = self.client(Response(429))
        with self.assertRaisesRegex(c.ApiError, "429"):
            api.snapshot()
        self.assertEqual(len(session.calls), 1)
        api.sleep.assert_not_called()

    def test_get_temporary_failure_retries_once(self):
        for failure in (Response(503), requests.Timeout()):
            with self.subTest(failure=type(failure).__name__):
                api, session = self.client(failure, Response(200, api_rrset()))
                self.assertEqual(api.snapshot().records, AAAA)
                self.assertEqual(len(session.calls), 2)
                api.sleep.assert_called_once_with(1)

    def test_mutation_timeout_or_5xx_is_not_retried(self):
        for failure in (Response(503), requests.Timeout()):
            with self.subTest(failure=type(failure).__name__):
                api, session = self.client(failure)
                with self.assertRaises(c.ApiError) as caught:
                    api.replace(AAAA, 900)
                self.assertTrue(caught.exception.uncertain)
                self.assertEqual(len(session.calls), 1)

    def test_domain_minimum_ttl_is_respected_and_bounded(self):
        for minimum, expected in ((60, 300), (300, 300), (900, 900), (3600, 3600), (86400, 86400)):
            api, _ = self.client(Response(200, {"name": c.DOMAIN, "minimum_ttl": minimum}))
            self.assertEqual(api.minimum_ttl(), expected)
        for invalid in (None, "900", True, 0, 86401):
            with self.subTest(invalid=invalid), self.assertRaises(c.ControllerError):
                c.target_ttl(invalid)


class ReconciliationTests(unittest.TestCase):
    def setUp(self):
        reader = patch.object(c, "read_maintenance_state", return_value=c.MaintenanceState("open"))
        reader.start()
        self.addCleanup(reader.stop)

    def reconcile(self, *args, **kwargs):
        kwargs.setdefault("maintenance", c.MaintenanceState("open"))
        kwargs.setdefault("maintenance_reader", lambda: c.MaintenanceState("open"))
        return c.reconcile(*args, **kwargs)

    def test_new_rrset_is_created_and_api_verified(self):
        session = Session([Response(404), Response(404), Response(200, []), Response(200, api_rrset())])
        api = c.DeSEC("test-token", session=session)
        initial = api.snapshot()
        result = self.reconcile(api, initial, c.Decision("sync", AAAA), 900, True)
        self.assertTrue(result["changed"])
        self.assertTrue(result["api_verified"])
        patch_call = [call for call in session.calls if call[0] == "PATCH"][0]
        self.assertEqual(patch_call[1], c.API_BULK)
        self.assertEqual(patch_call[2]["json"], [{"subname": "", "type": "AAAA", "records": list(AAAA), "ttl": 900}])

    def test_confirmed_outage_deletes_only_apex_aaaa(self):
        session = Session([Response(200, api_rrset()), Response(200, []), Response(404)])
        api = c.DeSEC("test-token", session=session)
        initial = c.Snapshot(AAAA, 900, "one")
        result = self.reconcile(api, initial, c.Decision("withdraw"), 900, True)
        self.assertTrue(result["changed"])
        self.assertEqual(session.calls[1][2]["json"], [{"subname": "", "type": "AAAA", "records": []}])

    def test_observe_and_hold_never_write(self):
        api = Mock()
        for decision in (c.Decision("sync", AAAA), c.Decision("withdraw"), c.Decision("hold")):
            self.reconcile(api, None, decision, 900, False)
        self.reconcile(api, None, c.Decision("hold"), 900, True)
        api.replace.assert_not_called()
        api.snapshot.assert_not_called()

    def test_matching_records_and_ttl_do_not_write(self):
        api = Mock()
        initial = c.Snapshot(AAAA, 900, "one")
        api.snapshot.return_value = initial
        result = self.reconcile(api, initial, c.Decision("sync", AAAA), 900, True)
        self.assertFalse(result["changed"])
        api.replace.assert_not_called()

    def test_race_during_sampling_holds_including_touched_only_change(self):
        initial = c.Snapshot(AAAA, 900, "one")
        for current in (None, c.Snapshot(OTHER_AAAA, 900, "two"), c.Snapshot(AAAA, 900, "two")):
            with self.subTest(current=current):
                api = Mock()
                api.snapshot.return_value = current
                result = self.reconcile(api, initial, c.Decision("withdraw"), 900, True)
                self.assertIn("another writer", result["result"])
                api.replace.assert_not_called()

    def test_post_write_disagreement_is_error_with_possible_mutation(self):
        api = Mock()
        api.snapshot.side_effect = [None, c.Snapshot(OTHER_AAAA, 900)]
        with self.assertRaises(c.ApiError) as caught:
            self.reconcile(api, None, c.Decision("sync", AAAA), 900, True)
        self.assertTrue(caught.exception.uncertain)
        api.replace.assert_called_once()

    def test_post_write_read_error_reports_possible_mutation(self):
        api = Mock()
        api.snapshot.side_effect = [None, c.ApiError("deSEC API rate-limited (429)")]
        with self.assertRaises(c.ApiError) as caught:
            self.reconcile(api, None, c.Decision("sync", AAAA), 900, True)
        self.assertTrue(caught.exception.uncertain)
        api.replace.assert_called_once()

    def test_apply_requires_token_and_exclusive_owner_before_network(self):
        for env in ({}, {"DESEC_APEX_AAAA_TOKEN": "test"}, {"EXCLUSIVE_APEX_AAAA_OWNER": "true"}):
            with self.subTest(env=env), patch.object(c, "discover") as discover:
                with self.assertRaises(c.ControllerError):
                    c.run(True, env)
                discover.assert_not_called()

    def test_observe_without_token_probes_and_plans_without_api(self):
        with patch.object(c, "DeSEC") as api, \
                patch.object(c, "discover", return_value=({}, True)), \
                patch.object(c, "collect_rounds", return_value=rounds()), \
                patch.object(c, "fetch_cf_ipv6_ranges", return_value=NETWORKS):
            result = c.run(False, {})
        api.assert_not_called()
        self.assertEqual(result["decision"]["action"], "sync")
        self.assertEqual(result["result"], "would change")
        self.assertFalse(result["changed"])

    def test_outage_does_not_depend_on_cloudflare_http_prefix_endpoint(self):
        with patch.object(c, "discover", return_value=({}, True)), \
                patch.object(c, "collect_rounds", return_value=rounds(DOWN, DOWN)), \
                patch.object(c, "fetch_cf_ipv6_ranges", side_effect=AssertionError("must not be fetched")):
            result = c.run(False, {})
        self.assertEqual(result["decision"]["action"], "withdraw")

    def test_unavailable_prefix_list_holds_publish(self):
        with patch.object(c, "discover", return_value=({}, True)), \
                patch.object(c, "collect_rounds", return_value=rounds()), \
                patch.object(c, "fetch_cf_ipv6_ranges", side_effect=c.ControllerError("prefix list unavailable")):
            result = c.run(False, {})
        self.assertEqual(result["decision"]["action"], "hold")
        self.assertFalse(result["changed"])


if __name__ == "__main__":
    unittest.main()
