// 화면 전환과 전체 흐름을 담당한다.
import { APP_VERSION } from './config.js';
import { getChapters } from './api.js';

const $ = (sel) => document.querySelector(sel);
const views = { list: $('#view-list'), detail: $('#view-detail') };
let chapters = [];

function show(name) {
  Object.entries(views).forEach(([key, el]) => { el.hidden = key !== name; });
  window.scrollTo(0, 0);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderList() {
  const box = $('#chapter-list');
  if (!chapters.length) {
    box.innerHTML = '<p class="state">아직 공개된 챕터가 없어요.</p>';
    return;
  }
  box.innerHTML = chapters.map((c) => `
    <button class="chapter" data-id="${escapeHtml(c.chapter_id)}">
      <span class="chapter-no">${escapeHtml(c.order)}</span>
      <span class="chapter-text">
        <span class="chapter-title">${escapeHtml(c.title)}</span>
        <span class="chapter-goal">${escapeHtml(c.goal)}</span>
      </span>
      <span class="chevron" aria-hidden="true">›</span>
    </button>`).join('');
  box.querySelectorAll('.chapter').forEach((btn) => {
    btn.addEventListener('click', () => openChapter(btn.dataset.id));
  });
}

function openChapter(id) {
  const c = chapters.find((x) => x.chapter_id === id);
  if (!c) return;
  $('#detail-no').textContent = `${c.order}장`;
  $('#detail-title').textContent = c.title;
  $('#detail-goal').textContent = c.goal;
  $('#detail-keywords').innerHTML = c.keywords.map((k) => `<span class="chip">${escapeHtml(k)}</span>`).join('');
  show('detail');
}

async function load() {
  const box = $('#chapter-list');
  box.innerHTML = '<p class="state">챕터를 불러오는 중…</p>';
  try {
    const { chapters: list, server } = await getChapters();
    chapters = list;
    $('#version').textContent = `앱 ${APP_VERSION} · 서버 ${server}`;
    renderList();
  } catch (err) {
    console.warn(err);
    box.innerHTML = `
      <p class="state">챕터를 불러오지 못했어요. (${escapeHtml(err.message)})</p>
      <button class="secondary" id="retry">다시 시도</button>`;
    $('#retry').addEventListener('click', load);
  }
}

$('#back').addEventListener('click', () => show('list'));
$('#version').textContent = `앱 ${APP_VERSION}`;
show('list');
load();
