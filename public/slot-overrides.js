/* ─────────────────────────────────────────────────────────────────────────
   slot-overrides.js — makes reel-symbol replacements from the /slot-admin page
   appear in the actual game reels.

   The admin page saves each replacement in IndexedDB (DB "slotAdmin", store
   "overrides") keyed by game+symbol, together with the symbol's ORIGINAL asset
   path. This consumer reads the overrides for the current game and swaps every
   reel <img> whose src matches an overridden path — to the uploaded image, or,
   for animated reels, replaces it with a looping muted <video>. A
   MutationObserver keeps applying as the reels re-render during spins.

   No coupling to any game's internals: matching is purely by image src path, so
   this works across all six slot templates. Set window.__SLOT_GAME to the
   game's key before loading this file. Glyph/CSS symbols (no image file) are
   not swapped in-game.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";
  var GAME = window.__SLOT_GAME;
  if (!GAME || !window.indexedDB) return;

  var DB = "slotAdmin", STORE = "overrides";
  function openDB() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(DB, 1);
      // create the store if the admin page has never run in this browser yet
      r.onupgradeneeded = function () { try { r.result.createObjectStore(STORE, { keyPath: "key" }); } catch (e) {} };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function allForGame() {
    return openDB().then(function (db) {
      return new Promise(function (res, rej) {
        var out = [];
        var tx = db.transaction(STORE, "readonly").objectStore(STORE);
        var q = tx.openCursor();
        q.onsuccess = function (e) {
          var c = e.target.result;
          if (c) { if (c.value && c.value.game === GAME && c.value.art) out.push(c.value); c.continue(); }
          else res(out);
        };
        q.onerror = function () { rej(q.error); };
      });
    });
  }

  function encPath(p) { return p.split("/").map(encodeURIComponent).join("/"); }
  function variants(p) {
    var set = {};
    set[p] = 1; set[encPath(p)] = 1;
    try { set[decodeURI(p)] = 1; } catch (e) {}
    try { set[encodeURI(p)] = 1; } catch (e) {}
    return Object.keys(set);
  }

  var byPath = Object.create(null);   // src path (all variants) -> {type, url}
  var active = false;

  function lookup(src) {
    if (!src) return null;
    if (byPath[src]) return byPath[src];
    // normalise: strip origin if absolute
    try { var u = new URL(src, location.href); var rel = u.pathname.replace(/^\//, "");
      if (byPath[rel]) return byPath[rel];
      try { if (byPath[decodeURI(rel)]) return byPath[decodeURI(rel)]; } catch (e) {}
    } catch (e) {}
    return null;
  }

  function apply(img) {
    if (!img || img.__ovType) return;                 // already swapped
    var ov = lookup(img.getAttribute("src"));
    if (!ov) return;
    if (ov.type === "video") {
      var v = document.createElement("video");
      v.src = ov.url; v.autoplay = true; v.loop = true; v.muted = true; v.defaultMuted = true;
      v.setAttribute("muted", ""); v.setAttribute("playsinline", ""); v.playsInline = true;
      v.className = img.className;
      var cs = window.getComputedStyle(img);
      v.style.cssText = img.style.cssText;
      v.style.width = cs.width && cs.width !== "auto" ? cs.width : "100%";
      v.style.height = cs.height && cs.height !== "auto" ? cs.height : "100%";
      v.style.objectFit = cs.objectFit && cs.objectFit !== "fill" ? cs.objectFit : "cover";
      v.style.borderRadius = cs.borderRadius || "";
      v.style.pointerEvents = "none";
      v.__ovType = "video";
      if (img.parentNode) img.parentNode.replaceChild(v, img);
      var pr = v.play && v.play(); if (pr && pr.catch) pr.catch(function () {});
    } else {
      img.__ovType = "image";
      img.src = ov.url;
    }
  }

  function scan(root) {
    var imgs = (root && root.querySelectorAll) ? root.querySelectorAll("img") : [];
    for (var i = 0; i < imgs.length; i++) apply(imgs[i]);
  }

  allForGame().then(function (list) {
    if (!list.length) return;
    list.forEach(function (o) {
      var url = URL.createObjectURL(o.blob);
      var rec = { type: o.type === "video" ? "video" : "image", url: url };
      variants(o.art).forEach(function (k) { byPath[k] = rec; });
    });
    active = true;
    scan(document);
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType !== 1) continue;
          if (n.tagName === "IMG") apply(n);
          else scan(n);
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }).catch(function () { /* no admin DB yet — leave originals */ });
})();
