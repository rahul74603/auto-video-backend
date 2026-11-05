# Job Extractor — Fail-Safe Sidecar (Report-Only)

Purane `govt_jobs.js` scraper ke **bagal me** chalne wala naya extractor.
Purana scraper isse bilkul untouched hai — ye uski jagah nahi leta,
ye uske saath ek doosra, zyada pakka raasta banata hai.

## Kyun?

- Purana scraper ek hi file me 5 kaam karta hai (scrape + publish
  trigger + video + social + Telegram), isiliye sudhaar khatarnak tha.
- Woh official notification **PDF kabhi kholta hi nahi** tha — tathya
  aggregator page ke text se aate the.
- Fail hui posting chup-chaap gayab ho jati thi.

## Ye kaise kaam karta hai (3 seedhiyan)

1. **JSON-LD** — page me tay-shuda JobPosting data mile to wahi sach.
2. **Official PDF** — page se official (`.gov.in`/`.nic.in` ko pehle)
   notification PDF dhoondh kar pdfplumber se padhta hai; vacancy
   table header pehchan kar (Post + Vacancies) pad-ginti nikalti hai.
3. **Text rules** — labeled dates/fees (Opening date / Last date / ₹).

**Har number/date source-text me literal verify hota hai** — source
me na mile to field khaali. Fail = **quarantine** (wajah ke saath),
posting kabhi gayab nahi.

## Saboot (2026-11-05)

- **Golden test:** RRB CEN 09/2026 ke official 59-page PDF par bina
  kisi case-specific code ke exact natija — kul **191 pad**, saato
  post ki sahi ginti, 05.11.2026 → 04.12.2026, ₹500 fee.
  (`golden/cen-09-2026-expected.json`; listing sites "195 approx"
  bol rahi thi, PDF ne 191 pakke diye.)
- **Live:** SarkariExam/FreeJobAlert ki asli postings par official
  ssc.gov.in / tnpsc.gov.in PDF apne aap mile; TNPSC 6,574 posts
  page-title se corroborate hue.
- **Quarantine:** hall-ticket (non-job) page se koi nakli job nahi
  bana — item wajah ke saath quarantine me gaya.

## Chalane ke liye (Eric ka ek hi step)

`WORKFLOW_COPY/job_extractor.yml.txt` ko GitHub web UI se
`.github/workflows/job_extractor.yml` naam se upload kar do —
bas. Workflow roz report-mode me chalega aur natije Firestore ki
nayi collections (`job_extractor_reports`, `job_extractor_seen`,
`job_extractor_quarantine`) me jayenge. **Drafts abhi NAHI bante** —
kuch din reports achhi aane ke baad hi draft-mode par baat hogi.

Local test: `python3 -m unittest test_extract.py` (offline) aur
`python3 extract.py <kisi job page ka URL>`.

## Jaane hue gaps (imaandari se)

- Fee kabhi "Rs. 250/-" likhi hoti hai (₹ chinh nahi) — woh format
  abhi miss hota hai; galat number kabhi nahi aata, field khaali
  rehti hai.
- Addendum-type PDF (sirf sudhaar suchna) se kam data milta hai;
  tab page-text fallback kaam karta hai.
- JSON-LD SarkariExam/FreeJobAlert par nahi mila (woh dete hi
  nahi); jo sites deti hain, wahan pehli seedhi hi kaafi hogi.
