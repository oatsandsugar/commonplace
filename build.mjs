#!/usr/bin/env node
// Regenerates entries on the index + every tag page, and tag chips on every post,
// from posts.json. Tag pages that don't exist yet are scaffolded; existing ones
// are preserved outside the <!-- entries:start --> / <!-- entries:end --> markers.
// Run: node build.mjs

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SITE_URL = 'https://oatsnotes.com';
const SITE_NAME = "oatsandsugar's commonplace book";
const SITE_DESCRIPTION = 'A catalogue of things worth keeping, with thoughts or half thoughts as to why.';
const { posts } = JSON.parse(readFileSync(join(ROOT, 'posts.json'), 'utf8'));
const publishedPosts = posts.filter((p) => !p.draft);
const sharePreviews = [];

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapeAttr = (s) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function replaceBetween(text, start, end, replacement) {
  const re = new RegExp(`(${escapeRegex(start)})[\\s\\S]*?(${escapeRegex(end)})`);
  if (!re.test(text)) return null;
  return text.replace(re, `$1\n${replacement}\n$2`);
}

function updateMeta(html, meta) {
  const updated = replaceBetween(html, '<!-- meta:start -->', '<!-- meta:end -->', meta);
  if (updated) return updated;
  // New pages need no manual metadata setup. Replace any old social tags once.
  return html.replace(/<head\b[^>]*>[\s\S]*?<\/head>/i, (head) => {
    const cleanHead = head.replace(/<meta\b(?=[^>]*(?:name|property)\s*=\s*["'](?:description|og:[^"']+|twitter:[^"']+)["'])[^>]*>\s*/gi, '');
    return cleanHead.replace(/<\/head>/i, `<!-- meta:start -->\n${meta}\n<!-- meta:end -->\n</head>`);
  });
}

function extractProvenance(slug) {
  const postPath = join(ROOT, 'posts', `${slug}.html`);
  if (!existsSync(postPath)) return { source: null, via: null };
  const html = readFileSync(postPath, 'utf8');
  const sourceMatch = html.match(/<dt>\s*Source:\s*<\/dt>\s*<dd>([\s\S]*?)<\/dd>/i);
  const viaMatch = html.match(/<dt>\s*via:\s*<\/dt>\s*<dd>([\s\S]*?)<\/dd>/i);
  return {
    source: sourceMatch ? sourceMatch[1].trim() : null,
    via: viaMatch ? viaMatch[1].trim() : null,
  };
}

const provenanceBySlug = new Map(posts.map((p) => [p.slug, extractProvenance(p.slug)]));

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function formatDisplayDate(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
  if (!m) return dateStr;
  const monthIdx = Number(m[2]) - 1;
  if (monthIdx < 0 || monthIdx > 11) return dateStr;
  const day = String(Number(m[3]));
  return `${day} ${MONTHS[monthIdx]} ${m[1]}`;
}

// Compact form for the title parenthetical: a bare year (or a year-ish
// display like "1861-63"), not the full day-month-year.
function sourceYearLabel(post) {
  if (post.sourceDateDisplay && /^\d/.test(post.sourceDateDisplay)) return post.sourceDateDisplay;
  const m = /^(\d{4})/.exec(post.sourceDate || '');
  return m ? m[1] : '';
}


function entryDl(postsList, prefix) {
  const items = postsList.map((p, shelfIdx) => {
    const displayDate = formatDisplayDate(p.date);
    const dataAttrs = [
      ` data-shelf="${shelfIdx}"`,
      ` data-date="${escapeAttr(p.date || '')}"`,
      ` data-source-date="${escapeAttr(p.sourceDate || p.date || '')}"`,
      ` data-via="${escapeAttr(p.via || '')}"`,
    ].join('');
    const chips = p.tags
      .map((t) => `      <a class="tag" href="${prefix}tags/${t}.html">${t}</a>`)
      .join('\n');
    const provenance = provenanceBySlug.get(p.slug) || { source: null, via: null };
    const provenanceRows = [];
    if (provenance.source) {
      provenanceRows.push(
        `      <div class="entry-provenance-row"><span class="entry-provenance-key">source:</span> ${provenance.source}</div>`,
      );
    }
    if (provenance.via) {
      provenanceRows.push(
        `      <div class="entry-provenance-row"><span class="entry-provenance-key">via:</span> ${provenance.via}</div>`,
      );
    }
    const provenanceBlock = provenanceRows.length
      ? `
    <div class="entry-provenance">
${provenanceRows.join('\n')}
    </div>`
      : '';
    const yearLabel = sourceYearLabel(p);
    const titleDates =
      `<span class="entry-title-date entry-title-date-saved"> (${displayDate})</span>` +
      (yearLabel ? `<span class="entry-title-date entry-title-date-source"> (${yearLabel})</span>` : '');
    return `  <div class="entry"${dataAttrs}>
  <dt><a href="${prefix}posts/${p.slug}.html">${p.title}</a>${titleDates}. <span class="entry-summary">${p.summary}</span></dt>
  <dd>
${provenanceBlock}
    <span class="tag-list">
      <span class="entry-date">${displayDate}</span>
${chips}
    </span>
  </dd>
  </div>`;
  });
  // Default is shelf order (posts.json order), which shows no title
  // parenthetical; the sort script adds date classes as needed.
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
<link rel="stylesheet" href="../tufte/tufte.min.css">
<link rel="stylesheet" href="../style.css">
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
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

// 1. Regenerate entries and the threads line in index.html
function threadsLine() {
  const counts = new Map();
  for (const p of publishedPosts) for (const t of p.tags) counts.set(t, (counts.get(t) || 0) + 1);
  const items = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t, n]) => `<a class="thread" href="tags/${t}.html">${t}</a><span class="thread-count">&times;${n}</span>`);
  return `<p class="threads">${items.join(',\n')}</p>`;
}

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
indexHtml = updatedIndex;
indexHtml = updateMeta(indexHtml, pageMeta({
  type: 'website', title: SITE_NAME, description: SITE_DESCRIPTION, url: `${SITE_URL}/`, html: indexHtml,
}));
const withThreads = replaceBetween(indexHtml, '<!-- threads:start -->', '<!-- threads:end -->', threadsLine());
if (withThreads) {
  indexHtml = withThreads;
} else {
  console.warn('index.html has no threads markers; skipped threads line');
}
writeFileSync(indexPath, indexHtml);
console.log('wrote index.html');

