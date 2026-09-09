import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyGetOblicGoogleId,
  googleBusinessIdsEqual,
} from "../../services/getoblicDirectory/getoblicGoogleId";

describe("GetOblic Google ID classifier", () => {
  it("classifies null as blank / not matchable", () => {
    assert.deepEqual(classifyGetOblicGoogleId(null), {
      raw: null,
      isMatchable: false,
      kind: "blank",
    });
  });

  it("classifies empty string as blank / not matchable", () => {
    assert.deepEqual(classifyGetOblicGoogleId(""), {
      raw: "",
      isMatchable: false,
      kind: "blank",
    });
  });

  it("classifies whitespace as blank / not matchable", () => {
    assert.deepEqual(classifyGetOblicGoogleId("   "), {
      raw: "   ",
      isMatchable: false,
      kind: "blank",
    });
  });

  it("classifies manual_entry as sentinel / not matchable", () => {
    assert.deepEqual(classifyGetOblicGoogleId("manual_entry"), {
      raw: "manual_entry",
      isMatchable: false,
      kind: "sentinel",
    });
  });

  it("classifies MANUAL_ENTRY as sentinel / not matchable", () => {
    assert.deepEqual(classifyGetOblicGoogleId("MANUAL_ENTRY"), {
      raw: "MANUAL_ENTRY",
      isMatchable: false,
      kind: "sentinel",
    });
  });

  it("classifies a proven legacy hex identifier as matchable", () => {
    const raw = "0x546e8d4e4b4a1d0b:0x9c3b2e8f1a2d4c6e";
    assert.deepEqual(classifyGetOblicGoogleId(raw), {
      raw,
      isMatchable: true,
      kind: "legacy_hex",
    });
  });

  it("classifies a proven ChIJ Place ID as matchable", () => {
    const raw = "ChIJN1t_tDeuEmsRUsoyG83frY4";
    assert.deepEqual(classifyGetOblicGoogleId(raw), {
      raw,
      isMatchable: true,
      kind: "chij",
    });
  });

  it("classifies numeric-only values as numeric / not matchable", () => {
    const raw = "178346283061208138";
    assert.deepEqual(classifyGetOblicGoogleId(raw), {
      raw,
      isMatchable: false,
      kind: "numeric",
    });
  });

  it("classifies a Google URL stored in _google_id as url / not matchable", () => {
    const raw =
      "https://local.google.com/place?id=381212099274464661&use=srp";
    assert.deepEqual(classifyGetOblicGoogleId(raw), {
      raw,
      isMatchable: false,
      kind: "url",
    });
  });

  it("classifies arbitrary free text as unknown / not matchable", () => {
    const raw = "Spritual and friendly";
    assert.deepEqual(classifyGetOblicGoogleId(raw), {
      raw,
      isMatchable: false,
      kind: "unknown",
    });
  });

  it("compares Google business identities after trim only", () => {
    assert.equal(googleBusinessIdsEqual("ChIJabc", "ChIJabc"), true);
    assert.equal(googleBusinessIdsEqual("  ChIJabc  ", "ChIJabc"), true);
    assert.equal(googleBusinessIdsEqual("ChIJabc", "ChIJxyz"), false);
    assert.equal(googleBusinessIdsEqual("", "ChIJabc"), false);
    assert.equal(googleBusinessIdsEqual(null, "ChIJabc"), false);
    assert.equal(googleBusinessIdsEqual("   ", "   "), false);
  });
});
