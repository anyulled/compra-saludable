import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repositoryRoot = process.cwd();
const migrationsDirectory = resolve(repositoryRoot, "supabase/migrations");
const workDirectory = await mkdtemp(join(tmpdir(), "mesa-supabase-dry-run-"));
let stackMayBeRunning = false;

function runSupabase(args, options = {}) {
  const result = spawnSync("supabase", args, {
    cwd: workDirectory,
    stdio: "inherit",
    ...options,
  });

  if (result.error?.code === "ENOENT") {
    throw new Error(
      "Supabase CLI is required for this hook. Install it (see docs/operaciones-terminal.md) and retry.",
    );
  }

  if (result.status !== 0) {
    throw new Error(`supabase ${args.join(" ")} failed with exit code ${result.status ?? 1}.`);
  }
}

try {
  const migrationFiles = (await readdir(migrationsDirectory)).filter((file) =>
    file.endsWith(".sql"),
  );

  if (migrationFiles.length === 0) {
    console.log("No Supabase SQL migrations found; skipping local dry-run.");
  } else {
    const dockerCheck = spawnSync("docker", ["info"], { stdio: "ignore" });
    if (dockerCheck.error?.code === "ENOENT" || dockerCheck.status !== 0) {
      throw new Error(
        "Docker must be installed and running for the isolated Supabase migration dry-run.",
      );
    }

    console.log("Starting a disposable local Supabase stack (no remote project is linked).");
    const gitInit = spawnSync("git", ["init", "--quiet"], {
      cwd: workDirectory,
      stdio: "inherit",
    });
    if (gitInit.status !== 0) {
      throw new Error(`git init failed with exit code ${gitInit.status ?? 1}.`);
    }
    runSupabase(["init", "--workdir", workDirectory]);
    stackMayBeRunning = true;
    await cp(migrationsDirectory, join(workDirectory, "supabase/migrations"), {
      recursive: true,
    });

    // `supabase start` prints local publishable/service-role keys. The hook only
    // needs its exit status; suppress those generated credentials from terminal
    // scrollback and any captured pre-push logs.
    runSupabase(["start", "--workdir", workDirectory], { stdio: "ignore" });
    runSupabase(["db", "push", "--dry-run"], { cwd: workDirectory });
    console.log(
      `Dry-run validated ${migrationFiles.length} migration(s) in disposable local Supabase project ${basename(workDirectory)}.`,
    );
  }
} finally {
  if (stackMayBeRunning) {
    const stop = spawnSync(
      "supabase",
      ["stop", "--workdir", workDirectory, "--no-backup"],
      { stdio: "inherit" },
    );
    if (stop.status !== 0) {
      console.error(
        `Warning: Supabase did not stop cleanly; inspect Docker for containers named from ${basename(workDirectory)}.`,
      );
    }
  }
  await rm(workDirectory, { recursive: true, force: true });
}
