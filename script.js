const STORAGE_KEY = 'shopping-pwa-state-v1';
const CUSTOM_STORE_VALUE = '__custom__';
const DEFAULT_STORES = ['Перекресток', 'Пятерочка', 'Дикси', 'Магнит', 'Вкусвилл'];
const money = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

const defaultState = {
  items: [],
  archive: [],
  stores: [...DEFAULT_STORES]
};

let state = loadState();
let currentSort = 'new';
let customStoreContext = null;

function normalizeStores(stores) {
  const prepared = Array.isArray(stores) ? stores : [];
  const clean = prepared
    .map(store => String(store || '').trim())
    .filter(Boolean);

  return [...new Set([...DEFAULT_STORES, ...clean])];
}

function normalizeStore(value) {
  const store = String(value || '').trim();
  return store || DEFAULT_STORES[0];
}

function getEntryStores(items = []) {
  const stores = items
    .map(item => normalizeStore(item.store))
    .filter(Boolean);

  return [...new Set(stores)];
}

function getEntryStoreLabel(entry) {
  if (entry.store) {
    return entry.store;
  }

  if (Array.isArray(entry.stores) && entry.stores.length) {
    return entry.stores.join(', ');
  }

  return getEntryStores(entry.items).join(', ');
}

function calculateEntryTotal(entry) {
  return (entry.items || []).reduce((sum, item) => sum + itemSum(item), 0);
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    const archive = Array.isArray(parsed.archive) ? parsed.archive : [];

    return {
      ...defaultState,
      ...parsed,
      stores: normalizeStores(parsed.stores),
      items: items.map(item => ({
        ...item,
        store: normalizeStore(item.store)
      })),
      archive: archive.map(entry => {
        const normalizedItems = Array.isArray(entry.items)
          ? entry.items.map(item => ({
              ...item,
              id: item.id || crypto.randomUUID(),
              store: normalizeStore(item.store || entry.store)
            }))
          : [];

        const stores = getEntryStores(normalizedItems);

        return {
          ...entry,
          id: entry.id || crypto.randomUUID(),
          items: normalizedItems,
          total: normalizedItems.reduce((sum, item) => sum + itemSum(item), 0),
          stores,
          store: stores.length === 1 ? stores[0] : ''
        };
      })
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatCurrency(value) {
  return `${money.format(Math.round((Number(value) || 0) * 100) / 100)} ₽`;
}

function formatNumber(value) {
  return money.format(Math.round((Number(value) || 0) * 100) / 100);
}

function itemSum(item) {
  return Number(item.price) * Number(item.quantity);
}

function pluralItems(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} товар`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} товара`;
  }

  return `${count} товаров`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));
}

function initPwa() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(console.error);
  }
}

function dismissKeyboard() {
  const active = document.activeElement;

  if (active && typeof active.blur === 'function') {
    active.blur();
  }

  document.querySelectorAll('input, select, textarea').forEach(control => control.blur());
}

function populateStoreSelect(select, selectedValue = '') {
  if (!select) {
    return;
  }

  const currentValue = selectedValue || select.value || DEFAULT_STORES[0];
  const options = state.stores.map(store => `
    <option value="${escapeHtml(store)}">${escapeHtml(store)}</option>
  `).join('');

  select.innerHTML = `${options}<option value="${CUSTOM_STORE_VALUE}">Добавить свой магазин…</option>`;
  select.value = state.stores.includes(currentValue) ? currentValue : DEFAULT_STORES[0];
  select.dataset.lastValue = select.value;
}

function addCustomStore(value) {
  const name = String(value || '').trim();

  if (!name) {
    return '';
  }

  const existingStore = state.stores.find(store => store.toLowerCase() === name.toLowerCase());

  if (existingStore) {
    return existingStore;
  }

  state.stores.push(name);
  saveState();
  return name;
}

