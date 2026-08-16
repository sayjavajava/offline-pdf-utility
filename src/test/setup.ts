import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// jsdom implements neither of these, and both sit directly on the download
// path we are testing (see the audit's P1-9: the revoke must not fire in the
// same tick as the click). Stubbing them here lets tests observe the calls.
if (typeof URL.createObjectURL !== "function") {
  Object.defineProperty(URL, "createObjectURL", {
    writable: true,
    value: vi.fn(() => "blob:mock/00000000-0000-0000-0000-000000000000"),
  });
}
if (typeof URL.revokeObjectURL !== "function") {
  Object.defineProperty(URL, "revokeObjectURL", { writable: true, value: vi.fn() });
}

// jsdom's HTMLAnchorElement.click() would attempt a navigation it cannot
// perform and log a "Not implemented" error for every download test.
Object.defineProperty(HTMLAnchorElement.prototype, "click", {
  writable: true,
  value: vi.fn(),
});
