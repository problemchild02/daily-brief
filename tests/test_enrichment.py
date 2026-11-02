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


NOTE_TEXT = ("Section 9 of the Arbitration and Conciliation Act, 1996 lets a court grant interim relief before the "
             "tribunal is constituted, so check whether your contract's seat and governing law give the High Court that "
             "power. (1) Confirm the arbitration clause names the seat. (2) Calendar the window to commence arbitration "
             "after any relief is granted. (3) Preserve the documents that show when the dispute arose.")
GOOD_NOTE = json.dumps({"contextNote": NOTE_TEXT})


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
        mock.patch.object(fs, "TRANSIENT_WAIT", 0).start()
        mock.patch.object(fs, "_pace", lambda name: None).start()
        mock.patch.object(fs, "HEALTH_PATH", None).start()      # tests must not write the repo's health file
        fs._PREV_HEALTH.clear()
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
        p = Providers(gemini=json.dumps({"contextNote": "This may affect compliance. " + NOTE_TEXT}))
        self.run_enrich([s], p.install(["gemini"]))
        self.assertEqual(len(p.calls), 2)
        self.assertNotIn("contextNote", s)       # still hedging after the retry: never published

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

    def test_sports_never_costs_a_call_but_opinion_does(self):
        sports = story(20, "Team wins the third Test by 5 wickets", "sports",
                       summary="The home side chased down 212 on the final day with five wickets in hand after a fine century.")
        opinion = story(21, "Why the new disclosure regime needs a rethink", "opinion",
                        summary="The author argues that the new disclosure regime will burden mid-sized listed companies unfairly.")
        p = Providers()
        self.run_enrich([sports, opinion], p.install(["gemini"]))
        self.assertNotIn("contextNote", sports)                          # skipped: no call, no extract
        self.assertTrue(sports["summary"])                               # but still summarised natively
        self.assertEqual(len(p.calls), 1)                                # only the opinion piece was sent
        self.assertIn("contextNote", opinion)

    def test_skip_list_is_configurable(self):
        s = story(22, "Team wins the third Test by 5 wickets", "sports",
                  summary="The home side chased down 212 on the final day with five wickets in hand after a fine century.")
        p = Providers()
        with mock.patch.object(fs, "AI_SKIP_SECTIONS", set()):
            self.run_enrich([s], p.install(["gemini"]))
        self.assertEqual(len(p.calls), 1)

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
                seen.update(path=self.path, auth=self.headers.get("Authorization"), model=body["model"], max_tokens=body["max_tokens"], effort=body.get("reasoning_effort"))
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
                             ("/openai/v1/chat/completions", "Bearer k123", "m-1", 1000))   # groq minTokens beats the 321 asked for
            self.assertEqual(seen["effort"], "low")                               # and its reasoning model is told to think briefly
            with self.assertRaises(fs._ProviderExhausted):
                fs._PROVIDERS["groq"][0]("quota", 10)

    def _serve(self, handler_fn):
        import http.server, threading

        class H(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a): pass
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                handler_fn(self, body)

        srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(srv.shutdown)
        return srv.server_port

    def test_github_models_gets_the_headers_its_docs_ask_for(self):
        seen = {}

        def h(req, body):
            seen.update(accept=req.headers.get("Accept"), version=req.headers.get("X-GitHub-Api-Version"),
                        ua=req.headers.get("User-Agent"), auth=req.headers.get("Authorization"))
            req.send_response(200); req.send_header("Content-Type", "application/json"); req.end_headers()
            req.wfile.write(json.dumps({"choices": [{"message": {"content": GOOD_NOTE}}]}).encode())

        port = self._serve(h)
        env = {"GITHUB_MODELS_TOKEN": "tok", "GITHUB_BASE_URL": f"http://127.0.0.1:{port}/inference"}
        with mock.patch.dict(os.environ, env):
            fs._PROVIDERS["github"][0]("hi", 50)
        self.assertEqual(seen["accept"], "application/vnd.github+json")
        self.assertEqual(seen["version"], "2022-11-28")
        self.assertEqual(seen["auth"], "Bearer tok")
        self.assertIn("daily-brief", seen["ua"])          # never the bare "Python-urllib"

    def test_a_redirect_is_reported_not_silently_followed(self):
        def h(req, body):
            req.send_response(302); req.send_header("Location", "https://example.com/elsewhere"); req.end_headers()

        port = self._serve(h)
        with mock.patch.dict(os.environ, {"GROQ_API_KEY": "k", "GROQ_BASE_URL": f"http://127.0.0.1:{port}/v1"}):
            with self.assertRaises(RuntimeError) as cm:
                fs._PROVIDERS["groq"][0]("hi", 50)
        self.assertIn("HTTP 302", str(cm.exception))
        self.assertIn("example.com/elsewhere", str(cm.exception))

    def test_a_non_json_reply_says_what_came_back(self):
        def h(req, body):
            req.send_response(200); req.send_header("Content-Type", "text/html"); req.end_headers()
            req.wfile.write(b"<html>Please sign in</html>")

        port = self._serve(h)
        with mock.patch.dict(os.environ, {"GROQ_API_KEY": "k", "GROQ_BASE_URL": f"http://127.0.0.1:{port}/v1"}):
            with self.assertRaises(RuntimeError) as cm:
                fs._PROVIDERS["groq"][0]("hi", 50)
        msg = str(cm.exception)
        self.assertIn("non-JSON reply", msg)
        self.assertIn("HTTP 200", msg)
        self.assertIn("text/html", msg)
        self.assertIn("Please sign in", msg)

    def test_gemini_gets_room_to_think(self):
        sent = {}
        with mock.patch.object(fs, "GEMINI_API_KEY", "k"), \
             mock.patch.object(fs, "_post_json", side_effect=lambda url, payload, headers, timeout=30: (
                 sent.update(payload) or {"candidates": [{"content": {"parts": [{"text": "{}"}]}}]})):
            fs._call_gemini_raw("hi", 450)
        self.assertGreaterEqual(sent["generationConfig"]["maxOutputTokens"], 2048)

    def test_prompt_forbids_the_hedging_phrases_up_front(self):
        prompt = fs._build_note_prompt("H", "legal", "Src", [], "excerpt", "summary", [])
        for phrase in fs._BANNED_PHRASES:
            self.assertIn(f'"{phrase}"', prompt)

    # ── accuracy check, cascade, patience, memory ──────────────────────────────

    SRC = ["The tribunal heard the dispute on Friday. It ordered the supplier to refund Rs 4 crore within 30 days. "
           "The supplier must also pay interest at 9%."]
    HEAD = "Tribunal orders refund in contract dispute"

    def check(self, note, section="legal", src=None):
        return ae.check_note(note, self.HEAD, src or self.SRC, section, banned=fs._BANNED_PHRASES)

    def test_checker_accepts_a_grounded_note(self):
        v = self.check(NOTE_TEXT + " The 9% interest and Rs 4 crore refund make delay costly.")
        self.assertTrue(v["ok"], v)

    def test_checker_rejects_an_invented_amount(self):
        v = self.check(NOTE_TEXT + " The supplier now owes Rs 40 crore on the refund.")
        self.assertTrue(any("not in the article" in h for h in v["hard"]), v)

    def test_checker_tolerates_formatting_and_rounding(self):
        v = self.check(NOTE_TEXT + " Interest runs at 9.0 per cent on the ₹4 crore refund.")
        self.assertFalse(v["hard"], v)

    def test_statutory_figures_are_background_not_invention(self):
        v = self.check(NOTE_TEXT + " Under the Act a penalty of up to Rs 25 crore can follow.")
        self.assertFalse(v["hard"], v)                     # quoted law, not a claim about this story
        self.assertTrue(any("statutory" in s for s in v["info"]), v)
        self.assertEqual(v["soft"], [])                    # and not worth paying a stronger model to redo

    def test_checker_flags_headline_restatement_and_hedging(self):
        self.assertIn("restates the headline", self.check("Tribunal orders refund in contract dispute.")["hard"])
        self.assertIn("generic hedging language", self.check("This may affect compliance. " + NOTE_TEXT)["hard"])

    def test_legal_note_without_an_anchor_is_only_soft(self):
        note = ("The order obliges the supplier to pay back the money within the stated window and to add interest, "
                "so the buyer should chase early. (1) Diarise the payment date. (2) Write to the supplier today. "
                "(3) Keep proof of the payment demand ready for any later hearing.")
        v = self.check(note)
        self.assertFalse(v["hard"], v)
        self.assertTrue(any("names no court" in s for s in v["soft"]), v)
        self.assertEqual(self.check(note, section="business")["soft"], [])     # only legal/Reliance need an anchor

    def test_free_provider_is_tried_first_even_for_legal(self):
        s = story(30, "Tribunal orders refund in contract dispute", "legal", summary=self.SRC[0])
        p = Providers()
        self.run_enrich([s], p.install(["anthropic", "gemini", "openai"]))
        self.assertEqual([c[0] for c in p.calls], ["gemini"])
        self.assertEqual(s["enrichedBy"], "gemini")

    def test_invented_figure_escalates_to_a_stronger_provider(self):
        s = story(31, "Tribunal orders refund in contract dispute", "legal", summary=self.SRC[0])
        bad = json.dumps({"contextNote": NOTE_TEXT + " The supplier now owes Rs 40 crore."})
        p = Providers(gemini=bad, anthropic=GOOD_NOTE)
        self.run_enrich([s], p.install(["anthropic", "gemini", "openai"]))
        self.assertEqual([c[0] for c in p.calls], ["gemini", "gemini", "anthropic"])   # one retry with feedback, then escalate
        self.assertEqual(s["enrichedBy"], "anthropic")
        self.assertNotIn("Rs 40", s["contextNote"])

    def test_retry_feedback_names_the_problem_and_can_fix_it(self):
        s = story(32, "Tribunal orders refund in contract dispute", "business", summary=self.SRC[0])
        bad = json.dumps({"contextNote": NOTE_TEXT + " The supplier now owes Rs 40 crore."})
        replies = iter([bad, GOOD_NOTE])
        p = Providers()
        p.behaviour["gemini"] = None
        reg = {n: p.make(n, n == "gemini") for n in ("anthropic", "gemini", "openai", "custom")}
        def second_time_lucky(prompt, max_tokens=900):
            p.calls.append(("gemini", max_tokens, prompt)); return next(replies)
        reg["gemini"] = (second_time_lucky, lambda: True)
        self.run_enrich([s], mock.patch.object(fs, "_PROVIDERS", reg))
        self.assertEqual(len(p.calls), 2)
        self.assertIn("previous attempt was rejected", p.calls[1][2])
        self.assertIn("figures not in the article", p.calls[1][2])
        self.assertEqual(s["enrichedBy"], "gemini")                            # fixed without paying anyone

    def test_fabricated_note_is_never_published_even_if_every_provider_agrees(self):
        s = story(33, "Tribunal orders refund in contract dispute", "business", summary=self.SRC[0])
        bad = json.dumps({"contextNote": NOTE_TEXT + " The supplier now owes Rs 40 crore."})
        p = Providers(gemini=bad, openai=bad, anthropic=bad)
        self.run_enrich([s], p.install(["gemini", "openai", "anthropic"]))
        self.assertNotIn("Rs 40", s.get("contextNote", ""))
        self.assertEqual(s.get("noteKind"), "extract")                         # the honest key points instead

    def test_soft_flaw_is_kept_if_the_stronger_provider_does_no_better(self):
        s = story(34, "Tribunal orders refund in contract dispute", "business", summary=self.SRC[0])
        short = json.dumps({"contextNote": "Chase the refund early and diarise the payment date for the interest."})
        p = Providers(gemini=short, openai=short)
        self.run_enrich([s], p.install(["gemini", "openai"]))
        self.assertEqual(len(p.calls), 2)                                       # tried the stronger one once
        self.assertIn("Chase the refund", s["contextNote"])                      # minor flaw: still better than nothing

    def test_at_most_max_answers_providers_per_story(self):
        s = story(35, "Tribunal orders refund in contract dispute", "business", summary=self.SRC[0])
        short = json.dumps({"contextNote": "Chase the refund early."})
        p = Providers(gemini=short, openai=short, anthropic=short, custom=short)
        with mock.patch.object(fs, "AI_MAX_ANSWERS", 2):
            self.run_enrich([s], p.install(["gemini", "openai", "anthropic", "custom"]))
        self.assertEqual(len(p.calls), 2)

    def test_strong_first_sections_skip_the_free_tier(self):
        with mock.patch.object(fs, "AI_STRONG_FIRST_SECTIONS", {"legal"}):
            self.assertEqual(fs._provider_order("legal")[0], "anthropic")
            self.assertEqual(fs._provider_order("tech")[0], "groq")

    def test_order_is_groq_then_gemini_then_the_rest_of_the_free_tier(self):
        order = fs._provider_order("legal")
        self.assertLess(order.index("groq"), order.index("gemini"))
        self.assertLess(order.index("gemini"), order.index("github"))
        self.assertLess(order.index("github"), order.index("anthropic"))
        self.assertEqual(order[-1], "custom")

    def test_a_busy_provider_gets_one_quiet_retry(self):
        s = story(36, "Tribunal orders refund in contract dispute", "business", summary=self.SRC[0])
        seq = iter([RuntimeError("HTTP 503: model is currently experiencing high demand"), GOOD_NOTE])
        p = Providers()
        reg = {n: p.make(n, n == "gemini") for n in ("anthropic", "gemini", "openai", "custom")}
        reg["gemini"] = ((lambda prompt, max_tokens=900: (p.calls.append(("gemini", 0, prompt)), (lambda r: (_ for _ in ()).throw(r) if isinstance(r, Exception) else r)(next(seq)))[1]),
                         lambda: True)
        self.run_enrich([s], mock.patch.object(fs, "_PROVIDERS", reg))
        self.assertEqual(len(p.calls), 2)
        self.assertEqual(s["enrichedBy"], "gemini")
        self.assertFalse(fs._PROVIDER_STATE["gemini"]["dead"])                  # a blip is not a failure

    def test_per_minute_rate_limit_waits_and_retries_but_daily_quota_does_not(self):
        minute = fs._exhausted('{"error":{"message":"Rate limit reached ... on tokens per minute (TPM): try again in 7.5s"}}')
        self.assertTrue(minute.per_minute)
        self.assertEqual(minute.wait, 7.5)
        # Groq's real per-minute message also tells you to upgrade "billing": still just a wait.
        groq = fs._exhausted('{"error":{"message":"Rate limit reached for model `openai/gpt-oss-120b` on tokens per minute (TPM): Limit 8000, Used 7259, Requested 1232. Please try again in 3.2s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing"}}')
        self.assertTrue(groq.per_minute)
        self.assertEqual(groq.wait, 3.2)
        daily = fs._exhausted('{"error":{"message":"Rate limit reached on requests per day (RPD)"}}')
        self.assertFalse(daily.per_minute)
        self.assertFalse(fs._exhausted('{"error":{"message":"Your credit balance is too low"}}').per_minute)

    def test_a_per_minute_limit_waits_and_does_not_kill_the_provider(self):
        sts = [story(60 + i, f"Rate limit story {i}", "business", summary=self.SRC[0] + f" Case {i}.") for i in range(4)]
        slept = []
        limit = fs._ProviderExhausted("tokens per minute", per_minute=True, wait=3)
        state = {"n": 0}
        p = Providers()
        reg = {n: p.make(n, n == "gemini") for n in ("anthropic", "gemini", "openai", "custom")}
        def flaky(prompt, max_tokens=900):
            state["n"] += 1
            p.calls.append(("gemini", 0, prompt))
            if state["n"] in (1, 3):          # the 1st and 3rd requests hit the limit once, then succeed
                raise limit
            return GOOD_NOTE
        reg["gemini"] = (flaky, lambda: True)
        with mock.patch.object(fs.time, "sleep", lambda s: slept.append(s)):
            self.run_enrich(sts, mock.patch.object(fs, "_PROVIDERS", reg))
        self.assertTrue(all("contextNote" in s and s["enrichedBy"] == "gemini" for s in sts))
        self.assertFalse(fs._PROVIDER_STATE["gemini"]["dead"])
        self.assertIn(3, slept)                                                 # waited the time the provider asked for

    def test_a_per_minute_limit_that_never_clears_is_a_failure_not_an_outage_of_quota(self):
        s = story(70, "Always limited", "business", summary=self.SRC[0])
        always = fs._ProviderExhausted("tokens per minute", per_minute=True, wait=0)
        p = Providers(gemini=always, openai=GOOD_NOTE)
        with mock.patch.object(fs.time, "sleep", lambda s: None):
            self.run_enrich([s], p.install(["gemini", "openai"]))
        self.assertEqual(s["enrichedBy"], "openai")                             # covered by the next provider
        self.assertEqual(fs._PROVIDER_STATE["gemini"]["why"], "")               # not marked as out of quota
        self.assertEqual(len([c for c in p.calls if c[0] == "gemini"]), 3)      # first try + two waits

    def test_health_file_records_what_happened_and_demotes_a_quota_dead_provider(self):
        import tempfile
        from datetime import datetime, timezone
        path = os.path.join(tempfile.mkdtemp(), "ai-health.json")
        sts = [story(40 + i, f"Health check story {i}", "business", summary=self.SRC[0] + f" Case {i}.") for i in range(3)]
        p = Providers(gemini=fs._ProviderExhausted("quota"), openai=GOOD_NOTE)
        with mock.patch.object(fs, "HEALTH_PATH", path):
            self.run_enrich(sts, p.install(["gemini", "openai"]))
            doc = json.load(open(path))
            self.assertEqual(doc["providers"]["gemini"]["dead"], "quota")
            self.assertEqual(doc["providers"]["openai"]["answered"], 3)
            self.assertEqual(doc["notes"]["ai_note"], 3)
            fs._PREV_HEALTH.update(json.load(open(path)))
            self.assertEqual(fs._demoted("gemini"), 1)                           # probed last next time
            self.assertEqual(fs._demoted("openai"), 0)
            self.assertGreater(fs._provider_order("tech").index("gemini"), fs._provider_order("tech").index("groq"))
            order_cheap = [n for n in fs._provider_order("tech") if n in ("gemini", "github", "cerebras", "mistral", "openrouter")]
            self.assertEqual(order_cheap[-1], "gemini")

    def test_real_stories_json_runs_clean(self):
        path = os.path.join(os.path.dirname(__file__), "..", "stories.json")
        data = json.load(open(path, encoding="utf-8"))["sections"]
        stories = [st for sec in data.values() for st in sec]
        p = Providers()
        self.run_enrich(stories, p.install(["gemini"]), previous={st["id"]: st for st in stories})
        self.assertTrue(all("wordCount" in st for st in stories))


if __name__ == "__main__":
    unittest.main()