function setupCustomStoreDialog() {
  const dialog = document.querySelector('#custom-store-dialog');
  const form = document.querySelector('#custom-store-form');
  const input = document.querySelector('#custom-store-name');
  const cancelButton = document.querySelector('#cancel-custom-store');

  if (!dialog || !form || !input || !cancelButton) {
    return;
  }

  function cancelCustomStore() {
    if (customStoreContext?.select) {
      customStoreContext.select.value = customStoreContext.previousValue || DEFAULT_STORES[0];
      customStoreContext.select.dataset.lastValue = customStoreContext.select.value;
    }

    customStoreContext = null;
    form.reset();
    dialog.close();
  }

  cancelButton.addEventListener('click', cancelCustomStore);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    cancelCustomStore();
  });

  form.addEventListener('submit', event => {
    event.preventDefault();

    const storeName = addCustomStore(input.value);

    if (!storeName || !customStoreContext?.select) {
      input.focus();
      return;
    }

    const { select, onSaved } = customStoreContext;
    populateStoreSelect(select, storeName);
    select.value = storeName;
    select.dataset.lastValue = storeName;

    customStoreContext = null;
    form.reset();
    dialog.close();

    if (typeof onSaved === 'function') {
      onSaved(storeName, select);
    }
  });
}

function openCustomStoreDialog(select, onSaved) {
  const dialog = document.querySelector('#custom-store-dialog');
  const input = document.querySelector('#custom-store-name');

  if (!dialog || !input) {
    select.value = select.dataset.lastValue || DEFAULT_STORES[0];
    return;
  }

  customStoreContext = {
    select,
    previousValue: select.dataset.lastValue || DEFAULT_STORES[0],
    onSaved
  };

  input.value = '';
  dialog.showModal();
  window.setTimeout(() => input.focus(), 50);
}

function handleStoreSelectChange(select, onSaved) {
  if (select.value === CUSTOM_STORE_VALUE) {
    openCustomStoreDialog(select, onSaved);
    return;
  }

  select.dataset.lastValue = select.value;
}

