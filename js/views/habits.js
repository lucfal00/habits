// "Abitudini": list, reorder, create/edit/archive/delete.
import { activeHabits } from '../logic.js';
import { createHabit, updateHabit, moveHabit } from '../store.js';
import { esc, safeColor, freqLabel, fmtNum, parseNum, COLORS, DAY_LETTERS, DAY_SHORT } from '../ui.js';

const EMOJIS = ['💧', '🏃', '📚', '🧘', '💪', '🥗', '😴', '✍️', '🎸', '🚭', '🧹', '💊'];
const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const typeLabel = (h) => (h.type === 'quantity' ? `${fmtNum(h.target)} ${esc(h.unit)}` : 'Sì / no');

function row(h, i, n) {
  const order = n
    ? `<span class="order">
        <button data-act="up" aria-label="Sposta su" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button data-act="down" aria-label="Sposta giù" ${i === n - 1 ? 'disabled' : ''}>↓</button>
      </span>`
    : '';
  return `<li data-id="${esc(h.id)}">
    <a class="row" href="#abitudini/${encodeURIComponent(h.id)}">
      <span class="badge" style="--c:${safeColor(h.color)}">${esc(h.emoji || '•')}</span>
      <span><b>${esc(h.name)}</b><small>${esc(freqLabel(h))} · ${typeLabel(h)}</small></span>
    </a>${order}
  </li>`;
}

function renderList(el, doc) {
  const active = activeHabits(doc);
  const archived = doc.habits.filter((h) => h.archived && !h.deleted);
  el.innerHTML = `
    <header class="top"><div class="grow"><h1>Abitudini</h1></div>
      <a class="btn primary" href="#abitudini/nuova">+ Nuova</a></header>
    ${active.length
    ? `<ul class="card list rows">${active.map((h, i) => row(h, i, active.length)).join('')}</ul>`
    : '<div class="card empty"><p class="muted">Nessuna abitudine attiva.</p></div>'}
    ${archived.length ? `<details class="card"><summary>Archiviate (${archived.length})</summary>
      <ul class="rows">${archived.map((h) => row(h, 0, 0)).join('')}</ul></details>` : ''}`;

  el.onclick = (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    moveHabit(b.closest('[data-id]').dataset.id, b.dataset.act === 'up' ? -1 : 1);
  };
}

