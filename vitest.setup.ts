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

function msgMatches(msg: string, messages: string[]): boolean {
  return messages.every((pattern) => msg.includes(pattern));
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
  toReportError(received: HasDiagnostics, code: number, message: string) {
    const diagnostics = received.diagnostics;

    const matching = diagnostics.filter((d) => {
      if (d.code !== code) return false;

      const text = flattenMessage(d.messageText);

      return msgMatches(
        text,
        message.split("\n").map((msg) => msg.trim())
      );
    });

    const pass = matching.length > 0;

    return {
      pass,
      message: () =>
        pass
          ? `Expected NOT to find TS${code} matching ${String(
              message
            )}, but found:\n${format(matching)}`
          : `Expected to find TS${code} matching ${String(
              message
            )}, but diagnostics were:\n${format(diagnostics)}`,
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
