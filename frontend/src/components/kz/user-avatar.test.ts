import { describe, expect, test } from "bun:test";

import { initials } from "./user-avatar";

describe("initials", () => {
  test("takes up to two parts of the email's local part", () => {
    expect(initials("sofia.prado@correo.com")).toBe("SP");
    expect(initials("demo@kotizi.app")).toBe("D");
    expect(initials("ana_maria-silva@x.io")).toBe("AM");
  });

  test("works with a plain name", () => {
    expect(initials("Sofia Prado")).toBe("SP");
  });
});
