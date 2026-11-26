import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const source = fs.readFileSync(new URL("../ui/app.js", import.meta.url), "utf8");
test("project notices can translate before token metadata is rendered", () => {
  const context = vm.createContext({ document: { createElement: () => ({ dataset: {} }) },
    isToolActivity: () => false, esc: x => x, t: (key, vars) => `${key}:${vars.count}` });
  vm.runInContext(source.slice(source.indexOf("function entryEl("), source.indexOf("const INITIAL_ENTRY_LIMIT")), context);
  const notice = context.entryEl({ kind: "system", text: "", meta: { connectedProjects: ["test"] } });
  assert.equal(notice.innerHTML, "project.updatedNote:1");
});
test("speech stays a bubble during work; only completed runs fold with their tool details", () => {
  const node = () => ({ dataset: {}, children: [], appendChild(child) { this.children.push(child); } });
  const state = { summary: { busyInfo: [{ runId: "run-1" }] }, expandedActivity: new Set() };
  const context = vm.createContext({ state, document: { createElement: node }, rowByN: new Map(),
    seatAvatarHTML: () => "avatar", seatLabel: x => x, esc: x => x, hhmm: () => "12:00", renderMD: x => x,
    t: () => "작업 과정 보기", hiddenEntry: () => false, dayOf: () => null,
    appendActivityRun: (parent, entries) => parent.appendChild({ className: "tool-run", entries }) });
  vm.runInContext(source.slice(source.indexOf("function isToolActivity("), source.indexOf("const INITIAL_ENTRY_LIMIT")), context);
  vm.runInContext("const actualEntryEl = entryEl; entryEl = e => e.meta?.publicSpeech ? actualEntryEl(e) : ({className:e.kind, text:e.text});", context);
  vm.runInContext(source.slice(source.indexOf("function appendEntryRange("), source.indexOf("function renderedStartIndex(")), context);
  const speech = { n: 1, kind: "activity", author: "codex", text: "확인하고 수정할게.", meta: { runId: "run-1", publicSpeech: true } };
  const entries = [speech, ...Array.from({ length: 12 }, (_, i) => ({ n: i + 2, kind: "activity", author: "codex", text: "tool", meta: { runId: "run-1" } })),
    { n: 14, kind: "agent", author: "codex", text: "완료" }];
  const active = node(); context.appendEntryRange(active, entries);
  assert.equal(active.children.length, 3);
  assert.match(active.children[0].className, /public-speech/);
  assert.match(active.children[0].innerHTML, /확인하고 수정할게/);
  assert.equal(active.children[1].className, "tool-run");
  state.summary.busyInfo = [];
  const completed = node(); context.appendEntryRange(completed, entries);
  assert.equal(completed.children.length, 3);
  assert.match(completed.children[0].className, /public-speech/);
  assert.equal(completed.children[1].className, "completed-work");
  assert.equal(completed.children[1].open, false);
  completed.children[1].open = true; completed.children[1].ontoggle();
  assert.equal(completed.children[1].children.length, 13);
  completed.children[1].ontoggle();
  assert.equal(completed.children[1].children.length, 13);
  for (const author of ["codex", "claude", "gemini"]) {
    const peer = node();
    context.appendEntryRange(peer, [{ ...speech, author }]);
    assert.match(peer.children[0].className, /public-speech/);
  }
  context.t = key => key;
  const mixed = node();
  context.appendEntryRange(mixed, [
    { n: 20, kind: "activity", author: "codex", text: "child", meta: { runId: "run-1", subagent: { id: "child" } } },
    { ...speech, n: 21 },
    entries[1],
  ]);
  assert.equal(mixed.children.length, 3);
  assert.equal(mixed.children[0].children[0].textContent, "progress.subagentWorkDetails");
  assert.match(mixed.children[1].className, /public-speech/);
  assert.equal(mixed.children[2].children[0].textContent, "progress.showActions");

});

test("live cards use configured names and roles for all providers", () => {
  const context = vm.createContext({
    state: { live: {} }, document: { createElement: () => ({ dataset: {} }) },
    seatAvatarHTML: () => "avatar", seatLabel: id => ({ codex: "빵빵이 · 주도", claude: "옥지 · 검토", gemini: "뚱뚱이 · 문서" })[id],
    esc: x => x, t: x => x, chat: { appendChild() {} }, liveObserver: { observe() {} },
    applyLiveRef() {}, scrollBottom() {}, scheduleVisibility() {},
  });
  vm.runInContext(source.slice(source.indexOf("function ensureLive("), source.indexOf("function progressText(")), context);
  for (const id of ["codex", "claude", "gemini"]) {
    const live = context.ensureLive(id);
    assert.ok(live.el.innerHTML.includes(`<span class="who">${context.seatLabel(id)}</span>`));
  }
});
