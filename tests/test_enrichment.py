"""
Offline tests for the enrichment pipeline (no network, no API keys):

    python3 -m unittest discover -s tests -v

Stand-in providers replace the real HTTP callers, so these prove the control flow
that decides how many tokens a refresh spends: reuse, native-first, the per-run
call cap, the dead-provider circuit breaker, fallback order, and "no note beats a
canned note".
"""
import json, os, sys, unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import analysis_engine as ae
import fetch_stories as fs


def story(i, headline, section="legal", hook="", summary="", priority="normal"):
    return {"id": f"s{i}", "section": section, "headline": headline, "hook": hook,
            "summary": summary, "source": "Test", "sourceUrl": f"https://e.com/{i}",
            "tags": [], "priority": priority}


GOOD_NOTE = '{"contextNote": "Check s.9 Arbitration Act interim relief. (1) a (2) b"}'


class Providers:
    """Stand-ins for the HTTP callers, recording every call."""
    def __init__(self, **behaviour):
        self.calls = []
        self.behaviour = behaviour

    def make(self, name, available):
        def call(prompt, max_tokens=900):
            self.calls.append((name, max_tokens, prompt))
            b = self.behaviour.get(name, GOOD_NOTE)
            if isinstance(b, Exception):
                raise b
            return b
        return (call, lambda: available)

    def install(self, names):
        """Register all four providers; only `names` have a key configured."""
        reg = {n: self.make(n, n in names) for n in ("anthropic", "gemini", "openai", "custom")}
        return mock.patch.object(fs, "_PROVIDERS", reg)


