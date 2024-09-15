import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeStringify from "rehype-stringify";
import rehypeShiki from "@shikijs/rehype";
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  existsSync,
} from "fs";
import { join } from "path";
import { visit } from "unist-util-visit";

function getHtmlFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    console.log(`Directory ${dir} does not exist.`);
    return [];
  }
  const files = readdirSync(dir);

  let htmlFiles: string[] = [];
  for (const file of files) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);

    if (stat.isDirectory()) {
      // Recursively get files from subdirectories
      htmlFiles = htmlFiles.concat(getHtmlFiles(filePath));
    } else if (file.endsWith(".html")) {
      htmlFiles.push(filePath);
    }
  }

  return htmlFiles;
}

const postsDir = "public/posts";

const files = getHtmlFiles(postsDir);

function wrapPreWithDiv() {
  return (tree) => {
    visit(tree, "element", (node, index, parent) => {
      if (node.tagName === "pre") {
        // Wrap the existing <pre> inside a <div> and add a copy button
        parent.children[index] = {
          type: "element",
          tagName: "div",
          properties: { className: ["code-adaptive"] },
          children: [
            {
              type: "element",
              tagName: "button",
              properties: {
                className: ["copy-btn"],
                ariaLabel: "Copy to clipboard",
              },
              children: [
                {
                  type: "element",
                  tagName: "i",
                  properties: { className: ["fas", "fa-copy"] },
                  children: [],
                },
              ],
            },
            node, // The original <pre> element
          ],
        };
      }
    });
  };
}

(async () => {
  for (const filePath of files) {
    const fileContent = readFileSync(filePath, "utf-8");

    // Use unified to parse, highlight code blocks, and convert back to HTML
    const processedContent = await unified()
      .use(rehypeParse, { fragment: true }) // Parse the HTML into an AST
      .use(rehypeShiki, {
        themes: {
          light: "one-light",
          dark: "ayu-dark",
        },
      })
      .use(wrapPreWithDiv)
      .use(rehypeStringify) // Convert the processed AST back into HTML
      .process(fileContent);

    // Write the new highlighted HTML back to the file
    writeFileSync(filePath, String(processedContent));
    console.log(`Processed ${filePath}`);
  }
})();
