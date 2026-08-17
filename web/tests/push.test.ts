import { describe, it, expect } from "vitest";
import {
  captureUrl,
  capturePushPayload,
  readDoor,
  subscriptionIsGone,
  subscriptionRow,
  urlBase64ToUint8Array,
} from "../src/lib/push";

describe("readDoor — a URL param is never trusted", () => {
  it("accepts the two real doors", () => {
    expect(readDoor("photo")).toBe("photo");
    expect(readDoor("document")).toBe("document");
  });
  it("returns null for anything else", () => {
    expect(readDoor("camera")).toBeNull();
    expect(readDoor("")).toBeNull();
    expect(readDoor(undefined)).toBeNull();
    expect(readDoor(["photo"])).toBeNull();
  });
});

describe("captureUrl", () => {
  it("builds the relay landing URL", () => {
    expect(captureUrl("https://the-brain-pi.vercel.app")).toBe(
      "https://the-brain-pi.vercel.app/capture?door=photo"
    );
  });
  it("survives a trailing slash on the origin", () => {
    expect(captureUrl("https://x.test/", "document")).toBe(
      "https://x.test/capture?door=document"
    );
  });
});

describe("urlBase64ToUint8Array", () => {
  it("decodes base64url including - and _ characters", () => {
    // "any carnal pleasure." — classic vector whose base64 carries + and /
    const b64url = "YW55IGNhcm5hbCBwbGVhc3VyZS4";
    const bytes = urlBase64ToUint8Array(b64url);
    expect(new TextDecoder().decode(bytes)).toBe("any carnal pleasure.");
  });
  it("handles unpadded input of every remainder length", () => {
    expect(new TextDecoder().decode(urlBase64ToUint8Array("YQ"))).toBe("a");
    expect(new TextDecoder().decode(urlBase64ToUint8Array("YWI"))).toBe("ab");
    expect(new TextDecoder().decode(urlBase64ToUint8Array("YWJj"))).toBe("abc");
  });
});

describe("subscriptionRow — a subscription without keys is not a subscription", () => {
  const good = {
    endpoint: "https://push.example/abc",
    keys: { p256dh: "pk", auth: "ak" },
  };
  it("shapes a well-formed subscription", () => {
    expect(subscriptionRow(good)).toEqual({
      endpoint: "https://push.example/abc",
      p256dh: "pk",
      auth: "ak",
    });
  });
  it("returns null for anything unusable", () => {
    expect(subscriptionRow(null)).toBeNull();
    expect(subscriptionRow({})).toBeNull();
    expect(subscriptionRow({ endpoint: "" })).toBeNull();
    expect(subscriptionRow({ endpoint: "x" })).toBeNull();
    expect(subscriptionRow({ endpoint: "x", keys: {} })).toBeNull();
    expect(subscriptionRow({ endpoint: "x", keys: { p256dh: "pk" } })).toBeNull();
    expect(subscriptionRow({ endpoint: "x", keys: { p256dh: "", auth: "a" } })).toBeNull();
  });
});

describe("capturePushPayload", () => {
  it("is JSON carrying a title and the photo-door URL", () => {
    const parsed = JSON.parse(capturePushPayload("https://x.test"));
    expect(parsed.title).toContain("THE BRAIN");
    expect(parsed.url).toBe("https://x.test/capture?door=photo");
  });
});

describe("subscriptionIsGone — only revoked, never rate-limited", () => {
  it("treats 404 and 410 as gone", () => {
    expect(subscriptionIsGone(404)).toBe(true);
    expect(subscriptionIsGone(410)).toBe(true);
  });
  it("keeps the row for transient failures — deleting on a 429 would silently unsubscribe a working phone", () => {
    expect(subscriptionIsGone(429)).toBe(false);
    expect(subscriptionIsGone(500)).toBe(false);
    expect(subscriptionIsGone(0)).toBe(false);
  });
});
