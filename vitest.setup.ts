// test/setup.ts
import { expect } from "vitest";
import * as ts from "typescript";

type HasDiagnostics = {
  diagnostics: readonly ts.Diagnostic[];
  formatted?: string; // optional pretty output from your helper
};

function getDiagnostics(
  received: HasDiagnostics | readonly ts.Diagnostic[]
): readonly ts.Diagnostic[] {
  return Array.isArray(received)
    ? received
    : received?.diagnostics ?? [];
}

function flattenMessage(messageText: string | ts.DiagnosticMessageChain): string {
  return ts.flattenDiagnosticMessageText(messageText, "\n");
}

function msgMatches(msg: string, pattern: RegExp | string): boolean {
  return pattern instanceof RegExp ? pattern.test(msg) : msg.trim() === pattern.trim();
}

function formatHost(): ts.FormatDiagnosticsHost {
  return {
    getCanonicalFileName: (f) => f,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => ts.sys.newLine,
  };
}

function format(diags: readonly ts.Diagnostic[]): string {
  try {
    return ts.formatDiagnosticsWithColorAndContext(diags, formatHost());
  } catch {
    return diags
      .map((d) => `TS${d.code}: ${flattenMessage(d.messageText)}`)
      .join("\n");
  }
}

expect.extend({
  toReportError(
    received: HasDiagnostics | readonly ts.Diagnostic[],
    code: number,
    message: RegExp | string
  ) {
    const diagnostics = getDiagnostics(received);

    const matching = diagnostics.filter((d) => {
      if (d.code !== code) return false;

      const text = flattenMessage(d.messageText);

      return msgMatches(text, message);
    });

    const pass = matching.length > 0;

    console.log(diagnostics)

    return {
      pass,
      message: () =>
        pass
          ? `Expected NOT to find TS${code} matching ${String(message)}, but found:\n${format(matching)}`
          : `Expected to find TS${code} matching ${String(message)}, but diagnostics were:\n${format(diagnostics)}`,
    };
  },
});

// Type augmentation for Vitest
declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Assertion<T = any> {
    toReportError(code: number, message: RegExp | string): void;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface AsymmetricMatchersContaining {
    toReportError(code: number, message: RegExp | string): void;
  }
}
