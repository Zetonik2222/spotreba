/* Spotreba – ukladanie údajov priamo v mobile (localStorage), garáž áut.
   Každé auto má vlastné tankovania, umývanie a odvozy. Ceny palív sú spoločné
   a každé ráno ich obnoví GitHub do súboru prices.json. */
(function () {
  var KEY = "spotreba-data-v1";
  var PER_CAR = { tankovania: 1, umyvanie: 1, odvozy: 1 };
  var FUELS = ["natural95", "premium", "nafta", "premiumDiesel", "lpg"];
  var store;
  try { store = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { store = null; }
  if (!store || typeof store !== "object") store = {};
  store.cars = store.cars || {};
  store.d = store.d || {};
  store.ceny = store.ceny || {};
  if (store.current && !store.cars[store.current]) store.current = null;
  if (!store.current) { var ids0 = Object.keys(store.cars); store.current = ids0.length ? ids0[0] : null; }

  var subs = [];
  var seq = 0;
  function persist() { localStorage.setItem(KEY, JSON.stringify(store)); }
  function safePersist() { try { persist(); } catch (e) { console.warn("Údaje sa nepodarilo uložiť", e); } }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function newId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function col(name) {
    if (PER_CAR[name]) {
      var cid = store.current || "_bez_auta";
      if (!store.d[cid]) store.d[cid] = {};
      if (!store.d[cid][name]) store.d[cid][name] = {};
      return store.d[cid][name];
    }
    if (!store[name]) store[name] = {};
    return store[name];
  }

  function snapshot(name, q) {
    var c = col(name);
    var docs = Object.keys(c).map(function (id) {
      var data = c[id];
      return { id: id, data: function () { return clone(data); } };
    });
    if (q.ord) {
      docs.sort(function (a, b) {
        var x = a.data()[q.ord], y = b.data()[q.ord];
        var r = x < y ? -1 : x > y ? 1 : 0;
        return q.dir === "desc" ? -r : r;
      });
    }
    if (q.lim) docs = docs.slice(0, q.lim);
    return { docs: docs };
  }
  function notify(name) {
    subs.forEach(function (s) {
      if (s.name === name) setTimeout(function () { s.cb(snapshot(name, s.q)); }, 0);
    });
  }

  function collection(name) {
    var q = { ord: null, dir: "asc", lim: 0 };
    var api = {
      orderBy: function (f, d) { q.ord = f; q.dir = d || "asc"; return api; },
      limit: function (n) { q.lim = n; return api; },
      onSnapshot: function (cb) {
        var sub = { name: name, q: { ord: q.ord, dir: q.dir, lim: q.lim }, cb: cb };
        subs.push(sub);
        setTimeout(function () { cb(snapshot(name, sub.q)); }, 0);
        return function () { subs = subs.filter(function (x) { return x !== sub; }); };
      },
      add: function (data) {
        var id = Date.now().toString(36) + "-" + (++seq);
        col(name)[id] = clone(data); persist(); notify(name);
        return Promise.resolve({ id: id });
      },
      doc: function (id) {
        return {
          set: function (data) { col(name)[id] = clone(data); persist(); notify(name); return Promise.resolve(); },
          delete: function () { delete col(name)[id]; persist(); notify(name); return Promise.resolve(); }
        };
      }
    };
    return api;
  }
  var db = { collection: collection };

  // Ceny zo servera: dopĺňajú sa do histórie, ručne zadaná cena v daný deň ostáva.
  function syncPrices() {
    return fetch("prices.json?t=" + Date.now(), { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) {
        var list = (j && j.ceny) || [];
        var c = col("ceny"), changed = false;
        list.forEach(function (p) {
          if (!p || !p.datum) return;
          var cur = c[p.datum];
          if (cur && cur.rucne) return;
          var rec = { datum: p.datum, pumpa: "Slovnaft (cenník MOL Group / Slovnaft)", zdroj: "cenník Slovnaftu" }, any = false;
          FUELS.forEach(function (k) { if (typeof p[k] === "number") { rec[k] = p[k]; any = true; } });
          if (!any) return;
          if (!cur || JSON.stringify(cur) !== JSON.stringify(rec)) { c[p.datum] = rec; changed = true; }
        });
        if (changed) { safePersist(); notify("ceny"); }
      })
      .catch(function () { /* bez internetu ostáva posledná uložená cena */ });
  }
  syncPrices();
  document.addEventListener("visibilitychange", function () { if (!document.hidden) syncPrices(); });

  function carData(id) {
    var d = store.d[id] || {};
    return { tankovania: clone(d.tankovania || {}), umyvanie: clone(d.umyvanie || {}), odvozy: clone(d.odvozy || {}) };
  }
  function checkCar(car) {
    if (!car || typeof car !== "object" || !car.nazov || FUELS.indexOf(car.palivo) < 0 || !(car.nadrz > 0) || !car.spotreba || !(car.spotreba.komb > 0)) throw new Error("bad car");
  }

  window.appStore = {
    FUELS: FUELS,
    car: store.current ? clone(store.cars[store.current]) : null,
    cars: function () {
      return Object.keys(store.cars).map(function (id) { var c = clone(store.cars[id]); c.id = id; return c; })
        .sort(function (a, b) { return (a.pridane || 0) - (b.pridane || 0); });
    },
    currentId: function () { return store.current; },
    addCar: function (car) {
      checkCar(car);
      var id = newId("auto-"); car = clone(car); car.id = id; car.pridane = Date.now();
      store.cars[id] = car; store.d[id] = { tankovania: {}, umyvanie: {}, odvozy: {} }; store.current = id;
      persist(); return id;
    },
    updateCar: function (id, car) {
      if (!store.cars[id]) throw new Error("no car");
      checkCar(car);
      var keep = store.cars[id]; car = clone(car); car.id = id; car.pridane = keep.pridane;
      store.cars[id] = car; persist();
    },
    deleteCar: function (id) {
      delete store.cars[id]; delete store.d[id];
      var ids = Object.keys(store.cars); store.current = ids.length ? ids[0] : null;
      persist();
    },
    setCurrent: function (id) { if (store.cars[id]) { store.current = id; persist(); } },
    countRecords: function () {
      var n = 0;
      Object.keys(store.d).forEach(function (id) {
        ["tankovania", "umyvanie", "odvozy"].forEach(function (k) { n += Object.keys((store.d[id] || {})[k] || {}).length; });
      });
      return n;
    },
    allCarsData: function () {
      return this.cars().map(function (c) { var d = carData(c.id); d.car = c; return d; });
    },
    exportCar: function (id) {
      var d = carData(id); d.car = clone(store.cars[id]); d.ceny = clone(store.ceny);
      return d;
    },
    exportAll: function () { return clone(store); },
    importCar: function (data) {
      checkCar(data.car);
      var id = data.car.id && /^[\w-]+$/.test(data.car.id) ? data.car.id : newId("auto-");
      var car = clone(data.car); car.id = id; if (!car.pridane) car.pridane = Date.now();
      store.cars[id] = car;
      store.d[id] = { tankovania: clone(data.tankovania || {}), umyvanie: clone(data.umyvanie || {}), odvozy: clone(data.odvozy || {}) };
      if (data.ceny && typeof data.ceny === "object") Object.keys(data.ceny).forEach(function (k) { if (!store.ceny[k]) store.ceny[k] = data.ceny[k]; });
      store.current = id; persist();
    },
    importAll: function (data) {
      if (!data || typeof data.cars !== "object" || typeof data.d !== "object") throw new Error("bad");
      Object.keys(data.cars).forEach(function (id) { checkCar(data.cars[id]); });
      store = clone(data); store.ceny = store.ceny || {};
      if (!store.current || !store.cars[store.current]) { var ids = Object.keys(store.cars); store.current = ids.length ? ids[0] : null; }
      persist();
    }
  };

  // Rovnaké rozhranie, aké appka používala v Claude: dostupné je len ukladanie.
  window.claude = {
    use: function (name) {
      return new Promise(function (res) { setTimeout(function () { res(name === "db" ? db : null); }, 0); });
    }
  };
})();
