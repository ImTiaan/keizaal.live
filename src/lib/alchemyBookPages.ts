import { readdir, readFile } from "fs/promises";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";

export type AlchemyBookPage = {
  key: string;
  title: string;
  html: string;
  sourcePath?: string;
};

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function markdownToHtml(markdown: string) {
  const result = await remark().use(remarkGfm).use(remarkHtml).process(markdown);
  return String(result);
}

async function readIngredientTitles() {
  const filePath = path.join(process.cwd(), "ingredients_pages.md");
  const raw = await readFile(filePath, "utf8");
  const titles: string[] = [];
  raw.split("\n").forEach((line) => {
    const m = line.match(/^\s*\d+\.\s+(.*)\s*$/);
    if (m && m[1]) titles.push(m[1]);
  });
  return titles;
}

function normaliseFileSlug(fileName: string) {
  const base = fileName.replace(/\.md$/i, "");
  return base.replace(/^\d+[-_]/, "");
}

export async function loadAlchemyBookPages() {
  const dir = path.join(process.cwd(), "src", "content", "alchemy-school", "pages");

  let files: string[] = [];
  try {
    files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith(".md"));
  } catch {
    files = [];
  }

  const titles = await readIngredientTitles();
  const fileBySlug = new Map<string, string>();
  files.forEach((file) => {
    fileBySlug.set(normaliseFileSlug(file), file);
  });

  const pages: AlchemyBookPage[] = [];

  for (const title of titles) {
    const slug = slugify(title);
    const file = fileBySlug.get(slug) || null;
    if (!file) {
      const suggested = `${String(pages.length + 1).padStart(2, "0")}-${slug}.md`;
      pages.push({
        key: slug,
        title,
        html: `<h1>${escapeHtml(title)}</h1><p>This page has not been written yet.</p><p>Create <code>${escapeHtml(
          suggested
        )}</code> in <code>src/content/alchemy-school/pages</code>.</p>`,
      });
      continue;
    }

    const sourcePath = path.join(dir, file);
    const raw = await readFile(sourcePath, "utf8");
    const parsed = matter(raw);
    const fmTitle = typeof parsed.data?.title === "string" ? parsed.data.title : "";
    const html = await markdownToHtml(parsed.content);
    pages.push({
      key: slug,
      title: fmTitle || title,
      html,
      sourcePath,
    });
  }

  const known = new Set(pages.map((p) => p.key));
  const extras = files
    .map((f) => ({ file: f, slug: slugify(normaliseFileSlug(f)) }))
    .filter((it) => !known.has(it.slug));

  for (const extra of extras) {
    const sourcePath = path.join(dir, extra.file);
    const raw = await readFile(sourcePath, "utf8");
    const parsed = matter(raw);
    const fmTitle = typeof parsed.data?.title === "string" ? parsed.data.title : normaliseFileSlug(extra.file);
    const html = await markdownToHtml(parsed.content);
    pages.push({
      key: extra.slug,
      title: fmTitle,
      html,
      sourcePath,
    });
  }

  return pages;
}
