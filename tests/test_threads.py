"""Offline tests for the daily archive and "Previously…" threads."""
import json, os, sys, tempfile, unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import story_threads as st


def story(i, headline, summary="", section="business", url=None, source="Test"):
    return {"id": f"s{i}", "section": section, "headline": headline, "summary": summary,
            "source": source, "sourceUrl": url or f"https://e.com/{i}", "publishedAt": "2026-10-20T10:00:00+05:30"}


def old(i, date, headline, summary="", **kw):
    return {**story(i, headline, summary, **kw), "date": date}


class ThreadTests(unittest.TestCase):
    def test_a_follow_up_is_linked_to_the_earlier_report(self):
        earlier = [old(1, "2026-10-19", "Jio Platforms IPO GMP today: Rs 30,213 cr issue, listing gains expected",
                       "Reliance-backed Jio Platforms opens its IPO"),
                   old(2, "2026-10-20", "Delhi High Court quashes FIR in property dispute", "The court quashed the FIR")]
        today = [story(10, "Jio Platforms shares to list on BSE, NSE tomorrow; GMP signals 22% premium",
                       "Jio Platforms will list tomorrow after its IPO")]
        # a realistic corpus: words common to many stories must not count as distinctive
        earlier += [old(100 + i, "2026-10-%02d" % (10 + i % 9), f"Court hears matter {i} on bail and shares of evidence", "the court heard the matter") for i in range(40)]
        th = st.build_threads(today, earlier, "2026-10-28")
        self.assertEqual([p["id"] for p in th["s10"]], ["s1"])

    def test_same_topic_is_not_the_same_story(self):
        earlier = [old(1, "2026-10-19", "Delhi High Court quashes FIR in property dispute", "The court quashed the FIR"),
                   old(2, "2026-10-20", "Delhi High Court restrains Beco ad campaign", "Ads disparaged the product")]
        today = [story(10, "Delhi High Court grants bail in a cheating case", "Bail was granted on Tuesday", "legal")]
        self.assertEqual(st.build_threads(today, earlier, "2026-10-28"), {})

    def test_a_story_that_stays_in_the_feed_is_not_its_own_previous_report(self):
        earlier = [old(1, "2026-10-27", "Jio Platforms Set for Stock-Market Debut Today", "Debut today", url="https://x.com/a")]
        same_headline = [story(2, "Jio Platforms Set for Stock-Market Debut Today", "Debut today", url="https://y.com/b")]
        same_url = [story(3, "Jio Platforms debut: what to expect", "Debut today", url="https://x.com/a")]
        self.assertEqual(st.build_threads(same_headline, earlier, "2026-10-28"), {})
        self.assertEqual(st.build_threads(same_url, earlier, "2026-10-28"), {})

    def test_one_previous_item_per_day_oldest_first_at_most_three(self):
        h = "Binance hack North Korea Lazarus blockchain analysis TRM"
        earlier = [old(i, f"2026-10-{20 + i}", h + f" update {i}", "North Korea Lazarus Binance hack") for i in range(1, 6)]
        earlier.append(old(9, "2026-10-21", h + " second report same day", "North Korea Lazarus Binance hack"))
        today = [story(10, "North Korea Lazarus Binance hack: funds traced by TRM blockchain analysis", "Binance hack")]
        prev = st.build_threads(today, earlier, "2026-10-28")["s10"]
        self.assertLessEqual(len(prev), st.MAX_PREVIOUS)
        self.assertEqual([p["date"] for p in prev], sorted(p["date"] for p in prev))
        self.assertEqual(len({p["date"] for p in prev}), len(prev))

    def test_archive_merges_a_days_refreshes_and_prunes_old_files(self):
        with tempfile.TemporaryDirectory() as d:
            for day in ("2026-08-01", "2026-10-27"):
                st.update_archive(day, [story(1, "Old edition story")], directory=d)
            self.assertEqual(st.update_archive("2026-10-28", [story(1, "First"), story(2, "Second")], directory=d), 2)
            self.assertEqual(st.update_archive("2026-10-28", [story(2, "Second v2"), story(3, "Third")], directory=d), 3)
            files = sorted(os.listdir(d))
            self.assertNotIn("2026-08-01.json", files)                 # older than the keep window
            self.assertIn("2026-10-27.json", files)
            doc = json.load(open(os.path.join(d, "2026-10-28.json")))
            self.assertEqual({s["id"]: s["headline"] for s in doc["stories"]}, {"s1": "First", "s2": "Second v2", "s3": "Third"})

    def test_run_threads_against_earlier_days_only_and_writes_files(self):
        with tempfile.TemporaryDirectory() as d:
            st.update_archive("2026-10-19", [story(1, "Jio Platforms IPO GMP today: listing gains expected", "Jio Platforms IPO opens")], directory=d)
            tp = os.path.join(d, "threads.json")
            today = [story(10, "Jio Platforms shares to list tomorrow; GMP signals premium", "Jio Platforms lists")]
            count, threaded = st.run(today, "2026-10-28", directory=d, threads_path=tp)
            self.assertEqual((count, threaded), (1, 1))
            self.assertEqual(json.load(open(tp))["threads"]["s10"][0]["id"], "s1")
            # Running again the same day must not make the story a follow-up to itself.
            count, threaded = st.run(today, "2026-10-28", directory=d, threads_path=tp)
            self.assertEqual(threaded, 1)
            self.assertEqual(len(json.load(open(tp))["threads"]["s10"]), 1)


if __name__ == "__main__":
    unittest.main()
