// Собирает demo/slides/deck.html — один автономный файл со всеми слайдами для офлайн-показа.
// Запуск: node demo/slides/build-deck.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const index = JSON.parse(readFileSync(join(here, 'canvas.json'), 'utf8'));

const files = index.order.filter((name) => readdirSync(here).includes(name));
if (files.length !== index.order.length) {
  throw new Error('В canvas.json перечислены артборды, которых нет в папке');
}

const noteKeys = Object.keys(index.notes).filter((k) => /^n\d+$/.test(k)).sort();

const slides = files.map((name, i) => {
  const src = readFileSync(join(here, name), 'utf8');
  const body = src.split('</helmet>')[1]?.split('</x-dc>')[0];
  if (!body) throw new Error(`Не нашёл разметку артборда в ${name}`);
  const title = index.boards[name]?.title ?? name;
  const note = index.notes[noteKeys[i]]?.text ?? '';
  return { name, title, note, body: body.trim() };
});

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>АИС Лизинг — прототип рабочего места</title>
<style>
  :root {
    --backdrop: #11161D;
    --chrome: #8A93A0;
    --navy: #14304F;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body {
    background: var(--backdrop);
    font-family: 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
    color: #E6EDF5;
    overflow: hidden;
  }
  #stage {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 1280px;
    height: 720px;
    transform-origin: center center;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
  }
  .slide { display: none; }
  .slide.active { display: block; }
  #bar {
    position: fixed;
    right: 20px;
    bottom: 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14px;
    color: var(--chrome);
  }
  #bar button {
    font: inherit;
    color: inherit;
    background: transparent;
    border: 1px solid #333D4A;
    border-radius: 6px;
    min-width: 44px;
    min-height: 44px;
    cursor: pointer;
  }
  #bar button:hover, #bar button:focus-visible { color: #FFFFFF; border-color: #5A6472; }
  #counter { min-width: 84px; text-align: center; font-variant-numeric: tabular-nums; }
  #notes {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    max-height: 38vh;
    overflow: auto;
    padding: 20px 28px 24px;
    background: #182130;
    border-top: 2px solid var(--navy);
    font-size: 17px;
    line-height: 1.5;
    color: #D3DBE5;
  }
  #notes[hidden] { display: none; }
  #notes h2 { margin: 0 0 8px; font-size: 14px; letter-spacing: 0.12em; text-transform: uppercase; color: #8A93A0; font-weight: 600; }
  #hint { position: fixed; left: 20px; bottom: 20px; font-size: 13px; color: #4A5464; }
  @media print {
    @page { size: 1280px 720px; margin: 0; }
    body { background: #FFFFFF; overflow: visible; }
    #bar, #hint, #notes { display: none !important; }
    #stage { position: static; width: auto; height: auto; transform: none !important; box-shadow: none; }
    .slide { display: block !important; page-break-after: always; break-after: page; }
    .slide:last-child { page-break-after: auto; break-after: auto; }
  }
</style>
</head>
<body>
<main id="stage">
${slides.map((s, i) => `<section class="slide${i === 0 ? ' active' : ''}" aria-label="${esc(s.title)}">\n${s.body}\n</section>`).join('\n')}
</main>

<div id="hint">← → слайды · N заметки · F во весь экран</div>

<div id="bar">
  <button type="button" id="prev" aria-label="Предыдущий слайд">←</button>
  <span id="counter"></span>
  <button type="button" id="next" aria-label="Следующий слайд">→</button>
  <button type="button" id="toggleNotes" aria-label="Заметки докладчика">N</button>
</div>

<aside id="notes" hidden>
  <h2 id="notesTitle"></h2>
  <p id="notesBody" style="margin: 0;"></p>
</aside>

<script>
  var NOTES = ${JSON.stringify(slides.map((s) => ({ title: s.title, note: s.note })))};
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  var stage = document.getElementById('stage');
  var counter = document.getElementById('counter');
  var notes = document.getElementById('notes');
  var notesTitle = document.getElementById('notesTitle');
  var notesBody = document.getElementById('notesBody');
  var i = 0;

  function fit() {
    var padX = 48;
    var padY = 104;
    var avail = window.innerHeight - (notes.hidden ? 0 : notes.offsetHeight);
    var scale = Math.min((window.innerWidth - padX) / 1280, (avail - padY) / 720);
    stage.style.top = (avail / 2) + 'px';
    stage.style.transform = 'translate(-50%, -50%) scale(' + Math.max(scale, 0.1) + ')';
  }

  function show(n) {
    i = (n + slides.length) % slides.length;
    slides.forEach(function (s, k) { s.classList.toggle('active', k === i); });
    counter.textContent = (i + 1) + ' / ' + slides.length;
    notesTitle.textContent = NOTES[i].title;
    notesBody.textContent = NOTES[i].note;
    fit();
  }

  document.getElementById('prev').addEventListener('click', function () { show(i - 1); });
  document.getElementById('next').addEventListener('click', function () { show(i + 1); });
  document.getElementById('toggleNotes').addEventListener('click', function () {
    notes.hidden = !notes.hidden;
    fit();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { show(i + 1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { show(i - 1); e.preventDefault(); }
    else if (e.key === 'Home') { show(0); }
    else if (e.key === 'End') { show(slides.length - 1); }
    else if (e.key === 'n' || e.key === 'N' || e.key === 'т' || e.key === 'Т') { notes.hidden = !notes.hidden; fit(); }
    else if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') {
      if (document.fullscreenElement) { document.exitFullscreen(); } else { document.documentElement.requestFullscreen(); }
    }
  });

  window.addEventListener('resize', fit);
  show(0);
</script>
</body>
</html>
`;

writeFileSync(join(here, 'deck.html'), html);
console.log('deck.html: ' + slides.length + ' слайдов, ' + Math.round(html.length / 1024) + ' КБ');
