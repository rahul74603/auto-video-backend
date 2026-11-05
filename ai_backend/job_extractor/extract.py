#!/usr/bin/env python3
"""StudyGyaan Job Extractor — fail-safe SIDECAR (prototype).

Purana govt_jobs.js scraper isse bilkul untouched hai — ye uske bagal
me chalne wala naya extractor hai. Teen seedhiyon wali ladder:

  1. JSON-LD / microdata — page me tay-shuda JobPosting data mile to
     wahi sach hai (AI ki zaroorat hi nahi, kabhi galat nahi hota).
  2. Official PDF — page par mila official notification PDF pdfplumber
     se khulta hai; tathya PDF se (aggregator ke daave se nahi).
  3. Page-text rules — labeled regex extraction (dates/fees/vacancy).

HAR number/date source-text me literal VERIFY hota hai — source me na
mile to field khaali chhod dete hain, guess kabhi nahi. Total fail =
quarantine/ me raw artifacts ke saath entry, posting kabhi gayab nahi.
"""
import json
import os
import re
import sys
import hashlib
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
QUARANTINE = os.path.join(HERE, "quarantine")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"}

BLOCKED_LINK_DOMAINS = ("freejobalert.com", "sarkariresult.com",
                        "rojgarresult.com", "naukri.com", "shine.com")


# ---------------------------------------------------------------
# helpers
# ---------------------------------------------------------------
def norm_digits(s):
    return re.sub(r"[^0-9]", "", str(s or ""))


def verify_in_source(value, source_text):
    """Number/date source-text me sach me hai ya nahi.
    Dates ke liye digit-sequence compare (format alag ho sakta hai)."""
    if value is None or str(value).strip() == "":
        return False
    v = norm_digits(value)
    if len(v) < 2:
        return str(value).strip().lower() in source_text.lower()
    return v in norm_digits(source_text)


def fetch(url, binary=False, timeout=30):
    r = requests.get(url, headers=UA, timeout=timeout)
    r.raise_for_status()
    return r.content if binary else r.text


# ---------------------------------------------------------------
# seedhi 1: JSON-LD / microdata (extruct)
# ---------------------------------------------------------------
def _walk_jsonld(obj):
    if isinstance(obj, dict):
        if obj.get("@type") == "JobPosting":
            yield obj
        for v in obj.values():
            yield from _walk_jsonld(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _walk_jsonld(v)


def extract_jsonld(html, page_url):
    import extruct
    data = extruct.extract(html, base_url=page_url,
                           syntaxes=["json-ld", "microdata"])
    postings = []
    for item in data.get("json-ld", []):
        postings.extend(_walk_jsonld(item))
    for item in data.get("microdata", []):
        if "JobPosting" in str(item.get("type", "")):
            postings.append(item)
    if not postings:
        return None
    p = postings[0]
    org = p.get("hiringOrganization") or {}
    if isinstance(org, list):
        org = org[0] if org else {}
    loc = p.get("jobLocation") or {}
    if isinstance(loc, list):
        loc = loc[0] if loc else {}
    addr = (loc.get("address") or {}) if isinstance(loc, dict) else {}
    salary = p.get("baseSalary") or {}
    sal_val = ""
    if isinstance(salary, dict):
        val = salary.get("value") or {}
        if isinstance(val, dict):
            sal_val = str(val.get("value") or val.get("minValue") or "")
        if sal_val:
            sal_val = f"{salary.get('currency','INR')} {sal_val}"
    ident = p.get("identifier") or {}
    job = {
        "title": str(p.get("title") or "").strip(),
        "organization": str(org.get("name") or "").strip(),
        "startDate": str(p.get("datePosted") or "")[:10],
        "lastDate": str(p.get("validThrough") or "")[:10],
        "vacancies": str(p.get("totalJobOpenings") or ""),
        "salary": sal_val,
        "location": str(addr.get("addressRegion") or
                        addr.get("addressLocality") or ""),
        "advtNo": str(ident.get("value") or "") if isinstance(ident, dict) else "",
        "applyLink": str(p.get("url") or ""),
    }
    return {k: v for k, v in job.items() if v}


# ---------------------------------------------------------------
# seedhi 2: official PDF
# ---------------------------------------------------------------
PDF_HINTS = ("notification", "advertisement", "advt", "notice",
             "cen", "recruitment", "detailed")
OFFICIAL_HINTS = (".gov.in", ".nic.in", ".res.in", ".ac.in")


def find_pdf_links(html, page_url):
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "lxml")
    host = urlparse(page_url).hostname or ""
    scored = []
    for a in soup.find_all("a", href=True):
        href = urljoin(page_url, a["href"])
        text = (a.get_text() or "").lower()
        low = href.lower()
        if ".pdf" not in low:
            continue
        score = 0
        h = urlparse(href).hostname or ""
        if any(h.endswith(d) for d in OFFICIAL_HINTS):
            score += 5
        if h == host:
            score += 1
        if any(k in low or k in text for k in PDF_HINTS):
            score += 3
        if any(b in h for b in BLOCKED_LINK_DOMAINS):
            score -= 5
        scored.append((score, href))
    scored.sort(reverse=True)
    return [u for s, u in scored if s > 0][:3]


