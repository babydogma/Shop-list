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

let productCatalogPromise = null;
let tesseractLoadPromise = null;
let activeReceiptWorker = null;
let receiptScanCancelled = false;

function ensureTesseractLoaded() {
  if (window.Tesseract?.createWorker) {
    return Promise.resolve(window.Tesseract);
  }

  if (!tesseractLoadPromise) {
    tesseractLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.async = true;
      script.onload = () => {
        if (window.Tesseract?.createWorker) {
          resolve(window.Tesseract);
          return;
        }

        reject(new Error('Модуль распознавания загрузился некорректно.'));
      };
      script.onerror = () => {
        tesseractLoadPromise = null;
        reject(new Error('Не удалось загрузить модуль распознавания. Проверьте подключение к интернету.'));
      };
      document.head.appendChild(script);
    });
  }

  return tesseractLoadPromise;
}

function loadProductCatalog() {
  if (!productCatalogPromise) {
    productCatalogPromise = fetch('products.json')
      .then(response => {
        if (!response.ok) {
          throw new Error('Не удалось загрузить справочник продуктов.');
        }

        return response.json();
      })
      .then(data => Array.isArray(data.products) ? data.products : [])
      .catch(error => {
        productCatalogPromise = null;
        throw error;
      });
  }

  return productCatalogPromise;
}

function normalizeSearchText(value) {
  const latinToCyrillic = {
    a: 'а', b: 'в', e: 'е', k: 'к', m: 'м', h: 'н', o: 'о', p: 'р',
    c: 'с', t: 'т', x: 'х', y: 'у'
  };

  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[abekmhopctxy]/g, char => latinToCyrillic[char] || char)
    .replace(/[^\p{L}\p{N}%]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeComparableName(value) {
  return normalizeSearchText(value)
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:кг|г|гр|л|мл|шт|уп|пач|бут|бан|%)\b/gu, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(first, second) {
  const a = String(first || '');
  const b = String(second || '');

  if (!a.length) {
    return b.length;
  }

  if (!b.length) {
    return a.length;
  }

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
    }

    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[b.length];
}

function similarity(first, second) {
  const a = normalizeComparableName(first);
  const b = normalizeComparableName(second);
  const maxLength = Math.max(a.length, b.length);

  if (!maxLength) {
    return 1;
  }

  return 1 - levenshteinDistance(a, b) / maxLength;
}

function matchProduct(value, catalog) {
  const text = normalizeComparableName(value);

  if (!text || text.length < 3) {
    return null;
  }

  const textTokens = text.split(' ').filter(token => token.length >= 2);
  let best = null;

  catalog.forEach(product => {
    const variants = [product.name, ...(product.aliases || [])];

    variants.forEach(variant => {
      const alias = normalizeComparableName(variant);

      if (!alias) {
        return;
      }

      const aliasTokens = alias.split(' ').filter(token => token.length >= 2);
      let score = 0;

      if (text === alias) {
        score = 1;
      } else if (alias.length >= 4 && text.includes(alias)) {
        score = 0.91 + Math.min(alias.length / 250, 0.07);
      } else if (text.length >= 4 && alias.includes(text) && text.split(' ').length > 1) {
        score = 0.82;
      } else if (aliasTokens.length) {
        const matchedTokens = aliasTokens.filter(aliasToken => {
          return textTokens.some(textToken => {
            if (textToken === aliasToken) {
              return true;
            }

            if (Math.min(textToken.length, aliasToken.length) < 5) {
              return false;
            }

            return similarity(textToken, aliasToken) >= 0.78;
          });
        });

        const tokenScore = matchedTokens.length / aliasTokens.length;

        if (tokenScore === 1) {
          score = aliasTokens.length > 1 ? 0.88 : 0.76;
        } else if (tokenScore >= 0.67 && aliasTokens.length >= 2) {
          score = 0.68;
        }
      }

      if (score < 0.74 && Math.max(text.length, alias.length) <= 34) {
        const fuzzyScore = similarity(text, alias);

        if (fuzzyScore >= 0.78) {
          score = Math.max(score, fuzzyScore * 0.88);
        }
      }

      score += Math.min(alias.length / 1000, 0.025);

      if (!best || score > best.score) {
        best = { product, score, alias: variant };
      }
    });
  });

  return best && best.score >= 0.69 ? best : null;
}

