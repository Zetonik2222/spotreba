/* Spotreba – záloha, obnova, pripomienka zálohy, inštalácia a offline režim */
(function () {
  function $(id) { return document.getElementById(id); }
  var S = window.appStore;
  function msg(t) { $("bkMsg").textContent = t; $("bkMsg").hidden = !t; }
  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function slug(t) {
    return String(t || "auto").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "auto";
  }

  // Pripomienka zálohy: raz za 30 dní, ak sú v appke nejaké záznamy
  var LAST = "spotreba-posledna-zaloha", SNOOZE = "spotreba-zaloha-neskor", DAY = 86400000;
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function fmtD(ms) { var d = new Date(ms); return d.getDate() + ". " + (d.getMonth() + 1) + ". " + d.getFullYear(); }
  function zaz(n) { return n + (n === 1 ? " záznam" : n < 5 ? " záznamy" : " záznamov"); }
  function checkReminder() {
    var last = +lsGet(LAST) || 0, snooze = +lsGet(SNOOZE) || 0, now = Date.now();
    $("bkLast").textContent = last ? "Posledná záloha: " + fmtD(last) + "." : "Zálohu si zatiaľ nerobil.";
    var n = S.countRecords();
    var due = !!S.car && n > 0 && now > snooze && (!last || now - last > 30 * DAY);
    if (due) {
      $("bkRemindTxt").textContent = last
        ? "Posledná záloha bola " + fmtD(last) + ". Máš tu " + zaz(n) + " len v tomto mobile."
        : "Máš tu " + zaz(n) + " len v tomto mobile a ešte žiadnu zálohu.";
    }
    $("bkRemind").hidden = !due;
  }
  function markBackup() { lsSet(LAST, String(Date.now())); checkReminder(); }
  $("bkRemindNow").addEventListener("click", function () { $(S.cars().length > 1 ? "bkSaveAll" : "bkSave").click(); });
  $("bkRemindLater").addEventListener("click", function () { lsSet(SNOOZE, String(Date.now() + 7 * DAY)); checkReminder(); });
  setTimeout(checkReminder, 400);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) checkReminder(); });

  function download(data, name) {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }
  // Záloha jedného auta
  $("bkSave").addEventListener("click", function () {
    try {
      var id = S.currentId(); if (!id) return;
      var data = S.exportCar(id);
      data._zaloha = { appka: "Spotreba", typ: "auto", vytvorena: new Date().toISOString() };
      download(data, "spotreba-" + slug(data.car.nazov) + "-" + today() + ".json");
      msg("Záloha auta je uložená v priečinku Stiahnuté (Downloads)."); markBackup();
    } catch (e) { msg("Zálohu sa nepodarilo vytvoriť."); }
  });
  // Záloha celej garáže
  $("bkSaveAll").addEventListener("click", function () {
    try {
      var data = S.exportAll();
      data._zaloha = { appka: "Spotreba", typ: "garaz", vytvorena: new Date().toISOString() };
      download(data, "spotreba-vsetky-auta-" + today() + ".json");
      msg("Záloha všetkých áut je uložená v priečinku Stiahnuté (Downloads)."); markBackup();
    } catch (e) { msg("Zálohu sa nepodarilo vytvoriť."); }
  });

  // Obnova zo zálohy (s potvrdením druhým ťuknutím)
  var armed = false;
  $("bkLoad").addEventListener("click", function () {
    if (!armed) {
      armed = true; $("bkLoad").textContent = "Naozaj? Vyber súbor zálohy";
      setTimeout(function () { armed = false; $("bkLoad").textContent = "Obnoviť zo zálohy"; }, 5000);
      return;
    }
    armed = false; $("bkLoad").textContent = "Obnoviť zo zálohy";
    $("bkFile").value = ""; $("bkFile").click();
  });
  $("bkFile").addEventListener("change", function () {
    var f = this.files && this.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      var bad = "Tento súbor nie je záloha appky Spotreba. Vyber súbor spotreba-….json.";
      try {
        var data = JSON.parse(r.result);
        var z = data._zaloha; if (!z || z.appka !== "Spotreba") throw new Error("not ours");
        delete data._zaloha;
        if (z.typ === "garaz") S.importAll(data); else if (z.typ === "auto") S.importCar(data); else throw new Error("type");
        markBackup();
        location.reload();
      } catch (e) {
        msg(bad);
        if (!$("setup").hidden) { var ce = $("cErr"); ce.textContent = bad; ce.hidden = false; }
      }
    };
    r.readAsText(f);
  });

  // Inštalácia na plochu
  var deferred = null;
  var standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault(); deferred = e;
    if (!standalone) $("installBar").hidden = false;
  });
  $("installBtn").addEventListener("click", function () {
    if (!deferred) return;
    deferred.prompt();
    deferred.userChoice.finally(function () { deferred = null; $("installBar").hidden = true; });
  });
  window.addEventListener("appinstalled", function () { $("installBar").hidden = true; });
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (ios && !standalone) {
    $("installTxt").textContent = "Na iPhone: ťukni na Zdieľať a vyber „Pridať na plochu“.";
    $("installBtn").hidden = true; $("installBar").hidden = false;
  }

  // Offline režim
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }
})();
