import { describe, it, expect } from "vitest";
import {
  attachmentPath,
  captureLine,
  fileTooLarge,
  MAX_UPLOAD_BYTES,
  readAttachment,
  sanitizeFilename,
  SIGNED_URL_SECONDS,
} from "../src/lib/capture";

describe("sanitizeFilename", () => {
  it("keeps ordinary names", () => {
    expect(sanitizeFilename("receipt.jpg")).toBe("receipt.jpg");
    expect(sanitizeFilename("Council_Tax-2026.pdf")).toBe("Council_Tax-2026.pdf");
  });

  it("strips directories from both path styles", () => {
    expect(sanitizeFilename("/home/jay/receipt.jpg")).toBe("receipt.jpg");
    expect(sanitizeFilename("C:\\photos\\receipt.jpg")).toBe("receipt.jpg");
  });

  it("collapses unsafe characters", () => {
    expect(sanitizeFilename("MOT cert (Zafira) £30.pdf")).toBe("MOT-cert-Zafira-30.pdf");
  });

  it("never returns an empty key", () => {
    expect(sanitizeFilename("")).toBe("file");
    expect(sanitizeFilename("£££")).toBe("file");
    expect(sanitizeFilename("///")).toBe("file");
  });
});

describe("attachmentPath", () => {
  it("leads with the user id — the folder the RLS policies check", () => {
    const p = attachmentPath("uid-123", "bill.pdf", 1755400000000);
    expect(p).toBe("uid-123/1755400000000-bill.pdf");
    expect(p.split("/")[0]).toBe("uid-123");
  });
});

describe("captureLine", () => {
  it("reads as words, not as a path", () => {
    expect(captureLine("photo", "IMG_2041.jpg")).toBe("Photo — IMG_2041.jpg");
    expect(captureLine("document", "insurance.pdf")).toBe("Document — insurance.pdf");
  });
});

describe("fileTooLarge", () => {
  it("accepts up to the ceiling and refuses past it", () => {
    expect(fileTooLarge(MAX_UPLOAD_BYTES)).toBe(false);
    expect(fileTooLarge(MAX_UPLOAD_BYTES + 1)).toBe(true);
    expect(fileTooLarge(0)).toBe(false);
  });
});

describe("readAttachment — jsonb is never trusted", () => {
  it("reads a well-formed attachment", () => {
    expect(
      readAttachment({ attachment: { path: "u/1-a.jpg", mime: "image/jpeg", size: 12345 } })
    ).toEqual({ path: "u/1-a.jpg", mime: "image/jpeg", size: 12345 });
  });

  it("degrades missing optional fields to null, never invented values", () => {
    expect(readAttachment({ attachment: { path: "u/1-a.jpg" } })).toEqual({
      path: "u/1-a.jpg",
      mime: null,
      size: null,
    });
    expect(
      readAttachment({ attachment: { path: "u/1-a.jpg", mime: 7, size: "big" } })
    ).toEqual({ path: "u/1-a.jpg", mime: null, size: null });
  });

  it("returns null for anything malformed — a bad row is a text capture, not a crash", () => {
    expect(readAttachment(null)).toBeNull();
    expect(readAttachment(undefined)).toBeNull();
    expect(readAttachment("string")).toBeNull();
    expect(readAttachment({})).toBeNull();
    expect(readAttachment({ attachment: "path.jpg" })).toBeNull();
    expect(readAttachment({ attachment: { path: "" } })).toBeNull();
    expect(readAttachment({ attachment: { path: "   " } })).toBeNull();
    expect(readAttachment({ attachment: { path: 42 } })).toBeNull();
  });

  it("rejects non-finite sizes", () => {
    expect(readAttachment({ attachment: { path: "u/a", size: Infinity } })).toEqual({
      path: "u/a",
      mime: null,
      size: null,
    });
  });
});

describe("SIGNED_URL_SECONDS", () => {
  it("is the 5-minute cog-docs rule", () => {
    expect(SIGNED_URL_SECONDS).toBe(300);
  });
});