def pdf_to_text(pdf_bytes):
    """(text, tables) — tables asal structure ke saath alag rakhe jate
    hain taaki vacancy-table jaisi cheezen TOC/page-number kachre se
    alag pehchani ja saken (golden test me yahi gadbad mili thi)."""
    import pdfplumber
    import io
    parts, tables = [], []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            parts.append(page.extract_text() or "")
            for table in page.extract_tables() or []:
                tables.append(table)
                for row in table:
                    cells = [str(c or "").strip() for c in row]
                    if any(cells):
                        parts.append(" | ".join(cells))
    return "\n".join(parts), tables


def extract_vacancy_table(tables):
    """Header me 'Post' + 'Vacancies' wala table hi asal vacancy table
    hai. Usi ke vacancy-column ka yog (ya explicit Total row)."""
    for table in tables or []:
        if not table or len(table) < 2:
            continue
        header = [str(c or "").replace("\n", " ").strip()
                  for c in table[0]]
        joined = " ".join(header).lower()
        if "post" not in joined or "vacanc" not in joined:
            continue
        post_col = next((i for i, h in enumerate(header)
                         if "post" in h.lower()), 1)
        vac_col = max(i for i, h in enumerate(header)
                      if "vacanc" in h.lower())
        rows, explicit = [], None
        for row in table[1:]:
            cells = [str(c or "").strip() for c in row]
            if len(cells) <= vac_col:
                continue
            name = cells[post_col] if len(cells) > post_col else ""
            m = re.search(r"\d{1,6}", cells[vac_col].replace(",", ""))
            if not m:
                continue
            n = int(m.group())
            if re.search(r"total", name, re.I):
                explicit = n
            elif name:
                rows.append((name, n))
        if explicit is not None:
            return explicit, rows
        if rows:
            return sum(n for _, n in rows), rows
    return None, []


# ---------------------------------------------------------------
# seedhi 3 / saajha: text se labeled extraction + verify
# ---------------------------------------------------------------
DATE_RE = (r"(\d{1,2}[./-]\d{1,2}[./-](?:19|20)\d{2}|"
           r"\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9},?\s+(?:19|20)\d{2}|"
           r"[A-Za-z]{3,9}\s+\d{1,2},?\s+(?:19|20)\d{2}|"
           r"(?:19|20)\d{2}-\d{1,2}-\d{1,2})")
START_LABEL = (r"(?:application\s*(?:start|begin|opening)\s*date|"
               r"start\s*date|online\s*application\s*(?:start|from)|"
               r"opening\s*date|date\s*of\s*opening|commencement|"
               r"आवेदन\s*(?:प्रारंभ|शुरू))")
LAST_LABEL = (r"(?:last\s*date|closing\s*date|application\s*deadline|"
              r"अंतिम\s*तिथि|आखिरी\s*तारीख)")


def extract_labeled_date(text, label_re):
    flat = re.sub(r"\s+", " ", text)
    m = re.search(label_re + r"[^0-9]{0,60}?" + DATE_RE, flat, re.I)
    return m.group(m.lastindex) if m else ""


def extract_fees(text):
    fees = {}
    flat = re.sub(r"\s+", " ", text)
    m = re.search(r"(?:for\s+all\s+candidates|general|ur\b)[^₹]{0,80}?"
                  r"₹\s*([0-9,]+)", flat, re.I)
    if m:
        fees["feeGen"] = "₹" + m.group(1)
    m = re.search(r"(?:SC\s*/\s*ST|SC,?\s*ST)[^₹]{0,120}?₹\s*([0-9,]+)",
                  flat, re.I)
    if m:
        fees["feeSCST"] = "₹" + m.group(1)
    return fees


