export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Spawn a process, capture stdout/stderr, and kill it if it exceeds the timeout. */
export async function spawnWithTimeout(cmd: string[], label: string, timeoutMs: number): Promise<SpawnResult> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error(`Invalid timeout: ${timeoutMs}`);
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const race = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    const [stdout, stderr, exitCode] = await Promise.race([
      Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]),
      race,
    ]);
    return { stdout, stderr, exitCode };
  } finally {
    clearTimeout(timer);
    if (proc.exitCode === null) {
      proc.kill();
      await proc.exited.catch(() => {});
    }
  }
}
