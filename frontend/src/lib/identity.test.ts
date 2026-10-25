import { describe, expect, test } from "bun:test";

import { ageOn, formatCpf, validateIdentity } from "./identity";

const TODAY = new Date(2026, 9, 11);
const valid = { fullName: "Maria da Silva", cpf: "529.982.247-25", birthDate: "1990-05-20" };

describe("formatCpf", () => {
  test("masks as it's typed", () => {
    expect(formatCpf("529")).toBe("529");
    expect(formatCpf("5299")).toBe("529.9");
    expect(formatCpf("5299822")).toBe("529.982.2");
    expect(formatCpf("5299822472")).toBe("529.982.247-2");
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
  });

  test("drops letters, symbols and extra digits", () => {
    expect(formatCpf("529.982.247-25999")).toBe("529.982.247-25");
    expect(formatCpf("abc529x982")).toBe("529.982");
    expect(formatCpf("")).toBe("");
  });
});

describe("ageOn", () => {
  test("counts whole years, the birthday included", () => {
    expect(ageOn("2008-10-11", TODAY)).toBe(18);
    expect(ageOn("2008-10-12", TODAY)).toBe(17);
  });

  test("rejects dates that don't exist", () => {
    expect(ageOn("2001-02-29", TODAY)).toBeNull();
    expect(ageOn("", TODAY)).toBeNull();
  });
});

describe("validateIdentity", () => {
  test("valid details have no errors", () => {
    expect(validateIdentity(valid, TODAY)).toEqual({});
    expect(validateIdentity({ ...valid, cpf: "52998224725" }, TODAY)).toEqual({});
  });

  test("demo: any 11 digits pass, check digits aren't verified", () => {
    expect(validateIdentity({ ...valid, cpf: "123.456.789-01" }, TODAY)).toEqual({});
  });

  test("an incomplete CPF asks for 11 digits", () => {
    expect(validateIdentity({ ...valid, cpf: "529.982.247" }, TODAY).cpf).toBe("Enter your 11-digit CPF");
  });

  test("each field reports its own error", () => {
    const errors = validateIdentity({ fullName: "Maria", cpf: "529.982.247", birthDate: "2010-01-01" }, TODAY);
    expect(Object.keys(errors).sort()).toEqual(["birthDate", "cpf", "fullName"]);
    expect(errors.birthDate).toBe("You must be at least 18 years old");
  });

  test("a date of birth in the future is invalid", () => {
    expect(validateIdentity({ ...valid, birthDate: "2030-01-01" }, TODAY).birthDate).toBe("Enter a valid date of birth");
  });

  test("a year before 1900 or longer than 4 digits is invalid", () => {
    expect(validateIdentity({ ...valid, birthDate: "1899-12-31" }, TODAY).birthDate).toBe("Enter a valid date of birth");
    expect(validateIdentity({ ...valid, birthDate: "19900-05-20" }, TODAY).birthDate).toBe("Enter a valid date of birth");
    expect(validateIdentity({ ...valid, birthDate: "1900-01-01" }, TODAY)).toEqual({});
  });
});
