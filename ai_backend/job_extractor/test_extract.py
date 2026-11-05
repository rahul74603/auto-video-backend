#!/usr/bin/env python3
"""extract.py ke offline unit tests — network nahi, PDF nahi.
Golden-file usool: koi bhi badlav pehle yahan toote, production me nahi.
Asli CEN 09/2026 PDF par ka golden result golden/ folder me pada hai
(2026-11-05 ko haath se verify kiye hue 191 pad se exact match)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import extract


class TestVerify(unittest.TestCase):
    def test_number_must_exist_in_source(self):
        src = "Total Posts: 1,234 available"
        self.assertTrue(extract.verify_in_source("1234", src))
        self.assertTrue(extract.verify_in_source("1,234", src))
        self.assertFalse(extract.verify_in_source("1235", src))

    def test_date_digit_sequence(self):
        src = "Last date 04/12/2026 hai"
        self.assertTrue(extract.verify_in_source("04.12.2026", src))
        self.assertFalse(extract.verify_in_source("05.12.2026", src))


class TestLabeledDates(unittest.TestCase):
    TEXT = ("Opening date of Online application 05.11.2026. "
            "Closing date for Submission of Online Application "
            "04.12.2026 (23:59 hours)")

    def test_start_and_last(self):
        job, _ = extract.extract_from_text(self.TEXT, "t")
        self.assertEqual(job.get("startDate"), "05.11.2026")
        self.assertEqual(job.get("lastDate"), "04.12.2026")


class TestVacancyTable(unittest.TestCase):
    TABLES = [[
        ["CAT NO", "Post Name", "Department", "Vacancies"],
        ["1", "Junior Translator", "Personnel", "79"],
        ["2", "Lab Assistant", "Mechanical", "36"],
    ]]

    def test_sum_from_real_table(self):
        total, rows = extract.extract_vacancy_table(self.TABLES)
        self.assertEqual(total, 115)
        self.assertEqual(len(rows), 2)

    def test_toc_is_not_a_vacancy_table(self):
        toc = [[["Contents", "Page"],
                ["Important Dates", "4"],
                ["Vacancies", "8"]]]
        total, rows = extract.extract_vacancy_table(toc)
        self.assertIsNone(total)

    def test_explicit_total_row_wins(self):
        t = [[["Post Name", "Vacancies"],
              ["A Post", "10"], ["Total", "42"]]]
        total, _ = extract.extract_vacancy_table(t)
        self.assertEqual(total, 42)


class TestFees(unittest.TestCase):
    def test_general_fee(self):
        job, _ = extract.extract_from_text(
            "Application fee for all candidates: ₹500 only", "t")
        self.assertEqual(job.get("feeGen"), "₹500")

    def test_no_invented_fee(self):
        job, _ = extract.extract_from_text("koi fee jankari nahi", "t")
        self.assertNotIn("feeGen", job)


class TestJsonLd(unittest.TestCase):
    HTML = """<html><head>
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"JobPosting",
     "title":"SSC Clerk Recruitment 2026",
     "hiringOrganization":{"@type":"Organization","name":"SSC"},
     "datePosted":"2026-11-01","validThrough":"2026-12-01",
     "totalJobOpenings":250,
     "jobLocation":{"@type":"Place","address":
       {"@type":"PostalAddress","addressRegion":"Delhi"}}}
    </script></head><body>x</body></html>"""

    def test_jobposting_mapping(self):
        job = extract.extract_jsonld(self.HTML, "https://example.com/j")
        self.assertIsNotNone(job)
        self.assertEqual(job["vacancies"], "250")
        self.assertEqual(job["lastDate"], "2026-12-01")
        self.assertEqual(job["organization"], "SSC")


class TestTitleHint(unittest.TestCase):
    def test_hint_fills_missing_title(self):
        r = {"job": {}, "evidence": {}}
        extract.apply_title_hint(r, "WAPCOS Recruitment 2026")
        self.assertEqual(r["job"]["title"], "WAPCOS Recruitment 2026")
        self.assertEqual(r["evidence"]["title"], "rss-feed")

    def test_hint_never_overrides_jsonld_title(self):
        r = {"job": {"title": "Asli Title"}, "evidence": {}}
        extract.apply_title_hint(r, "Feed Wala Title")
        self.assertEqual(r["job"]["title"], "Asli Title")

    def test_process_url_with_hint_offline(self):
        html = ("<html><body><p>Last Date: 20 November 2026</p>"
                "</body></html>")
        old_fetch, old_pdf = extract.fetch, extract.find_pdf_links
        extract.fetch = lambda url, binary=False, timeout=30: html
        extract.find_pdf_links = lambda h, u: []
        try:
            r = extract.process_url("https://example.com/job",
                                    title_hint="Example Recruitment 2026")
        finally:
            extract.fetch, extract.find_pdf_links = old_fetch, old_pdf
        self.assertEqual(r["job"].get("title"),
                         "Example Recruitment 2026")
        self.assertEqual(r["job"].get("lastDate"), "20 November 2026")
        self.assertTrue(r["ok"])


class TestQuarantine(unittest.TestCase):
    def test_quarantine_writes_file(self):
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            old = extract.QUARANTINE
            extract.QUARANTINE = td
            try:
                p = extract.quarantine("https://x.example/j", "test wajah")
                self.assertTrue(os.path.exists(p))
            finally:
                extract.QUARANTINE = old


if __name__ == "__main__":
    unittest.main()
