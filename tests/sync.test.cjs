const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup(rows = []) {
  const storage = new Map();
  const api = { rows, failRead: false, failWrite: false, failDelete: false, writes: [] };
  const client = {
    from(table) {
      const query = {
        select() { return this; }, eq() { return this; }, order() { return this; },
        async limit() { return { data: [], error: api.failRead ? new Error('read failed') : null }; },
        async range(start, end) {
          return { data: api.rows.slice(start, end + 1), error: api.failRead ? new Error('read failed') : null };
        },
        async upsert(payload) {
          api.writes.push(payload);
          if (api.failWrite) return { error: new Error('write failed') };
          for (const row of payload) {
            const index = api.rows.findIndex((item) => item.id === row.id);
            if (index < 0) api.rows.push(row); else api.rows[index] = row;
          }
          return { error: null };
        },
        delete() { return { eq: async () => ({ error: api.failDelete ? new Error('delete failed') : null }) }; }
      };
      return query;
    }
  };
  const context = vm.createContext({
    window: { supabase: { createClient: () => client } },
    document: { querySelector: () => ({}) },
    navigator: {},
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }
  });
  const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8').replace(/^init\(\);/m, '');
  vm.runInContext(source, context);
  vm.runInContext('render = () => {}; state.user = { id: "test-user" };', context);
  return { api, context, run: (code) => vm.runInContext(code, context) };
}

const cloudRow = (id, updatedAt, goods = 'old') => ({
  id, user_id: 'test-user', date: '2026-10-09', goods, price: 35,
  dozen_qty: 1, loose_qty: 0, updated_at: updatedAt
});

test('newer offline edit survives login merge and uploads; timezone formats compare correctly', async () => {
  const { run, api } = setup([cloudRow('one', '2026-10-09T10:00:00+00:00')]);
  run('state.records = [{ id: "one", date: "2026-10-09", goods: "new", price: 35, dozenQty: 2, updatedAt: "2026-10-09T10:00:01.000Z" }];');
  await run('syncRecords()');
  assert.equal(run('state.records[0].goods'), 'new');
  assert.equal(api.rows[0].goods, 'new');
  assert.equal(run('state.syncStatus'), '已同步');
});

test('newer cloud edit replaces stale local data without uploading stale records', async () => {
  const { run, api } = setup([cloudRow('one', '2026-10-09T10:00:02+00:00', 'cloud-new')]);
  run('state.records = [{ id: "one", updatedAt: "2026-10-09T10:00:01.000Z", goods: "stale" }];');
  await run('syncRecords()');
  assert.equal(run('state.records[0].goods'), 'cloud-new');
  assert.equal(api.writes.length, 0);
});

test('read failure preserves local records and never writes or claims success', async () => {
  const { run, api } = setup();
  api.failRead = true;
  run('state.records = [{ id: "one", goods: "local" }];');
  await run('syncRecords()');
  assert.equal(run('state.records[0].goods'), 'local');
  assert.equal(api.writes.length, 0);
  assert.equal(run('state.syncStatus'), '本机已保存，待同步');
});

test('failed upload stays local and a subsequent retry uploads it', async () => {
  const { run, api } = setup();
  api.failWrite = true;
  run('state.records = [{ id: "one", goods: "local", price: 35, dozenQty: 1, date: "2026-10-09", updatedAt: "2026-10-09T10:00:00Z" }];');
  await run('syncRecords()');
  assert.equal(run('state.syncStatus'), '本机已保存，待同步');
  api.failWrite = false;
  await run('syncRecords()');
  assert.equal(api.rows.length, 1);
  assert.equal(run('state.syncStatus'), '已同步');
});

test('cloud reads paginate beyond the default response limit', async () => {
  const { run } = setup(Array.from({ length: 1201 }, (_, i) => cloudRow(String(i), '2026-10-09T10:00:00Z')));
  await run('syncRecords()');
  assert.equal(run('state.records.length'), 1201);
});

test('failed permanent delete reports failure so the caller retains the trash record', async () => {
  const { run, api } = setup();
  api.failDelete = true;
  assert.equal(await run('deleteCloudRecord("one")'), false);
  assert.equal(run('state.syncStatus'), '彻底删除失败，记录仍在回收站');
});

test('report history failures are surfaced rather than shown as a successful refresh', async () => {
  const { run, api } = setup();
  api.failRead = true;
  assert.equal(await run('mergeCloudReportRanges()'), false);
  assert.match(run('els.reportHistory.textContent'), /同步失败/);
});

test('report payload retains its captured account and month when the view changes', () => {
  const { run } = setup();
  run('state.activeMonth = new Date(2026, 9, 1);');
  const payload = run('reportRangeToCloud({ id: "range-one", range: { all: true }, createdAt: "2026-09-09T00:00:00Z" }, "2026-09", "original-user")');
  assert.equal(payload.month, '2026-09');
  assert.equal(payload.user_id, 'original-user');
});

test('service worker never serves cloud data from the offline asset cache', () => {
  const handlers = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../service-worker.js'), 'utf8'), {
    URL,
    self: {
      location: { origin: 'https://1353320289.github.io' },
      addEventListener: (name, handler) => { handlers[name] = handler; }
    }
  });
  let intercepted = false;
  handlers.fetch({
    request: { method: 'GET', url: 'https://xbelcicqzulbexljkttq.supabase.co/rest/v1/ledger_records' },
    respondWith() { intercepted = true; }
  });
  assert.equal(intercepted, false);
});
