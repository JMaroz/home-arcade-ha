import { describe, it, expect } from "vitest";
import { integrationSettingsSchema, insertUserSchema } from "../../shared/schema";

describe("integrationSettingsSchema", () => {
  it("parses a complete valid object", () => {
    const input = {
      haBaseUrl: "https://ha.local:8123",
      haToken: "abc123",
      liveMode: true,
      endpoints: { snes: "https://example.com/webhook" },
      kioskMode: false,
      kioskPin: "1234",
      kioskCollectionId: null,
      raUsername: "retrouser",
      raToken: "ratoken",
      pcHostname: "MY-PC",
      pcOnlineEntityId: "binary_sensor.pc",
      pcCpuEntityId: "sensor.cpu",
      pcRamEntityId: "sensor.ram",
      pcAppEntityId: "sensor.app",
      controlDefaults: {},
    };
    const result = integrationSettingsSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.haBaseUrl).toBe("https://ha.local:8123");
      expect(result.data.liveMode).toBe(true);
    }
  });

  it("fills in defaults for an empty object", () => {
    const result = integrationSettingsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.haBaseUrl).toBe("https://homeassistant.local:8123");
      expect(result.data.haToken).toBe("");
      expect(result.data.liveMode).toBe(false);
      expect(result.data.kioskMode).toBe(false);
      expect(result.data.kioskCollectionId).toBe(null);
      expect(result.data.endpoints).toEqual({});
      expect(result.data.controlDefaults).toEqual({});
    }
  });

  it("rejects haBaseUrl longer than 2048 chars", () => {
    const result = integrationSettingsSchema.safeParse({
      haBaseUrl: "https://" + "a".repeat(2048),
    });
    expect(result.success).toBe(false);
  });

  it("rejects kioskPin longer than 8 chars", () => {
    const result = integrationSettingsSchema.safeParse({ kioskPin: "123456789" });
    expect(result.success).toBe(false);
  });

  it("accepts kioskCollectionId as a positive integer or null", () => {
    const r1 = integrationSettingsSchema.safeParse({ kioskCollectionId: 5 });
    expect(r1.success).toBe(true);
    const r2 = integrationSettingsSchema.safeParse({ kioskCollectionId: null });
    expect(r2.success).toBe(true);
  });

  it("rejects non-integer kioskCollectionId", () => {
    const result = integrationSettingsSchema.safeParse({ kioskCollectionId: 1.5 });
    expect(result.success).toBe(false);
  });

  it("coerces controlDefaults numeric keys", () => {
    const result = integrationSettingsSchema.safeParse({
      controlDefaults: { snes: { "0": "b", "1": "a" } },
    });
    expect(result.success).toBe(true);
  });

  it("validates wasmMode defaults and enum values", () => {
    const defaultRes = integrationSettingsSchema.safeParse({});
    expect(defaultRes.success).toBe(true);
    if (defaultRes.success) {
      expect(defaultRes.data.wasmMode).toBe("fallback");
    }

    expect(integrationSettingsSchema.safeParse({ wasmMode: "always" }).success).toBe(true);
    expect(integrationSettingsSchema.safeParse({ wasmMode: "fallback" }).success).toBe(true);
    expect(integrationSettingsSchema.safeParse({ wasmMode: "disabled" }).success).toBe(true);
    expect(integrationSettingsSchema.safeParse({ wasmMode: "invalid" }).success).toBe(false);
  });
});

describe("insertUserSchema", () => {
  it("accepts valid username and password", () => {
    const result = insertUserSchema.safeParse({
      username: "admin",
      password: "secret",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing username", () => {
    const result = insertUserSchema.safeParse({ password: "secret" });
    expect(result.success).toBe(false);
  });

  it("rejects missing password", () => {
    const result = insertUserSchema.safeParse({ username: "admin" });
    expect(result.success).toBe(false);
  });

  it("rejects empty object", () => {
    const result = insertUserSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