function initHome() {
  const form = document.querySelector('#item-form');
  const list = document.querySelector('#items-list');
  const empty = document.querySelector('#empty-state');
  const finish = document.querySelector('#finish-button');
  const dialog = document.querySelector('#edit-dialog');
  const editForm = document.querySelector('#edit-form');
  const storeSelect = document.querySelector('#store');
  const editStoreSelect = document.querySelector('#edit-store');

  function refreshStoreControls(homeValue = '', editValue = '') {
    populateStoreSelect(storeSelect, homeValue || storeSelect.value || DEFAULT_STORES[0]);
    populateStoreSelect(editStoreSelect, editValue || editStoreSelect.value || DEFAULT_STORES[0]);
  }

  refreshStoreControls();

  storeSelect.addEventListener('change', () => {
    handleStoreSelectChange(storeSelect, storeName => {
      refreshStoreControls(storeName, editStoreSelect.value);
      storeSelect.value = storeName;
      storeSelect.dataset.lastValue = storeName;
    });
  });

  editStoreSelect.addEventListener('change', () => {
    handleStoreSelectChange(editStoreSelect, storeName => {
      refreshStoreControls(storeSelect.value, storeName);
      editStoreSelect.value = storeName;
      editStoreSelect.dataset.lastValue = storeName;
    });
  });

  form.addEventListener('submit', event => {
    event.preventDefault();

    const data = new FormData(form);
    const selectedStore = storeSelect.value;

    if (!selectedStore || selectedStore === CUSTOM_STORE_VALUE) {
      return;
    }

    state.items.push({
      id: crypto.randomUUID(),
      name: data.get('name').trim(),
      price: Number(data.get('price')),
      quantity: Number(data.get('quantity')),
      store: selectedStore,
      done: false,
      createdAt: Date.now()
    });

    saveState();

    form.reset();
    document.querySelector('#quantity').value = 1;
    refreshStoreControls(selectedStore, editStoreSelect.value);
    renderHome();

    window.requestAnimationFrame(dismissKeyboard);
  });

  list.addEventListener('click', event => {
    const card = event.target.closest('.item-card');

    if (!card) {
      return;
    }

    const item = state.items.find(entry => entry.id === card.dataset.id);

    if (!item) {
      return;
    }

    if (event.target.matches('[data-action="delete"]')) {
      state.items = state.items.filter(entry => entry.id !== item.id);
      saveState();
      renderHome();
    }

    if (event.target.matches('[data-action="edit"]')) {
      document.querySelector('#edit-id').value = item.id;
      document.querySelector('#edit-name').value = item.name;
      document.querySelector('#edit-price').value = item.price;
      document.querySelector('#edit-quantity').value = item.quantity;
      refreshStoreControls(storeSelect.value, item.store);
      dialog.showModal();
    }
  });

  list.addEventListener('change', event => {
    if (!event.target.matches('[data-action="toggle"]')) {
      return;
    }

    const item = state.items.find(entry => {
      return entry.id === event.target.closest('.item-card').dataset.id;
    });

    if (item) {
      item.done = event.target.checked;
      saveState();
      renderHome();
    }
  });

  editForm.addEventListener('submit', event => {
    event.preventDefault();

    const item = state.items.find(entry => {
      return entry.id === document.querySelector('#edit-id').value;
    });

    if (item && editStoreSelect.value !== CUSTOM_STORE_VALUE) {
      item.name = document.querySelector('#edit-name').value.trim();
      item.price = Number(document.querySelector('#edit-price').value);
      item.quantity = Number(document.querySelector('#edit-quantity').value);
      item.store = editStoreSelect.value;

      saveState();
      refreshStoreControls(storeSelect.value, item.store);
      renderHome();
    }

    dialog.close();
    window.requestAnimationFrame(dismissKeyboard);
  });

  document.querySelector('#cancel-edit').addEventListener('click', () => {
    dialog.close();
    window.requestAnimationFrame(dismissKeyboard);
  });

  finish.addEventListener('click', () => {
    if (!state.items.length) {
      return;
    }

    const archivedItems = state.items.map(item => ({ ...item }));
    const stores = getEntryStores(archivedItems);

    state.archive.unshift({
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      items: archivedItems,
      total: archivedItems.reduce((sum, item) => sum + itemSum(item), 0),
      stores,
      store: stores.length === 1 ? stores[0] : ''
    });

    state.items = [];

    saveState();
    renderHome();
    window.requestAnimationFrame(dismissKeyboard);
  });

  function renderHome() {
    const sorted = [...state.items].sort((a, b) => {
      return Number(a.done) - Number(b.done) || a.createdAt - b.createdAt;
    });

    list.innerHTML = sorted.map(item => `
      <article class="item-card ${item.done ? 'done' : ''}" data-id="${item.id}">
        <input
          type="checkbox"
          data-action="toggle"
          ${item.done ? 'checked' : ''}
          aria-label="Отметить купленным"
        >

        <div class="item-main">
          <div class="item-name">${escapeHtml(item.name)}</div>

          <div class="item-meta">
            ${formatCurrency(item.price)} × ${formatNumber(item.quantity)} = ${formatCurrency(itemSum(item))}
          </div>

          <span class="category-pill">${escapeHtml(item.store)}</span>
        </div>

        <div class="item-actions">
          <button class="small-action" data-action="edit" aria-label="Редактировать">✏️</button>
          <button class="small-action delete" data-action="delete" aria-label="Удалить">×</button>
        </div>
      </article>
    `).join('');

    const total = state.items.reduce((sum, item) => sum + itemSum(item), 0);
    const left = state.items
      .filter(item => !item.done)
      .reduce((sum, item) => sum + itemSum(item), 0);

    document.querySelector('#total-sum').textContent = formatCurrency(total);
    document.querySelector('#left-sum').textContent = formatCurrency(left);
    document.querySelector('#items-count').textContent = pluralItems(state.items.length);

    empty.hidden = state.items.length > 0;
    finish.disabled = state.items.length === 0;
  }

  renderHome();
}

