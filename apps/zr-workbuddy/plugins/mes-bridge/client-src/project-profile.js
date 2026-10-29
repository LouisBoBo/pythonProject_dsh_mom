export function installProjectProfile(ctx) {
  var engineBase = ctx.engineBase;
  var authHeaders = ctx.authHeaders;

  /**
   * 侧栏工作区（session.cwd）变化后，让引擎扫描并缓存项目画像。
   * 只读工程，不改文件。同一路径在顶层标记未变时引擎直接命中缓存。
   */
  function installProjectProfileWatcher(hostCtx) {
    var lastCwd = "";
    var disposed = false;
    var timer = null;
    var unsub = null;

    function sessionsOf() {
      try {
        return (
          (hostCtx && hostCtx.sessions) ||
          (hostCtx && typeof hostCtx.get === "function" ? hostCtx.get("sessions") : null)
        );
      } catch (e) {
        return null;
      }
    }

    function readCwd() {
      var sessions = sessionsOf();
      if (!sessions) return "";
      var list = sessions.list;
      var snap = null;
      try {
        snap = list && typeof list.getSnapshot === "function" ? list.getSnapshot() : null;
      } catch (eSnap) {
        snap = null;
      }
      var sid = "";
      if (snap && snap.current != null && snap.current !== "") sid = String(snap.current);
      else if (typeof sessions.current === "string") sid = sessions.current;
      if (!sid) return "";
      var buckets = [];
      if (snap && snap.byId) buckets.push(snap.byId);
      if (sessions.byId) buckets.push(sessions.byId);
      var i;
      for (i = 0; i < buckets.length; i++) {
        var row = buckets[i][sid];
        if (row && row.cwd) return String(row.cwd).trim();
      }
      var items = (snap && (snap.items || snap.sessions)) || [];
      if (Array.isArray(items)) {
        for (i = 0; i < items.length; i++) {
          var it = items[i];
          if (it && String(it.id || "") === sid && it.cwd) return String(it.cwd).trim();
        }
      }
      return "";
    }

    function ensure(cwd) {
      var base = "";
      try {
        base = engineBase ? engineBase() : "";
      } catch (eBase) {
        base = "";
      }
      if (!base || !cwd) return;
      var headers = { "Content-Type": "application/json" };
      try {
        if (typeof authHeaders === "function") headers = authHeaders(headers);
      } catch (eAuth) {}
      fetch(base + "/api/project-profile/ensure", {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ workspace: cwd }),
      }).catch(function () {});
    }

    function tick() {
      if (disposed) return;
      var cwd = readCwd();
      if (!cwd || cwd === lastCwd) return;
      lastCwd = cwd;
      ensure(cwd);
    }

    try {
      var sessions = sessionsOf();
      var list = sessions && sessions.list;
      if (list && typeof list.subscribe === "function") {
        unsub = list.subscribe(tick);
      }
    } catch (eSub) {}
    timer = setInterval(tick, 2000);
    tick();

    return function () {
      disposed = true;
      if (timer) clearInterval(timer);
      if (typeof unsub === "function") {
        try {
          unsub();
        } catch (eUn) {}
      }
    };
  }

  ctx.installProjectProfileWatcher = installProjectProfileWatcher;
}