function normalizeOcrMoneyText(value) {
  return String(value || '')
    .replace(/(\d)\s+[,.]\s*(\d{2})(?!\d)/g, '$1.$2')
    .replace(/(\d{1,5})\s+(\d{2})(?=\s*(?:₽|руб|р\b|$))/giu, '$1.$2');
}

function parseDecimal(value) {
  const number = Number(String(value || '').replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function extractLineNumbers(value) {
  const line = normalizeOcrMoneyText(value);
  const moneyValues = [];
  const moneyPattern = /(?:^|[^\d])([0-9]{1,6}[.,][0-9]{2})(?!\d)/g;
  let moneyMatch;

  while ((moneyMatch = moneyPattern.exec(line)) !== null) {
    moneyValues.push(parseDecimal(moneyMatch[1]));
  }

  const quantityMatch = line.match(/([0-9]+(?:[.,][0-9]{1,3})?)\s*(?:x|х|×|\*)\s*([0-9]+(?:[.,][0-9]{1,2})?)/i);
  let quantity = 1;
  let unitPrice = moneyValues.length ? moneyValues[moneyValues.length - 1] : 0;
  let total = unitPrice;

  if (quantityMatch) {
    quantity = Math.max(parseDecimal(quantityMatch[1]), 0.001);
    const priceFromMultiplier = parseDecimal(quantityMatch[2]);

    if (moneyValues.length >= 2) {
      total = moneyValues[moneyValues.length - 1];
      unitPrice = total / quantity;
    } else if (priceFromMultiplier > 0) {
      unitPrice = priceFromMultiplier;
      total = quantity * unitPrice;
    }
  }

  if (!quantityMatch && moneyValues.length >= 2) {
    const possibleQuantity = moneyValues[0];

    if (possibleQuantity > 0 && possibleQuantity <= 20 && Number.isInteger(possibleQuantity)) {
      total = moneyValues[moneyValues.length - 1];
      quantity = possibleQuantity;
      unitPrice = total / quantity;
    }
  }

  return {
    quantity: Math.round(quantity * 1000) / 1000,
    unitPrice: Math.round(unitPrice * 100) / 100,
    total: Math.round(total * 100) / 100,
    hasPrice: total > 0,
    moneyValues
  };
}

function cleanReceiptItemName(value) {
  return String(value || '')
    .replace(/\b[0-9]+(?:[.,][0-9]{1,3})?\s*(?:x|х|×|\*)\s*[0-9]+(?:[.,][0-9]{1,2})?\b/giu, ' ')
    .replace(/(?:^|[^\d])[0-9]{1,6}[.,][0-9]{2}(?!\d)/g, ' ')
    .replace(/\b(?:итог|итого|сумма|скидка|ндс|без ндс)\b/giu, ' ')
    .replace(/^[\s#№*\-–—=.\d]+/g, '')
    .replace(/[|_=]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

function isReceiptNoiseLine(value) {
  const line = normalizeSearchText(value);

  if (!line || line.length < 2) {
    return true;
  }

  const noisePhrases = [
    'кассовый чек', 'приход', 'касса', 'кассир', 'смена', 'итог', 'итого',
    'всего', 'сумма', 'скидка', 'оплата', 'наличными', 'безналичными', 'карта',
    'сдача', 'ндс', 'фн', 'фд', 'фп', 'ккт', 'инн', 'сайт фнс', 'налог',
    'спасибо за покупку', 'дата', 'время', 'номер чека', 'магазин', 'адрес',
    'бонус', 'баллы', 'куплено', 'позиций', 'продавец', 'телефон'
  ];

  return noisePhrases.some(phrase => line.includes(phrase));
}

function hasMeaningfulLetters(value) {
  return (String(value || '').match(/[\p{L}]/gu) || []).length >= 3;
}

function findFollowingPriceLine(lines, startIndex, catalog) {
  for (let index = startIndex + 1; index <= Math.min(startIndex + 2, lines.length - 1); index += 1) {
    const candidate = lines[index];
    const numbers = extractLineNumbers(candidate);
    const anotherProduct = matchProduct(candidate, catalog);

    if (numbers.hasPrice && !anotherProduct && !isReceiptNoiseLine(candidate)) {
      return { index, line: candidate, numbers };
    }
  }

  return null;
}

function parseReceiptText(text, catalog) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const positions = [];
  const seen = new Set();

  function addPosition(receiptLine, nameLine, numbers, match) {
    if (!numbers.hasPrice || numbers.total <= 0 || numbers.total > 1000000) {
      return;
    }

    const cleanedName = cleanReceiptItemName(nameLine || receiptLine);
    const finalName = match?.product?.name || cleanedName;

    if (!finalName || !hasMeaningfulLetters(finalName)) {
      return;
    }

    const key = `${normalizeComparableName(finalName)}|${numbers.total}|${numbers.quantity}`;

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    positions.push({
      id: crypto.randomUUID(),
      catalogId: match?.product?.id || '',
      catalogName: match?.product?.name || '',
      receiptName: cleanedName || finalName,
      name: finalName,
      quantity: numbers.quantity || 1,
      price: numbers.unitPrice || numbers.total,
      total: numbers.total,
      confidence: match?.score || 0,
      matched: Boolean(match),
      sourceLine: receiptLine
    });
  }

  for (let index = 0; index < lines.length && positions.length < 80; index += 1) {
    const line = lines[index];
    const productMatch = matchProduct(line, catalog);
    const numbers = extractLineNumbers(line);
    const noise = isReceiptNoiseLine(line);

    if (productMatch && numbers.hasPrice) {
      addPosition(line, line, numbers, productMatch);
      continue;
    }

    if (productMatch && !numbers.hasPrice) {
      const following = findFollowingPriceLine(lines, index, catalog);

      if (following) {
        addPosition(`${line} ${following.line}`, line, following.numbers, productMatch);
        index = following.index;
      }

      continue;
    }

    if (noise) {
      continue;
    }

    if (numbers.hasPrice && hasMeaningfulLetters(line)) {
      addPosition(line, line, numbers, null);
      continue;
    }

    if (!numbers.hasPrice && hasMeaningfulLetters(line)) {
      const following = findFollowingPriceLine(lines, index, catalog);

      if (following) {
        addPosition(`${line} ${following.line}`, line, following.numbers, null);
        index = following.index;
      }
    }
  }

  return positions;
}

function detectReceiptStore(text) {
  const value = normalizeSearchText(text);
  const variants = [
    { store: 'Перекресток', patterns: ['перекресток', 'perekrestok'] },
    { store: 'Пятерочка', patterns: ['пятерочка', 'пятерочка', '5ка', '5 ka'] },
    { store: 'Дикси', patterns: ['дикси', 'dixy'] },
    { store: 'Магнит', patterns: ['магнит', 'magnit'] },
    { store: 'Вкусвилл', patterns: ['вкусвилл', 'вкус вилл', 'vkusvill'] }
  ];

  return variants.find(entry => entry.patterns.some(pattern => value.includes(normalizeSearchText(pattern))))?.store || '';
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось открыть изображение.'));
    };

    image.src = url;
  });
}

async function prepareReceiptImage(file) {
  const image = await loadImageElement(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const targetMinWidth = 1400;
  const targetMaxWidth = 2200;
  const targetMaxHeight = 3600;
  let scale = sourceWidth < targetMinWidth ? targetMinWidth / sourceWidth : 1;

  scale = Math.min(scale, targetMaxWidth / sourceWidth, targetMaxHeight / sourceHeight);

  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });

  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height);

  const imageData = context.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  for (let index = 0; index < pixels.length; index += 4) {
    const gray = pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
    const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128));
    pixels[index] = contrasted;
    pixels[index + 1] = contrasted;
    pixels[index + 2] = contrasted;
  }

  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.92);
}

