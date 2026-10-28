// "Impostazioni": theme, vacation, notifications, sync and backup.
import {
  setSetting, exportBackup, importBackup, getSync, connectSync, disconnectSync, runSync, startVacation, endVacation,
  getSyncToken, setReminders,
} from '../store.js';
import { vacationOn, addDays } from '../logic.js';
import { reminderSettings, DEFAULTS, WEEKLY_TIME } from '../remind.js';
import * as push from '../push.js';
import { esc, fmtDay } from '../ui.js';

let vacMsg = null;

function vacationSection(doc, today) {
  const until = vacationOn(doc, today);
  if (until) {
    return `<section class="card settings"><h2>🏖️ Vacanza</h2>
      <p>In vacanza fino a <b>${fmtDay(until).toLowerCase()}</b>. Le abitudini sono in pausa e le serie sono al sicuro.</p>
      <button class="btn" data-act="vac-end">Termina la vacanza oggi</button>
    </section>`;
  }
  return `<section class="card settings"><h2>🏖️ Vacanza</h2>
    <p class="muted">Mette in pausa tutte le abitudini per un periodo: niente percentuali e nessuna serie interrotta.</p>
    <div class="two">
      <label class="field">Dal<input type="date" name="vfrom" value="${today}"></label>
      <label class="field">Al<input type="date" name="vto" value="${addDays(today, 6)}"></label>
    </div>
    ${vacMsg ? `<p class="msg err" role="alert">${esc(vacMsg)}</p>` : ''}
    <button class="btn" data-act="vac-start">Inizia vacanza</button>
  </section>`;
}

let pushMsg = null;
let pushBusy = false;

function remindRow(id, label, time) {
  return `<div class="remind-row">
    <label class="switch"><input type="checkbox" name="r-${id}" ${time ? 'checked' : ''}><span></span></label>
    <span>${label}</span>
    <input type="time" name="r-${id}-time" value="${time || DEFAULTS[id]}" ${time ? '' : 'disabled'} aria-label="Ora ${label}">
  </div>`;
}

function notifySection(doc) {
  if (!push.configured()) return '';
  const r = reminderSettings(doc);
  const support = push.support();
  let device;
  if (support === 'home') device = '<p class="muted">Su iPhone le notifiche arrivano solo all’app aggiunta alla schermata Home: apri Habits dalla sua icona.</p>';
  else if (support === 'no') device = '<p class="muted">Questo browser non supporta le notifiche.</p>';
  else if (!getSync().connected) device = '<p class="muted">Per le notifiche serve la sincronizzazione collegata (qui sotto).</p>';
  else if (push.isOn()) device = `<p>Attive su questo dispositivo.</p><button class="btn" data-act="push-off" ${pushBusy ? 'disabled' : ''}>Disattiva</button>`;
  else device = `<button class="btn primary" data-act="push-on" ${pushBusy ? 'disabled' : ''}>${pushBusy ? 'Attivo…' : 'Attiva su questo dispositivo'}</button>`;
  return `<section class="card settings"><h2>🔔 Notifiche</h2>
    ${device}
    ${note(pushMsg)}
    <div class="remind-rows">
      ${remindRow('sleep', 'Sonno · la mattina', r.sleep)}
      ${remindRow('mood', 'Umore · la sera', r.mood)}
      <div class="remind-row">
        <label class="switch"><input type="checkbox" name="r-weekly" ${r.weekly ? 'checked' : ''}><span></span></label>
        <span>Riepilogo della settimana</span><small>domenica ${WEEKLY_TIME}</small>
      </div>
    </div>
    <p class="muted">Arrivano solo se quel giorno non l’hai ancora registrato. Per le abitudini: Modifica abitudine → Promemoria.
      Gli orari valgono su tutti i dispositivi.</p>
  </section>`;
}

const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=Habits%20sync';

let msg = null;       // backup result { text, err }, survives the re-render triggered by the import
let syncMsg = null;   // connect result
let busy = false;     // connecting
let draft = { token: '', password: '' };   // kept in memory only, so re-renders do not wipe the form

const fmtDate = (ms) => new Date(ms).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtWhen = (ms) => new Date(ms).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const note = (m) => (m ? `<p class="msg${m.err ? ' err' : ''}" role="status">${esc(m.text)}</p>` : '');

function syncSection() {
  const s = getSync();
  if (!s.connected) {
    return `<section class="card settings"><h2>Sincronizzazione</h2>
      <p class="muted">Tiene allineati telefono e PC tramite un Gist segreto sul tuo account GitHub.
        I dati vengono cifrati con la tua password prima di lasciare il dispositivo.</p>
      <form class="form" data-form="sync" novalidate>
        <label class="field">Token GitHub
          <input name="token" type="password" value="${esc(draft.token)}" placeholder="ghp_…" autocomplete="off" spellcheck="false"></label>
        <small><a href="${TOKEN_URL}" target="_blank" rel="noopener">Crea un token</a> con il solo permesso <b>gist</b>.</small>
        <label class="field">Password di cifratura
          <input name="password" type="password" value="${esc(draft.password)}" autocomplete="new-password"></label>
        <small>Almeno 8 caratteri, la stessa su tutti i dispositivi. Se la dimentichi la copia sul cloud non è
          recuperabile; i dati sui dispositivi restano.</small>
        <button class="btn primary block" type="submit" ${busy ? 'disabled' : ''}>${busy ? 'Collego…' : 'Collega'}</button>
      </form>
      ${note(syncMsg)}
    </section>`;
  }
  const status = {
    idle: s.at ? `Sincronizzato · ${fmtWhen(s.at)}` : 'Collegato',
    syncing: 'Sincronizzazione…',
    offline: s.message,
    error: s.message,
  }[s.state] || 'Collegato';
  return `<section class="card settings"><h2>Sincronizzazione</h2>
    <p>Stato: <b class="${s.state === 'error' ? 'err-text' : ''}">${esc(status)}</b></p>
    <div class="btn-row">
      <button class="btn primary" data-act="sync-now" ${s.state === 'syncing' ? 'disabled' : ''}>Sincronizza ora</button>
      <button class="btn danger" data-act="sync-off">Scollega</button>
    </div>
    ${note(syncMsg)}
  </section>`;
}

