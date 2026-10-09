// Builds every game and publishes dist/ to the gh-pages branch, which GitHub Pages serves
// at https://rownok-hr-ls.github.io/games/.
import { execSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";

const DIR = "dist";

const run = (cmd, cwd, env) => execSync(cmd, { stdio: "inherit", cwd, env: { ...process.env, ...env } });
const read = (cmd) => execSync(cmd).toString().trim();

const remote = read("git remote get-url origin");
const name = read("git config user.name");
const email = read("git config user.email");
const commit = read("git rev-parse --short HEAD");

rmSync(DIR, { recursive: true, force: true });
run("npm run build", undefined, { BUILD_ID: commit });
// Pages compare their built-in id with this file to reload themselves after a deploy.
writeFileSync(`${DIR}/version.json`, JSON.stringify({ build: commit }));
// Serve files as-is (no Jekyll processing).
writeFileSync(`${DIR}/.nojekyll`, "");

run("git init -q -b gh-pages", DIR);
run("git config core.longpaths true", DIR);
run("git add -A", DIR);
run(`git -c user.name="${name}" -c user.email="${email}" commit -q -m "Deploy ${commit}"`, DIR);
run(`git push -f -q ${remote} gh-pages`, DIR);

console.log(`Deployed ${commit} to gh-pages.`);
