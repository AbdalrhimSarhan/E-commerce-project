/**
 * Minimal line logger. It never receives the API key: callers only pass
 * tool names, request ids, outcomes, durations and error codes. As a second
 * line of defence, `redact` masks anything that looks like a key or a bearer
 * token before a line is written.
 */
export type LogSink = (line: string) => void;

let sink: LogSink = (line) => {
  process.stdout.write(`${line}\n`);
};

/** Replaces the output (used by tests to capture log lines). */
export function setLogSink(next: LogSink): void {
  sink = next;
}

const SECRET_PATTERNS: RegExp[] = [
  /pmk_[A-Za-z0-9_-]+/g, // API keys
  /Bearer\s+\S+/gi, // Authorization header values
];

export function redact(text: string): string {
  return SECRET_PATTERNS.reduce((out, pattern) => out.replace(pattern, '[REDACTED]'), text);
}

export function log(message: string): void {
  sink(redact(`${new Date().toISOString()} [mcp] ${message}`));
}

export interface ToolCallLog {
  tool: string;
  requestId: string;
  outcome: 'ok' | 'error';
  durationMs: number;
  errorCode?: string;
}

/** One line per tool call. */
export function logToolCall(entry: ToolCallLog): void {
  const code = entry.errorCode ? ` code=${entry.errorCode}` : '';
  log(
    `tool=${entry.tool} requestId=${entry.requestId} outcome=${entry.outcome}${code} durationMs=${entry.durationMs}`,
  );
}
