import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve("dist-standalone");
let html = await readFile(resolve(root, "index.html"), "utf8");
const script = html.match(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/);
const style = html.match(
  /<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/,
);
if (!script || !style)
  throw new Error("The standalone build is missing its script or stylesheet.");
const js = await readFile(resolve(root, script[1].replace(/^\//, "")), "utf8");
const css = await readFile(resolve(root, style[1].replace(/^\//, "")), "utf8");
html = html.replace(
  script[0],
  () =>
    `<script type="module">${js.replace(/<\/script/gi, "<\\/script")}</script>`,
);
html = html.replace(style[0], () => `<style>${css}</style>`);
html = html.replace(/<link\b[^>]*rel="modulepreload"[^>]*>/g, "");
await writeFile("Aurelle Ring Studio.html", html, "utf8");
console.log(
  "Created the standalone Aurelle Ring Studio.html. Open it in a browser to begin.",
);
