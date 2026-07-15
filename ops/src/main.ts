/* ---- OPSDECK dashboard ----
 *
 * A small vanilla-TS UI that exercises the whole ops utility surface:
 * event readiness, per-unit suitability scoring, compliance, pools/shortlists,
 * stock par levels, and the ICS/CSV connectors.
 */
import {
  areaOfUnit, csv, download, eventColor, eventReadiness, ics,
  staffingFor, suitableForUnit,
} from './ops';
import { OPSDATA } from './store';
import type { EventRec, Suitability, Unit } from './types';

const app = document.getElementById('app')!;

const state = {
  eventId: OPSDATA.all('events')[0]?.id ?? '',
  unitId: '' as string,
  widen: false,
};

/* ---- tiny html helpers ---- */
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

function meter(pct: number, color: string): string {
  const p = Math.max(0, Math.min(100, pct));
  return `<span class="meter"><span class="meter-fill" style="width:${p}%;background:${color}"></span></span>`;
}

function dateLabel(e: EventRec): string {
  if (e.start && e.end && e.end !== e.start) return `${e.start} → ${e.end}`;
  return e.start || e.end || 'TBC';
}

/* ---- panels ---- */
function eventsPanel(): string {
  const events = OPSDATA.all('events');
  const rows = events.map((e) => {
    const r = eventReadiness(e);
    const col = eventColor(e.id);
    const active = e.id === state.eventId ? ' active' : '';
    return `
      <button class="ev-row${active}" data-act="pick-event" data-id="${e.id}">
        <span class="ev-dot" style="background:${col}"></span>
        <span class="ev-main">
          <span class="ev-name">${esc(e.name)}</span>
          <span class="ev-sub">${esc(dateLabel(e))} · ${esc(e.loc ?? '')}</span>
          <span class="ev-metrics">
            ${meter(r.score, col)}
            <span class="ev-score">${r.score}</span>
            <span class="tag">${r.filled}/${r.totalNeed} crew</span>
            <span class="tag">${r.confirmedPct}% conf</span>
            ${r.lowStock ? '<span class="tag warn">low stock</span>' : ''}
          </span>
        </span>
      </button>`;
  }).join('');
  return `<div class="panel">
    <div class="panel-head"><h2>Events</h2></div>
    <div class="ev-list">${rows}</div>
  </div>`;
}

function candidateRow(unit: Unit, ev: EventRec, c: Suitability): string {
  const assigned = OPSDATA.assignmentsForUnit(unit.id).find((a) => a.staffId === c.id);
  const badges = c.reasons.map((r) => `<span class="tag warn">${esc(r)}</span>`).join('');
  const tags = [
    c.skillOk ? '' : '',
    c.inPool ? '<span class="tag ok">pool</span>' : '',
    c.inShortlist ? '<span class="tag ok">shortlist</span>' : '',
    `<span class="tag">${c.pastShifts} shifts</span>`,
  ].join('');
  return `
    <div class="cand${c.blocked ? ' blocked' : ''}">
      <span class="cand-score" title="suitability score">${c.score}</span>
      <span class="cand-main">
        <span class="cand-name">${esc(c.name)} <span class="muted">· ${esc(c.area)}</span></span>
        <span class="cand-tags">${tags}${badges}</span>
      </span>
      <span class="cand-actions">
        ${assigned
          ? `<button class="btn xs" data-act="toggle-confirm" data-id="${assigned.id}">${assigned.confirmed ? '✓ confirmed' : 'confirm'}</button>
             <button class="btn xs danger" data-act="unassign" data-id="${assigned.id}">remove</button>`
          : `<button class="btn xs" data-act="assign" data-unit="${unit.id}" data-id="${c.id}">assign</button>`}
        <button class="btn xs ghost" data-act="pool" data-unit="${unit.id}" data-id="${c.id}">${c.inPool ? 'unpool' : 'pool'}</button>
        <button class="btn xs ghost" data-act="shortlist" data-unit="${unit.id}" data-event="${ev.id}" data-id="${c.id}">${c.inShortlist ? 'unshort' : 'short'}</button>
      </span>
    </div>`;
}