function renderForm(el, doc, h, today) {
  const v = h ?? {
    name: '', emoji: '✅', color: COLORS[doc.habits.length % COLORS.length], type: 'check',
    target: '', unit: '', freq: { kind: 'daily' }, start: today,
  };
  const days = v.freq.kind === 'days' ? v.freq.days : [];
  const times = v.freq.kind === 'weekly' ? v.freq.times : 3;
  const radio = (name, value, label, checked) => `<label class="pick"><input type="radio" name="${name}" value="${value}"
    ${checked ? 'checked' : ''}><span>${label}</span></label>`;

  el.innerHTML = `
    <header class="top"><a class="back" href="#abitudini">‹ Abitudini</a></header>
    <h1 style="margin-bottom:16px">${h ? 'Modifica abitudine' : 'Nuova abitudine'}</h1>
    <form class="card form" novalidate data-type="${v.type}" data-kind="${v.freq.kind}">
      <label class="field">Nome<input name="name" maxlength="40" value="${esc(v.name)}" placeholder="Es. Leggere" autocomplete="off"></label>
      <fieldset><legend>Emoji</legend>
        <div class="emoji-row">${EMOJIS.map((x) => `<button type="button" data-emoji="${x}" aria-label="Usa ${x}">${x}</button>`).join('')}</div>
        <input name="emoji" maxlength="8" value="${esc(v.emoji)}" aria-label="Emoji personalizzata">
      </fieldset>
      <fieldset><legend>Colore</legend>
        <div class="swatches">${COLORS.map((c, i) => `<label class="pick"><input type="radio" name="color" value="${c}"
          ${c === safeColor(v.color) ? 'checked' : ''} aria-label="Colore ${i + 1}"><span style="--sw:${c}"></span></label>`).join('')}</div>
      </fieldset>
      <fieldset><legend>Tipo</legend>
        <div class="seg">${radio('type', 'check', 'Sì / no', v.type === 'check')}${radio('type', 'quantity', 'Quantità', v.type === 'quantity')}</div>
        <div class="two if-quantity">
          <label class="field">Obiettivo al giorno<input name="target" inputmode="decimal" value="${v.target === '' ? '' : fmtNum(v.target)}" placeholder="8"></label>
          <label class="field">Unità<input name="unit" maxlength="20" value="${esc(v.unit)}" placeholder="bicchieri"></label>
        </div>
      </fieldset>
      <fieldset><legend>Frequenza</legend>
        <div class="seg">${radio('kind', 'daily', 'Ogni giorno', v.freq.kind === 'daily')}${radio('kind', 'days', 'Alcuni giorni', v.freq.kind === 'days')}${radio('kind', 'weekly', 'N a settimana', v.freq.kind === 'weekly')}</div>
        <div class="days-row if-days">${DAY_LETTERS.map((d, i) => `<label class="pick"><input type="checkbox" name="days" value="${i + 1}"
          ${days.includes(i + 1) ? 'checked' : ''} aria-label="${DAY_SHORT[i]}"><span>${d}</span></label>`).join('')}</div>
        <label class="field if-weekly">Volte a settimana<input name="times" type="number" min="1" max="7" inputmode="numeric" value="${times}"></label>
      </fieldset>
      <label class="field">Data di inizio<input name="start" type="date" max="${today}" value="${esc(v.start)}"></label>
      <p class="error" role="alert" hidden></p>
      <button class="btn primary block" type="submit">Salva</button>
      ${h ? `<div class="danger-zone">
        <button class="btn" type="button" data-act="archive">${h.archived ? 'Ripristina' : 'Archivia'}</button>
        <button class="btn danger" type="button" data-act="delete">Elimina</button></div>` : ''}
    </form>`;

  const form = el.querySelector('form');
  const error = form.querySelector('.error');

  form.onchange = (e) => {
    if (e.target.name === 'type') form.dataset.type = e.target.value;
    if (e.target.name === 'kind') form.dataset.kind = e.target.value;
  };

  form.onclick = (e) => {
    const b = e.target.closest('button[type="button"]');
    if (!b) return;
    if (b.dataset.emoji) form.emoji.value = b.dataset.emoji;
    if (b.dataset.act === 'archive') {
      updateHabit(h.id, { archived: !h.archived });
      location.hash = '#abitudini';
    }
    if (b.dataset.act === 'delete' && confirm(`Eliminare "${h.name}"? Il suo storico non sarà più visibile.`)) {
      updateHabit(h.id, { deleted: true });
      location.hash = '#abitudini';
    }
  };

  form.onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const name = f.get('name').trim();
    const type = f.get('type');
    const kind = f.get('kind');
    const target = parseNum(f.get('target'));
    const pickedDays = f.getAll('days').map(Number);
    const n = Number(f.get('times'));
    const start = f.get('start');
    let msg = '';
    if (!name) msg = 'Inserisci un nome.';
    else if (type === 'quantity' && !(target > 0)) msg = "L'obiettivo deve essere un numero maggiore di 0.";
    else if (kind === 'days' && !pickedDays.length) msg = 'Scegli almeno un giorno.';
    else if (kind === 'weekly' && !(Number.isInteger(n) && n >= 1 && n <= 7)) msg = 'Le volte a settimana vanno da 1 a 7.';
    else if (!KEY_RE.test(start) || start > today) msg = 'Data di inizio non valida.';
    if (msg) {
      error.textContent = msg;
      error.hidden = false;
      return;
    }
    const freq = kind === 'days' ? { kind, days: pickedDays } : kind === 'weekly' ? { kind, times: n } : { kind: 'daily' };
    const fields = {
      name,
      emoji: f.get('emoji').trim() || '✅',
      color: f.get('color'),
      type,
      target: type === 'quantity' ? target : 1,
      unit: type === 'quantity' ? f.get('unit').trim() : '',
      freq,
      start,
    };
    location.hash = '#abitudini';
    if (h) updateHabit(h.id, fields);
    else createHabit(fields);
  };
}

export function render(el, { doc, param, today }) {
  if (!param) {
    renderList(el, doc);
    return;
  }
  const h = param === 'nuova' ? null : doc.habits.find((x) => x.id === param && !x.deleted);
  if (param !== 'nuova' && !h) {
    location.hash = '#abitudini';
    return;
  }
  renderForm(el, doc, h, today);
}
