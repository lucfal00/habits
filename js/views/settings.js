// "Impostazioni": theme and backup.
import { setSetting, exportBackup, importBackup } from '../store.js';
import { esc } from '../ui.js';

let msg = null;   // { text, err } survives the re-render triggered by the import

const fmtDate = (ms) => new Date(ms).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });

export function render(el, { doc, refresh }) {
  const theme = doc.settings.theme;
  const opt = (v, label) => `<label class="pick"><input type="radio" name="theme" value="${v}" ${theme === v ? 'checked' : ''}><span>${label}</span></label>`;
  const last = doc.settings.lastBackup;

  el.innerHTML = `
    <header class="top"><h1>Impostazioni</h1></header>
    <section class="card settings"><h2>Tema</h2>
      <div class="seg">${opt('auto', 'Automatico')}${opt('light', 'Chiaro')}${opt('dark', 'Scuro')}</div>
    </section>
    <section class="card settings"><h2>Backup</h2>
      <p>Ultimo backup: <b>${last ? fmtDate(last) : 'mai'}</b></p>
      <p class="muted">Salva il file su iCloud Drive o OneDrive. Importandolo sull'altro dispositivo i dati vengono
        uniti: per ogni giorno e abitudine vince la modifica più recente, niente viene sovrascritto per errore.</p>
      <div class="btn-row">
        <button class="btn primary" data-act="export">Esporta backup</button>
        <button class="btn" data-act="import">Importa backup</button>
        <input class="sr-only" type="file" accept=".json,application/json" tabindex="-1" aria-hidden="true">
      </div>
      ${msg ? `<p class="msg${msg.err ? ' err' : ''}" role="status">${esc(msg.text)}</p>` : ''}
    </section>
    <section class="card settings"><h2>Info</h2>
      <p class="muted">Habits 1.0 · funziona offline · i dati restano solo su questo dispositivo.</p>
    </section>`;

  const input = el.querySelector('input[type="file"]');

  el.onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'import') input.click();
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
