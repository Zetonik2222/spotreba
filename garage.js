/* Spotreba – sprievodca pridaním auta, garáž áut a prehľad celej flotily */
(function () {
  function $(id) { return document.getElementById(id); }
  var S = window.appStore;
  var FUELS = [["natural95", "Benzín 95"], ["premium", "Prémiový benzín"], ["nafta", "Nafta"], ["premiumDiesel", "Prémiová nafta"], ["lpg", "LPG"]];
  var FUEL_SHORT = { natural95: "benzín 95", premium: "prémiový benzín", nafta: "nafta", premiumDiesel: "prémiová nafta", lpg: "LPG" };
  function num(v) { var x = parseFloat(String(v).replace(/\s/g, "").replace(",", ".")); return isFinite(x) ? x : NaN; }
  function f1(v) { return String(v).replace(".", ","); }
  function fmt(v, d) { return v.toLocaleString("sk-SK", { minimumFractionDigits: d, maximumFractionDigits: d }); }

  // ---------- sprievodca / úprava auta ----------
  var editId = null, fuel = null;
  var fuelBox = $("cFuel");
  FUELS.forEach(function (f) {
    var b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.textContent = f[1];
    b.setAttribute("role", "radio"); b.dataset.k = f[0];
    b.addEventListener("click", function () { fuel = f[0]; markFuel(); });
    fuelBox.appendChild(b);
  });
  function markFuel() {
    fuelBox.querySelectorAll(".chip").forEach(function (b) {
      var on = b.dataset.k === fuel; b.setAttribute("aria-pressed", on); b.setAttribute("aria-checked", on);
    });
  }
  function err(m) { $("cErr").textContent = m; $("cErr").hidden = !m; }

  function openSetup(car) {
    editId = car ? car.id : null;
    var first = !S.cars().length;
    $("setupKicker").textContent = first ? "Vitaj v appke Spotreba" : (car ? "Úprava auta" : "Garáž");
    $("setupTitle").textContent = car ? "Upraviť auto" : (first ? "Pridaj svoje auto" : "Pridať ďalšie auto");
    $("cSave").textContent = car ? "Uložiť zmeny" : "Uložiť a pokračovať";
    $("cCancel").hidden = first;
    $("setupRestoreNote").hidden = !first;
    $("cNazov").value = car ? car.nazov : "";
    $("cModel").value = car ? (car.model || "") : "";
    $("cTank").value = car ? f1(car.nadrz) : "";
    var sp = (car && car.spotreba) || {};
    $("cKomb").value = sp.komb ? f1(sp.komb) : "";
    $("cMesto").value = sp.mesto ? f1(sp.mesto) : "";
    $("cMimo").value = sp.mimo ? f1(sp.mimo) : "";
    $("cDial").value = sp.dialnica ? f1(sp.dialnica) : "";
    $("cMore").open = !!(sp.mesto || sp.mimo || sp.dialnica);
    fuel = car ? car.palivo : null; markFuel(); err("");
    $("setup").hidden = false; document.body.classList.add("no-car");
    $("setup").scrollTop = 0;
    if (first) setTimeout(function () { $("cNazov").focus(); }, 50);
  }
  function closeSetup() { $("setup").hidden = true; document.body.classList.remove("no-car"); }

  $("carForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var nazov = $("cNazov").value.trim(), model = $("cModel").value.trim();
    var tank = num($("cTank").value), komb = num($("cKomb").value);
    var opt = { mesto: num($("cMesto").value), mimo: num($("cMimo").value), dialnica: num($("cDial").value) };
    if (!nazov) { err("Zadaj názov auta, napríklad Moja Kia."); $("cNazov").focus(); return; }
    if (!fuel) { err("Vyber palivo, ktoré auto tankuje."); return; }
    if (!(tank >= 5 && tank <= 200)) { err("Zadaj objem nádrže v litroch, napríklad 50."); $("cTank").focus(); return; }
    if (!(komb >= 1 && komb <= 30)) { err("Zadaj kombinovanú spotrebu v l/100 km, napríklad 6,5."); $("cKomb").focus(); return; }
    var sp = { komb: Math.round(komb * 10) / 10 };
    for (var k in opt) {
      var v = opt[k];
      if ($(k === "mesto" ? "cMesto" : k === "mimo" ? "cMimo" : "cDial").value.trim()) {
        if (!(v >= 1 && v <= 30)) { err("Ďalšie spotreby zadaj v l/100 km (1 až 30), alebo nechaj prázdne."); return; }
        sp[k] = Math.round(v * 10) / 10;
      }
    }
    var car = { nazov: nazov, model: model, palivo: fuel, nadrz: Math.round(tank * 10) / 10, spotreba: sp };
    try {
      if (editId) {
        S.updateCar(editId, car);
        try { localStorage.removeItem("sp-" + editId + "-jazda"); } catch (e2) {}
      } else { S.addCar(car); }
      location.reload();
    } catch (ex) { err("Auto sa nepodarilo uložiť. Skús to znova."); }
  });
  $("cCancel").addEventListener("click", closeSetup);
  $("setupRestore").addEventListener("click", function () { $("bkFile").value = ""; $("bkFile").click(); });

  // ---------- garáž ----------
  var curId = S.currentId();
  function renderCars() {
    var list = $("carList"); list.innerHTML = "";
    S.cars().forEach(function (c) {
      var b = document.createElement("button"); b.type = "button"; b.className = "carrow" + (c.id === curId ? " on" : "");
      var left = document.createElement("span");
      var t = document.createElement("b"); t.textContent = c.nazov;
      var m = document.createElement("small"); m.textContent = (c.model ? c.model + " · " : "") + FUEL_SHORT[c.palivo] + " · " + f1(c.spotreba.komb) + " l/100 km";
      left.appendChild(t); left.appendChild(m);
      var right = document.createElement("span");
      if (c.id === curId) { right.className = "tag"; right.textContent = "práve používaš"; }
      else { right.className = "go"; right.textContent = "Prepnúť ›"; }
      b.appendChild(left); b.appendChild(right);
      b.addEventListener("click", function () { if (c.id !== curId) { S.setCurrent(c.id); location.reload(); } });
      list.appendChild(b);
    });
  }
  $("gAdd").addEventListener("click", function () { openSetup(null); });
  $("gEdit").addEventListener("click", function () {
    var c = S.cars().filter(function (x) { return x.id === curId; })[0]; if (c) openSetup(c);
  });
  var delArmed = false;
  $("gDel").addEventListener("click", function () {
    var c = S.cars().filter(function (x) { return x.id === curId; })[0]; if (!c) return;
    if (!delArmed) {
      delArmed = true; $("gDel").textContent = "Naozaj? Zmaže aj všetky jeho záznamy";
      $("gMsg").textContent = "Pred odstránením si pre istotu urob zálohu tohto auta (nižšie)."; $("gMsg").hidden = false;
      setTimeout(function () { delArmed = false; $("gDel").textContent = "Odstrániť toto auto"; $("gMsg").hidden = true; }, 6000);
      return;
    }
    try { localStorage.removeItem("sp-" + c.id + "-jazda"); localStorage.removeItem("sp-" + c.id + "-taxi"); } catch (e) {}
    S.deleteCar(c.id); location.reload();
  });
  $("heroModel").addEventListener("click", function () { $("garage").scrollIntoView({ behavior: "smooth", block: "start" }); });

  // ---------- flotila vo výpisoch ----------
  var MES = ["január", "február", "marec", "apríl", "máj", "jún", "júl", "august", "september", "október", "november", "december"];
  function sumBy(obj, ym, field) {
    var n = 0, s = 0;
    Object.keys(obj || {}).forEach(function (k) { var x = obj[k]; if (x && x.datum && x.datum.slice(0, 7) === ym && typeof x[field] === "number") { s += x[field]; n++; } });
    return { s: s, n: n };
  }
  function renderFleet() {
    var all = S.allCarsData(), set = {};
    all.forEach(function (c) {
      ["tankovania", "umyvanie", "odvozy"].forEach(function (k) {
        Object.keys(c[k]).forEach(function (id) { var d = c[k][id]; if (d && d.datum) set[d.datum.slice(0, 7)] = 1; });
      });
    });
    var months = Object.keys(set).sort().reverse(), box = $("fleetList"); box.innerHTML = "";
    if (!months.length) { box.innerHTML = '<p class="note">Prehľad sa ukáže po prvom tankovaní alebo výdavku.</p>'; return; }
    months.forEach(function (ym) {
      var card = document.createElement("div"); card.className = "rep";
      var h = document.createElement("div"); h.className = "rep-h";
      var t = document.createElement("h3"); t.textContent = MES[+ym.slice(5) - 1] + " " + ym.slice(0, 4) + " · všetky autá";
      var tot = document.createElement("span"); tot.className = "tot"; h.appendChild(t); h.appendChild(tot); card.appendChild(h);
      var total = 0, rides = 0;
      all.forEach(function (c) {
        var f = sumBy(c.tankovania, ym, "suma"), w = sumBy(c.umyvanie, ym, "suma"), r = sumBy(c.odvozy, ym, "spolu");
        if (!f.n && !w.n && !r.n) return;
        total += f.s + w.s; rides += r.s;
        var row = document.createElement("div"); row.className = "fl-row";
        var nm = document.createElement("span"); nm.textContent = c.car.nazov;
        var v = document.createElement("b"); v.textContent = fmt(f.s + w.s, 2) + " €";
        var d = document.createElement("small");
        d.textContent = "palivo " + fmt(f.s, 2) + " € (" + f.n + "×) · výdavky " + fmt(w.s, 2) + " € (" + w.n + "×)" + (r.n ? " · odvozy +" + fmt(r.s, 2) + " €" : "");
        row.appendChild(nm); row.appendChild(v); row.appendChild(d); card.appendChild(row);
      });
      tot.textContent = fmt(total, 2) + " €";
      if (rides > 0) {
        var rr = document.createElement("div"); rr.className = "rep-ride";
        var a = document.createElement("span"); a.textContent = "Čisté náklady po odvozoch";
        var b = document.createElement("b"); b.textContent = fmt(total - rides, 2) + " €";
        rr.appendChild(a); rr.appendChild(b); card.appendChild(rr);
      }
      box.appendChild(card);
    });
  }
  function setFleet(on) {
    $("fltCar").setAttribute("aria-selected", !on); $("fltAll").setAttribute("aria-selected", on);
    $("repList").hidden = on; $("fleetList").hidden = !on;
    if (on) renderFleet();
  }
  $("fltCar").addEventListener("click", function () { setFleet(false); });
  $("fltAll").addEventListener("click", function () { setFleet(true); });

  // ---------- štart ----------
  if (!S.car) { openSetup(null); }
  else {
    renderCars();
    $("fleetTabs").hidden = S.cars().length < 2;
    $("gDel").hidden = false;
  }
})();
