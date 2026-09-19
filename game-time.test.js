var assert = require("assert");
var GT = require("./game-time.js");

var KIDS = [
  {
    id: "hajoo", name: "김하주",
    groups: [{
      name: "핵심",
      items: [
        { id: "qt", label: "큐티" },
        { id: "ma_calc", label: "연산 1장" },
        { id: "en_focus", label: "집중듣기" },
        { id: "hr_day", label: "그날의 학습하기" }
      ]
    }]
  },
  {
    id: "empty", name: "미등록아이",
    groups: [{ name: "없음", items: [{ id: "other", label: "기타" }] }]
  }
];

function mon(y, m, d) { return new Date(y, m - 1, d); }
var WEEK = mon(2026, 9, 14); // 월
var FRI_NIGHT = new Date(2026, 8, 18, 20, 0, 0);
var SUN_NIGHT = new Date(2026, 8, 20, 21, 0, 0);
var SUN_EVE = new Date(2026, 8, 20, 20, 59, 0);

function mark(data, kidId, dateKey, ids) {
  data[kidId] = data[kidId] || {};
  data[kidId][dateKey] = data[kidId][dateKey] || { t: {}, h: {} };
  ids.forEach(function (id) { data[kidId][dateKey].t[id] = true; });
}

function fillWeek(data, kidId, except) {
  except = except || {};
  var ids = ["qt", "ma_calc", "en_focus", "hr_day"];
  for (var i = 0; i < 5; i++) {
    var d = new Date(WEEK.getFullYear(), WEEK.getMonth(), WEEK.getDate() + i);
    var key = d.getFullYear() + "-09-" + (d.getDate() < 10 ? "0" : "") + d.getDate();
    var skip = except[key] || [];
    mark(data, kidId, key, ids.filter(function (id) { return skip.indexOf(id) < 0; }));
  }
}

var rules = GT.defaultRules();

// 남은 0·1·2·3·4개
[0, 1, 2, 3, 4].forEach(function (n) {
  var data = {};
  var skip = {};
  var ids = ["qt", "ma_calc", "en_focus", "hr_day"];
  for (var i = 0; i < n; i++) skip["2026-09-14"] = (skip["2026-09-14"] || []).concat(ids[i]);
  fillWeek(data, "hajoo", skip);
  var c = GT.compute(KIDS[0], data, WEEK, rules, FRI_NIGHT);
  assert.strictEqual(c.remaining, n, "remaining " + n);
  assert.strictEqual(c.minutes, 120 - n * 30, "minutes for " + n);
});

// 5개 이상 → 0분 (안 A, min_minutes 0)
var over = {};
fillWeek(over, "hajoo", { "2026-09-14": ["qt", "ma_calc", "en_focus", "hr_day"], "2026-09-15": ["qt"] });
var c5 = GT.compute(KIDS[0], over, WEEK, rules, FRI_NIGHT);
assert.ok(c5.remaining >= 5, "5+ remaining");
assert.strictEqual(c5.minutes, 0, "5+ → 0분");

// 규칙 변경이 코드 없이 반영
var custom = GT.normalizeRules({ base_minutes: 90, deduct_per_item: 15, min_minutes: 30 });
assert.strictEqual(GT.minutesFromRemaining(2, custom), 60);
assert.strictEqual(GT.minutesFromRemaining(10, custom), 30);
assert.strictEqual(GT.slotCount(custom), 6);

// 미등록
var un = GT.compute(KIDS[1], {}, WEEK, rules, FRI_NIGHT);
assert.strictEqual(un.status, "unregistered");
assert.strictEqual(un.minutes, null);

// 전부 완료 → 120분
var done = {};
fillWeek(done, "hajoo", {});
var c0 = GT.compute(KIDS[0], done, WEEK, rules, FRI_NIGHT);
assert.strictEqual(c0.status, "complete");
assert.strictEqual(c0.minutes, 120);
assert.strictEqual(c0.remaining, 0);

