#!/usr/bin/env node
// Regenerates entries on the index + every tag page, and tag chips on every post,
// from posts.json. Tag pages that don't exist yet are scaffolded; existing ones
// are preserved outside the <!-- entries:start --> / <!-- entries:end --> markers.
// Run: node build.mjs

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SITE_URL = 'https://oatsnotes.com';
const SITE_NAME = "oatsandsugar's commonplace book";
const { posts } = JSON.parse(readFileSync(join(ROOT, 'posts.json'), 'utf8'));
const publishedPosts = posts.filter((p) => !p.draft);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapeAttr = (s) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function replaceBetween(text, start, end, replacement) {
  const re = new RegExp(`(${escapeRegex(start)})[\\s\\S]*?(${escapeRegex(end)})`);
  if (!re.test(text)) return null;
  return text.replace(re, `$1\n${replacement}\n$2`);
}

function entryDl(postsList, prefix) {
  const items = postsList.map((p) => {
    const chips = p.tags
      .map((t) => `      <a class="tag" href="${prefix}tags/${t}.html">${t}</a>`)
      .join('\n');
    return `  <dt><a href="${prefix}posts/${p.slug}.html">${p.title}</a></dt>
  <dd>${p.summary}
    <span class="tag-list">
${chips}
    </span>
  </dd>`;
  });
  return `<dl class="entries">
${items.join('\n')}
</dl>`;
}

function tagPageTemplate(tag, entriesBlock) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tag: ${tag} | oatsandsugar's commonplace book</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/tufte-css/1.8.0/tufte.min.css">
<link rel="stylesheet" href="../style.css">
</head>
<body>
<article>

<p class="back"><a href="../index.html">&larr; index</a></p>

<h1>${tag}</h1>

<section>
<!-- Write your own prose here; everything outside the entries markers below is preserved across builds. -->
</section>

<section>
<!-- entries:start -->
${entriesBlock}
<!-- entries:end -->
</section>

</article>
</body>
</html>
`;
}

// 1. Regenerate entries in index.html
const indexPath = join(ROOT, 'index.html');
let indexHtml = readFileSync(indexPath, 'utf8');
const updatedIndex = replaceBetween(
  indexHtml,
  '<!-- entries:start -->',
  '<!-- entries:end -->',
  entryDl(publishedPosts, ''),
);
if (!updatedIndex) {
  console.error('index.html is missing <!-- entries:start --> / <!-- entries:end --> markers.');
  process.exit(1);
}
writeFileSync(indexPath, updatedIndex);
console.log('wrote index.html');

// 2. Regenerate tag chips and head meta inside each post (each is skipped if markers are missing)
function metaBlock(post) {
  const title = escapeAttr(post.title);
  const description = escapeAttr(post.summary);
  const url = `${SITE_URL}/posts/${post.slug}.html`;
  return [
    `<meta name="description" content="${description}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="${escapeAttr(SITE_NAME)}">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta name="twitter:card" content="summary">`,
  ].join('\n');
}

for (const post of posts) {
  const postPath = join(ROOT, 'posts', `${post.slug}.html`);
  if (!existsSync(postPath)) {
    console.warn(`skip missing post: posts/${post.slug}.html`);
    continue;
  }
  let html = readFileSync(postPath, 'utf8');
  let touched = false;

  const chips = post.tags
    .map((t) => `    <a class="tag" href="../tags/${t}.html">${t}</a>`)
    .join('\n');
  const withChips = replaceBetween(html, '<!-- tags:start -->', '<!-- tags:end -->', chips);
  if (withChips) {
    html = withChips;
    touched = true;
  } else {
    console.warn(`skip (no tag markers): posts/${post.slug}.html`);
  }

  const withMeta = replaceBetween(html, '<!-- meta:start -->', '<!-- meta:end -->', metaBlock(post));
  if (withMeta) {
    html = withMeta;
    touched = true;
  } else {
    console.warn(`skip (no meta markers): posts/${post.slug}.html`);
  }

  if (touched) {
    writeFileSync(postPath, html);
    console.log(`wrote posts/${post.slug}.html`);
  }
}

// 3. Regenerate or scaffold every tag page
const allTags = new Set();
for (const p of posts) for (const t of p.tags) allTags.add(t);
for (const file of readdirSync(join(ROOT, 'tags'))) {
  if (file.endsWith('.html')) allTags.add(file.slice(0, -'.html'.length));
}

for (const tag of [...allTags].sort()) {
  const tagPath = join(ROOT, 'tags', `${tag}.html`);
  const tagPosts = publishedPosts.filter((p) => p.tags.includes(tag));
  const block = entryDl(tagPosts, '../');

  if (existsSync(tagPath)) {
    const html = readFileSync(tagPath, 'utf8');
    const updated = replaceBetween(html, '<!-- entries:start -->', '<!-- entries:end -->', block);
    if (!updated) {
      console.warn(`tags/${tag}.html exists but lacks markers; skipped`);
      continue;
    }
    writeFileSync(tagPath, updated);
    console.log(`wrote tags/${tag}.html`);
  } else {
    writeFileSync(tagPath, tagPageTemplate(tag, block));
    console.log(`created tags/${tag}.html`);
  }
}