// 2. Regenerate tag chips and head metadata inside each post.
function decodeAttr(value) {
  const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', lsquo: '‘', rsquo: '’' };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|lsquo|rsquo);/gi, (match, entity) => {
    if (entity.startsWith('#')) {
      const isHex = entity[1].toLowerCase() === 'x';
      return String.fromCodePoint(parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10));
    }
    return entities[entity.toLowerCase()] || match;
  });
}

// Use the entry's first image as it is, or the site logo when it has no image.
function shareImage(html, pageUrl) {
  const firstImage = html.match(/<img\b[^>]*>/i)?.[0];
  const src = firstImage?.match(/\ssrc\s*=\s*(["'])(.*?)\1/i)?.[2];
  const alt = firstImage?.match(/\salt\s*=\s*(["'])(.*?)\1/i)?.[2];
  const isLogo = !src;
  const url = new URL(src ? decodeAttr(src) : '/assets/og/logo.png', pageUrl);
  if (url.origin === SITE_URL) {
    const imagePath = join(ROOT, decodeURIComponent(url.pathname));
    const version = createHash('sha256').update(readFileSync(imagePath)).digest('hex').slice(0, 12);
    url.searchParams.set('v', version);
  }
  const extension = url.pathname.split('.').pop().toLowerCase();
  const type = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[extension];
  return { url, alt: isLogo ? 'Circled plus and oatsnotes.com' : decodeAttr(alt || ''), isLogo, type };
}

function pageMeta({ type, title, description, url, html = '', preview = true }) {
  const image = shareImage(html, url);
  const imageUrl = escapeAttr(image.url.href);
  const imageAlt = escapeAttr(image.alt);
  const imageMeta = [
    `<meta property="og:image" content="${imageUrl}">`,
    ...(image.type ? [`<meta property="og:image:type" content="${image.type}">`] : []),
    ...(image.isLogo ? ['<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">'] : []),
    `<meta property="og:image:alt" content="${imageAlt}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:image" content="${imageUrl}">`,
    `<meta name="twitter:image:alt" content="${imageAlt}">`,
  ];
  if (preview) sharePreviews.push({ title, description, url, image });
  return [
    `<meta name="description" content="${escapeAttr(description)}">`,
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:site_name" content="${escapeAttr(SITE_NAME)}">`,
    `<meta property="og:title" content="${escapeAttr(title)}">`,
    `<meta property="og:description" content="${escapeAttr(description)}">`,
    `<meta property="og:url" content="${url}">`,
    ...imageMeta,
  ].join('\n');
}

function metaBlock(post, html) {
  return pageMeta({
    type: 'article', title: post.title, description: post.summary,
    url: `${SITE_URL}/posts/${post.slug}.html`, html, preview: !post.draft,
  });
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

  html = updateMeta(html, metaBlock(post, html));
  touched = true;

  if (touched) {
    writeFileSync(postPath, html);
    console.log(`wrote posts/${post.slug}.html`);
  }
}

// 3. Regenerate or scaffold every tag page, including its social metadata.
const allTags = new Set();
for (const p of posts) for (const t of p.tags) allTags.add(t);
for (const file of readdirSync(join(ROOT, 'tags'))) {
  if (file.endsWith('.html')) allTags.add(file.slice(0, -'.html'.length));
}

for (const tag of [...allTags].sort()) {
  const tagPath = join(ROOT, 'tags', `${tag}.html`);
  const tagPosts = publishedPosts.filter((p) => p.tags.includes(tag));
  const block = entryDl(tagPosts, '../');
  let html = existsSync(tagPath) ? readFileSync(tagPath, 'utf8') : tagPageTemplate(tag, block);
  const updated = replaceBetween(html, '<!-- entries:start -->', '<!-- entries:end -->', block);
  if (!updated) {
    console.warn(`tags/${tag}.html lacks entry markers; preserved entries`);
  } else {
    html = updated;
  }
  html = updateMeta(html, pageMeta({
    type: 'website', title: `Tag: ${tag}`, description: `Entries tagged ${tag}.`,
    url: `${SITE_URL}/tags/${tag}.html`, html,
  }));
  writeFileSync(tagPath, html);
  console.log(`wrote tags/${tag}.html`);
}

// Gallery of the actual images selected for published pages.
writeFileSync(join(ROOT, 'assets/og/preview.html'), `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Share image previews</title>
<style>
body { margin: 40px auto; padding: 0 24px; max-width: 1100px; background: #fffff8; color: #222; font-family: system-ui, sans-serif; }
h1 { font-size: 28px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; }
figure { margin: 0; overflow: hidden; border: 1px solid #ddd; border-radius: 10px; background: white; }
img { display: block; width: 100%; height: 260px; object-fit: contain; background: #fffff8; }
figcaption { padding: 18px; }
a { color: #7b2d26; font-weight: 600; }
p { line-height: 1.5; }
small { color: #666; }
</style>
</head>
<body>
<h1>Share images</h1>
<p>Each page uses its first image. Pages without images use the site wordmark.</p>
<div class="grid">
${sharePreviews.sort((a, b) => Number(a.image.isLogo) - Number(b.image.isLogo)).map(({ title, description, url, image }) => {
  const imageSrc = image.url.origin === SITE_URL ? image.url.pathname + image.url.search : image.url.href;
  return `<figure><img src="${escapeAttr(imageSrc)}" alt="${escapeAttr(image.alt)}"><figcaption><a href="${new URL(url).pathname}">${escapeAttr(title)}</a><p>${escapeAttr(description)}</p><small>${image.isLogo ? 'Site wordmark' : 'First image on the page'}</small></figcaption></figure>`;
}).join('\n')}
</div>
</body>
</html>
`);
