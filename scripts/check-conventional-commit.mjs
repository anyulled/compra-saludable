import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const headerPattern =
  /^(?<type>[a-z][a-z0-9-]*)(?:\((?<scope>[^()\r\n]+)\))?(?<breaking>!)?: (?<description>\S.*)$/;

export function isConventionalCommitHeader(header) {
  return headerPattern.test(header);
}

async function main() {
  const messagePath = process.argv[2];

  if (!messagePath) {
    console.error("Usage: node scripts/check-conventional-commit.mjs <message-file>");
    process.exitCode = 2;
    return;
  }

  const message = await readFile(messagePath, "utf8");
  const header = message.split(/\r?\n/, 1)[0];

  if (!isConventionalCommitHeader(header)) {
    console.error(
      "Commit message must use Conventional Commits: type(scope)!: description",
    );
    console.error(`Received: ${header || "<empty>"}`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
