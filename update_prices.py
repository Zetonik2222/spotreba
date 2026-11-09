"""Passeraty – stiahne dnešné ceny palív z oficiálneho cenníka Slovnaftu (MOL Group)
a zapíše ich do prices.json. Spúšťa ho GitHub každé ráno (súbor .github/workflows/ceny.yml).
Ak sa cenník nepodarí prečítať, nič nepokazí – ostanú posledné známe ceny."""
import html
import json
import re
import sys
import urllib.request
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

URL = "https://molgroupcards.com/news/informacie-o-kartovej-cennikovej-cene"
FILE = "prices.json"
PRODUCTS = {  # názov v cenníku -> pole v prices.json
    "natural95": r"Benz[ií]n\s+EVO(?!\s*Plus)",
    "premium": r"Benz[ií]n\s+EVO\s*Plus",
    "nafta": r"Diesel\s+EVO(?!\s*Plus)",
    "premiumDiesel": r"Diesel\s+EVO\s*Plus",
    "lpg": r"\bLPG\b",
}


def page_text(raw: str) -> str:
    raw = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", raw)
    txt = html.unescape(re.sub(r"<[^>]+>", " ", raw)).replace("\xa0", " ")
    return re.sub(r"\s+", " ", txt)


def parse(txt: str, today: date) -> dict:
    """Nájde tabuľku: hlavička s názvami palív, riadky 'od DD.MM.RRRR' + ceny."""
    m = re.search(r"AKTU[AÁ]LNA\s+V[YÝ][SŠ]KA", txt, re.I)
    seg = txt[m.start():m.start() + 4000] if m else txt
    first_row = re.search(r"\b(?:od|do)\s*\d{1,2}\.\s*\d{1,2}\.\s*\d{4}", seg)
    header = seg[: first_row.start()] if first_row else seg
    found = []
    for key, pat in PRODUCTS.items():
        hm = re.search(pat, header, re.I)
        if hm:
            found.append((hm.start(), key))
    order = [k for _, k in sorted(found)]
    if "nafta" not in order:
        raise ValueError("v cenníku chýba stĺpec Diesel EVO")
    num = r"[\s|*:€]*(\d+[,.]\d{2,3})"  # oddelovače: medzery, | alebo ** (tabuľka v texte)
    rows = re.finditer(r"\b(od|do)\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})" + num * len(order), seg, re.I)
    best = None
    for r in rows:
        kind = r.group(1).lower()
        d = date(int(r.group(4)), int(r.group(3)), int(r.group(2)))
        vals = [float(r.group(5 + i).replace(",", ".")) for i in range(len(order))]
        valid = (kind == "od" and d <= today) or (kind == "do" and d >= today)
        if valid and (best is None or (kind == "od" and (best[0] != "od" or d > best[1]))):
            best = (kind, d, dict(zip(order, vals)))
    if not best:
        raise ValueError("v cenníku nie je riadok platný pre dnešok")
    prices = best[2]
    for k, v in prices.items():
        if not 0.3 < v < 5:
            raise ValueError(f"podozrivá cena {k}={v}")
    return prices


def main() -> int:
    tz = ZoneInfo("Europe/Bratislava")
    today = datetime.now(tz).date()
    try:
        with open(FILE, encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        data = {"ceny": []}
    data["skontrolovane"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    try:
        req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0 (Passeraty; denná kontrola ceny)"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8", "ignore")
        prices = parse(page_text(raw), today)
    except Exception as e:  # cenník nedostupný alebo zmenený – necháme posledné ceny
        print(f"VAROVANIE: ceny sa nepodarilo zistiť: {e}", file=sys.stderr)
        data["chyba"] = str(e)
    else:
        data.pop("chyba", None)
        rec = {"datum": today.isoformat(), **prices}
        ceny = [c for c in data.get("ceny", []) if c.get("datum") != rec["datum"]]
        ceny.append(rec)
        ceny.sort(key=lambda c: c["datum"])
        data["ceny"] = ceny[-400:]
        print("Zapísané:", rec)
    with open(FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
