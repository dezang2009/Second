import { describe, expect, it } from "vitest";
import { fill, formatMoney, josa } from "./text";

describe("조사", () => {
  it("받침에 맞춰 고른다", () => {
    expect(josa("지민이(가)")).toBe("지민이");
    expect(josa("서아이(가)")).toBe("서아가");
    expect(josa("엄마은(는)")).toBe("엄마는");
    expect(josa("아빠와(과)")).toBe("아빠와");
    expect(josa("동현을(를)")).toBe("동현을");
    expect(josa("서울(으)로")).toBe("서울로");
    expect(josa("부산(으)로")).toBe("부산으로");
  });

  it("빈칸을 채운다", () => {
    expect(fill("{a}이(가) {b}을(를) 만났다", { a: "하준", b: "지우" })).toBe("하준이 지우를 만났다");
  });
});

describe("돈 표시", () => {
  it("억과 만 원 단위", () => {
    expect(formatMoney(0)).toBe("0원");
    expect(formatMoney(500)).toBe("500만 원");
    expect(formatMoney(12300)).toBe("1억 2,300만 원");
    expect(formatMoney(-20000)).toBe("-2억 원");
  });
});
