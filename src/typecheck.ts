import path from "node:path";
import process from "node:process";

import * as ts from "typescript";

export type FileMap = Record<string, string>;

function formatHost(): ts.FormatDiagnosticsHost {
  return {
    getCanonicalFileName: (f) => f,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => ts.sys.newLine,
  };
}

export function loadTsConfig(
  tsconfigPath = "tsconfig.json"
): ts.CompilerOptions {
  const cfg = ts.readConfigFile(tsconfigPath, ts.sys.readFile);

  if (cfg.error)
    throw new Error(ts.formatDiagnostics([cfg.error], formatHost()));

  const parsed = ts.parseJsonConfigFileContent(
    cfg.config,
    ts.sys,
    path.dirname(tsconfigPath)
  );

  return parsed.options;
}

export async function typecheck(
  files: FileMap,
  opts: ts.CompilerOptions = {}
): Promise<{
  byCode: (code: number) => ts.Diagnostic[];
  diagnostics: readonly ts.Diagnostic[];
  formatted: string;
  messages: string[];
}> {
  const defaults: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
  };

  const options = { ...defaults, ...opts };

  const cwd = process.cwd();

  const toAbs = (p: string) =>
    path.isAbsolute(p) ? path.normalize(p) : path.join(cwd, p);

  const mem = new Map<string, string>(
    Object.entries(files).map(([k, v]) => [toAbs(k), v] as const)
  );

  const baseHost = ts.createCompilerHost(options, /*setParentNodes*/ true);

  const host: ts.CompilerHost = {
    ...baseHost,
    fileExists: (f) => mem.has(toAbs(f)) || baseHost.fileExists(toAbs(f)),
    getSourceFile: (f, lang) => {
      const abs = toAbs(f);

      const text = mem.get(abs);

      if (text != null) return ts.createSourceFile(abs, text, lang, true);

      return baseHost.getSourceFile(abs, lang);
    },
    readFile: (f) => mem.get(toAbs(f)) ?? baseHost.readFile(toAbs(f)),
    writeFile: () => {},
  };

  const rootNames = [...mem.keys()];

  const program = ts.createProgram({ rootNames, options, host });

  const diagnostics = [
    ...program.getConfigFileParsingDiagnostics(),
    ...program.getOptionsDiagnostics(),
    ...program.getSyntacticDiagnostics(),
    ...program.getGlobalDiagnostics(),
    ...program.getSemanticDiagnostics(),
  ];

  return {
    byCode: (code) => diagnostics.filter((d) => d.code === code),
    diagnostics,
    formatted: ts.formatDiagnosticsWithColorAndContext(
      diagnostics,
      formatHost()
    ),
    messages: diagnostics.map((d) =>
      ts.flattenDiagnosticMessageText(d.messageText, "\n")
    ),
  };
}
