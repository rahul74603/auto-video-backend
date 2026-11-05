#!/usr/bin/env python3
"""Job Extractor SIDECAR runner — REPORT-ONLY mode.

Roz ke RSS feeds se taaze items uthata hai, har item ko extract.py ki
ladder se chalata hai, aur natija Firestore ki NAYI collections me
likhta hai:
  - job_extractor_reports/<runId>  (poori run ki report)
  - job_extractor_seen/<urlHash>   (dedupe — wahi item dobara nahi)
  - job_extractor_quarantine/<id>  (fail hue items, wajah ke saath)

YEH KUCH AUR NAHI CHHUTA: govt_jobs.js, job_drafts, jobs — sab
untouched. Draft-creation mode tabhi aayega jab kuch din ki reports
achhi aayengi aur Eric haan kahenge.

Env: SERVICE_ACCOUNT_JSON (repo secret) — na ho to report sirf
console par print hoti hai (local test mode).
"""
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import requests
from extract import process_url, UA

FEEDS = [
    ("IndGovtJobs", "https://www.indgovtjobs.in/feeds/posts/default?alt=rss"),
    ("FreeJobAlert", "https://www.freejobalert.com/feed/"),
    ("SarkariExam", "https://www.sarkariexam.com/feed"),
    ("SarkariJobFind", "https://sarkarijobfind.com/feed/"),
    ("RojgarResult", "https://rojgarresult.com/feed/"),
    ("GovtJobsBlog", "https://www.govtjobsblog.in/feed/"),
    ("SarkariNaukriDaily", "https://www.sarkarinaukridaily.in/feed/"),
]
MAX_AGE_DAYS = 10          # purane scraper wali hi freshness policy
MAX_ITEMS_PER_RUN = 6      # report mode — chhota budget, koi jaldi nahi
SKIP_TITLE = ("admit card", "result", "answer key", "cut off", "cutoff",
              "merit list", "hall ticket", "call letter", "syllabus")


def feed_items():
    items = []
    cutoff = datetime.now(timezone.utc) - timedelta(days=MAX_AGE_DAYS)
    for name, url in FEEDS:
        try:
            xml = requests.get(url, headers=UA, timeout=25).text
        except Exception as e:
            print(f"feed fail {name}: {e}")
            continue
        for block in re.findall(r"<item>(.*?)</item>", xml, re.S)[:12]:
            t = re.search(r"<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>",
                          block, re.S)
            l = re.search(r"<link>(https?://[^<]+)</link>", block)
            d = re.search(r"<pubDate>(.*?)</pubDate>", block)
            if not (t and l):
                continue
            title = re.sub(r"<[^>]+>", "", t.group(1)).strip()
            pub = None
            if d:
                try:
                    pub = parsedate_to_datetime(d.group(1).strip())
                except Exception:
                    pub = None
            if pub and pub < cutoff:
                continue
            if any(k in title.lower() for k in SKIP_TITLE):
                continue
            items.append({"title": title, "link": l.group(1).strip(),
                          "source": name,
                          "publishedAt": pub.isoformat() if pub else ""})
    items.sort(key=lambda x: x["publishedAt"] or "", reverse=True)
    return items


def main():
    db = None
    sa = os.environ.get("SERVICE_ACCOUNT_JSON")
    if sa:
        import firebase_admin
        from firebase_admin import credentials, firestore
        cred = credentials.Certificate(json.loads(sa))
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        print("Firestore connected (report mode)")
    else:
        print("SERVICE_ACCOUNT_JSON nahi — LOCAL mode, sirf console report")

    run_id = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")
    results = []
    for item in feed_items():
        if len(results) >= MAX_ITEMS_PER_RUN:
            break
        h = hashlib.md5(item["link"].encode()).hexdigest()
        if db is not None:
            seen = db.collection("job_extractor_seen").document(h).get()
            if seen.exists:
                continue
        print(f"processing: {item['title'][:70]}")
        r = process_url(item["link"], title_hint=item["title"])
        r["feedTitle"] = item["title"]
        r["feedSource"] = item["source"]
        results.append(r)
        if db is not None:
            db.collection("job_extractor_seen").document(h).set({
                "url": item["link"], "title": item["title"],
                "ok": r["ok"],
                "at": datetime.now(timezone.utc).isoformat()})
            if not r["ok"]:
                qid = hashlib.md5(
                    (item["link"] + run_id).encode()).hexdigest()[:12]
                db.collection("job_extractor_quarantine").document(qid).set({
                    "url": item["link"], "title": item["title"],
                    "runId": run_id, "result": r})
    report = {"runId": run_id, "mode": "report-only",
              "items": results,
              "okCount": sum(1 for r in results if r["ok"]),
              "total": len(results)}
    if db is not None:
        db.collection("job_extractor_reports").document(run_id).set(report)
        print(f"report saved: job_extractor_reports/{run_id} "
              f"({report['okCount']}/{report['total']} ok)")
    else:
        print(json.dumps(report, ensure_ascii=False, indent=1)[:3000])
    return 0


if __name__ == "__main__":
    sys.exit(main())
