import * as ts from "typescript";
import { expect } from "vitest";

type HasDiagnostics = {
  diagnostics: readonly ts.Diagnostic[];
  formatted?: string;
};

function flattenMessage(
  messageText: string | ts.DiagnosticMessageChain
): string {
  return ts.flattenDiagnosticMessageText(messageText, "\n");
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
    return ts.formatDiagnostics(diags, formatHost());
  } catch {
    return diags
      .map((d) => `TS-${d.code}: ${flattenMessage(d.messageText)}`)
      .join("\n");
  }
}

expect.extend({
  toReportError(received: HasDiagnostics, code: number, message: string) {
    const diagnostics = received.diagnostics;

    const report = format(diagnostics);

    const pass =
      diagnostics.some((d) => d.code === code) &&
      message
        .split("\n")
        .map((line) => line.trim())
        .every((line) => report.includes(line));

    return {
      pass,
      message: () =>
        pass
          ? `Expected NOT to find TS-${code} matching ${String(
              message
            )}, but found:\n${report}`
          : `Expected to find TS-${code} matching ${String(
              message
            )}, but diagnostics were:\n${report}`,
    };
  },
});

declare module "vitest" {
  interface Assertion {
    toReportError(code: number, message: string): void;
  }

  interface AsymmetricMatchersContaining {
    toReportError(code: number, message: string): void;
  }
}
