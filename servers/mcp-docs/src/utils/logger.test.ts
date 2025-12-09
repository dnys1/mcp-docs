import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { logger } from "./logger.js";

describe("logger", () => {
  let originalLogLevel: string | undefined;
  let originalLogFormat: string | undefined;
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let consoleWarnSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    originalLogLevel = process.env.LOG_LEVEL;
    originalLogFormat = process.env.LOG_FORMAT;
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalLogLevel === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = originalLogLevel;
    }
    if (originalLogFormat === undefined) {
      delete process.env.LOG_FORMAT;
    } else {
      process.env.LOG_FORMAT = originalLogFormat;
    }
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe("log levels", () => {
    test("logs info by default", () => {
      delete process.env.LOG_LEVEL;
      logger.info("test message");
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    test("does not log debug when level is info", () => {
      process.env.LOG_LEVEL = "info";
      logger.debug("debug message");
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    test("logs debug when level is debug", () => {
      process.env.LOG_LEVEL = "debug";
      logger.debug("debug message");
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    test("logs error when level is error", () => {
      process.env.LOG_LEVEL = "error";
      logger.error("error message");
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    test("does not log info when level is error", () => {
      process.env.LOG_LEVEL = "error";
      logger.info("info message");
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    test("uses warn console for warn level", () => {
      process.env.LOG_LEVEL = "warn";
      logger.warn("warning message");
      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });

  describe("log format", () => {
    test("outputs text format by default", () => {
      delete process.env.LOG_FORMAT;
      logger.info("test");
      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("[INFO");
      expect(output).toContain("test");
    });

    test("outputs JSON format when configured", () => {
      process.env.LOG_FORMAT = "json";
      logger.info("test message");
      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.level).toBe("info");
      expect(parsed.message).toBe("test message");
      expect(parsed.timestamp).toBeDefined();
    });
  });

  describe("context", () => {
    test("includes context in text format", () => {
      process.env.LOG_FORMAT = "text";
      logger.info("test", { foo: "bar", count: 5 });
      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain('foo="bar"');
      expect(output).toContain("count=5");
    });

    test("includes context in JSON format", () => {
      process.env.LOG_FORMAT = "json";
      logger.info("test", { foo: "bar", count: 5 });
      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.context.foo).toBe("bar");
      expect(parsed.context.count).toBe(5);
    });

    test("omits context key when no context provided", () => {
      process.env.LOG_FORMAT = "json";
      logger.info("test");
      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.context).toBeUndefined();
    });
  });

  describe("child logger", () => {
    test("creates child with preset context", () => {
      process.env.LOG_FORMAT = "json";
      const child = logger.child({ source: "bun", requestId: "123" });
      child.info("test");
      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.context.source).toBe("bun");
      expect(parsed.context.requestId).toBe("123");
    });

    test("merges child context with call context", () => {
      process.env.LOG_FORMAT = "json";
      const child = logger.child({ source: "bun" });
      child.info("test", { extra: "data" });
      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.context.source).toBe("bun");
      expect(parsed.context.extra).toBe("data");
    });

    test("call context overrides child context", () => {
      process.env.LOG_FORMAT = "json";
      const child = logger.child({ value: "original" });
      child.info("test", { value: "override" });
      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.context.value).toBe("override");
    });
  });
});
