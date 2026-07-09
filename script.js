const STORAGE_KEYS = {
    shopping: "shopping",
    archive: "shoppingArchive"
};

let items = readArray(STORAGE_KEYS.shopping);
let archive = readArray(STORAGE_KEYS.archive);

function readArray(key) {
    try {
        const value = JSON.parse(localStorage.getItem(key));
        return Array.isArray(value) ? value : [];
    } catch {
        return [];
    }
}

function saveData() {
    localStorage.setItem(STORAGE_KEYS.shopping, JSON.stringify(items));
    localStorage.setItem(STORAGE_KEYS.archive, JSON.stringify(archive));
}

function money(value) {
    return new Intl.NumberFormat("ru-RU", {
        maximumFractionDigits: 2
    }).format(Number(value) || 0);
}

function normalizePrice(value) {
    const price = Number(String(value).replace(",", "."));
    return Number.isFinite(price) && price > 0 ? price : 0;
}

function create(tag, className, text) {
    const element = document.createElement(tag);

    if (className) {
        element.className = className;
    }

    if (text !== undefined) {
        element.textContent = text;
    }

    return element;
}

function getShopTotal(shop) {
    return shop.products.reduce((sum, item) => sum + normalizePrice(item.price), 0);
}

function getArchiveTime(shop, index) {
    const parsed = Date.parse(shop.createdAt || "");
    return Number.isFinite(parsed) ? parsed : index;
}

function renderShoppingList() {
    const list = document.getElementById("list");
    const totalNode = document.getElementById("total");
    const remainingNode = document.getElementById("remaining");

    if (!list || !totalNode || !remainingNode) {
        return;
    }

    list.replaceChildren();

    let total = 0;
    let remaining = 0;

    if (items.length === 0) {
        list.append(create("p", "empty-row", "Список пуст"));
    }

    items.forEach((item, index) => {
        const price = normalizePrice(item.price) * (Number(item.quantity) || 1);

        total += price;

        if (!item.done) {
            remaining += price;
        }

        const row = create("article", "shopping-item");

        const checkbox = create("input", "item-check");
        checkbox.type = "checkbox";
        checkbox.checked = Boolean(item.done);
        checkbox.setAttribute("aria-label", `Отметить ${item.name}`);
        checkbox.addEventListener("change", () => toggleDone(index));

        const name = create("span", `item-name${item.done ? " done" : ""}`, item.name);
        const itemPrice = create("span", "item-price", `${money(price)} ₽`);

        const edit = create("button", "edit-button", "✎");
        edit.type = "button";
        edit.addEventListener("click", () => editItem(index));

        const remove = create("button", "delete-button", "×");
        remove.type = "button";
        remove.setAttribute("aria-label", `Удалить ${item.name}`);
        remove.addEventListener("click", () => removeItem(index));

        row.append(checkbox, name, itemPrice, edit, remove);
        list.append(row);
    });

    totalNode.textContent = money(total);
    remainingNode.textContent = money(remaining);
}

function addItem(event) {
    event.preventDefault();

    const nameInput = document.getElementById("item");
    const priceInput = document.getElementById("price");
    const quantityInput = document.getElementById("quantity");

    if (!nameInput || !priceInput) {
        return;
    }

    const name = nameInput.value.trim();

    if (!name) {
        nameInput.focus();
        return;
    }

    items.push({
        name,
        price: normalizePrice(priceInput.value),
        quantity: Number(quantityInput?.value) || 1,
        done: false
    });

    saveData();
    renderShoppingList();

    nameInput.value = "";
    priceInput.value = "";
    if (quantityInput) quantityInput.value = "";
    nameInput.focus();
}

function editItem(index) {
    const item = items[index];
    if (!item) return;

    const name = prompt("Название товара", item.name);
    const price = prompt("Цена за единицу", item.price);
    const quantity = prompt("Количество", item.quantity || 1);

    if (name !== null) item.name = name.trim() || item.name;
    if (price !== null) item.price = normalizePrice(price);
    if (quantity !== null) item.quantity = Number(quantity) || 1;

    saveData();
    renderShoppingList();
}

function toggleDone(index) {
    if (!items[index]) {
        return;
    }

    items[index].done = !items[index].done;
    saveData();
    renderShoppingList();
}

function removeItem(index) {
    items.splice(index, 1);
    saveData();
    renderShoppingList();
}

function finishShopping() {
    if (items.length === 0) {
        return;
    }

    archive.push({
        date: new Date().toLocaleString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }),
        createdAt: new Date().toISOString(),
        products: items.map(item => ({ ...item }))
    });

    items = [];
    saveData();
    renderShoppingList();
}

function renderArchive() {
    const list = document.getElementById("archive-list");

    if (!list) {
        return;
    }

    const stats = document.getElementById("archive-stats");
    const searchInput = document.getElementById("archive-search");
    const sortInput = document.getElementById("archive-sort");

    const query = searchInput?.value.trim().toLowerCase() || "";
    const sort = sortInput?.value || "newest";

    let shops = archive
        .map((shop, index) => ({ ...shop, originalIndex: index }))
        .filter(shop => {
            if (!query) {
                return true;
            }

            return shop.products.some(product => {
                return product.name.toLowerCase().includes(query);
            });
        });

    shops.sort((a, b) => {
        if (sort === "oldest") {
            return getArchiveTime(a, a.originalIndex) - getArchiveTime(b, b.originalIndex);
        }

        if (sort === "expensive") {
            return getShopTotal(b) - getShopTotal(a);
        }

        return getArchiveTime(b, b.originalIndex) - getArchiveTime(a, a.originalIndex);
    });

    list.replaceChildren();

    const productsCount = shops.reduce((sum, shop) => sum + shop.products.length, 0);
    const amount = shops.reduce((sum, shop) => sum + getShopTotal(shop), 0);

    if (stats) {
        stats.textContent = `Записей: ${shops.length} · товаров: ${productsCount} · сумма: ${money(amount)} ₽`;
    }

    if (shops.length === 0) {
        list.append(create("p", "empty-row", "В архиве ничего не найдено"));
        return;
    }

    shops.forEach(shop => {
        const card = create("article", "archive-card");

        const header = create("header", "archive-card-header");

        const date = create("h2", "archive-date", shop.date);
        const total = create("strong", "archive-total", `${money(getShopTotal(shop))} ₽`);

        header.append(date, total);

        const products = create("div", "archive-products");

        shop.products.forEach(product => {
            const row = create("div", "archive-product");

            const name = create("span", product.done ? "done" : "", product.name);
            const price = create("span", "archive-product-price", `${money(product.price)} ₽`);

            row.append(name, price);
            products.append(row);
        });

        card.append(header, products);
        list.append(card);
    });
}

function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
        return;
    }

    navigator.serviceWorker.register("service-worker.js")
        .then(registration => registration.update())
        .catch(() => {});
}

function init() {
    document.getElementById("add-form")?.addEventListener("submit", addItem);
    document.getElementById("finish-shopping")?.addEventListener("click", finishShopping);
    document.getElementById("archive-search")?.addEventListener("input", renderArchive);
    document.getElementById("archive-sort")?.addEventListener("change", renderArchive);

    renderShoppingList();
    renderArchive();
    registerServiceWorker();
}

init();