def extract_from_text(text, source_url, tables=None):
    job = {}
    evidence = {}
    sd = extract_labeled_date(text, START_LABEL)
    if sd and verify_in_source(sd, text):
        job["startDate"], evidence["startDate"] = sd, source_url
    ld = extract_labeled_date(text, LAST_LABEL)
    if ld and verify_in_source(ld, text):
        job["lastDate"], evidence["lastDate"] = ld, source_url
    # vacancies: pehle asal vacancy-table (header-verified), phir
    # explicit total. Andaz wala row-scan jaanboojh kar hata diya —
    # galat number se khaali field behtar hai.
    flat = re.sub(r"\s+", " ", text)
    total, rows = extract_vacancy_table(tables)
    m = re.search(r"(?:total|कुल)[^0-9]{0,30}?(?:posts?|vacanc\w*|पद)"
                  r"[^0-9]{0,20}?([0-9,]{2,})", flat, re.I)
    if total is not None:
        job["vacancies"] = str(total)
        evidence["vacancies"] = (f"{source_url} (vacancy-table: "
                                  f"{len(rows)} posts ka yog/total)")
        job["_postRows"] = rows
    elif m and verify_in_source(m.group(1), text):
        job["vacancies"] = m.group(1)
        evidence["vacancies"] = source_url + " (explicit total)"
    for k, v in extract_fees(text).items():
        if verify_in_source(v, text):
            job[k], evidence[k] = v, source_url
    return job, evidence


# ---------------------------------------------------------------
# orchestration + quarantine
# ---------------------------------------------------------------
def quarantine(url, reason, artifacts=None):
    os.makedirs(QUARANTINE, exist_ok=True)
    hid = hashlib.md5((url + reason).encode()).hexdigest()[:12]
    path = os.path.join(QUARANTINE, f"{hid}.json")
    entry = {"url": url, "reason": reason,
             "at": datetime.now(timezone.utc).isoformat(),
             "artifacts": artifacts or {}}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(entry, f, ensure_ascii=False, indent=1)
    return path


def process_url(url):
    result = {"sourceUrl": url, "job": {}, "evidence": {},
              "ladder": [], "ok": False}
    try:
        html = fetch(url)
    except Exception as e:
        result["quarantine"] = quarantine(url, f"fetch fail: {e}")
        return result

    # 1) JSON-LD
    try:
        jl = extract_jsonld(html, url)
    except Exception:
        jl = None
    if jl and jl.get("title"):
        result["job"].update(jl)
        result["evidence"].update({k: "json-ld" for k in jl})
        result["ladder"].append("json-ld: HIT")
    else:
        result["ladder"].append("json-ld: miss")

    # 2) official PDF — hamesha koshish (tathya ka sabse pakka source)
    pdf_text, pdf_url, pdf_tables = "", "", None
    for cand in find_pdf_links(html, url):
        try:
            raw = fetch(cand, binary=True)
            if raw[:4] == b"%PDF":
                pdf_text, pdf_tables = pdf_to_text(raw)
                pdf_url = cand
                result["ladder"].append(f"pdf: HIT {cand}")
                break
        except Exception as e:
            result["ladder"].append(f"pdf: fail {cand} ({e})")
    if not pdf_text:
        result["ladder"].append("pdf: miss")

    # 3) text rules — PDF mila to usi par, warna page text par
    from bs4 import BeautifulSoup
    page_text = BeautifulSoup(html, "lxml").get_text(" ")
    for text, src, tbls in ((pdf_text, pdf_url, pdf_tables),
                            (page_text, url, None)):
        if not text:
            continue
        job2, ev2 = extract_from_text(text, src, tbls)
        for k, v in job2.items():
            if k not in result["job"] or not result["job"][k]:
                result["job"][k], result["evidence"][k] = v, ev2.get(k, src)
        if job2:
            result["ladder"].append(f"text-rules({src[:40]}): "
                                     f"{len(job2)} fields")
    result["job"] = {k: v for k, v in result["job"].items()
                     if not k.startswith("_") or k == "_postRows"}
    core = [k for k in ("title", "lastDate", "vacancies")
            if result["job"].get(k)]
    result["ok"] = len(core) >= 2
    if not result["ok"]:
        result["quarantine"] = quarantine(
            url, f"core fields kam ({core})",
            {"ladder": result["ladder"], "got": list(result["job"])})
    return result


def process_pdf_file(path, label=""):
    with open(path, "rb") as f:
        text, tables = pdf_to_text(f.read())
    job, ev = extract_from_text(text, label or path, tables)
    return {"sourceUrl": label or path, "job": job, "evidence": ev,
            "ok": bool(job.get("vacancies") or job.get("lastDate"))}


if __name__ == "__main__":
    args = sys.argv[1:]
    if args[:1] == ["--pdf"]:
        out = process_pdf_file(args[1], args[2] if len(args) > 2 else "")
    else:
        out = process_url(args[0])
    print(json.dumps(out, ensure_ascii=False, indent=1, default=str))