function findExistingReceiptMatch(position, catalog, usedIds) {
  if (position.catalogId) {
    const byCatalog = state.items.find(item => {
      if (usedIds.has(item.id)) {
        return false;
      }

      return matchProduct(item.name, catalog)?.product?.id === position.catalogId;
    });

    if (byCatalog) {
      return byCatalog;
    }
  }

  const normalizedName = normalizeComparableName(position.name);
  let best = null;

  state.items.forEach(item => {
    if (usedIds.has(item.id)) {
      return;
    }

    const itemName = normalizeComparableName(item.name);
    const score = itemName === normalizedName ? 1 : similarity(itemName, normalizedName);

    if (score >= 0.74 && (!best || score > best.score)) {
      best = { item, score };
    }
  });

  return best?.item || null;
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

  const scanButton = document.querySelector('#scan-receipt-button');
  const cameraInput = document.querySelector('#receipt-camera-input');
  const fileInput = document.querySelector('#receipt-file-input');
  const sourceDialog = document.querySelector('#receipt-source-dialog');
  const progressDialog = document.querySelector('#receipt-progress-dialog');
  const reviewDialog = document.querySelector('#receipt-review-dialog');
  const reviewForm = document.querySelector('#receipt-review-form');
  const receiptStoreSelect = document.querySelector('#receipt-store');
  const comparisonList = document.querySelector('#receipt-comparison-list');
  const missingSection = document.querySelector('#receipt-missing-section');
  const missingList = document.querySelector('#receipt-missing-list');
  const rawText = document.querySelector('#receipt-raw-text');
  const reviewSummary = document.querySelector('#receipt-review-summary');
  const progressText = document.querySelector('#receipt-progress-text');
  const progressBar = document.querySelector('#receipt-progress-bar');
  const preview = document.querySelector('#receipt-preview');

  let currentReceiptCatalog = [];
  let currentReceiptPositions = [];
  let usedExistingIds = new Set();

  function refreshStoreControls(homeValue = '', editValue = '', receiptValue = '') {
    populateStoreSelect(storeSelect, homeValue || storeSelect.value || DEFAULT_STORES[0]);
    populateStoreSelect(editStoreSelect, editValue || editStoreSelect.value || DEFAULT_STORES[0]);
    populateStoreSelect(receiptStoreSelect, receiptValue || receiptStoreSelect.value || storeSelect.value || DEFAULT_STORES[0]);
  }

  refreshStoreControls();

  storeSelect.addEventListener('change', () => {
    handleStoreSelectChange(storeSelect, storeName => {
      refreshStoreControls(storeName, editStoreSelect.value, receiptStoreSelect.value);
      storeSelect.value = storeName;
      storeSelect.dataset.lastValue = storeName;
    });
  });

  editStoreSelect.addEventListener('change', () => {
    handleStoreSelectChange(editStoreSelect, storeName => {
      refreshStoreControls(storeSelect.value, storeName, receiptStoreSelect.value);
      editStoreSelect.value = storeName;
      editStoreSelect.dataset.lastValue = storeName;
    });
  });

  receiptStoreSelect.addEventListener('change', () => {
    handleStoreSelectChange(receiptStoreSelect, storeName => {
      refreshStoreControls(storeSelect.value, editStoreSelect.value, storeName);
      receiptStoreSelect.value = storeName;
      receiptStoreSelect.dataset.lastValue = storeName;
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
    refreshStoreControls(selectedStore, editStoreSelect.value, receiptStoreSelect.value);
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
      refreshStoreControls(storeSelect.value, item.store, receiptStoreSelect.value);
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
      refreshStoreControls(storeSelect.value, item.store, receiptStoreSelect.value);
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

  function closeSourceDialog() {
    if (sourceDialog.open) {
      sourceDialog.close();
    }
  }

  function closeReviewDialog() {
    if (reviewDialog.open) {
      reviewDialog.close();
    }

    window.requestAnimationFrame(dismissKeyboard);
  }

  function setReceiptProgress(message, progress = 0) {
    progressText.textContent = message;
    progressBar.style.width = `${Math.max(0, Math.min(100, progress * 100))}%`;
  }

  function translateTesseractStatus(status) {
    const statuses = {
      'loading tesseract core': 'Загружаем модуль распознавания…',
      'initializing tesseract': 'Запускаем распознавание…',
      'loading language traineddata': 'Загружаем русский словарь…',
      'initializing api': 'Подготавливаем словарь…',
      'recognizing text': 'Читаем строки чека…'
    };

    return statuses[status] || 'Обрабатываем изображение…';
  }

  function updateReceiptRowComparison(row) {
    const comparison = row.querySelector('[data-role="price-comparison"]');
    const price = Number(row.querySelector('[data-field="receipt-price"]').value) || 0;
    const quantity = Number(row.querySelector('[data-field="receipt-quantity"]').value) || 0;
    const rowTotal = row.querySelector('[data-role="receipt-row-total"]');
    const oldPrice = Number(row.dataset.oldPrice);

    if (rowTotal) {
      rowTotal.textContent = `Итого по позиции: ${formatCurrency(price * quantity)}`;
    }

    if (!comparison) {
      return;
    }

    if (row.dataset.existingId && Number.isFinite(oldPrice)) {
      const difference = Math.round((price - oldPrice) * 100) / 100;
      const sign = difference > 0 ? '+' : '';
      comparison.innerHTML = `Было: <strong>${formatCurrency(oldPrice)}</strong> → в чеке: <strong>${formatCurrency(price)}</strong> <span class="price-difference ${difference > 0 ? 'up' : difference < 0 ? 'down' : ''}">(${sign}${formatCurrency(difference)})</span>`;
      return;
    }

    comparison.textContent = row.dataset.matched === 'true'
      ? 'Новая позиция — будет добавлена в текущий список.'
      : 'Название не найдено в справочнике. Проверьте его перед добавлением.';
  }

  function createReceiptComparisonRow(position = {}, existingItem = null) {
    const row = document.createElement('section');
    const matched = Boolean(position.matched || existingItem);
    const displayName = position.name || position.receiptName || '';
    const price = Number(position.price) || 0;
    const quantity = Number(position.quantity) || 1;

    row.className = `receipt-compare-row ${matched ? 'matched' : 'unmatched'}`;
    row.dataset.rowId = position.id || crypto.randomUUID();
    row.dataset.catalogId = position.catalogId || '';
    row.dataset.existingId = existingItem?.id || '';
    row.dataset.oldPrice = existingItem ? Number(existingItem.price) : '';
    row.dataset.matched = String(matched);

    row.innerHTML = `
      <div class="receipt-row-head">
        <label class="receipt-include-control">
          <input data-field="receipt-include" type="checkbox" checked>
          <span>${matched ? 'Найдено' : 'Проверьте'}</span>
        </label>
        <button class="remove-receipt-row" type="button" data-action="remove-receipt-row" aria-label="Удалить строку">×</button>
      </div>

      <div class="receipt-source-line">${escapeHtml(position.receiptName || position.sourceLine || 'Добавлено вручную')}</div>

      <label>
        <span>Наименование</span>
        <input data-field="receipt-name" type="text" value="${escapeHtml(displayName)}" maxlength="100">
      </label>

      <div class="form-grid">
        <label>
          <span>Цена за единицу</span>
          <input data-field="receipt-price" type="number" inputmode="decimal" min="0" step="0.01" value="${price}">
        </label>

        <label>
          <span>Количество</span>
          <input data-field="receipt-quantity" type="number" inputmode="decimal" min="0.001" step="0.001" value="${quantity}">
        </label>
      </div>

      <div class="receipt-row-total" data-role="receipt-row-total"></div>
      <div class="receipt-price-comparison" data-role="price-comparison"></div>
    `;

    updateReceiptRowComparison(row);
    return row;
  }

  function renderReceiptReview(positions, catalog, receiptText, detectedStore) {
    currentReceiptCatalog = catalog;
    currentReceiptPositions = positions;
    usedExistingIds = new Set();
    comparisonList.innerHTML = '';

    positions.forEach(position => {
      const existingItem = findExistingReceiptMatch(position, catalog, usedExistingIds);

      if (existingItem) {
        usedExistingIds.add(existingItem.id);
      }

      comparisonList.appendChild(createReceiptComparisonRow(position, existingItem));
    });

    const missingItems = state.items.filter(item => !usedExistingIds.has(item.id));
    missingList.innerHTML = missingItems.map(item => `
      <div class="receipt-missing-item">
        <span>${escapeHtml(item.name)}</span>
        <strong>${formatCurrency(item.price)} × ${formatNumber(item.quantity)}</strong>
      </div>
    `).join('');
    missingSection.hidden = missingItems.length === 0;

    const renderedRows = [...comparisonList.querySelectorAll('.receipt-compare-row')];
    const matchedCount = renderedRows.filter(row => row.dataset.matched === 'true').length;
    const unmatchedCount = positions.length - matchedCount;
    reviewSummary.textContent = positions.length
      ? `Распознано ${pluralItems(positions.length)}: ${matchedCount} по справочнику или текущему списку${unmatchedCount ? `, ${unmatchedCount} требуют проверки` : ''}.`
      : 'Автоматически распознать товары не удалось. Добавьте строки вручную или попробуйте другое фото.';

    rawText.value = receiptText;

    const selectedStore = detectedStore || storeSelect.value || DEFAULT_STORES[0];

    if (detectedStore && !state.stores.includes(detectedStore)) {
      state.stores.push(detectedStore);
      saveState();
    }

    refreshStoreControls(storeSelect.value, editStoreSelect.value, selectedStore);
    receiptStoreSelect.value = state.stores.includes(selectedStore) ? selectedStore : storeSelect.value;
    receiptStoreSelect.dataset.lastValue = receiptStoreSelect.value;

    if (!positions.length) {
      comparisonList.appendChild(createReceiptComparisonRow({
        id: crypto.randomUUID(),
        name: '',
        receiptName: 'Строка для ручного заполнения',
        price: 0,
        quantity: 1,
        matched: false
      }));
    }

    reviewDialog.showModal();
  }

  async function processReceiptFile(file) {
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      window.alert('Выберите фотографию чека в формате изображения.');
      return;
    }

    closeSourceDialog();
    receiptScanCancelled = false;
    preview.removeAttribute('src');
    setReceiptProgress('Подготавливаем изображение…', 0.03);
    progressDialog.showModal();

    try {
      const [catalog, preparedImage] = await Promise.all([
        loadProductCatalog(),
        prepareReceiptImage(file)
      ]);

      if (receiptScanCancelled) {
        return;
      }

      preview.src = preparedImage;
      setReceiptProgress('Загружаем модуль распознавания…', 0.06);
      await ensureTesseractLoaded();

      if (!window.Tesseract?.createWorker) {
        throw new Error('Модуль распознавания не загрузился. Проверьте подключение к интернету и попробуйте ещё раз.');
      }

      setReceiptProgress('Загружаем модуль распознавания…', 0.08);
      activeReceiptWorker = await window.Tesseract.createWorker(['rus', 'eng'], 1, {
        logger: message => {
          const base = message.status === 'recognizing text' ? 0.34 : 0.1;
          const range = message.status === 'recognizing text' ? 0.64 : 0.22;
          setReceiptProgress(
            translateTesseractStatus(message.status),
            base + (Number(message.progress) || 0) * range
          );
        },
        errorHandler: error => console.error(error)
      });

      if (receiptScanCancelled) {
        await activeReceiptWorker.terminate();
        activeReceiptWorker = null;
        return;
      }

      await activeReceiptWorker.setParameters({
        preserve_interword_spaces: '1',
        user_defined_dpi: '300'
      });

      const result = await activeReceiptWorker.recognize(preparedImage);
      await activeReceiptWorker.terminate();
      activeReceiptWorker = null;

      if (receiptScanCancelled) {
        return;
      }

      setReceiptProgress('Сравниваем товары и цены…', 0.98);
      const recognizedText = result?.data?.text || '';
      const positions = parseReceiptText(recognizedText, catalog);
      const detectedStore = detectReceiptStore(recognizedText);

      progressDialog.close();
      renderReceiptReview(positions, catalog, recognizedText, detectedStore);
    } catch (error) {
      if (activeReceiptWorker) {
        try {
          await activeReceiptWorker.terminate();
        } catch {
          // Worker may already be stopped.
        }

        activeReceiptWorker = null;
      }

      if (progressDialog.open) {
        progressDialog.close();
      }

      if (!receiptScanCancelled) {
        window.alert(error?.message || 'Не удалось распознать чек. Попробуйте сделать более чёткое фото.');
      }
    } finally {
      cameraInput.value = '';
      fileInput.value = '';
    }
  }

  scanButton.addEventListener('click', () => {
    dismissKeyboard();
    sourceDialog.showModal();
  });

  document.querySelector('#take-receipt-photo').addEventListener('click', () => {
    cameraInput.click();
  });

  document.querySelector('#choose-receipt-photo').addEventListener('click', () => {
    fileInput.click();
  });

  document.querySelector('#close-receipt-source').addEventListener('click', closeSourceDialog);
  sourceDialog.addEventListener('cancel', event => {
    event.preventDefault();
    closeSourceDialog();
  });

  cameraInput.addEventListener('change', () => processReceiptFile(cameraInput.files?.[0]));
  fileInput.addEventListener('change', () => processReceiptFile(fileInput.files?.[0]));

  document.querySelector('#cancel-receipt-scan').addEventListener('click', async () => {
    receiptScanCancelled = true;

    if (activeReceiptWorker) {
      try {
        await activeReceiptWorker.terminate();
      } catch {
        // Worker may already be stopped.
      }

      activeReceiptWorker = null;
    }

    if (progressDialog.open) {
      progressDialog.close();
    }
  });

  progressDialog.addEventListener('cancel', event => {
    event.preventDefault();
  });

  comparisonList.addEventListener('click', event => {
    const removeButton = event.target.closest('[data-action="remove-receipt-row"]');

    if (!removeButton) {
      return;
    }

    removeButton.closest('.receipt-compare-row')?.remove();
  });

  comparisonList.addEventListener('input', event => {
    const row = event.target.closest('.receipt-compare-row');

    if (row && event.target.matches('[data-field="receipt-price"], [data-field="receipt-quantity"]')) {
      updateReceiptRowComparison(row);
    }
  });

  comparisonList.addEventListener('change', event => {
    const checkbox = event.target.closest('[data-field="receipt-include"]');

    if (!checkbox) {
      return;
    }

    const row = checkbox.closest('.receipt-compare-row');
    row.classList.toggle('excluded', !checkbox.checked);
  });

  document.querySelector('#add-receipt-row').addEventListener('click', () => {
    const row = createReceiptComparisonRow({
      id: crypto.randomUUID(),
      name: '',
      receiptName: 'Добавлено вручную',
      price: 0,
      quantity: 1,
      matched: false
    });

    comparisonList.appendChild(row);
    row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  reviewForm.addEventListener('submit', event => {
    event.preventDefault();

    const store = receiptStoreSelect.value;

    if (!store || store === CUSTOM_STORE_VALUE) {
      return;
    }

    const selectedRows = [...comparisonList.querySelectorAll('.receipt-compare-row')]
      .filter(row => row.querySelector('[data-field="receipt-include"]')?.checked);

    if (!selectedRows.length) {
      window.alert('Выберите хотя бы одну позицию для добавления.');
      return;
    }

    const preparedItems = [];

    for (const row of selectedRows) {
      const nameInput = row.querySelector('[data-field="receipt-name"]');
      const priceInput = row.querySelector('[data-field="receipt-price"]');
      const quantityInput = row.querySelector('[data-field="receipt-quantity"]');
      const name = nameInput.value.trim();
      const price = Number(priceInput.value);
      const quantity = Number(quantityInput.value);

      if (!name) {
        nameInput.focus();
        window.alert('Укажите название товара.');
        return;
      }

      if (!Number.isFinite(price) || price < 0) {
        priceInput.focus();
        window.alert('Проверьте цену товара.');
        return;
      }

      if (!Number.isFinite(quantity) || quantity <= 0) {
        quantityInput.focus();
        window.alert('Проверьте количество товара.');
        return;
      }

      preparedItems.push({
        row,
        existingId: row.dataset.existingId,
        name,
        price,
        quantity
      });
    }

    preparedItems.forEach(prepared => {
      const existing = prepared.existingId
        ? state.items.find(item => item.id === prepared.existingId)
        : null;

      if (existing) {
        existing.name = prepared.name;
        existing.price = prepared.price;
        existing.quantity = prepared.quantity;
        existing.store = store;
        existing.done = true;
      } else {
        state.items.push({
          id: crypto.randomUUID(),
          name: prepared.name,
          price: prepared.price,
          quantity: prepared.quantity,
          store,
          done: true,
          createdAt: Date.now()
        });
      }
    });

    saveState();
    refreshStoreControls(storeSelect.value, editStoreSelect.value, store);
    renderHome();
    closeReviewDialog();
  });

  document.querySelector('#cancel-receipt-review').addEventListener('click', closeReviewDialog);
  document.querySelector('#close-receipt-review').addEventListener('click', closeReviewDialog);
  reviewDialog.addEventListener('cancel', event => {
    event.preventDefault();
    closeReviewDialog();
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