// 확정 시각
assert.strictEqual(GT.isConfirmedTime(WEEK, SUN_EVE, 21), false);
assert.strictEqual(GT.isConfirmedTime(WEEK, SUN_NIGHT, 21), true);

// 확정 후 체크해도 값 고정
var locked = {};
fillWeek(locked, "hajoo", { "2026-09-14": ["qt"] });
locked._game = { confirmed: true, confirmedAt: SUN_NIGHT.toISOString(), minutes: { hajoo: 90 } };
var before = GT.compute(KIDS[0], locked, WEEK, rules, SUN_NIGHT);
assert.strictEqual(before.minutes, 90);
GT.toggleLeftover(locked, before.leftovers[0], KIDS[0]);
var after = GT.compute(KIDS[0], locked, WEEK, rules, SUN_NIGHT);
assert.strictEqual(after.liveMinutes, 120, "live moved");
assert.strictEqual(after.minutes, 90, "frozen stays");
assert.ok(after.frozen);

// 지난 주 값이 이번 주에 덮이지 않음
var thisWeek = {};
fillWeek(thisWeek, "hajoo", { "2026-09-14": ["qt", "ma_calc"] });
var lastFreeze = { confirmed: true, minutes: { hajoo: 30 } };
assert.strictEqual(GT.compute(KIDS[0], thisWeek, WEEK, rules, FRI_NIGHT).minutes, 60);
assert.strictEqual(GT.compute(KIDS[0], { _game: lastFreeze, hajoo: {} }, mon(2026, 9, 7), rules, FRI_NIGHT).minutes, 30);

// 체크 시 +30, 해제 시 되돌림
var live = {};
fillWeek(live, "hajoo", { "2026-09-14": ["qt"] });
var a = GT.compute(KIDS[0], live, WEEK, rules, FRI_NIGHT);
assert.strictEqual(a.minutes, 90);
GT.toggleLeftover(live, a.leftovers[0], KIDS[0]);
assert.strictEqual(GT.compute(KIDS[0], live, WEEK, rules, FRI_NIGHT).minutes, 120);
GT.toggleLeftover(live, a.leftovers[0], KIDS[0]);
assert.strictEqual(GT.compute(KIDS[0], live, WEEK, rules, FRI_NIGHT).minutes, 90);

// 전체 숙제는 세지 않는다 (핵심이 아닌 항목)
var extraKid = {
  id: "hajoo",
  groups: [{
    name: "혼합",
    items: [
      { id: "qt", label: "큐티" },
      { id: "ma_calc", label: "연산 1장" },
      { id: "en_focus", label: "집중듣기" },
      { id: "hr_day", label: "그날의 학습하기" },
      { id: "en_work", label: "문제집 풀기" }
    ]
  }]
};
var onlyExtra = {};
fillWeek(onlyExtra, "hajoo", {});
assert.strictEqual(GT.compute(extraKid, onlyExtra, WEEK, rules, FRI_NIGHT).remaining, 0);

assert.strictEqual(GT.lastNameChar({id:"hajoo", name:"김하주"}, rules), "주");
assert.strictEqual(GT.lastNameChar({id:"hayoo", name:"김하유"}, rules), "유");
assert.strictEqual(GT.lastNameChar({id:"haseo", name:"김하서"}, rules), "서");
var withPhoto = GT.normalizeRules({
  child_master: { hajoo: { photo_url: "https://example.com/a.jpg", emoji: "👧" } }
});
assert.ok(GT.avatarHTML({id:"hajoo", name:"김하주"}, withPhoto).indexOf("<img") >= 0);
assert.ok(GT.avatarHTML({id:"hajoo", name:"김하주"}, rules).indexOf("주") >= 0);
assert.ok(GT.avatarHTML({id:"hajoo", name:"김하주"}, rules).indexOf("👧") < 0);

console.log("game-time 테스트 통과");
