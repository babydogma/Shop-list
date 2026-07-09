const STORAGE_KEY = 'shopping-pwa-state-v1';
const money = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

const defaultState = {
  items: [],
  archive: []
};

let state = loadState();
let currentSort = 'new';

function loadState() {
  try {
    return {
      ...defaultState,
      ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
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

function initHome() {
  const form = document.querySelector('#item-form');
  const list = document.querySelector('#items-list');
  const empty = document.querySelector('#empty-state');
  const finish = document.querySelector('#finish-button');
  const dialog = document.querySelector('#edit-dialog');
  const editForm = document.querySelector('#edit-form');

  form.addEventListener('submit', event => {
    event.preventDefault();

    const data = new FormData(form);

    state.items.push({
      id: crypto.randomUUID(),
      name: data.get('name').trim(),
      price: Number(data.get('price')),
      quantity: Number(data.get('quantity')),
      category: data.get('category'),
      done: false,
      createdAt: Date.now()
    });

    saveState();

    form.reset();
    document.querySelector('#quantity').value = 1;

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
      document.querySelector('#edit-category').value = item.category;

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

    if (item) {
      item.name = document.querySelector('#edit-name').value.trim();
      item.price = Number(document.querySelector('#edit-price').value);
      item.quantity = Number(document.querySelector('#edit-quantity').value);
      item.category = document.querySelector('#edit-category').value;

      saveState();
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

    state.archive.unshift({
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      items: state.items.map(item => ({ ...item })),
      total: state.items.reduce((sum, item) => sum + itemSum(item), 0)
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
            ${formatCurrency(item.price)} × ${money.format(item.quantity)} = ${formatCurrency(itemSum(item))}
          </div>

          <span class="category-pill">${escapeHtml(item.category)}</span>
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

      return entry.items.some(item => item.name.toLowerCase().includes(query))
        || date.includes(query);
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

    list.innerHTML = entries.map(entry => `
      <article class="archive-entry">
        <div class="archive-date">${new Date(entry.date).toLocaleDateString('ru-RU')}</div>

        <div class="archive-items">
          ${entry.items.map(item => `
            <div class="archive-item">
              ${escapeHtml(item.name)} — ${formatCurrency(itemSum(item))}
            </div>
          `).join('')}
        </div>

        <div class="archive-total">
          Итог: ${formatCurrency(entry.total)}
        </div>
      </article>
    `).join('');

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
