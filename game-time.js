/* 주말 게임 시간 — 차감 규칙 A
 * 기본 120분 − (남은 핵심 숙제 개수 × 30분), 최소 0분
 * 차감은 전체 숙제가 아니라 아이별 핵심 항목만 센다.
 * 평일(월–금)에 남긴 핵심 항목만 주말 차감에 들어간다.
 * 일요일 confirm_hour(기본 21시) 이후 그 주 값을 확정한다.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GameTime = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var RULE_WEEK = "1970-01-06";
  var DEFAULT_TARGETS = {
    hajoo: ["qt", "ma_calc", "en_focus", "hr_day"],
    hayoo: ["qt", "ma_calc", "sc_read", "hr_day"],
    haseo: ["qt", "dc_go", "dc_bag", "dc_sleep"]
  };

  function defaultRules() {
    return {
      base_minutes: 120,
      deduct_per_item: 30,
      min_minutes: 0,
      deduct_mode: "A",
      confirm_hour: 21,
      deduct_target: {
        hajoo: DEFAULT_TARGETS.hajoo.slice(),
        hayoo: DEFAULT_TARGETS.hayoo.slice(),
        haseo: DEFAULT_TARGETS.haseo.slice()
      },
      child_master: {
        hajoo: { name: "김하주", color: "#059669", photo_url: "" },
        hayoo: { name: "김하유", color: "#0A84FF", photo_url: "" },
        haseo: { name: "김하서", color: "#FF6B35", photo_url: "" }
      }
    };
  }

  function num(v, fb) {
    v = Number(v);
    return isFinite(v) ? v : fb;
  }

  function normalizeRules(raw) {
    var d = defaultRules();
    if (!raw || typeof raw !== "object") return d;
    var n = {
      base_minutes: num(raw.base_minutes, d.base_minutes),
      deduct_per_item: num(raw.deduct_per_item, d.deduct_per_item),
      min_minutes: num(raw.min_minutes, d.min_minutes),
      deduct_mode: raw.deduct_mode || d.deduct_mode,
      confirm_hour: num(raw.confirm_hour, d.confirm_hour),
      deduct_target: {},
      child_master: {}
    };
    if (n.deduct_per_item < 1) n.deduct_per_item = 1;
    if (n.base_minutes < 0) n.base_minutes = 0;
    if (n.min_minutes < 0) n.min_minutes = 0;
    if (n.confirm_hour < 0 || n.confirm_hour > 23) n.confirm_hour = 21;
    Object.keys(d.deduct_target).forEach(function (id) {
      var t = raw.deduct_target && raw.deduct_target[id];
      n.deduct_target[id] = Array.isArray(t) ? t.slice() : d.deduct_target[id].slice();
    });
    Object.keys(d.child_master).forEach(function (id) {
      var src = (raw.child_master && raw.child_master[id]) || {};
      var fb = d.child_master[id];
      n.child_master[id] = {
        name: src.name || fb.name,
        color: src.color || fb.color,
        photo_url: src.photo_url || ""
      };
    });
    return n;
  }

  function fmt(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
  }

  function addDays(d, n) {
    var c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    c.setDate(c.getDate() + n);
    return c;
  }

  function isWeekend(d) {
    var w = d.getDay();
    return w === 0 || w === 6;
  }

  function findItem(kid, itemId) {
    var found = null;
    (kid.groups || []).forEach(function (g) {
      (g.items || []).forEach(function (it) {
        if (it.id === itemId) found = it;
        (it.subs || []).forEach(function (s) {
          if (s.id === itemId) found = { id: s.id, label: it.label + " · " + s.label, parent: it };
        });
      });
    });
    return found;
  }

  function itemApplies(it, date) {
    if (!it || it.weekly) return false;
    var wknd = isWeekend(date);
    if (it.weekendOnly && !wknd) return false;
    if (it.weekdayOnly && wknd) return false;
    return true;
  }

  function cellOf(data, kidId, dateKey) {
    var kid = data && data[kidId];
    var c = kid && kid[dateKey];
    return { t: (c && c.t) || {}, h: (c && c.h) || {} };
  }

  function instanceDone(cell, it) {
    if (it.subs) return it.subs.every(function (s) { return !!cell.t[s.id]; });
    return !!cell.t[it.id];
  }

  function leftoverInstances(kid, data, weekStart, rules) {
    rules = normalizeRules(rules);
    var targets = (rules.deduct_target[kid.id] || []).slice();
    var out = [];
    var i, d, key, cell;
    for (i = 0; i < 5; i++) {
      d = addDays(weekStart, i);
      key = fmt(d);
      cell = cellOf(data, kid.id, key);
      targets.forEach(function (id) {
        var it = findItem(kid, id);
        if (!it || it.weekly || it.weekendOnly) return;
        if (!itemApplies(it, d)) return;
        if (!instanceDone(cell, it)) {
          out.push({
            kidId: kid.id,
            dateKey: key,
            dayIndex: i,
            itemId: it.id,
            label: it.label,
            weekly: false
          });
        }
      });
    }
    for (i = 5; i < 7; i++) {
      d = addDays(weekStart, i);
      key = fmt(d);
      cell = cellOf(data, kid.id, key);
      targets.forEach(function (id) {
        var it = findItem(kid, id);
        if (!it || !it.weekendOnly) return;
        if (!instanceDone(cell, it)) {
          out.push({
            kidId: kid.id,
            dateKey: key,
            dayIndex: i,
            itemId: it.id,
            label: it.label,
            weekly: false
          });
        }
      });
    }
    targets.forEach(function (id) {
      var it = findItem(kid, id);
      if (!it || !it.weekly) return;
      var n = 0;
      for (var j = 0; j < 7; j++) {
        if (cellOf(data, kid.id, fmt(addDays(weekStart, j))).t[it.id]) n++;
      }
      var miss = Math.max(0, it.weekly - n);
      for (var k = 0; k < miss; k++) {
        out.push({
          kidId: kid.id,
          dateKey: fmt(weekStart),
          dayIndex: -1,
          itemId: it.id,
          label: it.label,
          weekly: true,
          n: n,
          target: it.weekly
        });
      }
    });
    return out;
  }

  function hasRegisteredHomework(kid, rules) {
    rules = normalizeRules(rules);
    var targets = rules.deduct_target[kid.id] || [];
    if (!targets.length) return false;
    return targets.some(function (id) { return !!findItem(kid, id); });
  }

  function slotCount(rules) {
    rules = normalizeRules(rules);
    return Math.max(1, Math.round(rules.base_minutes / rules.deduct_per_item));
  }

  function minutesFromRemaining(remaining, rules) {
    rules = normalizeRules(rules);
    return Math.max(rules.min_minutes, rules.base_minutes - remaining * rules.deduct_per_item);
  }

  function confirmAt(weekStart, confirmHour) {
    var sun = addDays(weekStart, 6);
    sun.setHours(confirmHour, 0, 0, 0);
    return sun;
  }

  function isConfirmedTime(weekStart, now, confirmHour) {
    return now.getTime() >= confirmAt(weekStart, confirmHour).getTime();
  }

  function getFreeze(data, kidId) {
    var g = data && data._game;
    if (!g || !g.confirmed) return null;
    if (g.minutes && Object.prototype.hasOwnProperty.call(g.minutes, kidId)) return g.minutes[kidId];
    return null;
  }

  function formulaText(rules, remaining, minutes) {
    rules = normalizeRules(rules);
    return "기본 " + rules.base_minutes + "분 − 남은 " + remaining + "개 × " + rules.deduct_per_item + "분 = " + minutes + "분";
  }

  function weekdayCounts(leftovers) {
    var c = [0, 0, 0, 0, 0, 0, 0];
    leftovers.forEach(function (it) {
      if (it.dayIndex >= 0 && it.dayIndex < 7) c[it.dayIndex]++;
    });
    return c;
  }

  function compute(kid, data, weekStart, rules, now) {
    rules = normalizeRules(rules);
    now = now || new Date();
    var slots = slotCount(rules);
    if (!hasRegisteredHomework(kid, rules)) {
      return {
        status: "unregistered",
        remaining: 0,
        minutes: null,
        liveMinutes: null,
        slots: slots,
        filled: 0,
        leftovers: [],
        dayCounts: [0, 0, 0, 0, 0, 0, 0],
        confirmed: false,
        frozen: false,
        pendingConfirm: !isConfirmedTime(weekStart, now, rules.confirm_hour),
        formula: ""
      };
    }
    var leftovers = leftoverInstances(kid, data, weekStart, rules);
    var remaining = leftovers.length;
    var live = minutesFromRemaining(remaining, rules);
    var confirmed = isConfirmedTime(weekStart, now, rules.confirm_hour);
    var frozenVal = getFreeze(data, kid.id);
    var frozen = confirmed && frozenVal != null;
    var minutes = frozen ? frozenVal : live;
    var status = remaining === 0 ? "complete" : (minutes <= rules.min_minutes ? "zero" : "active");
    return {
      status: status,
      remaining: remaining,
      minutes: minutes,
      liveMinutes: live,
      slots: slots,
      filled: Math.round(minutes / rules.deduct_per_item),
      leftovers: leftovers,
      dayCounts: weekdayCounts(leftovers),
      confirmed: confirmed,
      frozen: frozen,
      pendingConfirm: !confirmed,
      formula: formulaText(rules, remaining, live)
    };
  }

  function freezeAll(kids, data, weekStart, rules, now) {
    rules = normalizeRules(rules);
    now = now || new Date();
    var minutes = {};
    (kids || []).forEach(function (kid) {
      var c = compute(kid, data, weekStart, rules, now);
      minutes[kid.id] = c.status === "unregistered" ? null : c.liveMinutes;
    });
    return {
      confirmed: true,
      confirmedAt: now.toISOString(),
      minutes: minutes
    };
  }

  function mergeGameLock(base, local, remote) {
    base = base || {};
    local = local || {};
    remote = remote || {};
    if (local.confirmed && !base.confirmed) return JSON.parse(JSON.stringify(local));
    if (remote.confirmed) return JSON.parse(JSON.stringify(remote));
    if (local.confirmed) return JSON.parse(JSON.stringify(local));
    if (base.confirmed) return JSON.parse(JSON.stringify(base));
    return {};
  }

  function toggleLeftover(data, leftover, kid) {
    if (!leftover || leftover.weekly) return data;
    data[leftover.kidId] = data[leftover.kidId] || {};
    data[leftover.kidId][leftover.dateKey] = data[leftover.kidId][leftover.dateKey] || { t: {}, h: {} };
    var c = data[leftover.kidId][leftover.dateKey];
    c.t = c.t || {};
    var it = kid ? findItem(kid, leftover.itemId) : { id: leftover.itemId };
    var done = instanceDone(c, it);
    if (it.subs) {
      it.subs.forEach(function (s) { c.t[s.id] = !done; });
    } else {
      c.t[it.id] = !done;
    }
    return data;
  }

  return {
    RULE_WEEK: RULE_WEEK,
    DEFAULT_TARGETS: DEFAULT_TARGETS,
    defaultRules: defaultRules,
    normalizeRules: normalizeRules,
    findItem: findItem,
    leftoverInstances: leftoverInstances,
    hasRegisteredHomework: hasRegisteredHomework,
    slotCount: slotCount,
    minutesFromRemaining: minutesFromRemaining,
    isConfirmedTime: isConfirmedTime,
    confirmAt: confirmAt,
    compute: compute,
    freezeAll: freezeAll,
    mergeGameLock: mergeGameLock,
    toggleLeftover: toggleLeftover,
    formulaText: formulaText
  };
});