function stockPanel(unit: Unit): string {
  const rows = OPSDATA.stockForUnit(unit.id).map((s) => {
    const low = Number(s.qty) < Number(s.par);
    return `<tr class="${low ? 'low' : ''}">
      <td>${esc(s.item)}</td>
      <td class="num">
        <button class="btn xs ghost" data-act="stock-dec" data-unit="${unit.id}" data-item="${esc(s.item)}">−</button>
        <span class="qty">${s.qty}</span>
        <button class="btn xs ghost" data-act="stock-inc" data-unit="${unit.id}" data-item="${esc(s.item)}">+</button>
      </td>
      <td class="num muted">${s.par}</td>
      <td class="muted">${esc(s.unit)}</td>
    </tr>`;
  }).join('');
  return `<table class="stock"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Par</th><th>Unit</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function unitPanel(ev: EventRec, unit: Unit): string {
  const open = unit.id === state.unitId;
  const assigned = OPSDATA.assignmentsForUnit(unit.id);
  const need = unit.crew ?? 0;
  const cands = suitableForUnit(unit, { event: ev, widen: state.widen });
  const col = eventColor(ev.id);
  return `
    <div class="unit${open ? ' open' : ''}">
      <button class="unit-head" data-act="pick-unit" data-id="${unit.id}">
        <span class="unit-name">${esc(unit.name ?? unit.type)} <span class="muted">· ${esc(areaOfUnit(unit))}</span></span>
        <span class="unit-fill">${assigned.length}/${need}${meter(need ? (assigned.length / need) * 100 : 100, col)}</span>
        <span class="chev">${open ? '▾' : '▸'}</span>
      </button>
      ${open ? `
        <div class="unit-body">
          <div class="unit-tools">
            <label class="check"><input type="checkbox" data-act="toggle-widen" ${state.widen ? 'checked' : ''}/> show all clients</label>
            <span class="muted">${cands.length} candidates</span>
          </div>
          <div class="cands">${cands.map((c) => candidateRow(unit, ev, c)).join('')}</div>
          <div class="stock-wrap">
            <div class="stock-head">Stock</div>
            ${stockPanel(unit)}
          </div>
        </div>` : ''}
    </div>`;
}

function detailPanel(): string {
  const ev = OPSDATA.get('events', state.eventId);
  if (!ev) return `<div class="panel"><div class="empty">Select an event.</div></div>`;
  const r = eventReadiness(ev);
  const need = staffingFor(ev);
  const col = eventColor(ev.id);
  const needChips = (Object.keys(need) as Array<keyof typeof need>)
    .filter((a) => need[a] > 0)
    .map((a) => `<span class="tag">${esc(a)} ×${need[a]}</span>`)
    .join('');
  const units = OPSDATA.unitsForEvent(ev);
  return `<div class="panel">
    <div class="panel-head detail-head" style="border-color:${col}">
      <div>
        <h2>${esc(ev.name)}</h2>
        <div class="muted">${esc(dateLabel(ev))} · ${esc(ev.loc ?? '')} · call ${esc(ev.callTime ?? '—')}</div>
      </div>
      <div class="readiness">
        <div class="big-score" style="color:${col}">${r.score}</div>
        <div class="muted">readiness</div>
      </div>
    </div>
    <div class="detail-summary">
      <div class="stat"><span class="stat-k">Crew</span> ${r.filled}/${r.totalNeed} ${meter(r.crewPct, col)}</div>
      <div class="stat"><span class="stat-k">Confirmed</span> ${r.confirmedPct}% ${meter(r.confirmedPct, col)}</div>
      <div class="stat"><span class="stat-k">Stock</span> ${r.lowStock ? '<span class="tag warn">below par</span>' : '<span class="tag ok">ok</span>'}</div>
    </div>
    <div class="need-chips">${needChips || '<span class="muted">No staffing requirement.</span>'}</div>
    <div class="units">${units.map((u) => unitPanel(ev, u)).join('') || '<div class="empty">No units on this event.</div>'}</div>
  </div>`;
}

function render(): void {
  app.innerHTML = `
    <header class="topbar">
      <div class="brand"><span class="logo">◧</span> OPSDECK <span class="muted">/ mainframe</span></div>
      <div class="actions">
        <button class="btn" data-act="export-ics">Export .ics</button>
        <button class="btn" data-act="export-csv">Export .csv</button>
        <button class="btn ghost" data-act="reset">Reset data</button>
      </div>
    </header>
    <main class="grid">
      ${eventsPanel()}
      ${detailPanel()}
    </main>`;
}

/* ---- event delegation ---- */
app.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!el) return;
  const act = el.dataset.act!;
  const id = el.dataset.id ?? '';
  const unit = el.dataset.unit ?? '';
  const eventId = el.dataset.event ?? state.eventId;
  const item = el.dataset.item ?? '';

  switch (act) {
    case 'pick-event':
      state.eventId = id;
      state.unitId = '';
      break;
    case 'pick-unit':
      state.unitId = state.unitId === id ? '' : id;
      break;
    case 'assign':
      OPSDATA.assign(state.eventId, unit, id);
      break;
    case 'unassign':
      OPSDATA.unassign(id);
      break;
    case 'toggle-confirm':
      OPSDATA.toggleConfirm(id);
      break;
    case 'pool':
      OPSDATA.togglePool(unit, id);
      break;
    case 'shortlist':
      OPSDATA.toggleShortlist(eventId, unit, id);
      break;
    case 'stock-inc':
    case 'stock-dec': {
      const cur = OPSDATA.stockForUnit(unit).find((s) => s.item === item);
      if (cur) OPSDATA.setStockQty(unit, item, cur.qty + (act === 'stock-inc' ? 1 : -1));
      break;
    }
    case 'reset':
      if (confirm('Reset all data back to the seed dataset?')) OPSDATA.reset();
      break;
    case 'export-ics':
      download('opsdeck-events.ics', ics(OPSDATA.all('events')), 'text/calendar');
      return;
    case 'export-csv': {
      const headers = ['Event', 'Date', 'Location', 'Crew filled', 'Crew needed', 'Confirmed %', 'Readiness'];
      const rows = OPSDATA.all('events').map((ev) => {
        const r = eventReadiness(ev);
        return [ev.name ?? '', dateLabel(ev), ev.loc ?? '', r.filled, r.totalNeed, r.confirmedPct, r.score];
      });
      download('opsdeck-readiness.csv', csv(headers, rows), 'text/csv');
      return;
    }
    default:
      return;
  }
  render();
});

app.addEventListener('change', (e) => {
  const el = e.target as HTMLElement;
  if (el.dataset.act === 'toggle-widen') {
    state.widen = (el as HTMLInputElement).checked;
    render();
  }
});

render();
