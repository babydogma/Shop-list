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

function normalizeStores(stores) {
  const prepared = Array.isArray(stores) ? stores : [];
  const clean = prepared
    .map(store => String(store || '').trim())
    .filter(Boolean);

  return [...new Set([...DEFAULT_STORES, ...clean])];
}

function getEntryStores(items = []) {
  const stores = items
    .map(item => String(item.store || item.category || '').trim())
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

  const stores = getEntryStores(entry.items);
  return stores.join(', ');
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
        store: String(item.store || item.category || DEFAULT_STORES[0]).trim()
      })),
      archive: archive.map(entry => {
        const normalizedItems = Array.isArray(entry.items)
          ? entry.items.map(item => ({
              ...item,
              store: String(item.store || item.category || entry.store || DEFAULT_STORES[0]).trim()
            }))
          : [];

        const stores = getEntryStores(normalizedItems);

        return {
          ...entry,
          items: normalizedItems,
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

function populateStoreSelect(select, selectedValue = '') {
  if (!select) {
    return;
  }

  const currentValue = selectedValue || select.value || DEFAULT_STORES[0];
  const options = state.stores.map(store => `
    <option value="${escapeHtml(store)}">${escapeHtml(store)}</option>
  `).join('');

  select.innerHTML = `${options}<option value="${CUSTOM_STORE_VALUE}">Добавить свой магазин…</option>`;

  if (state.stores.includes(currentValue)) {
    select.value = currentValue;
  } else {
    select.value = CUSTOM_STORE_VALUE;
  }
}

function toggleCustomStoreWrap(select, wrap, input, presetValue = '') {
  if (!select || !wrap || !input) {
    return;
  }

  const isCustom = select.value === CUSTOM_STORE_VALUE;
  wrap.hidden = !isCustom;

  if (isCustom) {
    input.value = presetValue;
  } else {
    input.value = '';
  }
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

function getSelectedStore(select, input) {
  if (select.value !== CUSTOM_STORE_VALUE) {
    return select.value;
  }

  return addCustomStore(input.value);
}

function initHome() {
  const form = document.querySelector('#item-form');
  const list = document.querySelector('#items-list');
  const empty = document.querySelector('#empty-state');
  const finish = document.querySelector('#finish-button');
  const dialog = document.querySelector('#edit-dialog');
  const editForm = document.querySelector('#edit-form');

  const storeSelect = document.querySelector('#store');
  const customStoreWrap = document.querySelector('#custom-store-wrap');
  const customStoreInput = document.querySelector('#custom-store');
  const saveStoreButton = document.querySelector('#save-store-button');

  const editStoreSelect = document.querySelector('#edit-store');
  const editCustomStoreWrap = document.querySelector('#edit-custom-store-wrap');
  const editCustomStoreInput = document.querySelector('#edit-custom-store');
  const editSaveStoreButton = document.querySelector('#edit-save-store-button');

  function refreshStoreControls(homeValue = '', editValue = '') {
    populateStoreSelect(storeSelect, homeValue || storeSelect.value || DEFAULT_STORES[0]);
    populateStoreSelect(editStoreSelect, editValue || editStoreSelect.value || DEFAULT_STORES[0]);
    toggleCustomStoreWrap(storeSelect, customStoreWrap, customStoreInput);
    toggleCustomStoreWrap(editStoreSelect, editCustomStoreWrap, editCustomStoreInput);
  }

  refreshStoreControls();

  storeSelect.addEventListener('change', () => {
    toggleCustomStoreWrap(storeSelect, customStoreWrap, customStoreInput);
    if (storeSelect.value === CUSTOM_STORE_VALUE) {
      customStoreInput.focus();
    }
  });

  editStoreSelect.addEventListener('change', () => {
    toggleCustomStoreWrap(editStoreSelect, editCustomStoreWrap, editCustomStoreInput);
    if (editStoreSelect.value === CUSTOM_STORE_VALUE) {
      editCustomStoreInput.focus();
    }
  });

  saveStoreButton.addEventListener('click', () => {
    const storeName = addCustomStore(customStoreInput.value);

    if (!storeName) {
      customStoreInput.focus();
      return;
    }

    refreshStoreControls(storeName, editStoreSelect.value);
    storeSelect.value = storeName;
    toggleCustomStoreWrap(storeSelect, customStoreWrap, customStoreInput);
  });

  editSaveStoreButton.addEventListener('click', () => {
    const storeName = addCustomStore(editCustomStoreInput.value);

    if (!storeName) {
      editCustomStoreInput.focus();
      return;
    }

    refreshStoreControls(storeSelect.value, storeName);
    editStoreSelect.value = storeName;
    toggleCustomStoreWrap(editStoreSelect, editCustomStoreWrap, editCustomStoreInput);
  });

  form.addEventListener('submit', event => {
    event.preventDefault();

    const selectedStore = getSelectedStore(storeSelect, customStoreInput);

    if (!selectedStore) {
      customStoreInput.focus();
      return;
    }

    const data = new FormData(form);

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
    document.querySelector('#name').focus();
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
      editStoreSelect.value = state.stores.includes(item.store) ? item.store : CUSTOM_STORE_VALUE;
      toggleCustomStoreWrap(
        editStoreSelect,
        editCustomStoreWrap,
        editCustomStoreInput,
        state.stores.includes(item.store) ? '' : item.store
      );

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

    const selectedStore = getSelectedStore(editStoreSelect, editCustomStoreInput);

    if (!selectedStore) {
      editCustomStoreInput.focus();
      return;
    }

    const item = state.items.find(entry => {
      return entry.id === document.querySelector('#edit-id').value;
    });

    if (item) {
      item.name = document.querySelector('#edit-name').value.trim();
      item.price = Number(document.querySelector('#edit-price').value);
      item.quantity = Number(document.querySelector('#edit-quantity').value);
      item.store = selectedStore;

      saveState();
      refreshStoreControls(storeSelect.value, selectedStore);
      renderHome();
    }

    dialog.close();
  });

  document.querySelector('#cancel-edit').addEventListener('click', () => {
    dialog.close();
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
      total: state.items.reduce((sum, item) => sum + itemSum(item), 0),
      stores,
      store: stores.length === 1 ? stores[0] : ''
    });

    state.items = [];

    saveState();
    renderHome();
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

function initArchive() {
  const search = document.querySelector('#search');
  const list = document.querySelector('#archive-list');
  const empty = document.querySelector('#archive-empty');

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
        return b.total - a.total;
      }

      return new Date(b.date) - new Date(a.date);
    });

    list.innerHTML = entries.map(entry => {
      const storesLabel = getEntryStoreLabel(entry);
      const itemCount = entry.items.length;

      return `
        <article class="archive-entry">
          <div class="archive-date">${new Date(entry.date).toLocaleDateString('ru-RU')}</div>

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
            Итог: ${formatCurrency(entry.total)}
          </div>
        </article>
      `;
    }).join('');

    const spent = state.archive.reduce((sum, entry) => sum + Number(entry.total), 0);

    document.querySelector('#archive-count').textContent = state.archive.length;
    document.querySelector('#archive-total').textContent = formatCurrency(spent);

    empty.hidden = entries.length > 0;
  }

  renderArchive();
}

initPwa();

if (document.body.querySelector('[data-screen="home"]')) {
  initHome();
}

if (document.body.querySelector('[data-screen="archive"]')) {
  initArchive();
}