export function render(el, { doc, today, refresh }) {
  const theme = doc.settings.theme;
  const opt = (v, label) => `<label class="pick"><input type="radio" name="theme" value="${v}" ${theme === v ? 'checked' : ''}><span>${label}</span></label>`;
  const last = doc.settings.lastBackup;

  el.innerHTML = `
    <header class="top"><h1>Impostazioni</h1></header>
    <section class="card settings"><h2>Tema</h2>
      <div class="seg">${opt('auto', 'Automatico')}${opt('light', 'Chiaro')}${opt('dark', 'Scuro')}</div>
    </section>
    ${vacationSection(doc, today)}
    ${notifySection(doc)}
    ${syncSection()}
    <section class="card settings"><h2>Backup</h2>
      <p>Ultimo backup: <b>${last ? fmtDate(last) : 'mai'}</b></p>
      <p class="muted">Salva il file su iCloud Drive o OneDrive. Importandolo sull'altro dispositivo i dati vengono
        uniti: per ogni giorno e abitudine vince la modifica più recente, niente viene sovrascritto per errore.</p>
      <div class="btn-row">
        <button class="btn primary" data-act="export">Esporta backup</button>
        <button class="btn" data-act="import">Importa backup</button>
        <input class="sr-only" type="file" accept=".json,application/json" tabindex="-1" aria-hidden="true">
      </div>
      ${note(msg)}
    </section>
    <section class="card settings"><h2>Info</h2>
      <p class="muted">Habits 1.1 · funziona offline · i dati restano sui tuoi dispositivi (e cifrati sul tuo Gist, se colleghi la sincronizzazione).</p>
    </section>`;

  const input = el.querySelector('input[type="file"]');
  const form = el.querySelector('form[data-form="sync"]');

  if (form) {
    form.oninput = (e) => { draft[e.target.name] = e.target.value; };
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (!draft.token.trim()) syncMsg = { text: 'Inserisci il token GitHub.', err: true };
      else if (draft.password.length < 8) syncMsg = { text: 'La password deve avere almeno 8 caratteri.', err: true };
      else {
        busy = true;
        syncMsg = null;
        refresh();
        try {
          await connectSync(draft.token, draft.password);
          draft = { token: '', password: '' };
          syncMsg = { text: 'Collegato: i dati di questo dispositivo sono sincronizzati.' };
        } catch (err) {
          syncMsg = { text: err.message || 'Collegamento non riuscito.', err: true };
        }
        busy = false;
      }
      refresh();
    };
  }

  el.onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'import') input.click();
    if (act === 'vac-start') {
      const from = el.querySelector('[name=vfrom]').value;
      const to = el.querySelector('[name=vto]').value;
      const ok = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to && to >= today;
      vacMsg = ok ? null : 'Scegli un periodo valido (la fine non può essere prima dell’inizio né nel passato).';
      if (ok) startVacation(from, to);
      else refresh();
    }
    if (act === 'vac-end') endVacation(today);
    if (act === 'push-on' || act === 'push-off') {
      pushBusy = true;
      pushMsg = null;
      const run = act === 'push-on' ? push.enable(getSyncToken(), doc) : push.disable(getSyncToken());
      refresh();
      try {
        await run;
        pushMsg = act === 'push-on' ? { text: 'Attivate: tra pochi secondi arriva una notifica di prova.' } : null;
      } catch (err) {
        pushMsg = { text: err.message || 'Non è stato possibile.', err: true };
      }
      pushBusy = false;
      refresh();
    }
    if (act === 'sync-now') {
      syncMsg = null;
      runSync();
    }
    if (act === 'sync-off' && confirm('Scollegare la sincronizzazione su questo dispositivo? I dati restano qui e sul Gist.')) {
      syncMsg = null;
      disconnectSync();
    }
    if (act === 'export') {
      try {
        if (await exportBackup()) msg = { text: 'Backup esportato.' };
      } catch {
        msg = { text: 'Esportazione non riuscita.', err: true };
      }
      refresh();
    }
  };

  el.onchange = async (e) => {
    const name = e.target.name || '';
    if (name === 'r-weekly') {
      setReminders({ weekly: e.target.checked });
      return;
    }
    const m = /^r-(sleep|mood)(-time)?$/.exec(name);
    if (m) {
      const box = el.querySelector(`[name="r-${m[1]}"]`);
      const time = el.querySelector(`[name="r-${m[1]}-time"]`).value || DEFAULTS[m[1]];
      setReminders({ [m[1]]: box.checked ? time : null });
      return;
    }
    if (e.target.name === 'theme') {
      setSetting('theme', e.target.value);
      return;
    }
    if (e.target !== input || !input.files[0]) return;
    try {
      const r = await importBackup(input.files[0]);
      msg = { text: `Import completato: ${r.habits} abitudini e ${r.entries} registrazioni aggiornate.` };
    } catch (err) {
      msg = { text: err.message, err: true };
    }
    refresh();
  };
}