class EnrichmentTests(unittest.TestCase):
    def setUp(self):
        fs._PROVIDER_STATE.clear()
        self.env = mock.patch.dict(os.environ, {"AI_PROVIDER_ORDER": ""}, clear=False)
        self.env.start()
        mock.patch.object(fs, "AI_CALL_DELAY", 0).start()
        self.addCleanup(mock.patch.stopall)

    def run_enrich(self, stories, providers, previous=None, cap=30, page_text=None):
        with providers, mock.patch.object(fs, "AI_MAX_CALLS", cap):
            fs.enrich_stories(stories, page_text or {}, previous or {})

    def test_native_summary_never_restates_headline(self):
        a = ae.analyse("Delhi HC restrains Beco ad campaign", "legal", ["Delhi HC restrains Beco ad campaign - Bar & Bench"])
        self.assertIsNone(a["summary"])          # nothing beyond the headline → no fake summary

    def test_native_summary_extracts_real_sentences(self):
        ex = ("The Delhi High Court on Monday restrained Beco from airing ads against Surf Excel. "
              "Justice Rao said the ads disparaged the product and ordered removal within 7 days. "
              "The matter returns on 12 November.")
        a = ae.analyse("Beco restrained", "legal", [ex])
        self.assertEqual(a["summaryQuality"], "good")
        self.assertIn("restrained Beco", a["summary"])

    def test_rule_needs_subject_not_passing_mention(self):
        a = ae.analyse("Sunil Gavaskar slams selectors", "sports", ["SEBI is mentioned later. Cricket story."])
        self.assertIsNone(a["whyItMatters"])     # sports never gets a legal rule
        b = ae.analyse("Local firm wins contract", "business", ["The firm won. Later, an aside mentions SEBI rules."])
        self.assertIsNone(b["whyItMatters"])     # SEBI only in passing

    def test_native_rule_fires_and_costs_no_tokens(self):
        st = [story(1, "SEBI tightens insider trading disclosure norms for promoters", "business",
                    summary="SEBI issued a circular on Monday tightening disclosure norms for promoters of listed entities from 1 January 2027.")]
        p = Providers()
        self.run_enrich(st, p.install(["gemini"]))
        self.assertEqual(p.calls, [])
        self.assertEqual(st[0]["enrichedBy"], "native")
        self.assertIn("(1)", st[0]["contextNote"])
        self.assertTrue(st[0]["facts"])

    def test_unchanged_story_reuses_ai_note_with_zero_calls(self):
        s = story(2, "Supreme Court on bail in a murder case", summary="The court granted bail to the accused on Tuesday after hearing both sides in detail.")
        prev = dict(s, enrichedBy="gemini", contextNote="Concrete note naming s.439 CrPC. (1) x (2) y",
                    enrichHash=ae.content_hash(s["headline"], s["hook"], s["summary"]))
        p = Providers()
        self.run_enrich([s], p.install(["gemini"]), previous={"s2": prev})
        self.assertEqual(p.calls, [])
        self.assertEqual(s["contextNote"], prev["contextNote"])
        self.assertEqual(s["enrichedBy"], "gemini")

    def test_changed_story_is_not_reused(self):
        s = story(3, "Supreme Court on bail in a murder case v2", summary="A materially different excerpt that changes what the article reports today.")
        prev = dict(s, enrichedBy="gemini", contextNote="Old note. (1) x (2) y", enrichHash="deadbeef")
        p = Providers()
        self.run_enrich([s], p.install(["gemini"]), previous={"s3": prev})
        self.assertEqual(len(p.calls), 1)

    def test_legacy_story_without_hash_reuses_on_same_headline(self):
        s = story(4, "High Court quashes FIR in property dispute", summary="The court quashed the FIR registered against the petitioner last year.")
        prev = {"id": "s4", "headline": s["headline"], "enrichedBy": "anthropic",
                "contextNote": "Specific analysis of s.482 CrPC. (1) a (2) b", "summary": "old ai summary text here"}
        p = Providers()
        self.run_enrich([s], p.install(["anthropic"]), previous={"s4": prev})
        self.assertEqual(p.calls, [])

    def test_canned_previous_note_is_never_reused(self):
        s = story(5, "Court hears matter", summary="The court heard the matter on Wednesday and reserved its order for later.")
        prev = {"id": "s5", "headline": s["headline"], "enrichedBy": "gemini",
                "contextNote": fs.CONTEXT_TEMPLATES["legal"]}
        p = Providers()
        self.run_enrich([s], p.install(["gemini"]), previous={"s5": prev})
        self.assertEqual(len(p.calls), 1)        # re-asked, not reused

    def test_ai_prompt_asks_for_note_only_and_caps_tokens(self):
        s = story(6, "Tribunal rules on a niche dispute", summary="The tribunal ruled on a niche dispute between two private firms on Friday afternoon.")
        p = Providers()
        self.run_enrich([s], p.install(["gemini"]))
        name, max_tokens, prompt = p.calls[0]
        self.assertEqual(max_tokens, fs.NOTE_MAX_TOKENS)
        self.assertIn('"contextNote"', prompt)
        self.assertNotIn('"summary":', prompt)   # the summary is not requested from the AI

    def test_call_cap_is_respected_and_spent_legal_first(self):
        sts = [story(i, f"Niche story number {i}", "sports" if i % 2 else "legal",
                     summary="An excerpt with enough words in it to be a real summary of the news.") for i in range(10)]
        p = Providers()
        self.run_enrich(sts, p.install(["gemini"]), cap=3)
        self.assertEqual(len(p.calls), 3)
        with_note = [s for s in sts if "contextNote" in s]
        self.assertEqual(len(with_note), 3)
        self.assertTrue(all(s["section"] == "legal" for s in with_note))

    def test_failed_calls_do_not_spend_the_cap(self):
        """A refused request (no credit) costs no tokens, so it must not use up the cap."""
        sts = [story(i, f"Capped niche story {i}", "business", summary="Enough words here to form a proper excerpt for the summary check.") for i in range(4)]
        p = Providers(gemini=fs._ProviderExhausted("quota"), openai=GOOD_NOTE)
        self.run_enrich(sts, p.install(["gemini", "openai"]), cap=4)
        self.assertTrue(all("contextNote" in s for s in sts))      # all 4 got a note despite the failed probe
        self.assertEqual(len([c for c in p.calls if c[0] == "openai"]), 4)

    def test_exhausted_provider_is_not_called_again(self):
        sts = [story(i, f"Another niche story {i}", "business", summary="Enough words here to form a proper excerpt for the summary check.") for i in range(5)]
        p = Providers(gemini=fs._ProviderExhausted("quota"), openai=GOOD_NOTE)
        self.run_enrich(sts, p.install(["gemini", "openai", "anthropic"]))
        gemini_calls = [c for c in p.calls if c[0] == "gemini"]
        self.assertEqual(len(gemini_calls), 1)   # tried once, then skipped for the run
        self.assertTrue(all("contextNote" in s for s in sts))   # openai carried the rest

    def test_repeated_failures_trip_the_breaker(self):
        sts = [story(i, f"Yet another niche story {i}", "business", summary="Plenty of words in this excerpt so the native summary is considered good enough.") for i in range(8)]
        p = Providers(gemini=RuntimeError("HTTP 500"), openai=GOOD_NOTE)
        self.run_enrich(sts, p.install(["gemini", "openai", "anthropic"]))
        self.assertEqual(len([c for c in p.calls if c[0] == "gemini"]), fs.AI_MAX_FAILS)

    def test_custom_provider_is_the_last_resort(self):
        s = story(7, "Obscure story needing a fallback provider", "legal", summary="A decent excerpt with enough words to count as something real here.")
        p = Providers(anthropic=RuntimeError("down"), gemini=RuntimeError("down"), openai=RuntimeError("down"), custom=GOOD_NOTE)
        self.run_enrich([s], p.install(["anthropic", "gemini", "openai", "custom"]))
        self.assertEqual([c[0] for c in p.calls][-1], "custom")
        self.assertEqual(s["enrichedBy"], "custom")

    def test_env_order_override(self):
        s = story(8, "Story for order override", "legal", summary="An excerpt long enough to be treated as a genuine summary by the engine.")
        p = Providers()
        with mock.patch.dict(os.environ, {"AI_PROVIDER_ORDER": "openai,gemini"}):
            self.run_enrich([s], p.install(["anthropic", "gemini", "openai", "custom"]))
        self.assertEqual(p.calls[0][0], "openai")

    def test_no_providers_means_no_note_and_never_a_canned_one(self):
        s = story(9, "Story with nobody to ask", "legal", summary="An excerpt with a good number of words so that the summary is native.")
        with mock.patch.object(fs, "_PROVIDERS", {n: (lambda *a, **k: "", lambda: False) for n in ("anthropic", "gemini", "openai", "custom")}):
            fs.enrich_stories([s], {}, {})
        self.assertNotIn("contextNote", s)
        self.assertTrue(s["summary"])            # native summary still there

    def test_banned_phrase_triggers_exactly_one_retry(self):
        s = story(10, "Retry story", "legal", summary="An excerpt long enough to be a real summary of the story at hand.")
        p = Providers(gemini='{"contextNote": "This may affect compliance. (1) a (2) b"}')
        self.run_enrich([s], p.install(["gemini"]))
        self.assertEqual(len(p.calls), 2)

    def test_stale_ai_note_beats_blank_when_every_provider_fails(self):
        s = story(11, "Court rules on tenancy dispute", "legal",
                  summary="The court ruled on Tuesday that the tenant must vacate within 30 days and pay arrears.")
        prev = dict(s, enrichedBy="gemini", contextNote="Specific note on s.106 Transfer of Property Act. (1) a (2) b",
                    enrichHash="changed-since")      # text drifted, so not reusable normally
        p = Providers(anthropic=RuntimeError("down"), gemini=RuntimeError("down"), openai=RuntimeError("down"))
        self.run_enrich([s], p.install(["anthropic", "gemini", "openai"]), previous={"s11": prev})
        self.assertEqual(s["contextNote"], prev["contextNote"])          # kept, not blanked
        self.assertEqual(s["enrichedBy"], "gemini")
        self.assertNotIn("noteKind", s)

    def test_key_points_replace_blank_when_no_ai_and_no_history(self):
        s = story(12, "Tribunal orders refund in contract dispute", "business",
                  summary="The tribunal heard the dispute on Friday. It ordered the supplier to refund Rs 4 crore within 30 days. "
                          "The supplier must also pay interest at 9% and the matter will be listed again on 12 December 2026.")
        p = Providers()
        self.run_enrich([s], p.install([]))                              # no provider has a key
        self.assertEqual(p.calls, [])
        self.assertEqual(s.get("noteKind"), "extract")
        self.assertEqual(s["enrichedBy"], "native")
        self.assertIn("Amount", s["contextNote"])                        # concrete anchors, not boilerplate
        self.assertNotIn(s["contextNote"], fs.CONTEXT_TEMPLATES.values())

    def test_headline_only_story_stays_honestly_blank(self):
        s = story(13, "Some company announces something notable", "business", hook="", summary="")
        self.run_enrich([s], Providers().install([]))
        self.assertNotIn("contextNote", s)                               # nothing to extract, nothing invented
        self.assertFalse(s["summary"])

    def test_a_lone_court_name_is_not_a_note(self):
        s = story(15, "Supreme Court on judicial accountability", "legal",
                  summary="Former Justice Oka said the Supreme Court had to guard against hero worship and remain open to criticism.")
        self.run_enrich([s], Providers().install([]))
        self.assertNotIn("contextNote", s)                               # "Court: Supreme Court." would be noise

    def test_extract_note_is_replaced_once_ai_answers(self):
        s = story(14, "Regulator issues new circular for brokers", "business",
                  summary="The regulator issued a circular that requires brokers to report suspicious trades within 7 days.")
        prev = dict(s, enrichedBy="native", noteKind="extract", contextNote="Timeline: within 7 days.")
        p = Providers()
        self.run_enrich([s], p.install(["gemini"]), previous={"s14": prev})
        self.assertEqual(s["enrichedBy"], "gemini")                       # an old extract is never "reused"
        self.assertNotIn("noteKind", s)

    def test_free_presets_are_tried_before_paid_for_routine_sections(self):
        order = fs._provider_order("tech")
        self.assertLess(order.index("github"), order.index("openai"))
        self.assertLess(order.index("groq"), order.index("anthropic"))
        self.assertEqual(order[-1], "custom")

    def test_preset_turns_on_by_its_key_and_honours_overrides(self):
        with mock.patch.dict(os.environ, {"GROQ_API_KEY": "", "GROQ_MODEL": ""}):
            self.assertFalse(fs._PROVIDERS["groq"][1]())
        with mock.patch.dict(os.environ, {"GROQ_API_KEY": "k", "GROQ_MODEL": "other-model"}):
            self.assertTrue(fs._PROVIDERS["groq"][1]())
            self.assertEqual(fs._preset_setting("groq", "model"), "other-model")
            self.assertEqual(fs._preset_setting("groq", "base"), "https://api.groq.com/openai/v1")

    def test_preset_provider_over_real_http(self):
        """The shared preset caller against a local server: URL, auth, model, 429."""
        import http.server, threading
        seen = {}

        class H(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a): pass
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                seen.update(path=self.path, auth=self.headers.get("Authorization"), model=body["model"], max_tokens=body["max_tokens"])
                if body["messages"][0]["content"] == "quota":
                    self.send_response(429); self.end_headers(); self.wfile.write(b'{"error":"rate limited"}'); return
                self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers()
                self.wfile.write(json.dumps({"choices": [{"message": {"content": GOOD_NOTE}}]}).encode())

        srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(srv.shutdown)
        env = {"GROQ_API_KEY": "k123", "GROQ_BASE_URL": f"http://127.0.0.1:{srv.server_port}/openai/v1", "GROQ_MODEL": "m-1"}
        with mock.patch.dict(os.environ, env):
            out = fs._PROVIDERS["groq"][0]("hello", 321)
            self.assertIn("contextNote", out)
            self.assertEqual((seen["path"], seen["auth"], seen["model"], seen["max_tokens"]),
                             ("/openai/v1/chat/completions", "Bearer k123", "m-1", 321))
            with self.assertRaises(fs._ProviderExhausted):
                fs._PROVIDERS["groq"][0]("quota", 10)

    def test_real_stories_json_runs_clean(self):
        path = os.path.join(os.path.dirname(__file__), "..", "stories.json")
        data = json.load(open(path, encoding="utf-8"))["sections"]
        stories = [st for sec in data.values() for st in sec]
        p = Providers()
        self.run_enrich(stories, p.install(["gemini"]), previous={st["id"]: st for st in stories})
        self.assertTrue(all("wordCount" in st for st in stories))


if __name__ == "__main__":
    unittest.main()
