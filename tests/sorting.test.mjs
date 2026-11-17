import { test } from "node:test";
import assert from "node:assert/strict";
import { sortDurationRows, formatDuration } from "../plugins/PlaylistDurationSort/src/sorting.ts";

const rows = [
  {id: "a", originalIndex: 0, duration: 7200},
  {id: "b", originalIndex: 1, duration: 1200},
  {id: "c", originalIndex: 2},
  {id: "d", originalIndex: 3, duration: 1200},
];
test("shortest first: stable ties and unknown values last", () => {
  assert.deepEqual(sortDurationRows(rows, "shortest").map((r) => r.id), ["b","d","a","c"]);
});
test("longest first: stable ties and unknown values last", () => {
  assert.deepEqual(sortDurationRows(rows, "longest").map((r) => r.id), ["a","b","d","c"]);
});
test("the source array is never modified", () => {
  sortDurationRows(rows, "longest");
  assert.deepEqual(rows.map((r) => r.id), ["a","b","c","d"]);
});
test("formatting", () => {
  assert.equal(formatDuration(7260), "2h 1m");
  assert.equal(formatDuration(2100), "35m");
});
