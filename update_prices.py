"""Passeraty – stiahne dnešné ceny palív z oficiálneho cenníka Slovnaftu (MOL Group)
a zapíše ich do prices.json. Spúšťa ho GitHub každé ráno (súbor .github/workflows/ceny.yml).
Ak sa cenník nepodarí prečítať, nič nepokazí – ostanú posledné známe ceny."""
import html
import json
import re
import sys
import time
import urllib.request
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

URLS = [
    "https://molgroupcards.sk/informacie-o-kartovej-cennikovej-cene",  # nový web (od 12. 11. 2026)
    "https://molgroupcards.com/news/informacie-o-kartovej-cennikovej-cene",  # stará adresa
]
FILE = "prices.json"
PRODUCTS = {  # názov v cenníku -> pole v prices.json
    "natural95": r"Benz[ií]n\s+EVO(?!\s*Plus)",
    "premium": r"Benz[ií]n\s+EVO\s*Plus",
    "nafta": r"Diesel\s+EVO(?!\s*Plus)",
    "premiumDiesel": r"Diesel\s+EVO\s*Plus",
    "lpg": r"\bLPG\b",
}


HEADERS = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "sk-SK,sk;q=0.9,en;q=0.7",
}


def fetch() -> str:
    """Skúsi novú aj starú adresu cenníka, celé najviac 3x."""
    errors = []
    for attempt in range(3):
        for url in URLS:
            try:
                req = urllib.request.Request(url, headers=HEADERS)
                with urllib.request.urlopen(req, timeout=30) as resp:
                    return resp.read().decode("utf-8", "ignore")
            except Exception as e:
                errors.append(f"{url.split('/')[2]}: {e}")
        if attempt < 2:
            time.sleep(20 * (attempt + 1))
    raise RuntimeError("; ".join(errors[-2:]))


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
        prices = parse(page_text(fetch()), today)
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
