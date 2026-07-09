const STORAGE_KEYS = {
    shopping: "shopping",
    archive: "shoppingArchive"
};

let items = readStorage(STORAGE_KEYS.shopping, []);
let archive = readStorage(STORAGE_KEYS.archive, []);

function readStorage(key, fallback) {
    try {
        const value = JSON.parse(localStorage.getItem(key));
        return Array.isArray(value) ? value : fallback;
    } catch (error) {
        console.warn(`Не удалось прочитать ${key}`, error);
        return fallback;
    }
}

function saveData() {
    localStorage.setItem(STORAGE_KEYS.shopping, JSON.stringify(items));
    localStorage.setItem(STORAGE_KEYS.archive, JSON.stringify(archive));
}

function formatMoney(value) {
    return new Intl.NumberFormat("ru-RU", {
        maximumFractionDigits: 2
    }).format(Number(value) || 0);
}

function getShopTotal(shop) {
    return shop.products.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
}

function getArchiveTime(shop) {
    const parsed = Date.parse(shop.createdAt || "");
    return Number.isFinite(parsed) ? parsed : shop.originalIndex;
}

function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function render() {
    const list = document.getElementById("list");
    if (!list) return;

    list.replaceChildren();

    let total = 0;
    let remaining = 0;

    if (items.length === 0) {
        list.append(createElement("p", "empty-state line-row", "Пока пусто — добавьте первую покупку на строку выше."));
    }

    items.forEach((item, index) => {
        const price = Number(item.price) || 0;
        total += price;
        if (!item.done) remaining += price;

        const row = createElement("div", "item line-row");

        const checkbox = createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = Boolean(item.done);
        checkbox.addEventListener("change", () => toggleDone(index));

        const name = createElement("span", `item-name${item.done ? " done" : ""}`, item.name);
        const itemPrice = createElement("span", "item-price", `${formatMoney(price)} ₽`);
        const remove = createElement("button", "delete", "×");
        remove.type = "button";
        remove.setAttribute("aria-label", `Удалить ${item.name}`);
        remove.addEventListener("click", () => removeItem(index));

        row.append(checkbox, name, itemPrice, remove);
        list.append(row);
    });

    document.getElementById("total").textContent = formatMoney(total);
    document.getElementById("remaining").textContent = formatMoney(remaining);
}

function addItem(event) {
    event?.preventDefault();

    const nameInput = document.getElementById("item");
    const priceInput = document.getElementById("price");
    const name = nameInput.value.trim();
    const price = Number(priceInput.value);

    if (!name) {
        nameInput.focus();
        return;
    }

    items.push({
        name,
        price: Number.isFinite(price) && price > 0 ? price : 0,
        done: false
    });

    saveData();
    render();

    nameInput.value = "";
    priceInput.value = "";
    nameInput.focus();
}

function toggleDone(index) {
    if (!items[index]) return;
    items[index].done = !items[index].done;
    saveData();
    render();
}

function removeItem(index) {
    items.splice(index, 1);
    saveData();
    render();
}

function finishShopping() {
    if (items.length === 0) return;

    archive.push({
        date: new Date().toLocaleString("ru-RU"),
        createdAt: new Date().toISOString(),
        products: [...items]
    });

    items = [];
    saveData();
    render();
}

function renderArchive() {
    const box = document.getElementById("archive-list");
    if (!box) return;

    const searchInput = document.getElementById("archive-search");
    const sortInput = document.getElementById("archive-sort");
    const stats = document.getElementById("archive-stats");
    const query = searchInput?.value.trim().toLowerCase() || "";
    const sort = sortInput?.value || "newest";

    let filtered = archive
        .map((shop, originalIndex) => ({ ...shop, originalIndex }))
        .filter(shop => !query || shop.products.some(item => item.name.toLowerCase().includes(query)));

    filtered.sort((a, b) => {
        if (sort === "oldest") return getArchiveTime(a) - getArchiveTime(b);
        if (sort === "expensive") return getShopTotal(b) - getShopTotal(a);
        return getArchiveTime(b) - getArchiveTime(a);
    });

    box.replaceChildren();

    const totalProducts = filtered.reduce((sum, shop) => sum + shop.products.length, 0);
    const totalAmount = filtered.reduce((sum, shop) => sum + getShopTotal(shop), 0);
    if (stats) {
        stats.textContent = `Записей: ${filtered.length} • товаров: ${totalProducts} • сумма: ${formatMoney(totalAmount)} ₽`;
    }

    if (filtered.length === 0) {
        box.append(createElement("p", "empty-state line-row", "Ничего не найдено. Попробуйте изменить фильтр."));
        return;
    }

    filtered.forEach(shop => {
        const block = createElement("article", "archive-block");
        const header = createElement("div", "archive-block-header line-row");
        header.append(
            createElement("h2", "archive-date", shop.date),
            createElement("span", "archive-total", `${formatMoney(getShopTotal(shop))} ₽`)
        );

        const products = createElement("div", "archive-products");
        shop.products.forEach(item => {
            const row = createElement("div", "archive-item line-row");
            row.append(
                createElement("span", item.done ? "done" : "", item.name),
                createElement("span", "archive-item-price", `${formatMoney(item.price)} ₽`)
            );
            products.append(row);
        });

        block.append(header, products);
        box.append(block);
    });
}

document.getElementById("add-form")?.addEventListener("submit", addItem);
document.getElementById("archive-search")?.addEventListener("input", renderArchive);
document.getElementById("archive-sort")?.addEventListener("change", renderArchive);

render();
renderArchive();