function dateToInputValue(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function initArchive() {
  const search = document.querySelector('#search');
  const list = document.querySelector('#archive-list');
  const empty = document.querySelector('#archive-empty');
  const editDialog = document.querySelector('#archive-edit-dialog');
  const editForm = document.querySelector('#archive-edit-form');
  const editItems = document.querySelector('#archive-edit-items');
  const editDate = document.querySelector('#archive-edit-date');
  const editId = document.querySelector('#archive-edit-id');

  function createArchiveEditRow(item = {}) {
    const row = document.createElement('section');
    row.className = 'archive-edit-item';
    row.dataset.itemId = item.id || crypto.randomUUID();
    row.innerHTML = `
      <div class="archive-edit-item-head">
        <strong>Товар</strong>
        <button class="remove-archive-item" type="button" data-action="remove-archive-item" aria-label="Удалить товар">×</button>
      </div>

      <label>
        <span>Название</span>
        <input data-field="name" type="text" value="${escapeHtml(item.name || '')}" required maxlength="80">
      </label>

      <div class="form-grid">
        <label>
          <span>Цена</span>
          <input data-field="price" type="number" inputmode="decimal" min="0" step="0.01" value="${Number(item.price) || 0}" required>
        </label>

        <label>
          <span>Количество</span>
          <input data-field="quantity" type="number" inputmode="decimal" min="0.01" step="0.01" value="${Number(item.quantity) || 1}" required>
        </label>
      </div>

      <label>
        <span>Магазин</span>
        <select data-field="store"></select>
      </label>
    `;

    populateStoreSelect(row.querySelector('[data-field="store"]'), normalizeStore(item.store));
    return row;
  }

  function refreshArchiveStoreSelects(selectedSelect, newStore) {
    editItems.querySelectorAll('select[data-field="store"]').forEach(select => {
      const value = select === selectedSelect ? newStore : select.value;
      populateStoreSelect(select, value);
    });
  }

  function openArchiveEdit(entry) {
    editId.value = entry.id;
    editDate.value = dateToInputValue(entry.date);
    editItems.innerHTML = '';

    entry.items.forEach(item => {
      editItems.appendChild(createArchiveEditRow(item));
    });

    editDialog.showModal();
  }

  function closeArchiveEdit() {
    editDialog.close();
    window.requestAnimationFrame(dismissKeyboard);
  }

  document.querySelector('.filter-row').addEventListener('click', event => {
    if (!event.target.matches('.filter-chip')) {
      return;
    }

    currentSort = event.target.dataset.sort;

    document.querySelectorAll('.filter-chip').forEach(button => {
      button.classList.toggle('active', button === event.target);
    });

    renderArchive();
  });

  search.addEventListener('input', renderArchive);

  list.addEventListener('click', event => {
    const entryCard = event.target.closest('.archive-entry');

    if (!entryCard) {
      return;
    }

    const entry = state.archive.find(item => item.id === entryCard.dataset.id);

    if (!entry) {
      return;
    }

    if (event.target.closest('[data-action="edit-archive"]')) {
      openArchiveEdit(entry);
      return;
    }

    if (event.target.closest('[data-action="delete-archive"]')) {
      const shouldDelete = window.confirm('Удалить эту покупку из архива?');

      if (!shouldDelete) {
        return;
      }

      state.archive = state.archive.filter(item => item.id !== entry.id);
      saveState();
      renderArchive();
    }
  });

  editItems.addEventListener('click', event => {
    if (!event.target.closest('[data-action="remove-archive-item"]')) {
      return;
    }

    const rows = editItems.querySelectorAll('.archive-edit-item');

    if (rows.length === 1) {
      window.alert('В покупке должен остаться хотя бы один товар.');
      return;
    }

    event.target.closest('.archive-edit-item').remove();
  });

  editItems.addEventListener('change', event => {
    const select = event.target.closest('select[data-field="store"]');

    if (!select) {
      return;
    }

    handleStoreSelectChange(select, storeName => {
      refreshArchiveStoreSelects(select, storeName);
    });
  });

  document.querySelector('#archive-add-item').addEventListener('click', () => {
    editItems.appendChild(createArchiveEditRow({
      id: crypto.randomUUID(),
      name: '',
      price: 0,
      quantity: 1,
      store: DEFAULT_STORES[0]
    }));

    const rows = editItems.querySelectorAll('.archive-edit-item');
    rows[rows.length - 1].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  editForm.addEventListener('submit', event => {
    event.preventDefault();

    if (!editForm.reportValidity()) {
      return;
    }

    const entry = state.archive.find(item => item.id === editId.value);

    if (!entry) {
      closeArchiveEdit();
      return;
    }

    const items = [...editItems.querySelectorAll('.archive-edit-item')].map(row => ({
      id: row.dataset.itemId || crypto.randomUUID(),
      name: row.querySelector('[data-field="name"]').value.trim(),
      price: Number(row.querySelector('[data-field="price"]').value),
      quantity: Number(row.querySelector('[data-field="quantity"]').value),
      store: row.querySelector('[data-field="store"]').value,
      done: true,
      createdAt: entry.date ? new Date(entry.date).getTime() : Date.now()
    }));

    if (items.some(item => !item.name || !item.store || item.store === CUSTOM_STORE_VALUE)) {
      return;
    }

    const stores = getEntryStores(items);
    entry.date = new Date(`${editDate.value}T12:00:00`).toISOString();
    entry.items = items;
    entry.total = items.reduce((sum, item) => sum + itemSum(item), 0);
    entry.stores = stores;
    entry.store = stores.length === 1 ? stores[0] : '';

    saveState();
    closeArchiveEdit();
    renderArchive();
  });

  document.querySelector('#cancel-archive-edit').addEventListener('click', closeArchiveEdit);
  document.querySelector('#close-archive-edit').addEventListener('click', closeArchiveEdit);
  editDialog.addEventListener('cancel', event => {
    event.preventDefault();
    closeArchiveEdit();
  });

  function renderArchive() {
    const query = search.value.trim().toLowerCase();

    let entries = state.archive.filter(entry => {
      const date = new Date(entry.date).toLocaleDateString('ru-RU');
      const storesLabel = getEntryStoreLabel(entry).toLowerCase();

      return entry.items.some(item => item.name.toLowerCase().includes(query))
        || date.includes(query)
        || storesLabel.includes(query);
    });

    entries = entries.sort((a, b) => {
      if (currentSort === 'old') {
        return new Date(a.date) - new Date(b.date);
      }

      if (currentSort === 'sum') {
        return calculateEntryTotal(b) - calculateEntryTotal(a);
      }

      return new Date(b.date) - new Date(a.date);
    });

    list.innerHTML = entries.map(entry => {
      const storesLabel = getEntryStoreLabel(entry);
      const itemCount = entry.items.length;
      const total = calculateEntryTotal(entry);

      return `
        <article class="archive-entry" data-id="${entry.id}">
          <div class="archive-entry-head">
            <div class="archive-date">${new Date(entry.date).toLocaleDateString('ru-RU')}</div>

            <div class="archive-actions">
              <button class="archive-action" type="button" data-action="edit-archive" aria-label="Редактировать покупку">✏️</button>
              <button class="archive-action delete" type="button" data-action="delete-archive" aria-label="Удалить покупку">×</button>
            </div>
          </div>

          <div class="archive-meta-row">
            <span class="archive-meta-pill">Товаров: ${itemCount}</span>
            <span class="archive-meta-pill">Магазин: ${escapeHtml(storesLabel || '—')}</span>
          </div>

          <div class="archive-items">
            ${entry.items.map(item => `
              <div class="archive-item">
                ${escapeHtml(item.name)} × ${formatNumber(item.quantity)} — ${formatCurrency(itemSum(item))}
              </div>
            `).join('')}
          </div>

          <div class="archive-total">
            Итог: ${formatCurrency(total)}
          </div>
        </article>
      `;
    }).join('');

    const spent = state.archive.reduce((sum, entry) => sum + calculateEntryTotal(entry), 0);

    document.querySelector('#archive-count').textContent = state.archive.length;
    document.querySelector('#archive-total').textContent = formatCurrency(spent);

    empty.hidden = entries.length > 0;
  }

  renderArchive();
}

initPwa();
setupCustomStoreDialog();

if (document.body.querySelector('[data-screen="home"]')) {
  initHome();
}

if (document.body.querySelector('[data-screen="archive"]')) {
  initArchive();
}
